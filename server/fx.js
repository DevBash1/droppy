import { config } from "./config.js";

// ── FX + Naira (NGN) pricing ─────────────────────────────────────────────────
//
// The importer converts a scraped source price (USD/EUR/…) to Naira. Salesive
// products are priced in the store's own currency (see /app/context — most of
// these stores are NGN), so the conversion + markup is applied at import time
// and the NGN price is what gets stored on the product.
//
// The live rate comes from a free, keyless FX API and is cached in-process for
// CACHE_MS. When the API is unreachable (offline, blocked, 5xx), we fall back to
// the operator-configured DEFAULT_FX_RATE so an import never hard-fails on a
// transient rate fetch.

const CACHE_MS = 6 * 60 * 60 * 1000; // 6h — FX rates don't move enough to refetch per import

let cache = { at: 0, rate: null };

// Parse a numeric rate out of the common FX API shapes:
//   { rates: { NGN: 1500 } }                     (exchangerate-api / er-api.com)
//   { conversion_rates: { NGN: 1500 } }          (open.er-api.com)
//   { data: { NGN: { value: 1500 } } }           (some keyed providers)
export function parseRate(body, currencyCode) {
    const rates = body?.rates || body?.conversion_rates || body?.data || {};
    if (typeof rates === "object" && rates !== null) {
        const direct = rates[currencyCode];
        if (typeof direct === "number" && direct > 0) return direct;
        const nested = rates[currencyCode]?.value;
        if (typeof nested === "number" && nested > 0) return nested;
    }
    return null;
}

// Latest NGN per 1 unit of the base currency (usually USD). Cached in-process;
// falls back to config.defaultFxRate on any failure.
export async function getNgnRate() {
    const now = Date.now();
    if (cache.rate !== null && now - cache.at < CACHE_MS) return cache.rate;

    try {
        const res = await fetch(config.fxApiUrl, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`FX API ${res.status}`);
        const rate = parseRate(await res.json(), config.currencyCode);
        if (!rate) throw new Error("FX API response had no usable rate");
        cache = { at: now, rate };
        return rate;
    } catch (err) {
        if (cache.rate !== null) {
            // Stale-but-known rate is still better than the default — keep serving it.
            return cache.rate;
        }
        console.warn(
            `[fx] live rate unavailable (${err.message}) — using fallback ${config.defaultFxRate}.`,
        );
        cache = { at: now, rate: config.defaultFxRate };
        return config.defaultFxRate;
    }
}

const round2 = (n) => Math.round(n * 100) / 100;

// Convert a source price to Naira, applying the merchant's markup percent on top
// of the FX conversion. `markupPercent` is a percentage (e.g. 20 → ×1.20).
export async function priceToNaira(sourcePrice, sourceCurrency, markupPercent = 0) {
    const price = Number(sourcePrice);
    if (!Number.isFinite(price) || price < 0) return 0;

    const code = String(sourceCurrency || "").toUpperCase();
    if (code === config.currencyCode) {
        // Already Naira — just apply the markup.
        return round2(price * (1 + Number(markupPercent || 0) / 100));
    }

    const rate = await getNgnRate();
    return round2(price * rate * (1 + Number(markupPercent || 0) / 100));
}
