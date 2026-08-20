import express from "express";
import morgan from "morgan";
import { config } from "./config.js";
import { registerRoutes } from "./routes/index.js";

// The Express app, with no assumptions about how it's hosted. Two entry points build
// on it — read whichever one matches where you're deploying:
//
//   • server/index.js — a long-lived Node process (local dev, Pxxl, Render, Fly …).
//     Adds socket.io, serves the front end (Vite in dev · dist in prod), and listens
//     on a port. This is the full-featured path.
//   • api/index.js    — a Vercel serverless function. No socket.io (the webhook and
//     the browser's socket land on different instances, with no fan-out between
//     them), and the front end is served by Vercel's CDN rather than Express.
//
// Middleware order matters; read top-to-bottom.
export function createApp({ io = null } = {}) {
    const app = express();

    // 1) HTTP request logging — concise colored output in dev, Apache "combined" in prod.
    //    Skip Vite HMR / asset requests so the log stays readable during development.
    app.use(
        morgan(config.isProd ? "combined" : "dev", {
            skip: (req) =>
                /^\/@(vite|fs|id)|^\/__vite|^\/node_modules/.test(req.path),
        }),
    );

    // 2) Body parsing. Webhooks need the RAW bytes for HMAC verification, so mount
    //    express.raw scoped to /webhooks BEFORE express.json. (body-parser sets a
    //    _body flag that makes json skip an already-parsed request, so swapping these
    //    two lines would silently break signature checks.)
    app.use("/webhooks", express.raw({ type: "*/*", limit: "1mb" }));
    app.use(express.json());

    // 3) Backend routes (+ a JSON 404 for unmatched /api · /oauth · /webhooks).
    //    `io` is null on serverless — emitWebhook() then no-ops and the browser polls.
    registerRoutes(app, { io });

    return app;
}
