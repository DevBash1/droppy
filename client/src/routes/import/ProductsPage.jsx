import { useMemo, useState } from "react";
import { apiGet } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { useShop } from "../../lib/shop.jsx";
import { ChevronLeftIcon, ChevronRightIcon, GridIcon, ImageIcon } from "../../components/icons.jsx";
import { Button, Card, IconButton, PageHeader, SearchInput, Skeleton } from "../../components/ui.jsx";
import { formatNaira } from "../../lib/currency.js";
import { getImportedProducts } from "../../lib/storage.js";

const PER_PAGE = 20;

// The store's catalog. The server list is the source of truth; products imported
// on this browser are merged in from localStorage (keyed by shop) so they show up
// instantly and survive an empty catalog fetch. Paginated with a client-side
// search box (the Apps API supports server-side `search`, but a local filter over
// one page keeps it snappy).
export default function ProductsPage() {
    const { shop } = useShop();
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState("");

    const { data, loading, error, refetch } = useAsync(
        () => apiGet(`/products?page=${page}&limit=${PER_PAGE}`),
        [page],
    );

    // Locally-saved imports for this shop, newest first, deduped against the
    // server list by _id so a product never shows twice.
    const local = useMemo(() => {
        const serverIds = new Set((data?.products || []).map((p) => p._id));
        return getImportedProducts(shop).filter((p) => !serverIds.has(p._id));
    }, [data, shop]);

    const merged = useMemo(() => {
        const list = data?.products || [];
        return [...list, ...local].sort(
            (a, b) => new Date(b.importedAt || b.createdAt || 0) - new Date(a.importedAt || a.createdAt || 0),
        );
    }, [data, local]);

    const pagination = data?.pagination || {};

    const shown = filter.trim()
        ? merged.filter((p) =>
              String(p.name || "").toLowerCase().includes(filter.trim().toLowerCase()),
          )
        : merged;

    const showSkeleton = loading && !merged.length;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Catalog"
                subtitle="Products in your Salesive store, including the ones you imported."
                actions={
                    <Button to="/import" size="sm">
                        + Import
                    </Button>
                }
            />

            <div className="flex flex-wrap items-center gap-3">
                <SearchInput
                    placeholder="Filter this page…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full max-w-xs"
                />
                <span className="text-xs text-gray-400">
                    {pagination.total != null ? `${pagination.total} products` : ""}
                </span>
                <button
                    type="button"
                    onClick={refetch}
                    className="ml-auto text-xs font-medium text-brand-700 hover:underline"
                >
                    Refresh
                </button>
            </div>

            {showSkeleton && <ProductGridSkeleton />}

            {error && !merged.length && (
                <Card className="border-red-200 bg-red-50 p-8 text-center">
                    <p className="text-sm font-medium text-red-700">{error.message}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={refetch}>
                        Try again
                    </Button>
                </Card>
            )}

            {!showSkeleton && !error && !shown.length && (
                <Card className="flex flex-col items-center gap-3 p-12 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                        <GridIcon className="h-5 w-5" />
                    </span>
                    <div>
                        <p className="text-sm font-medium text-gray-700">No products yet</p>
                        <p className="mt-1 text-xs text-gray-400">
                            Import your first product from a URL.
                        </p>
                    </div>
                    <Button size="sm" to="/import" className="mt-1">
                        Import a product
                    </Button>
                </Card>
            )}

            {shown.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                    {shown.map((p) => (
                        <ProductCard key={p._id} product={p} />
                    ))}
                </div>
            )}

            {pagination.pages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                    <IconButton
                        label="Previous page"
                        disabled={!pagination.hasPrev}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        <ChevronLeftIcon />
                    </IconButton>
                    <span className="text-xs font-medium text-gray-500">
                        Page {pagination.page || page} of {pagination.pages || 1}
                    </span>
                    <IconButton
                        label="Next page"
                        disabled={!pagination.hasNext}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        <ChevronRightIcon />
                    </IconButton>
                </div>
            )}
        </div>
    );
}

function ProductCard({ product: p }) {
    const price = Number(p.price);
    const imgs = Array.isArray(p.images) && p.images.length ? p.images : p.imageUrl ? [p.imageUrl] : [];
    const img = imgs[0];
    return (
        <Card hoverable className="flex flex-col overflow-hidden">
            <div className="aspect-square w-full border-b border-gray-100 bg-gray-50">
                {img ? (
                    <img
                        src={img}
                        alt=""
                        onError={(e) => (e.currentTarget.style.display = "none")}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <ImageIcon className="h-6 w-6" />
                    </div>
                )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">
                    {p.name}
                </p>
                <p className="text-xs text-gray-400">
                    {p.category?.name || "Uncategorized"}
                </p>
                <p className="mt-auto pt-2 font-display text-sm font-semibold text-brand-700">
                    {formatNaira(price)}
                </p>
            </div>
        </Card>
    );
}

function ProductGridSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
                <Card key={i} className="flex flex-col overflow-hidden">
                    <Skeleton className="aspect-square w-full" />
                    <div className="space-y-2 p-3 sm:p-4">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-3.5 w-1/2" />
                    </div>
                </Card>
            ))}
        </div>
    );
}
