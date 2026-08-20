/**
 * Salesive App Bridge — runtime permission & lifecycle helpers.
 *
 * Use these from your app's client-side code to:
 *   · Request capabilities beyond your OAuth install scopes (permission modal).
 *   · Query which permissions have already been granted without a modal.
 *   · Listen for open / minimize lifecycle events from the dashboard.
 *   · Ask the dashboard to expand the app when it's minimized (AUTO_LAUNCH).
 *
 * Usage
 * -----
 * import { requestPermission, getGrantedPermissions, onAppOpened, onAppMinimized, onLaunch } from "@/lib/permissions";
 *
 * // Check what's already granted on mount (no modal):
 * const grants = await getGrantedPermissions();
 * const hasAutoLaunch = "AUTO_LAUNCH" in grants;
 *
 * // Request a permission if not yet granted:
 * if (!hasAutoLaunch) {
 *   const granted = await requestPermission("AUTO_LAUNCH", "recurring");
 * }
 *
 * // Listen for lifecycle events:
 * onAppMinimized(() => { startMyTimer(); });
 * onAppOpened(() => { clearMyTimer(); });
 *
 * // Ask the dashboard to expand (only works if AUTO_LAUNCH is granted):
 * onLaunch();
 */

const PARENT = window.parent !== window ? window.parent : null;

const MSG_REQUEST = "salesive:request-permission";
const MSG_RESPONSE = "salesive:permission-response";
const MSG_LAUNCH = "salesive:launch";
const MSG_GET_PERMISSIONS = "salesive:get-permissions";
const MSG_PERMISSIONS_STATE = "salesive:permissions-state";
const MSG_APP_OPENED = "salesive:app-opened";
const MSG_APP_MINIMIZED = "salesive:app-minimized";
const MSG_APP_CLOSED = "salesive:app-closed";
const MSG_APP_WAKE = "salesive:app-wake";
const MSG_APP_LOGOUT = "salesive:app-logout";
const MSG_STORE_CHANGED = "salesive:store-changed";

// One-time pending resolvers keyed by permission name.
const pendingPermissions = {};
// One-shot resolver for getGrantedPermissions.
let pendingGrants = null;
// Lifecycle callbacks.
const openedCallbacks    = new Set();
const minimizedCallbacks = new Set();
const closedCallbacks    = new Set();
const wakeCallbacks      = new Set();
// Session-boundary callbacks.
const logoutCallbacks       = new Set();
const storeChangedCallbacks = new Set();
const genericCallbacks   = new Map();

// Single shared listener — all incoming messages routed here.
window.addEventListener("message", (event) => {
    const { type, permission, granted, mode, expiresAt, permissions,
            shopId, shopName, previousShopId } = event.data || {};

    if (type === MSG_RESPONSE && permission) {
        const resolve = pendingPermissions[permission];
        if (resolve) {
            delete pendingPermissions[permission];
            resolve({ granted: Boolean(granted), mode, expiresAt });
        }
    } else if (type === MSG_PERMISSIONS_STATE) {
        if (pendingGrants) {
            const resolve = pendingGrants;
            pendingGrants = null;
            resolve(permissions || {});
        }
    } else if (type === MSG_APP_WAKE) {
        wakeCallbacks.forEach((cb) => cb());
    } else if (type === MSG_APP_OPENED) {
        openedCallbacks.forEach((cb) => cb());
    } else if (type === MSG_APP_MINIMIZED) {
        minimizedCallbacks.forEach((cb) => cb());
    } else if (type === MSG_APP_CLOSED) {
        closedCallbacks.forEach((cb) => cb());
    } else if (type === MSG_APP_LOGOUT) {
        logoutCallbacks.forEach((cb) => cb());
    } else if (type === MSG_STORE_CHANGED && shopId) {
        const payload = { shopId, shopName, previousShopId: previousShopId ?? null };
        storeChangedCallbacks.forEach((cb) => cb(payload));
    }
    if (type) {
        const cbs = genericCallbacks.get(type);
        if (cbs?.size) cbs.forEach((cb) => cb(event.data));
    }
});

/**
 * Request a runtime permission from the merchant via a dashboard modal.
 *
 * @param {"AUTO_LAUNCH"|"WRITE_DOMAINS"|"CLIPBOARD_READ"|"WRITE_ORDERS_CANCEL"} permission
 * @param {Array<"once"|"1day"|"7days"|"14days"|"31days">} [options] - Duration choices to show.
 *   Defaults to all five if omitted. First element is the default selection in the modal.
 * @param {number} [timeoutMs=30_000]
 * @returns {Promise<boolean>}
 */
export function requestPermission(permission, options = null, timeoutMs = 30_000) {
    if (!PARENT) return Promise.resolve(false);
    return new Promise((resolve) => {
        pendingPermissions[permission] = ({ granted }) => resolve(granted);
        PARENT.postMessage({ type: MSG_REQUEST, permission, ...(options ? { options } : {}) }, "*");
        setTimeout(() => {
            if (pendingPermissions[permission]) {
                delete pendingPermissions[permission];
                resolve(false);
            }
        }, timeoutMs);
    });
}

/**
 * Get currently active permission grants without showing any modal.
 * Returns a map of `{ [permission]: { mode, grantedAt, expiresAt } }`.
 *
 * @param {number} [timeoutMs=5_000]
 * @returns {Promise<Record<string, object>>}
 */
export function getGrantedPermissions(timeoutMs = 5_000) {
    if (!PARENT) return Promise.resolve({});
    return new Promise((resolve) => {
        pendingGrants = resolve;
        PARENT.postMessage({ type: MSG_GET_PERMISSIONS }, "*");
        setTimeout(() => {
            if (pendingGrants === resolve) {
                pendingGrants = null;
                resolve({});
            }
        }, timeoutMs);
    });
}

/**
 * Ask the dashboard to expand (un-minimize) this app. Only honoured if the
 * merchant has granted the AUTO_LAUNCH runtime permission.
 */
export function onLaunch() {
    PARENT?.postMessage({ type: MSG_LAUNCH }, "*");
}

/**
 * Register a callback that fires whenever the app is expanded/opened.
 * Returns an unsubscribe function.
 * @param {() => void} callback
 * @returns {() => void}
 */
export function onAppOpened(callback) {
    openedCallbacks.add(callback);
    return () => openedCallbacks.delete(callback);
}

/**
 * Register a callback that fires whenever the app is minimized.
 * Returns an unsubscribe function.
 * @param {() => void} callback
 * @returns {() => void}
 */
export function onAppMinimized(callback) {
    minimizedCallbacks.add(callback);
    return () => minimizedCallbacks.delete(callback);
}

/**
 * Register a callback that fires when the merchant presses × (close).
 * The app keeps running in the background — use this to save state.
 * Returns an unsubscribe function.
 * @param {() => void} callback
 * @returns {() => void}
 */
export function onAppClosed(callback) {
    closedCallbacks.add(callback);
    return () => closedCallbacks.delete(callback);
}

/**
 * Register a callback that fires when the dashboard first wakes the app in
 * the background (on dashboard load, before the merchant opens the app).
 * Returns an unsubscribe function.
 * @param {() => void} callback
 * @returns {() => void}
 */
export function onAppWake(callback) {
    wakeCallbacks.add(callback);
    return () => wakeCallbacks.delete(callback);
}

/**
 * Register a callback that fires when the merchant logs out of Salesive.
 * The dashboard clears only its own origin's storage — this app is on another
 * origin, so clear its token here or the next merchant to log in on this
 * browser inherits the session.
 * Must be synchronous: the dashboard waits ~150ms, then destroys the iframe.
 * Use navigator.sendBeacon() if the server must be told too.
 * Returns an unsubscribe function.
 * @param {() => void} callback
 * @returns {() => void}
 */
export function onLogout(callback) {
    logoutCallbacks.add(callback);
    return () => logoutCallbacks.delete(callback);
}

/**
 * Register a callback that fires when the merchant switches the active store.
 * The iframe reloads immediately after with the new `shop` query param, so that
 * reload — not this callback — is what boots the app under the new store. Use
 * this to drop caches that outlive a reload (IndexedDB, localStorage) and to
 * save in-progress work. Keep it synchronous.
 * Returns an unsubscribe function.
 * @param {(store: { shopId: string, shopName?: string, previousShopId: string|null }) => void} callback
 * @returns {() => void}
 */
export function onStoreChanged(callback) {
    storeChangedCallbacks.add(callback);
    return () => storeChangedCallbacks.delete(callback);
}

/**
 * Listen for any postMessage event type — including future types not yet in
 * this helper. Callback receives the full raw message data object.
 * Returns an unsubscribe function.
 * @param {string} type
 * @param {(data: object) => void} callback
 * @returns {() => void}
 */
export function onEvent(type, callback) {
    if (!genericCallbacks.has(type)) genericCallbacks.set(type, new Set());
    const cbs = genericCallbacks.get(type);
    cbs.add(callback);
    return () => cbs.delete(callback);
}
