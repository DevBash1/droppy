import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    getShop,
    fetchMe,
    logout as apiLogout,
    setUnauthorizedHandler,
} from "./api.js";

// App-wide context. Two distinct notions of "shop" live here on purpose:
//
//   • launchShop — the ?shop= from the dashboard launch URL. CLIENT-SUPPLIED and
//                  only used to start an install for that store (the gate's button).
//   • me.shop    — the store the SERVER says this browser is authenticated for,
//                  derived from the single signed session cookie. This is trusted.
//
// Access decisions use `authenticated` / `me.shop`, never launchShop.
const ShopContext = createContext(null);

export function ShopProvider({ children }) {
    const launchShop = useMemo(() => getShop(), []);
    const [me, setMe] = useState(null);
    const [loading, setLoading] = useState(true);

    // Always ask the server (it reads the session cookie); pass launchShop so it
    // can build the right install link for the gate.
    //
    // `loading` is the INITIAL gate only — it starts true and is lowered once, when
    // the first /me resolves. Revalidations (a 401 handler, a store switch) must
    // NOT raise it again: doing so makes RequireInstall swap the app for <Loading/>,
    // which unmounts the resource pages, which re-runs their fetches on remount —
    // and if one of those fetches is the thing that 401'd, that's an infinite
    // refetch/remount loop. So we only ever update `me` here; the gate stays down.
    const refetch = useCallback(async () => {
        try {
            setMe(await fetchMe(launchShop));
        } finally {
            setLoading(false);
        }
    }, [launchShop]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    // Sign this browser out (clears the session cookie), then re-ask /me so the UI
    // drops back to the install gate. The store stays installed.
    const logout = useCallback(async () => {
        try {
            await apiLogout();
        } finally {
            await refetch();
        }
    }, [refetch]);

    // A 401 from any resource call means the install was dropped server-side
    // (token revoked / uninstalled). Re-ask /api/me so `authenticated` flips
    // false and the install guard takes over — one place, wired once.
    useEffect(() => {
        setUnauthorizedHandler(() => refetch());
        return () => setUnauthorizedHandler(null);
    }, [refetch]);

    const value = useMemo(
        () => ({
            launchShop,
            me,
            loading,
            refetch,
            logout,
            authenticated: Boolean(me?.authenticated),
            shop: me?.shop || null,
            // "socket" (long-lived server pushes) or "poll" (serverless). The server
            // decides — see server/config.js. Default to socket for older servers that
            // don't report it; a never-connecting socket is a safer default than a
            // poller that hammers the API on a host that doesn't need one.
            realtime: me?.realtime === "poll" ? "poll" : "socket",
        }),
        [launchShop, me, loading, refetch, logout],
    );
    return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
    const ctx = useContext(ShopContext);
    if (!ctx) throw new Error("useShop must be used within <ShopProvider>");
    return ctx;
}
