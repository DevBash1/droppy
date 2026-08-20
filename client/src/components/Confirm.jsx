import { Button } from "./ui.jsx";

// Controlled confirmation modal for destructive / irreversible actions (delete a
// product, cancel an order, deactivate a customer). The parent owns `open` and
// the busy state so it can keep the dialog up while the request is in flight.
export default function Confirm({
    open,
    title,
    message,
    confirmLabel = "Confirm",
    variant = "danger",
    busy = false,
    onConfirm,
    onCancel,
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
            role="dialog"
            aria-modal="true"
            onClick={busy ? undefined : onCancel}
        >
            <div
                className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl animate-splash"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="font-display text-base font-semibold text-gray-900">{title}</h3>
                {message && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                        {message}
                    </p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="secondary" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button variant={variant} onClick={onConfirm} loading={busy}>
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
