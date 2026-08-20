import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    plugins: {
        // Point Tailwind at the config explicitly. Left to itself it looks for
        // tailwind.config.js from the working directory (the repo root, where npm
        // runs) upward, doesn't find it down here, and silently falls back to an
        // empty config — which still builds, but emits a stylesheet containing only
        // the base reset and none of the app's utilities.
        tailwindcss: { config: path.join(__dirname, "tailwind.config.js") },
        autoprefixer: {},
    },
};
