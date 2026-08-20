import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The front end lives in client/ rather than the repo root on purpose: the deploy
// platform sniffs the root for a framework, and a root-level index.html + vite.config.js
// made it publish dist/ as a static site and never boot the server. From down here it
// sees only server/ + package.json, so it runs the Express app. Moving these files back
// to the root will silently break the deploy.
//
// The Node server (server/index.js) consumes this build:
//   • dev  → Vite runs in middleware mode INSIDE Express (same port, with HMR)
//   • prod → this build emits ../dist, which Express serves statically
// So there is only ever one port for the whole app.
export default defineConfig({
    root: __dirname,
    plugins: [react()],
    build: {
        outDir: path.resolve(__dirname, "../dist"),
        emptyOutDir: true,
    },
});
