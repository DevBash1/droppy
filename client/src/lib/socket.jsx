import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useShop } from "./shop.jsx";

// How pages learn that store data changed. There are two delivery modes, and the
// SERVER picks which one via `realtime` on /api/me (see server/config.js) — so the
// same build is correct on every host and there's no build-time flag to forget:
//
//   • "socket" — a long-lived server (local dev, Pxxl, Render …) pushes webhook
//     payloads over socket.io the moment they arrive. Same-origin + withCredentials
//     sends the HttpOnly session cookie on the handshake, and the SERVER derives which
//     store's room to join from that session (server/sockets.js) — the client never
//     names a room. We only open the socket once authenticated, so the install gate
//     doesn't spin on a rejected handshake.
//
//   • "poll" — a serverless deployment (Vercel). The webhook lands on a different
//     function instance than the browser's socket would, with no fan-out between them,
//     so nothing can be pushed. Instead we tick on an interval (and on refocus, which
//     is when a user is most likely to be looking at stale data) and let subscribers
//     refetch. A poll tick carries no resource — see shouldRefetch().
//
// Either way, pages subscribe the same way: useWebhook().

const POLL_INTERVAL_MS = 10_000;

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
    const { authenticated, realtime } = useShop();
    const listeners = useRef(new Set());

    const dispatch = useCallback((payload) => {
        for (const fn of listeners.current) {
            try {
                fn(payload);
            } catch {
                /* a misbehaving listener must not kill the others */
            }
        }
    }, []);

    // Push mode.
    useEffect(() => {
        if (!authenticated || realtime !== "socket") return undefined;
        const socket = io({ withCredentials: true });
        socket.on("webhook", dispatch);
        return () => socket.close();
    }, [authenticated, realtime, dispatch]);

    // Poll mode. Deliberately does NOT open a socket: there's no server holding one,
    // so socket.io-client would just retry a failing handshake forever.
    //
    // Interval only — refetch-on-refocus is already handled per-page by
    // useVisibilityRefetch (client/src/lib/hooks.js). Ticking here on focus too would
    // just fire every subscriber's fetch twice.
    useEffect(() => {
        if (!authenticated || realtime !== "poll") return undefined;
        const id = setInterval(() => dispatch({ type: "poll" }), POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [authenticated, realtime, dispatch]);

    return (
        <SocketContext.Provider value={{ listeners }}>
            {children}
        </SocketContext.Provider>
    );
}

// Subscribe to store-change notifications. `handler` is called with each payload:
// a real webhook ({ type:"event"|"record", event, resource, ... }) in socket mode, or
// { type:"poll" } in poll mode. Keep `deps` stable; the handler is re-registered when
// they change. Typical use: refetch a list when its resource changes — and the right
// way to decide that is shouldRefetch(), not a bare resource comparison.
export function useWebhook(handler, deps = []) {
    const ctx = useContext(SocketContext);
    const ref = useRef(handler);
    ref.current = handler;

    useEffect(() => {
        if (!ctx) return undefined;
        const fn = (payload) => ref.current(payload);
        ctx.listeners.current.add(fn);
        return () => ctx.listeners.current.delete(fn);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx, ...deps]);
}

// The resource name carried by a webhook payload, whichever shape it arrived in.
// A poll tick has none — polling can't know WHAT changed, only that it's time to look.
export function webhookResource(payload) {
    return payload?.resource || payload?.event?.resource || null;
}

// Should a subscriber watching `resource` refetch for this payload? True for a webhook
// about that resource, and for any poll tick.
//
// Compare resources through this rather than `webhookResource(p) === "notes"`: on a
// serverless deployment every payload is a poll tick with no resource, so a bare
// comparison silently never matches and the page simply stops updating.
export function shouldRefetch(payload, resource) {
    return payload?.type === "poll" || webhookResource(payload) === resource;
}
