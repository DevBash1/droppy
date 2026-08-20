import { Router } from "express";
import { requireShop } from "../middleware/requireShop.js";
import { scrapeProduct } from "../scraper.js";
import { priceToNaira } from "../fx.js";
import { callSalesiveApi } from "../salesive.js";

// POST /api/import — the one non-proxy route: it orchestrates the whole
// import pipeline server-side:
//
//   1. scrape the product URL (@soblend/scraper, hostname-whitelisted)
//   2. convert the scraped price to Naira (live FX + merchant markup)
//   3. POST the result to the Salesive Apps API as a product
//
// The store-bound app token never leaves the server; the browser only ever posts
// the URL + the editable preview fields.
//
// Body: {
//   url            string  — Amazon / AliExpress / MercadoLibre product URL
//   category       string  — category ObjectId (required by the Apps API)
//   markupPercent  number  — merchant margin %, applied on top of FX conversion
//   name, description, price, weight, quantity, images  — optional overrides
//                          — sent as-is when provided (e.g. after the merchant
//                            edits the preview); otherwise derived from the scrape
// }
const router = Router();
router.use(requireShop);

const clamp = (n, min, max, fallback) => {
    const v = Number(n);
    return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
};

router.post("/", async (req, res, next) => {
    try {
        const { url, category, markupPercent } = req.body || {};

        if (!url || typeof url !== "string" || !url.trim()) {
            return res
                .status(400)
                .json({ success: false, message: "A product URL is required." });
        }
        if (!category || typeof category !== "string" || !category.trim()) {
            return res
                .status(400)
                .json({ success: false, message: "Pick a category for the product." });
        }

        const scraped = await scrapeProduct(url.trim());
        if (!scraped.success) {
            return res.status(422).json({ success: false, message: scraped.error });
        }

        const p = scraped.product;
        const body = req.body || {};
        const name = String(body.name || p.title || "").trim();
        const description = String(body.description || p.description || "").trim();

        if (!name) {
            return res
                .status(422)
                .json({ success: false, message: "The scraped product has no title." });
        }

        const markup = clamp(markupPercent, 0, 1000, 0);
        const price =
            body.price !== undefined && body.price !== ""
                ? Number(body.price)
                : await priceToNaira(p.price, p.currency, markup);

        if (!Number.isFinite(price) || price <= 0) {
            return res.status(422).json({
                success: false,
                message:
                    "The scraped price could not be read and no price was set — edit the price in the preview and try again.",
            });
        }

        // Variants + video from the scrape, if any. Each variant price goes
        // through the same source → NGN + markup conversion as the base price.
        let variants;
        if (Array.isArray(p.variants) && p.variants.length) {
            variants = await Promise.all(
                p.variants.map(async (v) => ({
                    attributes: v.attributes || {},
                    price: await priceToNaira(v.price, p.currency, markup),
                    quantity: clamp(v.quantity, 0, 1000000, 0),
                    sku: v.sku ? String(v.sku) : undefined,
                })),
            );
        }

        const payload = {
            name,
            description: description || "Imported with Droppy",
            price,
            // Salesive requires a weight; default to 0.5kg when the scrape
            // didn't provide one (the scrapers never do).
            weight: clamp(body.weight, 0, 100000, 0.5),
            category,
            quantity: clamp(body.quantity, 0, 1000000, 100),
            images: Array.isArray(body.images) && body.images.length ? body.images : p.imageUrl ? [p.imageUrl] : [],
            variants,
            video: p.video ? String(p.video) : undefined,
            listed: true,
        };

        const { status, data } = await callSalesiveApi(req.shop, "/api/v1/products", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        if (data == null) {
            return res.status(status || 502).json({
                success: false,
                message:
                    status === 401
                        ? "This store is no longer installed."
                        : "The Salesive API did not return a response.",
            });
        }
        // Forward the upstream envelope. The client's request() helper treats a
        // non-2xx (or success:false) envelope as an error and surfaces `message`
        // in a toast — so a Salesive validation error like "Product validation
        // failed: name: ..." reaches the user verbatim.
        return res.status(status || 200).json(data);
    } catch (err) {
        next(err);
    }
});

export default router;
