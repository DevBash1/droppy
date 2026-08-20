import { useCallback, useEffect, useRef, useState } from "react";

// Re-run `refetch` whenever the tab regains focus / becomes visible again. This is
// the primary freshness mechanism for resources without a webhook push (the
// catalog): a merchant who edits a product in the Salesive dashboard and switches
// back to this app sees the change without a manual reload. `refetch` should be stable
// (e.g. the one returned by useAsync).
export function useVisibilityRefetch(refetch) {
    const last = useRef(0);
    useEffect(() => {
        const run = () => {
            // Returning to a tab can fire BOTH "focus" and "visibilitychange";
            // dedupe within 1s so one tab switch is a single API call.
            const now = Date.now();
            if (now - last.current < 1000) return;
            last.current = now;
            refetch();
        };
        const onVisible = () => {
            if (document.visibilityState === "visible") run();
        };
        window.addEventListener("focus", run);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.removeEventListener("focus", run);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refetch]);
}

// Run an async loader and track { data, loading, error } with a refetch(). The
// loader is whatever you pass (usually an apiGet call). Re-runs whenever `deps`
// change. A ref guards against setting state after unmount or out-of-order
// responses (the last request to start always wins).
export function useAsync(loader, deps = []) {
    const [state, setState] = useState({
        data: null,
        loading: true,
        error: null,
    });
    const reqId = useRef(0);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const run = useCallback(async () => {
        const id = ++reqId.current;
        setState((s) => ({ ...s, loading: true, error: null }));
        try {
            const data = await loader();
            if (mounted.current && id === reqId.current) {
                setState({ data, loading: false, error: null });
            }
        } catch (error) {
            if (mounted.current && id === reqId.current) {
                // Preserve already-loaded data: a failed BACKGROUND refetch (tab
                // focus, a webhook, manual refresh) must not blow away content
                // that's on screen. Consumers show the full ErrorState only when
                // there's no data yet (`error && !data`); with data present they
                // keep rendering it. On the next successful run `error` clears.
                setState((s) => ({ ...s, loading: false, error }));
            }
        }
        // loader is intentionally re-created by callers via deps below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        run();
    }, [run]);

    return { ...state, refetch: run };
}
