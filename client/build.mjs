// Production build for the front end, invoked by `npm run build`.
//
// This exists instead of a plain `vite build` in package.json for the same reason the
// Vite config lives in client/ and not the repo root: the deploy platform sniffs the
// project for a front-end framework, and anything that reads as "Vite app" makes it
// publish dist/ as a static site instead of booting the Express server. Calling Vite's
// JS API here keeps the build working while the root stays a plain Node/Express app.
import path from "path";
import { fileURLToPath } from "url";
import { build } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// configFile must be a string path — Vite passes it to path.resolve, which rejects a URL.
await build({ configFile: path.join(__dirname, "vite.config.js") });
