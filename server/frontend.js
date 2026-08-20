import path from "path";
import fs from "fs";
import express from "express";

// Serve the React front end from the SAME Express server, so the whole app lives
// on one port. This is mounted AFTER the backend routes (and their JSON 404), so
// it only ever handles non-backend paths.
//
//   • dev  → run Vite in middleware mode (HMR shares this server's HTTP/ws).
//   • prod → serve the built ./dist with an SPA catch-all for client routing.
export async function serveFrontend(app, { root, server, isProd }) {
    if (isProd) {
        const dist = path.join(root, "dist");
        if (!fs.existsSync(path.join(dist, "index.html"))) {
            console.warn(
                "[server] dist/ not found — run `npm run build` before `npm start`.",
            );
        }
        app.use(express.static(dist));
        // SPA fallback: any unmatched GET returns index.html so the client router
        // (react-router) can resolve the path. Backend 404s were already handled
        // upstream, so this never swallows a real API miss.
        app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
        return;
    }

    // Dev: Vite serves the React app + HMR through Express on this one port. If you
    // ever hit a websocket "handleUpgrade" conflict with socket.io, give HMR its
    // own dev ws port instead: hmr: { port: <something> }.
    //
    // Vite's root is client/, not the repo root — that's where index.html, src/ and
    // vite.config.js live (see client/vite.config.js for why).
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
        root: path.join(root, "client"),
        appType: "spa",
        server: { middlewareMode: true, hmr: { server } },
    });
    app.use(vite.middlewares);
}
