import { Router } from "express";
import crypto from "crypto";
import { config } from "../config.js";
import { emitWebhook } from "../sockets.js";
import { callSalesiveApi } from "../salesive.js";

// Webhooks are NOTIFY-ONLY — they tell you what changed (topic/resource/resourceId)
// but never carry the record. We push the notify event to the UI immediately, then
// (best-effort) re-fetch the current record with the app's scoped token and push
// that too. Map each resource to its read-by-id endpoint:
const REFETCH_PATH = {
    products: (id) => `/api/v1/products/${id}`,
};

// Mounted at /webhooks (server/routes/index.js), so this router defines POST "/".
export default function webhookRouter(io) {
    const router = Router();

    // POST /webhooks
    // req.body is the RAW Buffer (express.raw is mounted before express.json in
    // server/index.js), so we can verify the signature over the exact bytes.
    router.post("/", (req, res) => {
        const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
        const signature = req.get("X-Salesive-Hmac-SHA256") || "";
        const expected = crypto
            .createHmac("sha256", config.webhookSecret)
            .update(raw)
            .digest("base64");

        const valid =
            signature.length === expected.length &&
            crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        if (!valid) return res.status(401).json({ error: "invalid signature" });

        let event;
        try {
            event = JSON.parse(raw.toString("utf8"));
        } catch {
            return res.status(400).json({ error: "invalid json" });
        }

        // Acknowledge fast — Salesive retries non-2xx. Do the rest async.
        res.sendStatus(200);

        const shop = event.shopId;
        if (!shop) return;

        // 1) Push the raw notify event to the store's connected frontends now.
        emitWebhook(io, shop, { type: "event", event });

        // 2) Re-fetch the current record with the scoped app token and push it.
        //    Strictly best-effort: a missing scope, a deleted record, or a refresh
        //    error simply leaves the UI with the notify event from step 1.
        (async () => {
            if (event.action === "deleted" || !event.resourceId) return;
            const build = REFETCH_PATH[event.resource];
            if (!build) return;
            try {
                const { ok, data } = await callSalesiveApi(
                    shop,
                    build(event.resourceId),
                );
                if (ok) {
                    emitWebhook(io, shop, {
                        type: "record",
                        topic: event.topic,
                        resource: event.resource,
                        resourceId: event.resourceId,
                        data: data?.data ?? data,
                    });
                }
            } catch {
                /* best-effort — ignore */
            }
        })();
    });

    return router;
}
