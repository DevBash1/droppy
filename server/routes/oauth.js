import { Router } from "express";
import { store } from "../store.js";
import {
    createPkce,
    randomState,
    buildAuthorizeUrl,
    exchangeCode,
    persistTokens,
    callSalesiveApi,
} from "../salesive.js";
import { setSessionCookie } from "../session.js";

// OAuth 2.1 + PKCE install flow. Mounted at /oauth in server/routes/index.js, so:
//   GET /oauth/start?shop=<id>   → begin the install (redirect to consent)
//   GET /oauth/callback          → finish the install (exchange code for tokens)
//
// Note we deliberately do NOT use the path /install for the OAuth start: /install
// is a CLIENT route (the React install gate). Keeping the backend on the /oauth/*
// prefix means a browser refresh of /install renders the gate instead of being
// shadowed by a server redirect.
const router = Router();

// GET /oauth/start?shop=<shopId>
// The Salesive dashboard launches your app URL with ?shop=… appended; the install
// gate's button forwards that here. We carry the shop through the OAuth `state` so
// we can key the installation on it back at the callback.
router.get("/start", async (req, res, next) => {
    try {
        const shop = req.query.shop ? String(req.query.shop) : null;
        const { codeVerifier, codeChallenge } = createPkce();
        const state = randomState();
        await store.putPending(state, { shop, codeVerifier });
        const url = await buildAuthorizeUrl({ codeChallenge, state });
        res.redirect(url);
    } catch (err) {
        next(err);
    }
});

// GET /oauth/callback?code=&state=
// Salesive redirects here after the merchant approves. We verify `state` (CSRF +
// PKCE binding), exchange the code for tokens (verifier + client secret), and
// persist the installation, then bounce the merchant back into the app.
router.get("/callback", async (req, res, next) => {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`Authorization denied: ${error}`);

    const pending = state ? await store.takePending(String(state)) : null;
    if (!pending) {
        return res
            .status(400)
            .send("Invalid or expired install state. Please start the install again.");
    }
    if (!code) return res.status(400).send("Missing authorization code.");

    try {
        const tokens = await exchangeCode({
            code: String(code),
            codeVerifier: pending.codeVerifier,
        });
        // Key the install on the shop captured from the launch URL; fall back to a
        // shop the token response may carry.
        const shop = pending.shop || tokens.shop || tokens.shop_id;
        if (!shop) {
            return res
                .status(400)
                .send("Could not determine which store this install is for.");
        }
        await persistTokens(shop, tokens, { shop });

        // Resolve the Salesive userId who just authorised the app (kept on the
        // session for reference). Best-effort — a transient failure just leaves it
        // null and doesn't block the install.
        let userId = null;
        try {
            const ctx = await callSalesiveApi(shop, "/api/v1/app/context");
            if (ctx.ok) userId = ctx.data?.data?.user?.id?.toString() ?? null;
        } catch {}

        // Bind THIS browser to the shop with the single signed, HttpOnly session
        // cookie — OVERWRITING any previous session (one store at a time). This is
        // the security anchor: from here on the server trusts the cookie, not
        // ?shop=, to decide who you are. (See server/session.js.)
        setSessionCookie(res, shop, userId);

        // Full-page redirect back into the SPA; the client boots at "/" and, seeing
        // it now has a valid session, renders the app instead of the gate.
        res.redirect(`/?shop=${encodeURIComponent(shop)}&installed=1`);
    } catch (err) {
        next(err);
    }
});

export default router;
