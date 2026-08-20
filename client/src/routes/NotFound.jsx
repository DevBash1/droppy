import { Link, useLocation } from "react-router-dom";
import { Centered } from "../components/States.jsx";

// Client-side 404 for unknown in-app paths. Keeps ?shop= on the "back to app" link
// so the store context survives the bounce.
export default function NotFound() {
    const { search } = useLocation();
    return (
        <Centered>
            <div className="rounded-2xl border border-gray-200/80 bg-white px-8 py-7 text-center shadow-soft">
                <p className="font-display text-lg font-semibold text-gray-900">Page not found</p>
                <p className="mt-1 text-sm text-gray-500">
                    That page doesn't exist in Droppy.
                </p>
                <Link
                    to={`/${search}`}
                    className="mt-4 inline-block text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
                >
                    ← Back to the app
                </Link>
            </div>
        </Centered>
    );
}
