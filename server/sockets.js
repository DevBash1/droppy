import { readSession } from "./session.js";

// Socket.io: each connected frontend is auto-joined to a room named after ITS shop,
// so a store's webhook events reach only that store's open tabs.
//
// SECURITY: the shop is read from the signed session cookie sent on the handshake —
// never from the client. No valid session → the handshake is rejected before any
// room is joined.
export function attachSockets(io) {
    io.use((socket, next) => {
        const session = readSession({ headers: socket.handshake.headers });
        if (!session) return next(new Error("unauthenticated"));
        // Server-derived + trusted; the room is the verified session shop.
        socket.data.shop = session.shop;
        next();
    });

    io.on("connection", (socket) => {
        socket.join(socket.data.shop);
        socket.emit("joined", { shop: socket.data.shop });
    });
}

// Push a payload to every frontend connected for a shop.
//
// `io` is null on serverless (api/index.js), where there are no sockets to push to —
// the webhook is still received, verified and processed, the UI just learns about it on
// its next poll instead. Returns whether the payload was actually pushed.
export function emitWebhook(io, shop, payload) {
    if (!io) return false;
    io.to(String(shop)).emit("webhook", payload);
    return true;
}
