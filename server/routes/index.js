import oauthRouter from "./oauth.js";
import apiRouter from "./api.js";
import { createCatalogRouter } from "./products.js";
import importRouter from "./import.js";
import scrapeRouter from "./scrape.js";
import webhookRouter from "./webhooks.js";
import { notFound } from "../middleware/notFound.js";

// Register all BACKEND routes under clear prefixes. Called from server/index.js
// BEFORE the front end is mounted, so these take precedence over the SPA catch-all.
//
//   POST /webhooks            signed store events (raw body — see server/index.js)
//   GET  /oauth/start         begin OAuth 2.1 + PKCE install
//   GET  /oauth/callback      finish install (code → tokens)
//   GET  /api/me              install state + scopes for the front end
//   GET/POST /api/products    catalog list / create (Apps API proxy, gated)
//   GET/POST /api/categories  category list / create (Apps API proxy, gated)
//   POST /api/import          scrape a URL → convert to NGN → create a product
//   POST /api/scrape          scrape a URL → preview (no import)
//   GET  /api/fx/preview      live ₦ conversion for the preview form
export function registerRoutes(app, { io }) {
    app.use("/webhooks", webhookRouter(io));
    app.use("/oauth", oauthRouter);
    app.use("/api", apiRouter);

    // Resource CRUD. Mounted on their own /api/* sub-prefixes; the more general
    // apiRouter above owns /api/me + /api/context + /api/logout, so these fall through here.
    app.use("/api/import", importRouter);
    app.use("/api/scrape", scrapeRouter);
    app.use("/api/fx", scrapeRouter);
    app.use(
        "/api/products",
        createCatalogRouter({
            upstream: "/api/v1/products",
            listParams: ["page", "limit", "search", "category", "stock"],
        }),
    );
    app.use(
        "/api/categories",
        createCatalogRouter({
            upstream: "/api/v1/categories",
            listParams: ["page", "limit", "search"],
        }),
    );

    // Anything under a backend prefix that wasn't matched above is a genuine miss —
    // answer with a JSON 404 here rather than letting it fall through to the SPA
    // (which would return index.html and break a fetch() caller).
    app.use(["/api", "/oauth", "/webhooks"], notFound);
}
