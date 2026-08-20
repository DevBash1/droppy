import { callSalesiveApi } from "../salesive.js";

// Thin proxy from this app's own /api/* routes to the Salesive Apps API.
//
// The app's `app_` access token never leaves the server — these helpers call
// Salesive with the store-scoped token (callSalesiveApi binds the token to
// req.shop, which requireShop derived from the session) and pipe the standard
// Salesive envelope ({ status, success, message, data }) straight back to the
// browser. The React API client (src/lib/api.js) then reads `.data`.
//
// callSalesiveApi returns { ok, status, data } where `data` is the full
// envelope — or { ok:false, status:401, data:null } when the install is gone
// (token revoked / uninstalled). We forward the upstream status so a 401 reaches
// the client, which refetches /me and falls back to the install gate.
export async function proxy(req, res, next, { path, method = "GET", body }) {
    try {
        const options = { method };
        if (body !== undefined) options.body = JSON.stringify(body);

        const { status, data } = await callSalesiveApi(req.shop, path, options);

        // Never res.json(null): on a dropped install (no token) data is null, so
        // synthesize a JSON error the client can read.
        if (data == null) {
            return res.status(status || 502).json({
                success: false,
                message:
                    status === 401
                        ? "This store is no longer installed."
                        : "The Salesive API did not return a response.",
            });
        }
        return res.status(status || 200).json(data);
    } catch (err) {
        next(err);
    }
}

// Build a `?a=1&b=2` query string from only the whitelisted keys present on the
// incoming request — so the browser can't smuggle arbitrary params upstream and
// empty values are dropped.
export function passthroughQuery(query, allowed) {
    const params = new URLSearchParams();
    for (const key of allowed) {
        const value = query[key];
        if (value !== undefined && value !== null && String(value).length > 0) {
            params.set(key, String(value));
        }
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

// Encode a path segment (e.g. a record id) safely.
export const seg = (v) => encodeURIComponent(String(v));
