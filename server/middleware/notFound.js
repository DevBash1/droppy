// JSON 404 for unmatched BACKEND routes.
//
// Mounted on the API prefixes (/api, /oauth, /webhooks) in server/routes/index.js
// so an unknown endpoint returns a clean JSON error instead of silently falling
// through to the SPA catch-all and serving index.html (which would surface to a
// fetch() caller as a confusing "Unexpected token < in JSON").
export function notFound(req, res) {
    res.status(404).json({ error: "not_found", path: req.originalUrl });
}
