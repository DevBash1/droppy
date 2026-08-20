import { Router } from "express";
import { requireShop } from "../middleware/requireShop.js";
import { scrapeProduct } from "../scraper.js";
import { priceToNaira } from "../fx.js";

// Importer helpers, mounted at /api/scrape + /api/fx (see routes/index.js).
// Both are gated by requireShop like every other store-data route.

const router = Router();
router.use(requireShop);

const clamp = (n, min, max, fallback) => {
    const v = Number(n);
    return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
};

// POST /api/scrape — scrape a URL and return the normalised preview WITHOUT
// importing. Used by the importer's "Scrape & preview" button.
router.post("/", async (req, res, next) => {
    try {
        const { url } = req.body || {};
        if (!url || typeof url !== "string" || !url.trim()) {
            return res
                .status(400)
                .json({ success: false, message: "A product URL is required." });
        }
        const scraped = await scrapeProduct(url.trim());
        if (!scraped.success) {
            return res.status(422).json({ success: false, message: scraped.error });
        }
        return res.json({ success: true, product: scraped.product });
    } catch (err) {
        next(err);
    }
});

// GET /api/fx/preview?price=&currency=&markup= — the converted Naira price for a
// source amount, so the UI can show "≈ ₦…" live. The authoritative conversion
// happens again server-side at import time.
router.get("/preview", async (req, res, next) => {
    try {
        const price = Number(req.query.price);
        if (!Number.isFinite(price)) {
            return res
                .status(400)
                .json({ success: false, message: "A numeric price is required." });
        }
        const naira = await priceToNaira(
            price,
            String(req.query.currency || ""),
            clamp(req.query.markup, 0, 1000, 0),
        );
        return res.json({ success: true, price: naira });
    } catch (err) {
        next(err);
    }
});

export default router;
