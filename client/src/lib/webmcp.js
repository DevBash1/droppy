// Salesive WebMCP bridge for your app.
// Vendored copy of the salesive-dev-tools/webmcp module (bridge parts only).
// Register tools that Ola — the merchant's AI assistant in the Salesive
// dashboard — can call after the merchant approves each request.
//
// Works in every browser: this file IS the implementation; no native
// navigator.modelContext support is needed. If the browser does ship one,
// registrations are mirrored into it too.

const PARENT = window.parent !== window ? window.parent : null;

const MSG_MCP_REGISTER = "salesive:mcp-register-tools";
const MSG_MCP_CALL = "salesive:mcp-call-tool";
const MSG_MCP_RESULT = "salesive:mcp-tool-result";

// name → { name, title, description, inputSchema, annotations, execute }
const tools = new Map();
let syncTimer = null;

const listeners = new Set();

/** Join MCP-style content blocks / stringify whatever execute() returned. */
function serializeToolResult(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value?.content)) {
        const texts = value.content
            .filter((b) => b && b.type === "text" && typeof b.text === "string")
            .map((b) => b.text);
        if (texts.length) return texts.join("\n");
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function nativeModelContext() {
    const nav = navigator.modelContext;
    if (nav && nav !== modelContext) return nav;
    const doc = document.modelContext;
    if (doc && doc !== modelContext) return doc;
    return null;
}

function mirrorToNative(method, arg) {
    const native = nativeModelContext();
    if (!native || typeof native[method] !== "function") return;
    try {
        native[method](arg);
    } catch {
        /* native rejection must never break the Salesive bridge */
    }
}

function changed() {
    listeners.forEach((fn) => {
        try {
            fn();
        } catch {
            /* ignore */
        }
    });
    if (!PARENT) return;
    if (syncTimer) clearTimeout(syncTimer);
    // Debounced: a burst of registrations on startup → one snapshot message.
    syncTimer = setTimeout(() => {
        syncTimer = null;
        const snapshot = [...tools.values()].map((t) => ({
            name: t.name,
            title: typeof t.title === "string" ? t.title : undefined,
            description: t.description,
            inputSchema: t.inputSchema ?? { type: "object", properties: {} },
            annotations: {
                readOnlyHint: t.annotations?.readOnlyHint === true,
                untrustedContentHint: t.annotations?.untrustedContentHint === true,
            },
        }));
        PARENT.postMessage({ type: MSG_MCP_REGISTER, tools: snapshot }, "*");
    }, 50);
}

/**
 * WebMCP-shaped model context. registerTool / unregisterTool / toolchange
 * via subscribe (this vendored copy skips the EventTarget niceties).
 */
export const modelContext = {
    /**
     * Register (or replace, by name) a tool.
     * @param {{ name: string, title?: string, description: string,
     *   inputSchema?: object, annotations?: { readOnlyHint?: boolean,
     *   untrustedContentHint?: boolean },
     *   execute: (input: object) => any | Promise<any> }} tool
     * @param {{ signal?: AbortSignal }} [options] abort → unregister
     * @returns {Promise<void>}
     */
    async registerTool(tool, options = {}) {
        if (!tool || typeof tool !== "object") {
            throw new TypeError("registerTool: tool must be an object");
        }
        if (typeof tool.name !== "string" || !tool.name.trim()) {
            throw new TypeError("registerTool: tool.name must be a non-empty string");
        }
        if (typeof tool.description !== "string" || !tool.description.trim()) {
            throw new TypeError("registerTool: tool.description must be a non-empty string");
        }
        if (typeof tool.execute !== "function") {
            throw new TypeError("registerTool: tool.execute must be a function");
        }
        if (options.signal?.aborted) return;
        tools.set(tool.name, tool);
        options.signal?.addEventListener(
            "abort",
            () => modelContext.unregisterTool(tool.name),
            { once: true },
        );
        mirrorToNative("registerTool", tool);
        changed();
    },

    /** Remove a tool by name. No-op if absent. */
    unregisterTool(name) {
        if (!tools.delete(name)) return;
        mirrorToNative("unregisterTool", name);
        changed();
    },

    /** Snapshot of registered tools. */
    getRegisteredTools() {
        return [...tools.values()];
    },

    /** Subscribe to registry changes. Returns unsubscribe. */
    onToolChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },
};

// Alias onto the standard locations when the browser has no native WebMCP —
// code written against navigator.modelContext works unchanged.
try {
    if (!navigator.modelContext) navigator.modelContext = modelContext;
} catch {
    /* frozen navigator */
}
try {
    if (!document.modelContext) document.modelContext = modelContext;
} catch {
    /* ignore */
}

// Dashboard → app: run an approved tool call. Exactly one terminal response
// (result or error) per callId.
window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object" || data.type !== MSG_MCP_CALL) return;
    const { callId, tool, args } = data;
    if (!callId || !tool || !PARENT) return;

    Promise.resolve()
        .then(() => {
            const def = tools.get(tool);
            if (!def) throw new Error(`Tool "${tool}" is not registered`);
            return def.execute(args ?? {});
        })
        .then((result) => {
            PARENT.postMessage(
                { type: MSG_MCP_RESULT, callId, result: serializeToolResult(result) },
                "*",
            );
        })
        .catch((err) => {
            PARENT.postMessage(
                {
                    type: MSG_MCP_RESULT,
                    callId,
                    error: err?.message || String(err) || "Tool execution failed",
                },
                "*",
            );
        });
});
