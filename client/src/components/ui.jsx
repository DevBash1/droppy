import { Link } from "react-router-dom";
import { BackIcon } from "./icons.jsx";

// Shared, dependency-free UI primitives for the CRUD pages. Styling matches the
// starter's Tailwind setup and the `salesive` brand palette (tailwind.config.js).

export function cx(...parts) {
    return parts.filter(Boolean).join(" ");
}

// ── Layout / headings ─────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, actions, back }) {
    return (
        <div className="mb-6">
            {back && (
                <Link
                    to={back.to}
                    className="mb-2 inline-flex items-center gap-1 text-xs font-medium leading-none text-gray-500 transition-colors hover:text-brand-700"
                >
                    <BackIcon className="h-3.5 w-3.5 shrink-0" />
                    {back.label || "Back"}
                </Link>
            )}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-gray-500">
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && (
                    <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}

export function Card({ children, className, hoverable = false }) {
    return (
        <div
            className={cx(
                "rounded-2xl border border-gray-200/80 bg-white shadow-soft",
                hoverable &&
                    "transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift",
                className,
            )}
        >
            {children}
        </div>
    );
}

// ── Buttons ───────────────────────────────────────────────────────────────────

const BTN_BASE =
    "inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";
const BTN_VARIANT = {
    primary:
        "bg-brand-700 text-white shadow-sm shadow-brand-700/20 hover:bg-brand-800 hover:shadow-md hover:shadow-brand-700/25",
    accent:
        "bg-accent-500 text-white shadow-sm shadow-accent-600/25 hover:bg-accent-600 hover:shadow-md hover:shadow-accent-600/30",
    secondary:
        "border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50",
    danger: "bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700",
    ghost: "text-gray-600 hover:bg-gray-100",
};
const BTN_SIZE = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-4 py-2.5",
    lg: "px-6 py-3 text-base",
};

export function Button({
    variant = "primary",
    size = "md",
    loading = false,
    className,
    children,
    to,
    type = "button",
    disabled,
    ...props
}) {
    const cls = cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className);
    if (to) {
        return (
            <Link to={to} className={cls} {...props}>
                {children}
            </Link>
        );
    }
    return (
        <button
            type={type}
            className={cls}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <Spinner className="h-3.5 w-3.5" />}
            {children}
        </button>
    );
}

// Compact icon-only button — pagination controls, dismissing an image chip, a
// refresh affordance next to a heading. 36px min hit target for touch.
export function IconButton({ className, children, label, ...props }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={cx(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white",
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
}

// ── Form controls ─────────────────────────────────────────────────────────────

export function Field({ label, htmlFor, hint, error, required, children }) {
    return (
        <label htmlFor={htmlFor} className="block">
            {label && (
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    {label}
                    {required && <span className="ml-0.5 text-accent-600">*</span>}
                </span>
            )}
            {children}
            {error ? (
                <span className="mt-1 block text-xs text-red-600">{error}</span>
            ) : (
                hint && (
                    <span className="mt-1 block text-xs text-gray-400">{hint}</span>
                )
            )}
        </label>
    );
}

const CONTROL =
    "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:bg-gray-50 disabled:text-gray-500";

export function Input({ className, ...props }) {
    return <input className={cx(CONTROL, className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }) {
    return <textarea rows={rows} className={cx(CONTROL, className)} {...props} />;
}

export function Select({ className, children, ...props }) {
    return (
        <select className={cx(CONTROL, "pr-8", className)} {...props}>
            {children}
        </select>
    );
}

// A search input with a leading magnifying-glass icon — used by the catalog
// filter box and any other "filter this list" affordance.
export function SearchInput({ className, ...props }) {
    return (
        <div className={cx("relative", className)}>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <SearchGlyph />
            </span>
            <input
                type="search"
                className={cx(CONTROL, "pl-9")}
                {...props}
            />
        </div>
    );
}

function SearchGlyph() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

// ── Badges / stats ────────────────────────────────────────────────────────────

const BADGE_TONE = {
    gray: "bg-gray-100 text-gray-600",
    blue: "bg-sky-100 text-sky-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    indigo: "bg-indigo-100 text-indigo-700",
    brand: "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100",
    accent: "bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100",
};

export function Badge({ tone = "gray", children, className }) {
    return (
        <span
            className={cx(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                BADGE_TONE[tone] || BADGE_TONE.gray,
                className,
            )}
        >
            {children}
        </span>
    );
}

export function Stat({ label, value, hint, tone }) {
    return (
        <Card className="px-4 py-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {label}
            </p>
            <p
                className={cx(
                    "mt-1 font-display text-2xl font-semibold",
                    tone === "red"
                        ? "text-red-600"
                        : tone === "amber"
                          ? "text-amber-600"
                          : "text-gray-900",
                )}
            >
                {value}
            </p>
            {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
        </Card>
    );
}

// ── Loading placeholders ─────────────────────────────────────────────────────

// A shimmering placeholder block. Sized entirely via className (h-4 w-24, etc.)
// so callers can mimic the shape of the content that's still loading.
export function Skeleton({ className }) {
    return (
        <div
            aria-hidden="true"
            className={cx("skeleton rounded-lg", className)}
        />
    );
}

export function Spinner({ className }) {
    return (
        <svg
            className={cx("animate-spin text-current", className || "h-4 w-4")}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
            />
        </svg>
    );
}
