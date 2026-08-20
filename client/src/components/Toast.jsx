import {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
} from "react";
import { cx } from "./ui.jsx";

// Tiny toast system for success/error feedback after a create / update / delete.
// useToast() returns { success, error } — call them with a message.

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timers = useRef(new Map());

    const dismiss = useCallback((id) => {
        setToasts((list) => list.filter((t) => t.id !== id));
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const push = useCallback(
        (tone, message) => {
            const id = nextId++;
            setToasts((list) => [...list, { id, tone, message }]);
            timers.current.set(
                id,
                setTimeout(() => dismiss(id), 4500),
            );
        },
        [dismiss],
    );

    const api = useRef({
        success: (m) => push("success", m),
        error: (m) => push("error", m),
    });

    return (
        <ToastContext.Provider value={api.current}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
                {toasts.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => dismiss(t.id)}
                        className={cx(
                            "animate-splash pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-medium shadow-lift",
                            t.tone === "error"
                                ? "bg-red-600 text-white"
                                : "bg-gray-900 text-white",
                        )}
                    >
                        <ToastGlyph tone={t.tone} />
                        <span className="min-w-0 flex-1">{t.message}</span>
                    </button>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastGlyph({ tone }) {
    return (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
            {tone === "error" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
            ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m5 13 4.5 4.5L19 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            )}
        </span>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
    return ctx;
}
