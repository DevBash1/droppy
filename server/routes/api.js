import { Router } from "express";
import { config } from "../config.js";
import { store } from "../store.js";
import { verifyInstallation, callSalesiveApi } from "../salesive.js";
import { readSession, clearSessionCookie, clearLegacyCookies } from "../session.js";

// App API consumed by the React front end. Mounted at /api (server/routes/index.js),
// so the routes below are defined relative to that prefix.
//
// The app's `app_` access token NEVER leaves the server — the browser only learns
// install state + granted scopes from here. Add your own app endpoints alongside
// /me: call the Salesive API with callSalesiveApi(shop, …) (see server/salesive.js)
// and return only what the UI needs.
//
// SECURITY: derive the shop from the signed SESSION (server/session.js), never from
// the client-supplied ?shop=. ?shop= is only used to seed the install gate's OAuth
// start link — it can never grant access to an existing install.
const router = Router();

// GET /api/me?shop=<shopId>
// Tells the front end whether THIS browser is authenticated for an installed store
// and which scopes it granted, so the client router can show the app or the gate.
router.get("/me", async (req, res, next) => {
    try {
        // The launch query may seed a NEW install; it does not authenticate anyone.
        const launchShop = req.query.shop ? String(req.query.shop) : null;

        // The single signed session cookie is the only source of who we are.
        const session = readSession(req);
        const shop = session?.shop || null;

        // Confirm with Salesive that the install is still active (detects an
        // uninstall and clears a now-dead local session).
        if (shop) await verifyInstallation(shop).catch(() => {});
        const inst = shop ? await store.getInstallation(shop) : null;

        // Session points at an install that's gone (uninstalled) → drop the cookie
        // so the UI falls back to the gate instead of running on a dead session.
        if (session && !inst) clearSessionCookie(res);

        res.json({
            // Authenticated == has a valid session AND that store is still installed.
            authenticated: Boolean(inst),
            installed: Boolean(inst),
            // Only ever reveal the shop the SESSION proves — never the launch query.
            shop: inst ? shop : null,
            scopes: inst
                ? String(inst.scopes || "")
                      .split(/\s+/)
                      .filter(Boolean)
                : [],
            // The scopes this app will request at install — shown on the gate.
            requestedScopes: config.scopes.split(/\s+/).filter(Boolean),
            // URL that begins the OAuth install for the LAUNCH shop (gate button).
            installUrl: launchShop
                ? `/oauth/start?shop=${encodeURIComponent(launchShop)}`
                : "/oauth/start",
            clientId: config.clientId || null,
            // How this deployment delivers store events: "socket" (a long-lived server
            // pushes over socket.io) or "poll" (serverless — the UI refetches on an
            // interval). The SERVER decides, so the same front-end build is correct on
            // both hosts and there's no build-time flag to forget. See client/src/lib/socket.jsx.
            realtime: config.realtime,
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/context?shop=<shopId>
// Returns basic store + user info for the authenticated install. Data comes
// from the Salesive API's /app/context endpoint which is default-granted to
// every installed app — no extra scopes needed.
router.get("/context", async (req, res, next) => {
    try {
        const session = readSession(req);
        if (!session) {
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }
        const { shop } = session;
        const result = await callSalesiveApi(shop, "/api/v1/app/context");
        if (!result.ok) {
            return res.status(result.status || 502).json({
                success: false,
                message: "Failed to fetch store context",
            });
        }
        res.json({ success: true, data: result.data?.data ?? result.data });
    } catch (err) {
        next(err);
    }
});

// POST /api/logout
// Ends the single session: clears the session cookie (plus any leftover per-store
// cookies from the old model) so the UI falls back to the install gate. The app's
// stored token is untouched — the store stays installed; this only signs THIS
// browser out. Re-opening the app starts a fresh OAuth.
router.post("/logout", (req, res) => {
    clearSessionCookie(res);
    clearLegacyCookies(req, res);
    res.json({ success: true });
});

export default router;
