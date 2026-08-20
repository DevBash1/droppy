# Salesive Dropshipping Importer (Droppy)

A [Salesive](https://salesive.com) app for **dropshipping**: paste an **Amazon,
AliExpress or MercadoLibre** product URL, and it scrapes the product, converts the
price to **Naira (₦)** with your markup, lets you edit the preview, and imports it
into the store's Salesive catalog.

- **React + Tailwind** front end and a **Node/Express** back end on **one port**.
- The three things every app needs: **install** (OAuth 2.1 + PKCE), the **app** (served at the app URL `/`), and **webhooks** — plus a signed **session** so only the store that installed can see its data.
- Scraping runs **server-side** (`@soblend/scraper`'s `ProductWatcher`) — the store's `app_` token never touches the browser, and the shop is always derived from the signed session, **never** from the client.
- **NGN pricing**: the scraped price is converted at a cached live FX rate and a merchant-set **markup %** is applied on top (e.g. 20% → sell at 1.2× cost). When the FX API is unreachable, a manual fallback rate is used — imports never hard-fail on a rate fetch.
- **socket.io** streams live store events to the UI (with a polling fallback on serverless/Vercel).

What you can do:

| Resource | Create | Read | Update | Delete |
| --- | --- | --- | --- | --- |
| **Products** | ✅ import from URL (scrape → ₦ price → preview → create) | list catalog | — | — |
| **Categories** | ✅ (via Apps API) | list (picker) | — | — |

```
┌──────────────────────── one port (default :3000) ────────────────────────┐
│  Express  ──  /oauth/* · /webhooks · /api/me · /api/context               │
│     │         /api/scrape      (scrape a URL → preview, gated)            │
│     │         /api/fx/preview  (live ₦ conversion, gated)                 │
│     │         /api/import      (scrape → convert → create product, gated) │
│     │         /api/products · /api/categories  (catalog CRUD → Apps API)  │
│     │         socket.io  (live events → browser)                          │
│     └──  React app  (Vite middleware in dev · dist in prod)               │
│              client routes:  /import · /products · /install               │
└──────────────────────────────────────────────────────────────────────────┘
```

## How an import works

1. **Scrape** — you paste a product URL; the server validates the hostname
   (Amazon / AliExpress / MercadoLibre only — an SSRF guard), then runs
   `@soblend/scraper`'s `ProductWatcher` for that platform. When the price or
   description comes back empty, the server falls back to the page's Open Graph /
   JSON-LD metadata to fill the gaps.
2. **Convert** — the scraped price is converted to **NGN** at a cached live FX
   rate (`open.er-api.com` by default, no key), then your **markup %** is applied.
   The live rate is cached 6h in-process; a fetch failure falls back to
   `DEFAULT_FX_RATE` (default 1500 ₦/USD).
3. **Preview** — you see the scraped product with the converted ₦ price and can
   edit the name, description, price, quantity, weight and image URLs. (Scrapers
   return a single image and no weight, so this step exists so you can fix
   anything before it lands in the catalog.)
4. **Import** — `POST /api/import` calls the Salesive **Apps API**
   `POST /api/v1/products` with the store-scoped token and the product appears in
   the store's catalog and dashboard.

There's no separate sync engine — imported products **are** the store's Salesive
products (same `/api/v1/products` resource the dashboard uses).

## Quick start

Requires **Node.js 18+** (the server uses the global `fetch`).

```bash
npm install
cp .env.example .env        # then fill in your app credentials
npm run dev                 # http://localhost:3000  (single port)
```

`npm run dev` gives instant **Vite HMR for the React front end**; changes to
`server/` files need a manual restart.

For a production-style run (Express serves the built React app):

```bash
npm run build
npm start                   # or: npm run preview  (build + start in one step)
```

### Configure your app (Salesive dashboard → Apps → Developer)

1. Create an app and copy the **Client ID**, **Client secret**, and **Webhook signing secret** into `.env`.
2. Add `http://localhost:3000/oauth/callback` (and your tunnel URL, below) as a **redirect URI**.
3. Set the app's **Install / launch URL** to your app URL, and its **Webhook URL** to `<your-url>/webhooks`.
4. Request the scopes you need in `SALESIVE_SCOPES`. This app reads **and writes** the catalog and categories, so it requests:
   `READ_INVENTORY WRITE_INVENTORY READ_CATEGORIES WRITE_CATEGORIES`

> **Changing scopes requires re-consent.** A store that installed with the old
> notes scopes must **re-install** the app before product imports will work — the
> new `READ/WRITE_INVENTORY` and `READ/WRITE_CATEGORIES` grants only take effect
> after the merchant approves them on the consent screen again.

## How it works

**Backend routes** (Express, mounted before the front end):

| Route | What it does |
| --- | --- |
| `GET /oauth/start?shop=` | Starts OAuth 2.1 + PKCE — redirects the merchant to the Salesive consent screen. |
| `GET /oauth/callback` | Exchanges the code for an `app_` access + refresh token and stores the install (keyed by shop). |
| `GET /api/me?shop=` | Tells the front end whether **this browser's session** is authenticated + its scopes (the `app_` token never leaves the server). |
| `POST /api/scrape` | Scrapes a product URL (`@soblend/scraper` + metadata fallback) and returns the normalised preview. Gated by `requireShop`. |
| `GET /api/fx/preview?price&currency&markup` | Converts a source price to NGN at the cached FX rate + markup, for the live "≈ ₦…" readout. Gated by `requireShop`. |
| `POST /api/import` | The pipeline: scrape → convert to NGN → `POST /api/v1/products`. Returns the created product. |
| `GET/POST /api/products` | Catalog list / create, proxied to the Apps API with the scoped token. |
| `GET/POST /api/categories` | Category list / create (the import form's picker). |
| `POST /webhooks` | Verifies the `X-Salesive-Hmac-SHA256` signature, then pushes the event to the store's UI over socket.io. |

Unknown `/api`, `/oauth`, or `/webhooks` paths return a JSON `404` (they never fall through to the SPA).

> **The one security rule for resource routes:** the store a request acts for comes **only** from the
> signed session cookie (`req.shop`, set by `server/middleware/requireShop.js`). `?shop=` is never
> consulted by a CRUD route — it exists solely to *seed* an install. A 401 from the Apps API means the
> install was dropped (uninstalled / token revoked); the browser's API client treats that as "session
> dead" and bounces back to the install gate.

**Client routes** (react-router, served by the SPA at `/`):

| Route | What it does |
| --- | --- |
| `/` | Redirects to `/import`. |
| `/import` | The importer: URL + category + markup %, then the editable preview, then import. |
| `/products` | The store's catalog — paginated list with prices in ₦. |
| `/install` | The install gate. Its button does a full-page navigation to `/oauth/start` (OAuth leaves this origin). |

All in-app pages live under one guarded `<Layout>` (a slim top strip with the
Import / Catalog nav, the signed-in user and a **Log out** button).

> The dashboard opens your app embedded with `?shop=<id>&embedded=1&host=<origin>` appended. That `shop`
> is **client-supplied** — it's used only to *start* an install, never to prove who you are.

### Sessions: who is allowed to see a store's data

`?shop=` in the URL is forgeable, so the server must never trust it for access. Instead the app issues
its **own signed session**:

1. The merchant clicks **Install** → completes OAuth on Salesive's consent screen (only the store's
   owner/staff can approve).
2. At `/oauth/callback` — the one point we *know* the visitor controls that store — the server sets a
   single **signed, HttpOnly cookie** named `sa_session` bound to that store (`server/session.js`).
3. From then on, every route derives the shop from that cookie: `/api/me`, `/api/context`, the
   `requireShop` middleware, and the socket handshake all read `readSession(req)` — never `?shop=`.

**One store at a time.** The session binds the browser to a single store; installing or authenticating
for another store **overwrites** the cookie (there's no multi-store switching). A **Log out** button
(`POST /api/logout`) clears it and drops back to the install gate.

> **Embedded + cookies:** the cookies are `SameSite=None; Secure` so they ride along inside the
> dashboard iframe — which means **production must be HTTPS**, and browsers that block third-party
> cookies will make an embedded merchant re-run the (instant, already-consented) install. The robust
> long-term fix is a signed **App Bridge session token**; this starter uses cookies for Phase 1.
>
> **CSRF:** `SameSite=None` forfeits the SameSite CSRF shield, and this app **does** have
> cookie-authenticated state-changing routes (the import `POST`s). They're guarded by a
> **same-origin check** in `server/middleware/requireShop.js`: an unsafe method whose `Origin` host
> doesn't match the request `Host` is rejected with `403`. (Webhooks are HMAC-verified, not cookie-authed,
> so they're separate.) For production, prefer an **App Bridge session token** in an `Authorization`
> header over the cookie — it sidesteps cross-site cookies and CSRF entirely.

### Webhooks are notify-only

A Salesive webhook tells you *what* changed (`topic`, `resource`, `resourceId`, `shopId`) — it never
carries the record. This app pushes the notify event to the UI immediately, then re-fetches the record
with the app's scoped token and pushes the enriched record — so you only ever surface data your scopes
allow, on the latest state. The catalog currently emits no webhook topic, so in practice the live feed
stays quiet — the catalog page relies on focus-refetch and manual refresh. The wiring is left in place
so that if/when catalog webhooks are delivered, the UI updates live with no code change.

## ⚠️ Before production

This is a sample app — tighten these before shipping:

- **Serve over HTTPS.** The session cookie is `SameSite=None; Secure`, so it's only stored over HTTPS
  (localhost aside). Without it, no one stays logged in.
- **Move to App Bridge session tokens.** The cookie session (`server/session.js`) is solid, but
  third-party-cookie blocking makes embedded merchants re-auth. A signed session token passed in the
  iframe is the robust upgrade — wire it in when Salesive's App Bridge ships.
- **Persist installs + encrypt tokens.** `server/store.js` ships with two backends: a zero-config
  in-memory store (the default) and MongoDB (set `MONGODB_URI`). The in-memory store loses installs on
  restart, so use a database in production — and encrypt the stored `app_` tokens at rest (they're kept
  as plain fields here for clarity). Adding another backend (Postgres/Redis/…) is just an object with
  the same six methods.
- **Verify, then act.** Keep webhook signature verification (`server/routes/webhooks.js`); reject the
  request before doing any work if it fails.
- **Scraping etiquette.** `@soblend/scraper` retries with backoff and we cap the whole scrape at ~30s,
  but marketplace pages change and some block bots. The import form lets the merchant correct the
  price/description when a scrape comes back partial — a scrape failure never fails the app. Respect
  the target sites' ToS and robots.txt.

## Env vars

Required: `SALESIVE_CLIENT_ID`, `SALESIVE_CLIENT_SECRET`, `SALESIVE_WEBHOOK_SECRET`, `APP_BASE_URL`.
Scopes: `SALESIVE_SCOPES` (default: `READ_INVENTORY WRITE_INVENTORY READ_CATEGORIES WRITE_CATEGORIES`).
Storage: `MONGODB_URI` (**required on Vercel** — see below).

Currency conversion:

| Var | Default | What it does |
| --- | --- | --- |
| `FX_API_URL` | `https://open.er-api.com/v6/latest/USD` | Keyless FX endpoint; must return `{ rates: { NGN: … } }` or `{ conversion_rates: { NGN: … } }`. |
| `DEFAULT_FX_RATE` | `1500` | Manual NGN-per-base rate used when the FX API is unreachable. |
| `DEFAULT_MARKUP_PERCENT` | `20` | Default markup % applied on top of FX conversion (editable per import in the UI). |
| `CURRENCY_CODE` | `NGN` | The importer's target currency. |

## Project layout

```
api/
  index.js           Vercel entry — the Express app as a serverless function
server/
  app.js             the Express app itself (shared by both entry points)
  index.js           long-lived entry: socket.io + front end + listen(port)
  config.js          env → typed config (scopes, URLs, secrets, FX/markup)
  salesive.js        OAuth/PKCE, token refresh, scoped API calls
  session.js         signed HttpOnly session cookie (the security anchor)
  store.js           installs + pending OAuth states (in-memory or MongoDB)
  sockets.js         socket.io rooms (one per shop, session-authenticated)
  frontend.js        serve the React app (Vite in dev · dist in prod)
  scraper.js         @soblend/scraper facade (hostname whitelist, normalise, fallback)
  fx.js              cached FX rate + NGN markup conversion
  routes/            oauth · api (/me, /context) · products/categories · import · webhooks
  routes/proxy.js    forward an /api/* call to the Apps API + pipe the envelope back
  middleware/        requireShop (shop from session) · notFound (JSON 404) · errors (backstop)
client/              the whole front end — kept OUT of the repo root on purpose (see below)
  index.html         Vite entry document
  src/main.jsx       React entry + <BrowserRouter>
  src/App.jsx        <Routes> + session guard + Toast/Socket providers
  src/routes/        import/ (ImportPage · ProductsPage) · Install · NotFound
  src/components/    Layout (top strip + nav) · ui (buttons/forms/badges) · Toast · States · icons
  src/lib/           api (fetch client) · socket (live webhooks) · shop (session context) · currency (₦ formatting) · hooks
  build.mjs          production build entry (`npm run build`) → ../dist
  vite.config.js / tailwind.config.js / postcss.config.js
```

### Why the front end lives in `client/`

The deploy platform detects a project's stack by sniffing the repo root. A root-level
`index.html` + `vite.config.js` makes it read this as a static Vite site: it publishes
`dist/` and never boots the server, so the API, OAuth and socket.io simply don't exist in
production. With the front end tucked into `client/`, the root is just `server/` +
`package.json` and it deploys as the Node/Express app it actually is.

Two consequences worth knowing before you rearrange anything:

- **Don't move these files back to the root.** The build will still work locally and the
  deploy will still go green — it'll just quietly serve a static site with no backend.
- Because the Vite config isn't where the tools look by default, the paths are wired
  explicitly: `postcss.config.js` names the Tailwind config, and `tailwind.config.js` uses
  absolute `content` globs. Tailwind resolves those globs against the working directory,
  not its own location, so relative paths would match nothing and emit a stylesheet with
  the base reset and none of the app's styles — a build that succeeds and looks broken.

## Deploying

The app supports two hosting models from one codebase. The **server** decides which one is
in play and tells the front end (`realtime` on `/api/me`), so there is no build-time flag
to set and nothing to keep in sync.

### A long-lived Node process (Pxxl, Render, Fly, a VM) — the full-featured path

Entry point `server/index.js`. Everything on one port: API, OAuth, webhooks, socket.io and
the front end. Webhooks are **pushed** to the browser the moment they arrive. Set the env
vars from `.env.example`, point `APP_BASE_URL` at the public URL, and run `npm start`
(`npm run build` first — the platform normally does this for you).

### Vercel — serverless

Entry point `api/index.js`; routing lives in `vercel.json`. `/api/*`, `/oauth/*` and
`/webhooks` rewrite to the function; everything else is served from the static `dist/`
build by the CDN, with an SPA fallback to `index.html`.

Deploy: import the repo at [vercel.com/new](https://vercel.com/new) (framework preset
**Other** — `vercel.json` already sets the build command and output directory), add the env
vars below, then register `https://<your-domain>/oauth/callback` as a redirect URI on your
app in the Salesive Developer console and set the webhook URL to
`https://<your-domain>/webhooks`.

Required env vars: `SALESIVE_CLIENT_ID`, `SALESIVE_CLIENT_SECRET`,
`SALESIVE_WEBHOOK_SECRET`, `APP_BASE_URL` (your production domain — not the per-deployment
preview URL, which changes on every push and can't be a registered redirect URI), and
`MONGODB_URI`.

Two things behave differently here, both consequences of serverless, not bugs to fix:

- **`MONGODB_URI` is mandatory.** Instances share no memory, so the in-memory store would
  write the pending OAuth state on one instance and look for it on another — every install
  would fail with "invalid state". The app deliberately **refuses to boot** on Vercel
  without it rather than degrade into that bug.
- **No socket.io — the UI polls instead** (every 10s, plus on tab focus). A webhook POST
  lands on a different function instance than the one holding the browser's socket, and
  Vercel provides no fan-out between instances, so a push would emit into the void. The
  webhook is still received, verified and processed; the UI just learns about it on its next
  poll. If you need true push here, the options are a Redis-backed socket.io adapter or a
  hosted realtime service (Ably/Pusher) — see `client/src/lib/socket.jsx`.

When adding a page that refreshes on store changes, use `shouldRefetch(payload, resource)`
from `client/src/lib/socket.jsx` rather than comparing `webhookResource(payload)` yourself:
on Vercel every payload is a poll tick with no resource, so a bare comparison never matches
and the page silently stops updating.
