import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ShopProvider, useShop } from "./lib/shop.jsx";
import { SocketProvider } from "./lib/socket.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import Layout from "./components/Layout.jsx";
import { Loading, NoShop } from "./components/States.jsx";
import ImportPage from "./routes/import/ImportPage.jsx";
import ProductsPage from "./routes/import/ProductsPage.jsx";
import Install from "./routes/Install.jsx";
import NotFound from "./routes/NotFound.jsx";

// Client-side routes (react-router). These must NOT collide with the backend
// paths (/api, /oauth, /webhooks) — the server handles those before the SPA ever
// loads. The install gate lives at /install; OAuth itself is /oauth/* on the
// server. Everything under the guarded Layout is the installed importer app:
//
//   /            redirect → /import
//   /import      the importer (landing page)
//   /products    the store's catalog
//   /install     install gate
//   *            in-app 404
export default function App() {
    return (
        <ShopProvider>
            <ToastProvider>
                <SocketProvider>
                    <Routes>
                        <Route
                            element={
                                <RequireInstall>
                                    <Layout />
                                </RequireInstall>
                            }
                        >
                            <Route index element={<Navigate to="/import" replace />} />
                            <Route path="import" element={<ImportPage />} />
                            <Route path="products" element={<ProductsPage />} />
                        </Route>
                        <Route path="/install" element={<Install />} />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </SocketProvider>
            </ToastProvider>
        </ShopProvider>
    );
}

// Gate for routes that need an authenticated session (a completed install bound to
// THIS browser via the session cookie — see server/session.js). Fails closed: with
// no session it shows the install gate (when we know which store to install for) or
// the "open from dashboard" notice otherwise.
function RequireInstall({ children }) {
    const { launchShop, me, loading, authenticated } = useShop();
    const location = useLocation();

    if (loading || !me) return <Loading />;
    if (!authenticated) {
        if (!launchShop) return <NoShop />;
        return <Navigate to={`/install${location.search}`} replace />;
    }
    return children;
}
