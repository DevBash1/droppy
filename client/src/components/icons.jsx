// Small inline SVG icons — no icon dependency, easy to swap for your own brand.

// A left arrow for "back" links. currentColor so a parent can tint it; sized to
// sit inline with small labels (override via className).
export function BackIcon({ className = "" }) {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={className}
        >
            <path
                d="M19 12H5m0 0 6-6m-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// A refresh glyph (two curved arrows). Always rendered in the Refresh button and
// spun with `animate-spin` while loading, so the button width never changes.
export function RefreshIcon({ className = "" }) {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={className}
        >
            <path
                d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// A "log out" glyph (door + exiting arrow). currentColor so a parent can tint it.
export function LogoutIcon({ className = "" }) {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={className}
        >
            <path
                d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l4 4-4 4M14 12H3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// Magnifying glass — search / filter fields.
export function SearchIcon({ className = "" }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function ChevronLeftIcon({ className = "" }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <path d="m14.5 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function ChevronRightIcon({ className = "" }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <path d="m9.5 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function ChevronDownIcon({ className = "" }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <path d="m6 9.5 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// A "plus" for adding something (create a new category, add an item).
export function PlusIcon({ className = "" }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

// A stylized link/URL glyph for the "paste a product URL" field.
export function LinkIcon({ className = "" }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <path
                d="M9.5 14.5 14.5 9.5M11 6.5l1-1a3.5 3.5 0 0 1 5 5l-1 1M13 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// Small "X" for removing an image chip / clearing a field.
export function XIcon({ className = "" }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

// Filled check in a circle — completed stepper stages.
export function CheckCircleIcon({ className = "" }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <circle cx="12" cy="12" r="10" fill="currentColor" />
            <path d="m8 12.5 2.5 2.5L16 9.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Photo / no-image placeholder glyph.
export function ImageIcon({ className = "" }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.6" />
            <path d="m5 17 4.5-4.5a2 2 0 0 1 2.8 0L15 15.2m2-1.7 1.5-1.5a2 2 0 0 1 2.8 0L21 11.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// A small play glyph — indicates a product video is attached.
export function PlayIcon({ className = "" }) {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
            <path d="M8 5.5v13l11-6.5L8 5.5Z" />
        </svg>
    );
}

// Nav icon — a shopping/import box (used for the "Import" tab).
export function BoxIcon({ className = "" }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <path
                d="M12 3 4 6.5v11L12 21l8-3.5v-11L12 3Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <path d="M4 6.5 12 10l8-3.5M12 10v11" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
    );
}

// Nav icon — a stacked grid (used for the "Catalog" tab).
export function GridIcon({ className = "" }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
            <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
            <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
            <rect x="13" y="13" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
        </svg>
    );
}
