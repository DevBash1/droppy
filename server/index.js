import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as IOServer } from "socket.io";
import { config, redirectUri, warnMissingConfig } from "./config.js";
import { createApp } from "./app.js";
import { store, initStore } from "./store.js";
import { attachSockets } from "./sockets.js";
import { serveFrontend } from "./frontend.js";
import { errorHandler } from "./middleware/errors.js";

// Entry point for a LONG-LIVED Node process — local dev and any always-on host
// (Pxxl, Render, Fly, a VM). The whole app runs on one port: API, OAuth, webhooks,
// socket.io and the front end.
//
// Deploying to Vercel instead? That uses api/index.js, which is serverless: no
// socket.io (the UI polls) and the front end is served by the CDN. See vercel.json
// and the "Deploying" section of the README.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

warnMissingConfig();

// socket.io needs the HTTP server and the app needs `io`, so the server is created
// first without a request handler, then express is attached.
//
// IMPORTANT: engine.io registers its OWN 'request' listener when the IOServer is
// constructed, and it must be the ONLY thing that answers /socket.io/ paths. If
// express also processed those requests (e.g. a polling request with a stale sid
// after a restart, which engine.io rejects with 404), both would write to the
// same response and crash with ERR_HTTP_HEADERS_SENT. So the wrapper below lets
// engine.io's listener handle /socket.io/ and delegates everything else to the
// app — engine.io runs first (it attached before this handler), so it wins.
const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/socket.io")) return;
    app(req, res);
});
// Same-origin (the front end is served from this very server, even when embedded
// in the dashboard iframe), so socket.io needs no CORS config.
const io = new IOServer(server);
attachSockets(io);

const app = createApp({ io });

// Front end — Vite middleware in dev, built dist + SPA fallback in prod. Mounted
// after the backend routes (inside createApp) so it only handles non-backend paths.
await serveFrontend(app, { root, server, isProd: config.isProd });

// Error backstop — last, so it can catch errors from any layer above.
app.use(errorHandler);

// Pick the storage backend before accepting traffic (in-memory by default, MongoDB
// when MONGODB_URI is set). Never fatal here — a MongoDB misconfig degrades to memory.
const storeKind = await initStore();

server.listen(config.port, () => {
    console.log(
        `\n  Salesive app starter → http://localhost:${config.port}  (${config.isProd ? "production" : "dev"})`,
    );
    console.log(`  Storage:              ${storeKind}`);
    console.log(`  Realtime:             ${config.realtime} (socket.io)`);
    console.log(`  OAuth redirect_uri:   ${redirectUri}`);
    console.log(`  Webhook endpoint:     POST ${config.appBaseUrl}/webhooks\n`);
});

// Close the store's connection cleanly on shutdown (a no-op for the in-memory store).
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        server.close();
        store.close().finally(() => process.exit(0));
    });
}
