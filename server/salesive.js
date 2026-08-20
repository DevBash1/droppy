import crypto from "crypto";
import { config, redirectUri } from "./config.js";
import { store } from "./store.js";

const base64url = (buf) =>
    buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

// ── PKCE (S256, required) ─────────────────────────────────────────────────────
export function createPkce() {
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(
        crypto.createHash("sha256").update(codeVerifier).digest(),
    );
    return { codeVerifier, codeChallenge };
}

export const randomState = () => base64url(crypto.randomBytes(16));

// ── OAuth discovery (cached) ──────────────────────────────────────────────────
// Read endpoints from the discovery doc rather than hardcoding — the consent
// screen lives on the dashboard host, the token endpoint on the API host.
let discoveryCache = null;
export async function getDiscovery() {
    if (discoveryCache) return discoveryCache;
    const res = await fetch(
        `${config.apiBase}/.well-known/oauth-authorization-server`,
    );
    if (!res.ok) throw new Error(`discovery failed (${res.status})`);
    discoveryCache = await res.json();
    return discoveryCache;
}

export async function buildAuthorizeUrl({ codeChallenge, state }) {
    const { authorization_endpoint } = await getDiscovery();
    const u = new URL(authorization_endpoint);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", config.clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", config.scopes);
    u.searchParams.set("code_challenge", codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("state", state);
    return u.toString();
}

// ── Token exchange + refresh ──────────────────────────────────────────────────
async function postToken(body) {
    const { token_endpoint } = await getDiscovery();
    const res = await fetch(token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        // Attach structure so callers can tell a definitive rejection (the grant is
        // gone) from a transient blip and react differently — see getValidAccessToken.
        const err = new Error(
            `token endpoint ${res.status}: ${JSON.stringify(data)}`,
        );
        err.status = res.status;
        err.oauthError = data?.error || null;
        throw err;
    }
    return data;
}

export function exchangeCode({ code, codeVerifier }) {
    return postToken({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: config.clientId,
        client_secret: config.clientSecret,
    });
}

export function refreshToken(refresh_token) {
    return postToken({
        grant_type: "refresh_token",
        refresh_token,
        client_id: config.clientId,
        client_secret: config.clientSecret,
    });
}

// Persist a token response onto the installation for a shop.
export async function persistTokens(shop, tokens, extra = {}) {
    // Refresh 60s before the real expiry to avoid races.
    const expiresAt = Date.now() + (Number(tokens.expires_in || 3600) - 60) * 1000;
    await store.saveInstallation(shop, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        scopes: tokens.scope || config.scopes,
        expiresAt,
        ...extra,
    });
    return store.getInstallation(shop);
}

// In-flight refresh, one promise per shop. The refresh token is SINGLE-USE and
// rotates: if several requests find an expired token at once and each POSTed the
// stored refresh token, only the first would succeed and the losers' invalid_grant
// would wrongly drop a healthy install. So concurrent callers share one refresh.
// NOTE: this dedups within ONE process only. With the MongoDB backend across
// multiple processes the race returns — reach for a short-lived DB lock there.
const refreshing = new Map();

// Return a non-expired access token, refreshing (and re-persisting the rotated
// refresh token) when needed. A refresh is de-duped per shop; a DEFINITIVE
// rejection (the merchant uninstalled → the grant is revoked) drops the dead
// install, but a transient failure (network, 5xx, discovery blip) leaves it intact
// so the next request can retry — deleting it would destroy the only copy of the
// refresh token.
export function getValidAccessToken(shop) {
    const key = String(shop);
    if (refreshing.has(key)) return refreshing.get(key);
    const p = resolveAccessToken(key).finally(() => refreshing.delete(key));
    refreshing.set(key, p);
    return p;
}

async function resolveAccessToken(shop) {
    const inst = await store.getInstallation(shop);
    if (!inst) return null;
    if (inst.expiresAt && Date.now() < inst.expiresAt) return inst.accessToken;
    if (!inst.refreshToken) return inst.accessToken;

    let tokens;
    try {
        tokens = await refreshToken(inst.refreshToken);
    } catch (err) {
        // 400/401 from the token endpoint = the grant is gone (uninstalled /
        // revoked): drop the install. Anything else is transient — keep it.
        if (err?.status === 400 || err?.status === 401) {
            await store.removeInstallation(shop);
        }
        return null;
    }
    // Rotation succeeded — persist the new pair. A write failure must NOT delete
    // the install (that would lose the freshly-issued single-use refresh token);
    // fall back to the token we just received if the read-back is racy.
    const updated = await persistTokens(shop, tokens, { shop });
    return updated?.accessToken ?? tokens.access_token;
}

// Call the Salesive API as the installed app. The store is bound to the token
// server-side, so you never send a shop id. A 401 means the app has been
// uninstalled (token revoked / installation inactive) — drop the install so the
// app re-prompts for consent instead of running with a dead token.
export async function callSalesiveApi(shop, pathWithQuery, options = {}) {
    const token = await getValidAccessToken(shop);
    if (!token) return { ok: false, status: 401, data: null };
    const res = await fetch(`${config.apiBase}${pathWithQuery}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });
    if (res.status === 401) await store.removeInstallation(shop);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
}

// Confirm the install is still active with Salesive (detects uninstalls before the
// UI trusts a stale local session). Pings /app/context — default-granted to every
// installed app, so it needs no scope: the auth layer rejects an uninstalled app
// with 401 (which callSalesiveApi clears) BEFORE any check, so this works
// regardless of which scopes were granted.
export async function verifyInstallation(shop) {
    if (!(await store.isInstalled(shop))) return false;
    await callSalesiveApi(shop, "/api/v1/app/context").catch(() => {});
    return store.isInstalled(shop);
}
