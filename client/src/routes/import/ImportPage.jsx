import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { useShop } from "../../lib/shop.jsx";
import { useToast } from "../../components/Toast.jsx";
import {
    BackIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ImageIcon,
    LinkIcon,
    PlusIcon,
    SearchIcon,
    XIcon,
} from "../../components/icons.jsx";
import {
    Badge,
    Button,
    Card,
    cx,
    Field,
    Input,
    PageHeader,
    Spinner,
    Textarea,
} from "../../components/ui.jsx";
import { formatNaira, formatSourcePrice } from "../../lib/currency.js";
import {
    getSavedMarkup,
    saveImportedProduct,
    saveMarkup,
} from "../../lib/storage.js";

// Tone per source platform, matched loosely against the scraper's label so a
// mis-cased or slightly different string still lands on something sensible.
function platformTone(platform) {
    const p = String(platform || "").toLowerCase();
    if (p.includes("amazon")) return "amber";
    if (p.includes("aliexpress")) return "red";
    if (p.includes("mercado")) return "accent";
    return "indigo";
}

// The importer, the app's landing page.
//
//   Step 1  paste a product URL (Amazon / AliExpress / MercadoLibre), pick a
//           category and set the markup %.
//   Step 2  scrape to an editable preview (title, price in ₦, description, images).
//   Step 3  import to POST /api/import, then save to the store catalog.
export default function ImportPage() {
    const toast = useToast();
    const { shop } = useShop();

    const [url, setUrl] = useState("");
    const [markup, setMarkup] = useState("");
    const [category, setCategory] = useState("");
    const [categories, setCategories] = useState([]);
    const [scraping, setScraping] = useState(false);
    const [importing, setImporting] = useState(false);
    const [scraped, setScraped] = useState(null);
    const [form, setForm] = useState(null);

    // Restore the merchant's last-used markup for this shop on mount.
    useEffect(() => {
        setMarkup(getSavedMarkup(shop));
    }, [shop]);

    // The store's categories for the required `category` picker (READ_CATEGORIES).
    // Loaded once; the create-new flow appends locally so the list stays current.
    const { data: catData } = useAsync(
        () => apiGet("/categories?limit=100"),
        [],
    );
    useEffect(() => {
        if (catData?.categories) setCategories(catData.categories);
    }, [catData]);

    // Create a category via the Apps API, then select it and add it to the list.
    async function createCategory(name) {
        const trimmed = String(name || "").trim();
        if (!trimmed) return toast.error("Enter a category name.");
        const existing = categories.find(
            (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
        );
        if (existing) {
            setCategory(existing._id);
            toast.success(`Using existing category "${existing.name}".`);
            return;
        }
        try {
            const created = await apiPost("/categories", { name: trimmed });
            if (!created?._id)
                throw new Error(
                    created?.message || "Could not create category.",
                );
            setCategories((list) => [...list, created]);
            setCategory(created._id);
            toast.success(`Created category "${created.name}".`);
        } catch (err) {
            toast.error(err.message || "Could not create category.");
        }
    }

    // Live ₦ preview of the scraped price, recomputed as the markup % and any
    // manual price edit change. Requires an FX round-trip, so it is only shown
    // once the scrape has a price (the server is authoritative at import time).
    const { data: fxPreview, loading: fxLoading } = useAsync(
        () =>
            apiGet(
                `/fx/preview?price=${encodeURIComponent(form?.price ?? "")}&currency=${encodeURIComponent(
                    form?.sourceCurrency || "",
                )}&markup=${encodeURIComponent(markup || "0")}`,
            ),
        [form?.price, form?.sourceCurrency, markup, Boolean(scraped)],
    );

    async function scrape() {
        const target = url.trim();
        if (!target) return toast.error("Paste a product URL first.");
        setScraping(true);
        try {
            const res = await apiPost("/scrape", { url: target });
            const product = res?.product;
            if (!product)
                throw new Error(res?.message || "Scrape returned nothing.");
            setScraped(product);
            setForm({
                name: product.title || "",
                description: product.description || "",
                price: product.price || "",
                sourceCurrency: product.currency || "",
                quantity: 100,
                weight: 0.5,
                images:
                    Array.isArray(product.images) && product.images.length
                        ? product.images
                        : product.imageUrl
                          ? [product.imageUrl]
                          : [],
            });
        } catch (err) {
            setScraped(null);
            setForm(null);
            toast.error(err.message || "Could not scrape that URL.");
        } finally {
            setScraping(false);
        }
    }

    function set(field, value) {
        setForm((f) => ({ ...f, [field]: value }));
    }

    function removeImage(i) {
        setForm((f) => ({
            ...f,
            images: f.images.filter((_, idx) => idx !== i),
        }));
    }

    function makeMain(i) {
        setForm((f) => {
            const images = [...f.images];
            const [chosen] = images.splice(i, 1);
            images.unshift(chosen);
            return { ...f, images };
        });
    }

    async function importProduct() {
        if (!category) return toast.error("Pick a category for the product.");
        // Salesive caps product names at 100 chars — fail fast with a clear
        // message instead of letting the API round-trip return a 400.
        if (String(form?.name || "").trim().length > 100) {
            return toast.error("Product name cannot exceed 100 characters.");
        }
        setImporting(true);
        try {
            const res = await apiPost("/import", {
                url: url.trim(),
                category,
                markupPercent: Number(markup || 0),
                name: form.name,
                description: form.description,
                price: Number(form.price),
                weight: Number(form.weight),
                quantity: Number(form.quantity),
                images: form.images.filter(Boolean),
            });
            // Keep a local copy of the import so the Catalog page can show it
            // instantly (and it survives a store with an empty catalog fetch).
            saveImportedProduct(shop, res);
            toast.success(
                `Imported "${res?.name || form.name}" into your catalog.`,
            );
            setScraped(null);
            setForm(null);
            setUrl("");
        } catch (err) {
            toast.error(err.message || "Import failed.");
        } finally {
            setImporting(false);
        }
    }

    // Derived pricing for the preview card. The FX preview wins, with the
    // client-side markup estimate as a fallback while it loads.
    const nairaPrice = useMemo(() => {
        if (fxPreview?.price != null) return fxPreview.price;
        const base = Number(form?.price);
        if (!Number.isFinite(base)) return null;
        const m = Number(markup || 0);
        return Math.round(base * (1 + m / 100) * 100) / 100;
    }, [fxPreview, form?.price, markup]);

    const step = scraped && form ? 2 : 1;

    // "Back" from the preview to step 1 — keeps the URL so a re-scrape is quick.
    function backToSource() {
        setScraped(null);
        setForm(null);
    }

    return (
        <div className="space-y-6 pb-4">
            <PageHeader
                title="Import a product"
                subtitle="Paste an Amazon, AliExpress or MercadoLibre link. We scrape it, convert the price to Naira and add it to your store catalog."
            />

            <Stepper step={step} />

            {/* Step 1 — source. Hidden once a product is scraped so the flow reads
                as a clean two-step wizard. */}
            {step === 1 && (
                <Card className="p-5 sm:p-6">
                    <div className="space-y-4">
                        <Field
                            label="Product URL"
                            required
                            htmlFor="product-url"
                        >
                            <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gray-400">
                                    <LinkIcon className="h-4 w-4" />
                                </span>
                                <Input
                                    id="product-url"
                                    placeholder="https://www.amazon.com/dp/…  ·  https://www.aliexpress.com/item/…"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    onKeyDown={(e) =>
                                        e.key === "Enter" && scrape()
                                    }
                                    className="pl-10"
                                />
                            </div>
                        </Field>

                        <div className="sm:max-w-xs">
                            <Field
                                label="Markup %"
                                hint="Added on top of the Naira conversion (20 = sell at 1.2× cost)."
                                htmlFor="markup"
                            >
                                <Input
                                    id="markup"
                                    type="number"
                                    min="0"
                                    max="1000"
                                    placeholder="20"
                                    value={markup}
                                    onChange={(e) => {
                                        setMarkup(e.target.value);
                                        saveMarkup(shop, e.target.value);
                                    }}
                                />
                            </Field>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            <Button
                                onClick={scrape}
                                loading={scraping}
                                size="lg"
                                className="max-sm:w-full"
                                disabled={importing}
                            >
                                {scraping ? "Scraping…" : "Scrape & preview"}
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {scraping && step === 1 && (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                    <Spinner className="h-4 w-4 text-brand-500" />
                    Scraping product…
                </p>
            )}

            {scraped && form && (
                <Card className="p-5 sm:p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <h3 className="font-display text-base font-semibold text-gray-900">
                            Preview &amp; edit before importing
                        </h3>
                        <div className="flex items-center gap-2">
                            <Badge tone={platformTone(scraped.platform)}>
                                {scraped.platform}
                            </Badge>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
                        <ImageGallery
                            images={form.images}
                            onRemove={removeImage}
                            onMakeMain={makeMain}
                            onEditRaw={(list) => set("images", list)}
                        />

                        <div className="space-y-4">
                            <Field
                                label="Name"
                                required
                                htmlFor="name"
                                hint={
                                    form.name.length > 90
                                        ? `${form.name.length}/100 characters`
                                        : "Salesive limits product names to 100 characters."
                                }
                                error={
                                    form.name.length > 100
                                        ? "Product name cannot exceed 100 characters."
                                        : undefined
                                }
                            >
                                <Input
                                    id="name"
                                    maxLength={100}
                                    value={form.name}
                                    onChange={(e) =>
                                        set("name", e.target.value)
                                    }
                                />
                            </Field>
                            <Field label="Description" htmlFor="description">
                                <Textarea
                                    id="description"
                                    rows={4}
                                    value={form.description}
                                    onChange={(e) =>
                                        set("description", e.target.value)
                                    }
                                />
                            </Field>

                            <CategorySelect
                                categories={categories}
                                value={category}
                                onChange={setCategory}
                                onCreate={createCategory}
                            />

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field
                                    label={`Price (${form.sourceCurrency || "source currency"})`}
                                    htmlFor="price"
                                    hint={`Price as scraped, in ${form.sourceCurrency || "the source currency"}. Your ${markup || 0}% markup is applied when converting to the ₦ sell price.`}
                                >
                                    <Input
                                        id="price"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.price}
                                        onChange={(e) =>
                                            set("price", e.target.value)
                                        }
                                    />
                                </Field>
                                <Field
                                    label="Sell price (₦)"
                                    hint={
                                        nairaPrice != null
                                            ? `≈ ${formatNaira(nairaPrice)} at ${markup || 0}% markup`
                                            : "Set the source price above"
                                    }
                                    htmlFor="naira"
                                >
                                    <Input
                                        id="naira"
                                        readOnly
                                        value={
                                            nairaPrice != null
                                                ? formatNaira(nairaPrice)
                                                : ""
                                        }
                                        className="bg-gray-50 font-medium text-brand-800"
                                    />
                                </Field>
                                <Field label="Quantity" htmlFor="quantity">
                                    <Input
                                        id="quantity"
                                        type="number"
                                        min="0"
                                        value={form.quantity}
                                        onChange={(e) =>
                                            set("quantity", e.target.value)
                                        }
                                    />
                                </Field>
                                <Field label="Weight (kg)" htmlFor="weight">
                                    <Input
                                        id="weight"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.weight}
                                        onChange={(e) =>
                                            set("weight", e.target.value)
                                        }
                                    />
                                </Field>
                            </div>
                        </div>
                    </div>

                    {/* Variants + video, when the scrape found any. Read-only
                        summary — the details are passed through to Salesive. */}
                    {(Array.isArray(scraped.variants) &&
                        scraped.variants.length) ||
                    scraped.video ? (
                        <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
                            {Array.isArray(scraped.variants) &&
                                scraped.variants.length > 0 && (
                                    <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                            Variants ({scraped.variants.length})
                                        </p>
                                        <ul className="grid gap-2 sm:grid-cols-2">
                                            {scraped.variants
                                                .slice(0, 8)
                                                .map((v, i) => (
                                                    <li
                                                        key={i}
                                                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 text-sm"
                                                    >
                                                        <span className="truncate text-gray-700">
                                                            {Object.entries(
                                                                v.attributes ||
                                                                    {},
                                                            )
                                                                .map(
                                                                    ([
                                                                        k,
                                                                        val,
                                                                    ]) =>
                                                                        `${k}: ${val}`,
                                                                )
                                                                .join(" · ")}
                                                        </span>
                                                        <span className="shrink-0 font-medium text-brand-700">
                                                            {formatSourcePrice(
                                                                v.price,
                                                                form.sourceCurrency,
                                                            )}
                                                        </span>
                                                    </li>
                                                ))}
                                        </ul>
                                        {scraped.variants.length > 8 && (
                                            <p className="mt-1 text-xs text-gray-400">
                                                +{scraped.variants.length - 8}{" "}
                                                more variants
                                            </p>
                                        )}
                                    </div>
                                )}
                            {scraped.video && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                                        <PlayIcon className="h-3 w-3" />
                                    </span>
                                    <span className="truncate">
                                        Product video:{" "}
                                        <a
                                            href={scraped.video}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-medium text-brand-700 hover:underline"
                                        >
                                            {scraped.video}
                                        </a>
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
                        <Button
                            onClick={importProduct}
                            loading={importing}
                            variant="primary"
                            disabled={scraping}
                        >
                            {importing ? "Importing…" : "Import to store"}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={backToSource}
                            disabled={importing}
                        >
                            <BackIcon className="h-3.5 w-3.5" />
                            Back
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    );
}

// Two-stage progress indicator: "Add source" → "Preview & import". Purely
// visual — the actual gating is `scraped && form`.
function Stepper({ step }) {
    return (
        <div className="flex items-center gap-2 text-xs font-medium text-gray-400 sm:gap-3">
            <StepDot
                active={step >= 1}
                done={step > 1}
                index={1}
                label="Add source"
            />
            <span className="h-px w-6 shrink-0 bg-gray-200 sm:w-10" />
            <StepDot
                active={step >= 2}
                done={false}
                index={2}
                label="Preview & import"
            />
        </div>
    );
}

function StepDot({ active, done, index, label }) {
    return (
        <span
            className={cx(
                "flex items-center gap-1.5",
                active ? "text-brand-800" : "text-gray-400",
            )}
        >
            {done ? (
                <CheckCircleIcon className="h-5 w-5 text-brand-600" />
            ) : (
                <span
                    className={cx(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                        active
                            ? "bg-brand-700 text-white"
                            : "bg-gray-200 text-gray-500",
                    )}
                >
                    {index}
                </span>
            )}
            <span className="hidden sm:inline">{label}</span>
        </span>
    );
}

// Main image + selectable thumbnail strip. Clicking a thumbnail promotes it to
// the main slot; each thumbnail carries a small remove button. Falls back to a
// raw newline-delimited textarea for anyone who wants to paste URLs directly.
function ImageGallery({ images, onRemove, onMakeMain, onEditRaw }) {
    const [showRaw, setShowRaw] = useState(false);

    return (
        <div>
            {images.length > 0 ? (
                <div className="space-y-2">
                    <div className="group relative overflow-hidden rounded-xl border border-gray-200">
                        <img
                            src={images[0]}
                            alt=""
                            onError={(e) =>
                                (e.currentTarget.style.display = "none")
                            }
                            className="h-40 w-full object-cover md:h-44"
                        />
                        <button
                            type="button"
                            onClick={() => onRemove(0)}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900/60 text-white opacity-0 backdrop-blur transition-opacity hover:bg-gray-900/80 group-hover:opacity-100"
                            aria-label="Remove image"
                        >
                            <XIcon className="h-3 w-3" />
                        </button>
                    </div>
                    {images.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {images.slice(1).map((src, i) => (
                                <button
                                    key={src + i}
                                    type="button"
                                    onClick={() => onMakeMain(i + 1)}
                                    className="group relative h-12 w-12 overflow-hidden rounded-md border border-gray-200 transition-colors hover:border-brand-400"
                                    title="Set as main image"
                                >
                                    <img
                                        src={src}
                                        alt=""
                                        onError={(e) =>
                                            (e.currentTarget.style.display =
                                                "none")
                                        }
                                        className="h-full w-full object-cover"
                                    />
                                    <span
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemove(i + 1);
                                        }}
                                        className="absolute inset-0 flex items-center justify-center bg-gray-900/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                    >
                                        <XIcon className="h-3 w-3" />
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-400 md:h-44">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs">No image</span>
                </div>
            )}

            <button
                type="button"
                onClick={() => setShowRaw((s) => !s)}
                className="mt-2 text-xs font-medium text-gray-400 hover:text-brand-700"
            >
                {showRaw ? "Hide image URLs" : "Edit image URLs"}
            </button>
            {showRaw && (
                <div className="mt-2">
                    <Textarea
                        rows={3}
                        value={images.join("\n")}
                        onChange={(e) =>
                            onEditRaw(
                                e.target.value
                                    .split("\n")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                            )
                        }
                    />
                </div>
            )}
        </div>
    );
}

// Custom category picker for the preview step: a searchable dropdown with an
// inline "create new" flow. Closes on outside click / Escape.
function CategorySelect({ categories, value, onChange, onCreate }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const rootRef = useRef(null);

    const selected = categories.find((c) => c._id === value) || null;

    // Close on outside click and Escape.
    useEffect(() => {
        if (!open) return;
        function onPointerDown(e) {
            if (rootRef.current && !rootRef.current.contains(e.target))
                setOpen(false);
        }
        function onKey(e) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const q = query.trim().toLowerCase();
    const filtered = q
        ? categories.filter((c) => c.name.toLowerCase().includes(q))
        : categories;
    const showCreate = q && !categories.some((c) => c.name.toLowerCase() === q);

    // Auto-fill the "create" input with whatever the user is typing, so a new
    // category name is already there when the create row appears. The user can
    // still edit it before creating.
    useEffect(() => {
        if (showCreate) setNewName(query.trim());
        else if (!open) setNewName("");
    }, [showCreate, query, open]);

    async function submitNew() {
        setCreating(true);
        try {
            await onCreate(newName);
            setNewName("");
            setQuery("");
            setOpen(false);
        } finally {
            setCreating(false);
        }
    }

    return (
        <div ref={rootRef} className="relative">
            <Field label="Category" required htmlFor="category-select">
                <button
                    type="button"
                    id="category-select"
                    onClick={() => setOpen((o) => !o)}
                    className={cx(
                        "flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm shadow-sm transition-colors",
                        open
                            ? "border-brand-500 ring-2 ring-brand-500/25"
                            : "border-gray-300 hover:border-gray-400",
                        selected ? "text-gray-900" : "text-gray-400",
                    )}
                >
                    <span className="truncate">
                        {selected ? selected.name : "Select a category…"}
                    </span>
                    <ChevronDownIcon
                        className={cx(
                            "h-4 w-4 shrink-0 text-gray-400 transition-transform",
                            open && "rotate-180",
                        )}
                    />
                </button>
            </Field>

            {open && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                    {/* Search box */}
                    <div className="relative border-b border-gray-100">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search categories…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                        />
                    </div>

                    {/* Options */}
                    <ul className="max-h-52 overflow-y-auto py-1">
                        {filtered.map((c) => (
                            <li key={c._id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChange(c._id);
                                        setOpen(false);
                                        setQuery("");
                                    }}
                                    className={cx(
                                        "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-brand-50",
                                        c._id === value
                                            ? "font-medium text-brand-800"
                                            : "text-gray-700",
                                    )}
                                >
                                    <span className="truncate">{c.name}</span>
                                    {c._id === value && (
                                        <CheckCircleIcon className="h-4 w-4 shrink-0 text-brand-600" />
                                    )}
                                </button>
                            </li>
                        ))}
                        {!filtered.length && !showCreate && (
                            <li className="px-3 py-2 text-sm text-gray-400">
                                No categories found.
                            </li>
                        )}
                    </ul>

                    {/* Create new (shown when the query doesn't match an existing one) */}
                    {showCreate && (
                        <div className="border-t border-gray-100 p-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            submitNew();
                                        }
                                    }}
                                    placeholder={`Create "${query.trim()}"`}
                                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={submitNew}
                                    loading={creating}
                                    className="shrink-0"
                                >
                                    <PlusIcon className="h-3.5 w-3.5" />
                                    Create
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
