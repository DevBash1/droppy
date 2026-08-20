// Naira formatting + pricing helpers for the importer UI.

// Format a number as Naira, e.g. 25400.5 -> "₦25,400.50". Falls back to the raw
// number when Intl isn't available.
export function formatNaira(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    try {
        return new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: "NGN",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(n);
    } catch {
        return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
}

// Format a source (scraped) price with whatever currency symbol the scraper
// returned, e.g. "$19.99". Falls back to just the number when the symbol is unknown.
export function formatSourcePrice(value, currency) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const symbol = currency || "";
    const amount = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return symbol ? `${symbol}${amount}` : amount;
}
