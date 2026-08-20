import { readSession } from "../session.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Gate for every resource route that acts on the store's data.
//
// SECURITY — this is the single most important rule in the app: the store a
// request acts for is ALWAYS derived from the signed, HttpOnly session cookie
// (server/session.js), NEVER from a client-supplied value like ?shop=. The
// launch query exists only to seed a NEW install (the gate's OAuth start link);
// it can never grant access to an existing store's data. So resource routers
// read req.shop (set here) and nothing else.
//
// No valid session → 401. The front-end API client treats a 401 as "session is
// dead" and bounces back to the install gate (src/lib/api.js).
//
// CSRF — the session cookie is SameSite=None (required so it rides along inside
// the dashboard's cross-site iframe), which forfeits SameSite's CSRF shield. For
// state-changing methods we therefore require the request to be SAME-ORIGIN: the
// browser sets the Origin header on cross-site POST/PUT/DELETE, and if its host
// doesn't match the host the request was sent to, it's a forged cross-site call.
// (Comparing Origin's host to the Host header is config-independent — it doesn't
// depend on APP_BASE_URL being set perfectly.) GET/HEAD change no state, so they
// are exempt. The robust long-term upgrade is an App Bridge session token in an
// Authorization header instead of a cookie (see README → Before production).
export function requireShop(req, res, next) {
    if (!SAFE_METHODS.has(req.method)) {
        const origin = req.headers.origin;
        if (origin) {
            let originHost = null;
            try {
                originHost = new URL(origin).host;
            } catch {
                /* malformed Origin → treat as mismatch below */
            }
            if (originHost !== req.headers.host) {
                return res.status(403).json({
                    success: false,
                    message: "Cross-origin request blocked.",
                });
            }
        }
    }

    // The store this request acts for comes ENTIRELY from the single signed session
    // cookie — the app never sends a shop id. We verify the cookie's signature and
    // read the shop it was issued for; that's the only trusted source.
    const session = readSession(req);
    if (!session) {
        return res
            .status(401)
            .json({ success: false, message: "Not authenticated" });
    }
    // Server-derived + trusted; the rest of the request pipeline uses this.
    req.shop = session.shop;
    next();
}
