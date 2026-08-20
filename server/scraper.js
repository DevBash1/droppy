import { ProductWatcher, MetaDataFinder } from "@soblend/scraper";
import scrapeAliExpress from "aliexpress-product-scraper";

// Force these into the Vercel serverless bundle. aliexpress-product-scraper's
// stealth plugin resolves two of its evasion's dependencies — the
// user-preferences and user-data-dir plugins — via puppeteer-extra's runtime
// `require(name)` resolver (puppeteer-extra/dist/index.cjs.js), not a normal
// static import. Vercel's function bundler only traces static imports, so it
// silently drops anything reached only that way — first the plugins
// themselves ("Cannot find module 'puppeteer-extra-plugin-user-preferences'"),
// then, once those were force-included via vercel.json, THEIR own deps
// (fs-extra, rimraf, …), because a file added by vercel.json's `includeFiles`
// is copied verbatim without being re-traced. A real static import here makes
// the bundler trace each package's full dependency tree correctly, so nothing
// further down the chain needs to be hand-enumerated. The evasion submodules
// themselves (puppeteer-extra-plugin-stealth/evasions/*) are still genuinely
// dynamic (their filenames are computed at runtime) — those stay covered by
// the includeFiles glob in vercel.json.
import "puppeteer-extra-plugin-user-preferences";
import "puppeteer-extra-plugin-user-data-dir";

// ── Server-side product scraping facade ──────────────────────────────────────
//
// The browser never talks to the shop sites — it sends a product URL to our own
// /api/import route, and THIS module does the scraping. The store-bound app token
// stays on the server; the client only ever sees the normalised preview.
//
// Platform scrapers:
//   • Amazon / MercadoLibre   → @soblend/scraper's ProductWatcher (cheerio).
//   • AliExpress              → aliexpress-product-scraper. The old cheerio
//     parser broke because AliExpress pages are now client-side rendered
//     (window.runParams is empty, isCSR=true) — no title/price in the static
//     HTML. The dedicated package launches a stealth headless browser and
//     intercepts AliExpress's own product API, so it returns the real title,
//     NGN prices, all images, description, specs and variants. It needs a
//     browser (puppeteer) and can take up to ~90s on a cold run.
//
// Hard guardrails:
//   • Hostname whitelist — only the supported marketplaces are ever fetched, so
//     the URL can't be pointed at internal hosts (SSRF) or arbitrary sites.
//   • Hard timeout on the whole scrape so a dead/blocked shop page can't hang
//     the request (each scraper has its own retries/timeouts).
//   • When a scrape comes back with a missing price or title, we try
//     MetaDataFinder's Open Graph/JSON-LD fallback to fill the gaps, then
//     normalise everything to ONE shape for the preview form.

const SUPPORTED = [
    { host: "amazon.com", name: "Amazon", scrape: (w, url) => w.scrapeAmazon(url) },
    { host: "aliexpress.com", name: "AliExpress", scrape: (w, url) => w.scrapeAliExpress(url) },
    { host: "mercadolibre.com", name: "MercadoLibre", scrape: (w, url) => w.scrapeMercadoLibre(url) },
];

const SCRAPE_TIMEOUT_MS = 30_000;
const ALIEXPRESS_TIMEOUT_MS = 120_000;

// Hostname whitelist. Amazon and MercadoLibre use country TLDs, so we list the
// real marketplace domains (amazon.com / amazon.de / mercadolibre.com.mx / …).
// The match is anchored: the host must equal the domain or end with ".<domain>"
// — so "amazon.com.evil.com" and "evil-amazon.com" never match.
const SUPPORTED_HOSTS = [
    // Amazon
    "amazon.com", "amazon.ca", "amazon.com.mx", "amazon.com.br", "amazon.co.uk",
    "amazon.de", "amazon.fr", "amazon.it", "amazon.es", "amazon.nl", "amazon.se",
    "amazon.pl", "amazon.in", "amazon.ae", "amazon.sa", "amazon.sg", "amazon.jp",
    // AliExpress
    "aliexpress.com", "aliexpress.ru",
    // MercadoLibre
    "mercadolibre.com", "mercadolibre.com.ar", "mercadolibre.com.mx",
    "mercadolibre.com.br", "mercadolibre.com.co", "mercadolibre.cl",
    "mercadolibre.com.uy", "mercadolibre.com.pe", "mercadolibre.com.ec",
    "mercadolibre.com.ve", "mercadolibre.com.bo", "mercadolibre.com.py",
    "mercadolibre.com.do", "mercadolibre.com.gt", "mercadolibre.com.hn",
    "mercadolibre.com.ni", "mercadolibre.com.sv", "mercadolibre.com.cr",
    "mercadolibre.com.pa", "mercadolibre.com.pr", "mercadolibre.com.pt",
];

function matchPlatform(host) {
    const domain = SUPPORTED_HOSTS.find(
        (d) => host === d || host.endsWith(`.${d}`),
    );
    if (!domain) return null;
    if (domain.startsWith("amazon")) return SUPPORTED[0];
    if (domain.startsWith("aliexpress")) return SUPPORTED[1];
    return SUPPORTED[2];
}

export function detectPlatform(url) {
    let host;
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
    return matchPlatform(host);
}

// Extract the AliExpress product id from an item URL:
//   https://www.aliexpress.com/item/1005006035521757.html
//   https://www.aliexpress.com/i/1005006035521757.html
//   https://m.aliexpress.com/item/1005006035521757.html
// The id is the numeric segment after /item/ (or /i/).
export function extractAliExpressId(url) {
    const match = String(url).match(/\/(?:item|i)\/(\d{5,20})(?:\.html)?/i);
    return match ? match[1] : null;
}

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Scrape timed out after ${ms / 1000}s`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── AliExpress (aliexpress-product-scraper) ──────────────────────────────────
// The package launches a stealth browser and intercepts AliExpress's product
// API, returning { title, description, images[], salePrice:{min,max}, … }.
// We map that to the normalised preview shape.
async function scrapeAliExpressProduct(url) {
    const productId = extractAliExpressId(url);
    if (!productId) {
        return { success: false, error: "Could not read the AliExpress product id from that URL." };
    }

    const data = await withTimeout(
        scrapeAliExpress(productId, { timeout: 60_000, reviewsCount: 0 }),
        ALIEXPRESS_TIMEOUT_MS,
    );
    if (!data || !data.title) {
        return { success: false, error: "AliExpress returned no product data." };
    }

    // salePrice.min is the price to sell at (in the visitor's currency — NGN for
    // a Nigeria session, as the user's URL shows). Use it, falling back to the
    // original (pre-discount) price.
    const priceInfo = data.salePrice?.min || data.originalPrice?.min;
    const price = Number(priceInfo?.value || priceInfo || 0);
    const currency = priceInfo?.currency || data.currencyInfo?.currencyCode || "USD";

    // HTML description → plain text for the preview form. Script/style blocks
    // (AliExpress injects e.g. "window.adminAccountId=6210959895;" into <script>
    // tags) are removed whole — their text content is not product description.
    const description = String(data.description || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const images = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
    const title = String(data.title || "").trim();

    // ── Variants ─────────────────────────────────────────────────────────────
    // AliExpress gives `options` (attribute definitions: Color → values, each
    // with an id) and `prices` (per-SKU: optionValueIds "14:29;…", price,
    // availableQuantity). We rebuild the option-id → value-id map and emit one
    // Salesive variant per SKU: { attributes, price, quantity, sku }.
    const variants = mapAliExpressVariants(data);

    // ── Video (best-effort) ───────────────────────────────────────────────────
    // The scraper package doesn't expose video; probe the product page's HTML
    // for a video URL (og:video / jsonLd contentUrl / .mp4) without failing the
    // scrape if nothing is found.
    let video = "";
    try {
        const html = await fetchProductHtml(url);
        video = extractVideoUrl(html);
    } catch {
        /* best-effort */
    }

    return {
        success: true,
        product: {
            title,
            description,
            price,
            currency: String(currency).toUpperCase(),
            imageUrl: images[0] || "",
            images,
            variants,
            video: video || null,
            sourceUrl: url,
            platform: "AliExpress",
        },
    };
}

// Build Salesive-style variants from aliexpress-product-scraper's output.
// Returns [] when the product has no variants (single SKU).
function mapAliExpressVariants(data) {
    const options = data?.variants?.options;
    const prices = data?.variants?.prices;
    if (!Array.isArray(options) || !Array.isArray(prices) || !prices.length) return [];

    // optionId → { name, valueId → displayName }
    const attrMap = new Map();
    for (const opt of options) {
        const values = new Map();
        for (const v of opt.values || []) {
            values.set(String(v.id), v.displayName || v.name || "");
        }
        attrMap.set(String(opt.id), { name: opt.name || "Option", values });
    }

    const variants = [];
    for (const sku of prices) {
        const attributes = {};
        for (const pair of String(sku.optionValueIds || "").split(";")) {
            if (!pair) continue;
            const [optId, valId] = pair.split(":");
            const opt = attrMap.get(optId);
            if (!opt) continue;
            attributes[opt.name] = opt.values.get(valId) || valId;
        }
        const priceInfo = sku.salePrice || sku.originalPrice;
        const price = Number(priceInfo?.value || priceInfo || 0);
        if (!price || !Object.keys(attributes).length) continue;
        variants.push({
            attributes,
            price,
            quantity: Number(sku.availableQuantity) || 0,
            sku: sku.skuId ? String(sku.skuId) : undefined,
        });
    }
    return variants;
}

// Fetch a product page's HTML with a browser-ish UA (for video probing).
async function fetchProductHtml(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });
    if (!res.ok) throw new Error(`page ${res.status}`);
    return res.text();
}

// Pull a video URL out of product-page HTML: og:video meta, JSON-LD
// contentUrl/video, or a raw .mp4 reference. Returns "" when absent.
function extractVideoUrl(html) {
    if (!html) return "";
    const og = html.match(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i);
    if (og?.[1]) return og[1];
    const jsonLd = html.match(/"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/i);
    if (jsonLd?.[1]) return jsonLd[1];
    const mp4 = html.match(/https?:\\?\/\\?\/[^"'\s]+\.mp4/i);
    return mp4?.[0] ? mp4[0].replace(/\\\//g, "/") : "";
}

// Pull price/description/extra images out of the page's <head> (Open Graph +
// JSON-LD) as a fallback when a scraper's extraction came up short.
async function metadataFallback(url) {
    try {
        const finder = new MetaDataFinder({ timeout: 10_000, retries: 1 });
        const res = await withTimeout(finder.scrape(url), 15_000);
        if (!res?.success) return {};

        const og = res.metadata?.openGraph || {};
        const jsonLd = Array.isArray(res.metadata?.jsonLd) ? res.metadata.jsonLd : [];
        const offer = jsonLd
            .map((item) => item?.offers)
            .flatMap((o) => (Array.isArray(o) ? o : o ? [o] : []))
            .find((o) => o && Number(o.price) > 0);

        return {
            description: og.description || res.metadata?.basic?.description || "",
            imageUrl: og.image || "",
            price: offer ? Number(offer.price) : 0,
            currency: offer?.priceCurrency || "",
        };
    } catch {
        return {}; // best-effort — never fail an import on the fallback
    }
}

// Normalise one scraped product into the shape the preview form + import route use.
function normalise(raw, meta, url, platform) {
    const price = Number(raw.price) || 0;
    const metaPrice = Number(meta.price) || 0;

    return {
        title: raw.title || meta.title || "",
        description: raw.description || meta.description || "",
        price: price > 0 ? price : metaPrice,
        currency: (raw.currency || meta.currency || "").toUpperCase(),
        imageUrl: raw.imageUrl || meta.imageUrl || "",
        images: Array.isArray(raw.images) && raw.images.length ? raw.images : [],
        sourceUrl: raw.sourceUrl || raw.url || url,
        platform: raw.platform || platform.name,
    };
}

// Scrape a supported product URL → normalised { success, product, error }.
export async function scrapeProduct(url) {
    const platform = detectPlatform(url);
    if (!platform) {
        return {
            success: false,
            error: "Unsupported URL. Paste an Amazon, AliExpress or MercadoLibre product link.",
        };
    }

    // AliExpress gets its own path — the old ProductWatcher can't read the
    // client-rendered pages, the dedicated package can.
    if (platform.name === "AliExpress") {
        try {
            return await scrapeAliExpressProduct(url);
        } catch (err) {
            return { success: false, error: err.message || "AliExpress scraping failed." };
        }
    }

    try {
        const watcher = new ProductWatcher({ timeout: 12_000, retries: 2 });
        const raw = await withTimeout(platform.scrape(watcher, url), SCRAPE_TIMEOUT_MS);

        if (!raw?.success || !raw.product) {
            return {
                success: false,
                error: raw?.error || "Could not scrape this product page.",
            };
        }

        // Fill gaps (price, description, better image) from the page metadata when
        // ProductWatcher's extraction came back incomplete.
        const meta =
            !raw.product.price || !raw.product.title
                ? await metadataFallback(url)
                : {};
        return { success: true, product: normalise(raw.product, meta, url, platform) };
    } catch (err) {
        return { success: false, error: err.message || "Scraping failed." };
    }
}
