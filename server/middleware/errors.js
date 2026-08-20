// Final error backstop. Registered LAST in server/index.js (after the frontend),
// so any error thrown or passed to next(err) from a route lands here instead of
// crashing the process or hanging the request.
//
// Backend paths get a JSON body; everything else (the SPA) gets a short text
// response — the React app renders its own UI errors.
const BACKEND_PREFIXES = ["/api", "/oauth", "/webhooks"];

export function errorHandler(err, req, res, next) {
    console.error("[error]", err);

    // If headers are already sent, hand off to Express's default handler.
    if (res.headersSent) return next(err);

    res.status(err.status || 500);

    const isBackend = BACKEND_PREFIXES.some((p) => req.path.startsWith(p));
    if (isBackend) {
        return res.json({ error: err.message || "internal_error" });
    }
    res.send("Something went wrong.");
}
