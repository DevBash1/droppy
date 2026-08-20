import crypto from "crypto";
import { config } from "./config.js";

// ── App session (single session) ────────────────────────────────────────────────
//
// WHY THIS EXISTS (read this — it's the security model of the starter):
//
// The dashboard launches your app with ?shop=<id> in the URL. That value is
// CLIENT-SUPPLIED and forgeable — anyone who knows a store's id could put it in the
// URL. So the server must NEVER treat ?shop= as proof of who you are.
//
// Instead we issue our OWN signed session at the only point we can trust: the end of
// the OAuth flow (server/routes/oauth.js → /oauth/callback). To reach that callback
// the visitor had to approve the install on Salesive's consent screen, which only
// the store's owner/staff can do. So a completed OAuth = proof the visitor controls
// that store. We bind a signed, HttpOnly cookie to the shop and, from then on, the
// server derives `shop` from THAT cookie — never from the request.
//
// ONE session per browser. The app is bound to a SINGLE store at a time: installing
// or authenticating for another store overwrites this cookie, and "log out" clears
// it (see POST /api/logout). There is no multi-store switching. The cookie is signed
// (HMAC-SHA256) so it can't be forged, and HttpOnly so a page script (or XSS) can't
// read or exfiltrate it.

const SESSION_COOKIE = "sa_session";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Sign with a dedicated SESSION_SECRET if set, else reuse the (required, secret)
// client secret. Without a secret, sessions are disabled (verify always fails).
const SECRET = process.env.SESSION_SECRET || config.clientSecret || "";

const sign = (payload) =>
    crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

// Token format: "<base64url(json)>.<base64url(hmac)>".
export function createSessionToken(shop, userId = null) {
    const payload = Buffer.from(
        JSON.stringify({
            shop: String(shop),
            userId: userId ? String(userId) : null,
            exp: Date.now() + TTL_MS,
        }),
    ).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

// Returns { shop, userId } for a valid, unexpired, untampered token — else null.
export function verifySessionToken(token) {
    if (!token || !SECRET) return null;
    const [payload, sig] = String(token).split(".");
    if (!payload || !sig) return null;

    // Constant-time signature check (reject before trusting any payload bytes).
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (!data.shop || !data.exp || Date.now() > data.exp) return null;
        return { shop: data.shop, userId: data.userId || null };
    } catch {
        return null;
    }
}

// SameSite=None + Secure is required so the cookie is sent when the app runs inside
// the dashboard's cross-site iframe. (Browsers reject SameSite=None without Secure;
// http://localhost counts as a secure context, so this works in local dev — but
// PRODUCTION MUST BE HTTPS.)
const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "none", path: "/" };

export function setSessionCookie(res, shop, userId = null) {
    res.cookie(SESSION_COOKIE, createSessionToken(shop, userId), {
        ...COOKIE_OPTS,
        maxAge: TTL_MS, // 30 days
    });
}

export function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
}

// Read + verify the single session from a request's cookies. Returns { shop, userId }
// or null. Accepts anything with `headers.cookie` (Express req or a socket handshake).
export function readSession(req) {
    return verifySessionToken(parseCookie(req.headers?.cookie, SESSION_COOKIE));
}

// One-time cleanup: clear leftover per-store cookies (sa_sess_<shopId>) from the old
// multi-session model so they don't linger after we've moved to a single session.
export function clearLegacyCookies(req, res) {
    const header = req.headers?.cookie;
    if (!header) return;
    for (const part of header.split(";")) {
        const name = part.slice(0, part.indexOf("=")).trim();
        if (name.startsWith("sa_sess_")) res.clearCookie(name, COOKIE_OPTS);
    }
}

// Minimal single-cookie reader (avoids a cookie-parser dependency).
export function parseCookie(header, name) {
    if (!header) return null;
    for (const part of header.split(";")) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === name) {
            return decodeURIComponent(part.slice(eq + 1).trim());
        }
    }
    return null;
}
