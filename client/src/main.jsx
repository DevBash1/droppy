import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// BrowserRouter (HTML5 history) pairs with the server's SPA fallback so deep links
// like /install resolve client-side. The app is served from the domain root, so no
// basename is needed.
createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>,
);
