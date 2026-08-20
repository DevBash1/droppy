import { createApp } from "../server/app.js";
import { initStore } from "../server/store.js";
import { warnMissingConfig } from "../server/config.js";
import { errorHandler } from "../server/middleware/errors.js";

// Entry point for VERCEL. An Express app is already a (req, res) handler, so Vercel's
// Node runtime can take it as the default export. vercel.json rewrites /api/*, /oauth/*
// and /webhooks here; everything else is served from the static build (dist/) by the CDN.
//
// Two differences from the long-lived server (server/index.js):
//
//   • No socket.io. A webhook POST and the browser's socket land on DIFFERENT function
//     instances and Vercel gives you no fan-out between them, so a push would emit into
//     the void. `io: null` makes emitWebhook() a no-op, and /api/me reports
//     realtime:"poll" so the UI refetches on an interval instead. Silent-failure risk if
//     you "fix" this by passing an io here: it will look connected and never deliver.
//   • No Express static serving — Vercel's CDN owns dist/.
//
// MONGODB_URI is REQUIRED here (initStore throws without it): instances don't share
// memory, so the in-memory store would put the pending OAuth state on one instance and
// look for it on another, breaking every install.

warnMissingConfig();

// Top-level await runs once per cold start, not per request — the Mongo connection is
// then reused by every invocation this instance handles.
await initStore();

const app = createApp({ io: null });
app.use(errorHandler);

export default app;
