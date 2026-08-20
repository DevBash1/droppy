import { Navigate, useLocation } from "react-router-dom";
import { useShop } from "../lib/shop.jsx";
import { getLaunchName } from "../lib/api.js";
import { Loading, NoShop } from "../components/States.jsx";

// Client route: /install — the entry / splash screen shown before install.
//
// The button is a plain <a>, NOT a react-router <Link>: installing leaves this
// origin for Salesive's consent screen, so it must be a real browser navigation.
// We lead with the merchant's own store NAME (from the launch URL's ?name=) — the
// store logo isn't fetchable until after install (it comes from the app-token
// /app/context endpoint), so it appears in the app header once installed. No
// permissions are surfaced here; they're reviewed on Salesive's consent screen.
export default function Install() {
    const { launchShop, me, loading, authenticated } = useShop();
    const location = useLocation();

    if (loading || !me) return <Loading />;
    // Already authenticated → send them to the app (preserve ?shop= in the URL).
    if (authenticated) return <Navigate to={`/${location.search}`} replace />;
    // No store to install for (opened outside the dashboard).
    if (!launchShop) return <NoShop />;

    const storeName = getLaunchName();

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 text-white">
            {/* Soft blue glows for depth. */}
            <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-400/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 right-0 h-64 w-64 translate-x-1/4 rounded-full bg-accent-500/20 blur-3xl" />

            <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
                {/* Logo */}
                <div
                    className="animate-splash relative mb-7"
                    style={{ animationDelay: "0ms" }}
                >
                    <div className="absolute inset-0 -z-10 rounded-[32px] bg-white/20 blur-2xl" />
                    <img
                        src="/logo.png"
                        alt="Droppy"
                        className="h-28 w-28 rounded-[28px] object-cover shadow-2xl shadow-black/30 ring-1 ring-white/20"
                    />
                </div>

                {/* App name */}
                <p
                    className="animate-splash text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-100"
                    style={{ animationDelay: "80ms" }}
                >
                    Droppy · Salesive
                </p>

                {/* Store name — the merchant's own store */}
                <h1
                    className="animate-splash mt-2 max-w-sm font-display text-3xl font-bold tracking-tight text-white"
                    style={{ animationDelay: "140ms" }}
                >
                    {storeName || "Your store"}
                </h1>

                {/* Tagline */}
                <p
                    className="animate-splash mt-3 max-w-xs text-sm leading-relaxed text-brand-100/80"
                    style={{ animationDelay: "200ms" }}
                >
                    Import products from Amazon and MercadoLibre — priced
                    in Naira with your markup — right into your Salesive store.
                </p>

                {/* CTA */}
                <a
                    href={me.installUrl}
                    className="animate-splash group mt-8 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-accent-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent-600/30 transition-all hover:bg-accent-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-accent-400/60 focus:ring-offset-2 focus:ring-offset-brand-800"
                    style={{ animationDelay: "270ms" }}
                >
                    Get started
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                        className="transition-transform group-hover:translate-x-0.5"
                    >
                        <path
                            d="M5 12h14M13 6l6 6-6 6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </a>

                {/* Footer */}
                <p
                    className="animate-splash mt-6 text-xs text-brand-100/60"
                    style={{ animationDelay: "330ms" }}
                >
                    Secured by Salesive
                </p>
            </div>
        </div>
    );
}
