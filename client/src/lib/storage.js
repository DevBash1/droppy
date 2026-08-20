// Local persistence for imported products + importer preferences.
//
// The catalog on the server is the source of truth, but a merchant's own imports
// are also saved to localStorage (keyed by shop) so they're instantly visible in
// the Catalog page even while the server list loads, and survive a store with an
// empty/failed catalog fetch. The merchant's markup % is remembered per shop so
// it doesn't need re-entering on every visit. Everything here is best-effort:
// storage can be blocked (private mode, partitioned storage), so every call is
// wrapped.

const KEY = (shop) => `droppy.imported.${shop || "default"}`;
const MARKUP_KEY = (shop) => `droppy.markup.${shop || "default"}`;

export function getImportedProducts(shop) {
    try {
        const raw = localStorage.getItem(KEY(shop));
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

// Add (or replace, by _id) a product in the local import log. Returns the new list.
export function saveImportedProduct(shop, product) {
    if (!product) return getImportedProducts(shop);
    const list = getImportedProducts(shop).filter((p) => p._id !== product._id);
    const next = [{ ...product, _local: true, importedAt: Date.now() }, ...list];
    try {
        localStorage.setItem(KEY(shop), JSON.stringify(next.slice(0, 200)));
    } catch {
        /* storage blocked or full — ignore */
    }
    return next;
}

// The merchant's last-used markup %, persisted per shop. Returns "" when unset.
export function getSavedMarkup(shop) {
    try {
        return localStorage.getItem(MARKUP_KEY(shop)) || "";
    } catch {
        return "";
    }
}

export function saveMarkup(shop, value) {
    try {
        if (value === "" || value == null) {
            localStorage.removeItem(MARKUP_KEY(shop));
        } else {
            localStorage.setItem(MARKUP_KEY(shop), String(value));
        }
    } catch {
        /* storage blocked or full — ignore */
    }
}
