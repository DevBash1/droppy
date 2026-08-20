import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useShop } from "../lib/shop.jsx";
import { apiGet, apiPost } from "../lib/api.js";
import { useAsync } from "../lib/hooks.js";
import { modelContext } from "../lib/webmcp.js";
import { BoxIcon, GridIcon, LogoutIcon } from "./icons.jsx";
import { cx } from "./ui.jsx";

const NAV_ITEMS = [
    { to: "/import", label: "Import", Icon: BoxIcon },
    { to: "/products", label: "Catalog", Icon: GridIcon },
];

// App shell for the installed experience. A slim, sticky top strip carries the
// app logo + wordmark, the nav (Import / Catalog), the current Salesive user
// (avatar + name, from the default-granted /app/context endpoint — no scope
// needed) and a log-out button. On narrow screens the top nav gives way to a
// thumb-reachable bottom tab bar. The <Outlet/> below is where the matched
// route renders.
export default function Layout() {
    const { logout } = useShop();

    // Default grant — store & user context. We only surface the user here.
    const { data: ctx } = useAsync(() => apiGet("/context"), []);
    const user = ctx?.user || null;

    // WebMCP tool for Ola (the merchant's dashboard assistant): look up a
    // product straight from its source URL, same scrape the Import page uses.
    // Registered once the authenticated shell mounts (session cookie is live)
    // and unregistered on unmount — Ola only sees it while this app is open.
    useEffect(() => {
        const controller = new AbortController();
        modelContext.registerTool(
            {
                name: "get_product_by_url",
                title: "Get product by URL",
                description:
                    "Scrape a product page (Amazon, AliExpress or MercadoLibre) by its URL and return its raw details — title, description, price, currency and images. Read-only: does not import anything into the store.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The product page URL to scrape.",
                        },
                    },
                    required: ["url"],
                },
                annotations: { readOnlyHint: true },
                async execute({ url }) {
                    const res = await apiPost("/scrape", { url });
                    if (!res?.product) {
                        throw new Error(res?.message || "Could not scrape that URL.");
                    }
                    return res.product;
                },
            },
            { signal: controller.signal },
        );
        return () => controller.abort();
    }, []);

    return (
        // Fill the iframe exactly (h-screen) and clip, so the PAGE never scrolls —
        // the header and bottom bar are fixed height and the content area between
        // them scrolls its own panes instead.
        <div className="brand-surface flex h-screen flex-col overflow-hidden text-gray-900">
            <header className="shrink-0 border-b border-gray-200/80 bg-white/80 backdrop-blur-md">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
                    <div className="flex min-w-0 items-center gap-4">
                        <Link to="/import" className="flex shrink-0 items-center gap-2">
                            <img
                                src="/logo.png"
                                alt="Droppy"
                                className="h-8 w-8 rounded-lg object-cover ring-1 ring-black/10"
                            />
                            <span className="font-display text-base font-bold tracking-tight text-brand-800 sm:text-lg">
                                Droppy
                            </span>
                        </Link>
                        {/* Desktop / tablet nav — becomes the bottom tab bar below sm. */}
                        <nav className="hidden items-center gap-1 sm:flex">
                            {NAV_ITEMS.map((item) => (
                                <NavItem key={item.to} {...item} />
                            ))}
                        </nav>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                        <UserBadge user={user} />
                        <button
                            type="button"
                            onClick={logout}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                        >
                            <LogoutIcon />
                            <span className="hidden sm:inline">Log out</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* The page area scrolls on its own: h-screen keeps the shell pinned
                and the header/tab bar fixed while <main> handles overflow. */}
            <main className="mx-auto w-full min-h-0 max-w-6xl flex-1 overflow-y-auto px-4 pb-8 pt-5 sm:px-6">
                <Outlet />
            </main>

            {/* Mobile bottom tab bar — thumb-reachable primary nav below sm. */}
            <nav className="flex shrink-0 items-stretch gap-1 border-t border-gray-200/80 bg-white/95 px-3 pb-safe pt-1.5 backdrop-blur-md sm:hidden">
                {NAV_ITEMS.map((item) => (
                    <TabItem key={item.to} {...item} />
                ))}
            </nav>
        </div>
    );
}

function NavItem({ to, label, Icon }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cx(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                        ? "bg-brand-700 text-white"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
                )
            }
        >
            <Icon className="h-4 w-4" />
            {label}
        </NavLink>
    );
}

function TabItem({ to, label, Icon }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cx(
                    "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
                    isActive ? "text-brand-700" : "text-gray-400 hover:text-gray-600",
                )
            }
        >
            {({ isActive }) => (
                <>
                    <span
                        className={cx(
                            "flex h-8 w-11 items-center justify-center rounded-full transition-colors",
                            isActive && "bg-brand-50",
                        )}
                    >
                        <Icon className="h-[18px] w-[18px]" />
                    </span>
                    {label}
                </>
            )}
        </NavLink>
    );
}

// The signed-in Salesive user: avatar + name. Falls back to an initial while the
// context loads or if the avatar is missing / fails to load. Hidden on the
// smallest screens (the bottom tab bar carries nav there) to keep the header lean.
function UserBadge({ user }) {
    const [broken, setBroken] = useState(false);

    if (!user) {
        return (
            <span className="hidden items-center gap-2 sm:flex">
                <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-gray-200" />
                <span className="hidden h-3 w-20 animate-pulse rounded bg-gray-200 md:block" />
            </span>
        );
    }

    const name = user.name || "You";
    const initial = (name.trim()[0] || "?").toUpperCase();

    return (
        <span className="hidden min-w-0 items-center gap-2 sm:flex">
            {user.avatar && !broken ? (
                <img
                    src={user.avatar}
                    alt=""
                    onError={() => setBroken(true)}
                    className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-black/5"
                />
            ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
                    {initial}
                </span>
            )}
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-gray-800 md:inline">
                {name}
            </span>
        </span>
    );
}
