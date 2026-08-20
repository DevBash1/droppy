import dotenv from "dotenv";
dotenv.config();

const REQUIRED = [
    "SALESIVE_CLIENT_ID",
    "SALESIVE_CLIENT_SECRET",
    "SALESIVE_WEBHOOK_SECRET",
];

const port = Number(process.env.PORT || 3000);

// Vercel sets VERCEL=1 in both the build and the function runtime. Serverless changes
// two things that the rest of the app has to know about: instances share no memory (so
// the in-memory store can't back an OAuth install — see server/store.js), and there is
// no socket.io (see api/index.js).
const isServerless = Boolean(process.env.VERCEL);

// On Vercel, fall back to the project's stable production domain if APP_BASE_URL isn't
// set. Deliberately NOT VERCEL_URL: that's the per-deployment URL and changes on every
// push, so it can never be a registered OAuth redirect URI.
const vercelBaseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "";

// Resolve the public base URL. For localhost we always use the port the server
// actually runs on — a stale hardcoded port in APP_BASE_URL is the #1 cause of an
// unreachable OAuth redirect_uri in local dev, so we just fix it. Public/tunnel
// URLs are used exactly as given.
function resolveAppBaseUrl(raw, p) {
    const fallback = `http://localhost:${p}`;
    // A scheme-less value ("localhost:4000", "myapp.outray.io" — the usual
    // tunnel-URL paste) either parses as a bogus opaque URL or throws, silently
    // breaking the redirect_uri. Prepend a scheme: http for local, https otherwise.
    if (raw && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
        const isLocal = /^(localhost|127\.0\.0\.1)([:/]|$)/i.test(raw);
        raw = (isLocal ? "http://" : "https://") + raw;
    }
    let url;
    try {
        url = new URL(raw || fallback);
    } catch {
        console.warn(
            `[config] APP_BASE_URL ${JSON.stringify(raw)} is not a valid URL — using ${fallback}.`,
        );
        return fallback;
    }
    if (
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.port !== String(p)
    ) {
        url.port = String(p);
    }
    return url.toString().replace(/\/$/, "");
}

export const config = {
    port,
    isProd: process.env.NODE_ENV === "production",
    isServerless,
    // How the front end learns that store data changed. A long-lived process pushes
    // over socket.io; a serverless deployment can't (see api/index.js), so the UI
    // polls instead. /api/me hands this to the client, so the same build works on
    // both hosts with nothing to configure.
    realtime: isServerless ? "poll" : "socket",
    appBaseUrl: resolveAppBaseUrl(process.env.APP_BASE_URL || vercelBaseUrl, port),
    clientId: process.env.SALESIVE_CLIENT_ID || "",
    clientSecret: process.env.SALESIVE_CLIENT_SECRET || "",
    webhookSecret: process.env.SALESIVE_WEBHOOK_SECRET || "",
    // Scopes are configured here in code, comma-separated. Normalised to the
    // standard space-separated form used on the OAuth `scope` wire param.
    scopes: (process.env.SALESIVE_SCOPES ||
        "READ_INVENTORY WRITE_INVENTORY READ_CATEGORIES WRITE_CATEGORIES")
        .split(/[\s,]+/)
        .filter(Boolean)
        .join(" "),
    apiBase: (process.env.SALESIVE_API_BASE || "https://api.salesive.com").replace(
        /\/$/,
        "",
    ),
    // Currency conversion for the importer. FX_API_URL must return a JSON body
    // with a `rates`/`conversion_rates` map (open.er-api.com needs no key).
    // DEFAULT_FX_RATE is the manual fallback when the API is unreachable.
    fxApiUrl:
        process.env.FX_API_URL || "https://open.er-api.com/v6/latest/USD",
    defaultFxRate: Number(process.env.DEFAULT_FX_RATE || 1500),
    defaultMarkupPercent: Number(process.env.DEFAULT_MARKUP_PERCENT || 20),
    currencyCode: (process.env.CURRENCY_CODE || "NGN").toUpperCase(),
    // Optional MongoDB connection string (db name from the URI path). Leave unset
    // to use the zero-config in-memory store; set it to persist installs.
    mongoUri: process.env.MONGODB_URI || "",
};

export const redirectUri = `${config.appBaseUrl}/oauth/callback`;

export function warnMissingConfig() {
    const missing = REQUIRED.filter((k) => !process.env[k]);
    if (missing.length) {
        console.warn(
            `[config] Missing env: ${missing.join(", ")}. Copy .env.example to .env and fill these in — OAuth and webhook verification won't work until you do.`,
        );
    }

    // localhost is only reachable for installs you trigger from THIS machine.
    // Real Salesive installs need a public URL.
    try {
        const u = new URL(config.appBaseUrl);
        if (["localhost", "127.0.0.1"].includes(u.hostname)) {
            console.warn(
                `[config] APP_BASE_URL is ${config.appBaseUrl} — OK for testing from this machine. For real installs, expose this port with a tunnel (outray, ngrok, …) and set APP_BASE_URL to the public URL. Register ${config.appBaseUrl}/oauth/callback as a redirect URI on your app.`,
            );
        }
    } catch {
        /* ignore malformed APP_BASE_URL */
    }
}
