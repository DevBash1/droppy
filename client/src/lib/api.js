// The Salesive dashboard launches your app with ?shop=<id>&embedded=1&host=<origin>
// appended to your app URL. We read the store context (?shop=) from there to SEED
// an install — but it never authenticates the user; that's the session cookie's
// job (see server/session.js).

// The store id from the launch URL. Used only to start an install for / act on
// that store — never a trust signal (the signed session cookie decides auth).
//
// The dashboard only puts ?shop= on the LAUNCH url. react-router drops the query
// on client-side navigation, so after visiting /products a full reload would
// arrive with no ?shop= and the app couldn't tell which store it's for. We
// therefore remember the launched shop for the tab session and fall back to it
// when the URL has none. A store switch re-launches with a fresh ?shop= and
// overwrites it; closing the tab clears it.
const SHOP_KEY = "salesive.launchShop";

export function getShop() {
    const fromUrl = new URLSearchParams(window.location.search).get("shop");
    if (fromUrl) {
        try {
            sessionStorage.setItem(SHOP_KEY, fromUrl);
        } catch {
            /* storage blocked (private mode / partitioning) — just skip caching */
        }
        return fromUrl;
    }
    try {
        return sessionStorage.getItem(SHOP_KEY);
    } catch {
        return null;
    }
}

// The store's display name from the launch URL (?name=). Convenience only — for
// greeting the merchant before install, when there's no token to fetch the full
// store context yet. Never a trust signal.
export function getLaunchName() {
    const n = new URLSearchParams(window.location.search).get("name");
    return n ? n.trim() : null;
}

// True when the app is running inside the dashboard's iframe. Handy as an
// extension point — e.g. adapt the UI, or skip a redirect that won't work framed.
// Not wired into anything by default.
export function isEmbedded() {
    return new URLSearchParams(window.location.search).get("embedded") === "1";
}

// Ask the server who this browser is. `credentials: "include"` sends the session
// cookie — required because, embedded in the dashboard, the request is cross-site.
export async function fetchMe(shop) {
    const query = shop ? `?shop=${encodeURIComponent(shop)}` : "";
    const res = await fetch(`/api/me${query}`, { credentials: "include" });
    return res.json();
}

// ── Resource API client ───────────────────────────────────────────────────────
//
// Thin wrapper over fetch for the app's own /api/* CRUD routes. Every call sends
// the session cookie and unwraps the Salesive envelope ({status,success,message,
// data}) so callers get `.data` directly, or a thrown ApiError carrying the
// server's message.
//
// 401 handling is wired ONCE here: a 401 means the install was dropped (token
// revoked / uninstalled), so we notify a registered handler (ShopProvider) to
// refetch /me — which flips `authenticated` to false and bounces the UI back to
// the install gate, instead of leaving a half-broken page.

export class ApiError extends Error {
    constructor(status, message, body) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
    onUnauthorized = fn;
}

// End the single session server-side (clears the cookie), then callers refetch /me
// so the UI falls back to the install gate. The store stays installed — this only
// signs THIS browser out.
export async function logout() {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
}

async function request(path, { method = "GET", body } = {}) {
    const init = { method, credentials: "include" };
    if (body !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }

    // The server derives the acting store from the single signed session cookie
    // (credentials: "include" sends it), so resource calls carry no shop id.
    const res = await fetch(`/api${path}`, init);

    // Parse JSON defensively — an error page or empty body shouldn't throw a
    // confusing "Unexpected token" before we can surface the real status.
    let payload = null;
    try {
        payload = await res.json();
    } catch {
        /* leave payload null */
    }

    if (res.status === 401) {
        if (onUnauthorized) onUnauthorized();
        throw new ApiError(
            401,
            payload?.message || "Your session has expired.",
            payload,
        );
    }

    // Treat a non-2xx OR an envelope that explicitly says success:false as an error.
    if (!res.ok || payload?.success === false) {
        throw new ApiError(
            res.status,
            // Salesive envelopes carry the human-readable reason in `message`;
            // fall back to `error` for the few error shapes that use it.
            payload?.message ||
                payload?.error ||
                `Request failed (${res.status}).`,
            payload,
        );
    }

    // Unwrap the envelope's data; fall back to the whole payload if absent.
    return payload && "data" in payload ? payload.data : payload;
}

// Build a query string from a params object, dropping empty values.
export function toQuery(params = {}) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && String(v).length > 0) u.set(k, String(v));
    }
    const s = u.toString();
    return s ? `?${s}` : "";
}

export const apiGet = (path) => request(path);
export const apiPost = (path, body) => request(path, { method: "POST", body });
export const apiPut = (path, body) => request(path, { method: "PUT", body });
export const apiDelete = (path) => request(path, { method: "DELETE" });
