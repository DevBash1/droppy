import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
    // Absolute, because Tailwind resolves content globs against the working directory
    // (the repo root, where npm runs), not against this file. Relative globs would
    // match nothing and emit a stylesheet with no utilities in it.
    content: [
        path.join(__dirname, "index.html"),
        path.join(__dirname, "src/**/*.{js,jsx}"),
    ],
    theme: {
        extend: {
            colors: {
                // Brand blue — matches the Droppy logo gradient (#00A3FF → #0066FF).
                brand: {
                    50: "#EFF8FF",
                    100: "#D9EFFF",
                    200: "#B3E3FF",
                    300: "#7FD0FF",
                    400: "#3DB4FF",
                    500: "#00A3FF", // logo top
                    600: "#0086E8",
                    700: "#0066FF", // logo bottom (primary)
                    800: "#0A4FC4",
                    900: "#0F3B8C",
                    950: "#0B2A66",
                },
                // Orange accent — the Droppy box + "D" in the logo.
                accent: {
                    50: "#FFF7ED",
                    100: "#FFEDD5",
                    200: "#FED7AA",
                    300: "#FDBA74",
                    400: "#FB923C",
                    500: "#F97316",
                    600: "#EA580C",
                    700: "#C2410C",
                },
            },
            fontFamily: {
                // Body / UI text — Manrope (warm, confident grotesque; loaded via
                // Google Fonts in index.html, falls back to the system stack).
                sans: [
                    "Manrope",
                    "ui-sans-serif",
                    "system-ui",
                    "-apple-system",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif",
                ],
                // Headings / display — Sora (geometric, a little more character than
                // the body face, matches the bold wordmark).
                display: [
                    "Sora",
                    "ui-sans-serif",
                    "system-ui",
                    "-apple-system",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif",
                ],
            },
            boxShadow: {
                soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 59, 140, 0.18)",
                lift: "0 4px 10px rgba(15, 23, 42, 0.06), 0 16px 32px -16px rgba(15, 59, 140, 0.28)",
            },
        },
    },
    plugins: [],
};
