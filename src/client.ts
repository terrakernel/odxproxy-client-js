/*
 * MIT License
 * Copyright (c) 2025 TERRAKERNEL PTE. LTD.
 * Author Julian Richie Wajong
 */

export interface OdxInstanceInfo{
    url: string;
    user_id: number;
    db: string;
    api_key: string;
}

export interface OdxProxyClientInfo{
    instance: OdxInstanceInfo;
    odx_api_key: string
    gateway_url?: string;
    /** Default upstream Odoo timeout in seconds, sent as the `x-request-timeout` header. */
    default_timeout_secs?: number;
}

export interface OdxClientRequestContext{
    allowed_company_ids?: number[];
    default_company_id?: number;
    tz: string;
}

export interface OdxServerErrorResponse {
    code: number;
    message: string;
    data: any;
}

export interface OdxServerResponse{
    jsonrpc: string;
    id: string;
    result?: any;
    error?: OdxServerErrorResponse;
}

export interface OdxClientKeywordRequest{
    fields?: string[];
    order?: string;
    limit?: number;
    offset?: number;
    context: OdxClientRequestContext;
}

export interface OdxClientRequest {
    id: string;
    action: string;
    model_id: string;
    keyword: OdxClientKeywordRequest,
    fn_name?: string,
    params: any[],
    odoo_instance: OdxInstanceInfo
}

/** Flat object returned by `GET /_/license` (NOT a JSON-RPC envelope). */
export interface OdxLicenseInfo {
    licensee: string;
    valid_until: string;
    is_valid: boolean;
}

/** Per-call options accepted by every request method. */
export interface OdxRequestOptions {
    /** Override the upstream Odoo timeout (seconds) for this call via `x-request-timeout`. */
    timeoutSecs?: number;
    /** Caller-supplied AbortSignal to cancel the request. */
    signal?: AbortSignal;
}

/**
 * Base class for every error thrown by the client. Carries the JSON-RPC `code`,
 * `message`, and `data` from the proxy (per SYSTEM_ARCHITECTURE §6), plus the raw
 * HTTP status. Use `instanceof` on the subclasses below to branch on error type.
 */
export class OdxError extends Error {
    readonly code: number;
    readonly data: any;
    readonly httpStatus: number;

    constructor(code: number, message: string, data: any, httpStatus: number) {
        super(message);
        this.name = new.target.name;
        this.code = code;
        this.data = data;
        this.httpStatus = httpStatus;
        // Restore prototype chain so `instanceof` works after transpilation to ES5/ES2020.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/** -32000 / 401 — missing or wrong `x-api-key`. */
export class AuthError extends OdxError {}
/** -32001 / 400 — `action` not in the allowlist. */
export class InvalidActionError extends OdxError {}
/** -32002 / 400 — `call_method` without a non-empty `fn_name`. */
export class MissingFnNameError extends OdxError {}
/** -32003 / 504 — upstream Odoo call timed out (also raised on client-side abort). */
export class OdooTimeoutError extends OdxError {}
/** -32004 / 502 — network failure connecting to the Odoo instance. */
export class OdooConnectError extends OdxError {}
/** -32005 / 500 — internal proxy error decoding the Odoo response. */
export class InternalProxyError extends OdxError {}
/** 0 / 403 — the proxy's license is expired or invalid. */
export class LicenseError extends OdxError {}
/** Odoo's own error code / 200 — an Odoo-side logic error (validation, access, etc.). */
export class OdooLogicError extends OdxError {}

/** Maps a (jsonrpc code, http status) pair to the appropriate typed error. */
function makeError(code: number, message: string, data: any, httpStatus: number): OdxError {
    switch (code) {
        case -32000: return new AuthError(code, message, data, httpStatus);
        case -32001: return new InvalidActionError(code, message, data, httpStatus);
        case -32002: return new MissingFnNameError(code, message, data, httpStatus);
        case -32003: return new OdooTimeoutError(code, message, data, httpStatus);
        case -32004: return new OdooConnectError(code, message, data, httpStatus);
        case -32005: return new InternalProxyError(code, message, data, httpStatus);
        case 0:
            if (httpStatus === 403) return new LicenseError(code, message, data, httpStatus);
            break;
    }
    // A 200 carrying an error object is always an Odoo-side logic error (passthrough code).
    if (httpStatus === 200) return new OdooLogicError(code, message, data, httpStatus);
    return new OdxError(code, message, data, httpStatus);
}

/**
 * Generates a request id. Prefers `crypto.randomUUID()` (browsers in a secure
 * context, Node 18+), falls back to `getRandomValues`, then to a timestamp — so it
 * works in plain-HTTP browser dev contexts where `randomUUID` is unavailable.
 */
export function newRequestId(): string {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) {
        const b: Uint8Array = c.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
        return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
    }
    return "id-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2);
}

const DEFAULT_GATEWAY_URL = "https://gateway.odxproxy.io";
/** Client-side abort ceiling (ms) when no timeout is configured — matches legacy axios behavior. */
const DEFAULT_CLIENT_TIMEOUT_MS = 45000;

export class OdxProxyClient {
    private static instance: OdxProxyClient | null = null;
    private OdooInstance: OdxInstanceInfo;
    private gatewayUrl: string;
    private apiKey: string;
    private defaultTimeoutSecs?: number;

    private constructor(options: OdxProxyClientInfo) {
        this.OdooInstance = options.instance;
        let gatewayUrl = options.gateway_url ?? DEFAULT_GATEWAY_URL;
        if (gatewayUrl.endsWith("/")) {
            gatewayUrl = gatewayUrl.slice(0, -1);
        }
        this.gatewayUrl = gatewayUrl;
        this.apiKey = options.odx_api_key;
        this.defaultTimeoutSecs = options.default_timeout_secs;
    }

    static init(options: OdxProxyClientInfo){
        if(OdxProxyClient.instance){
            throw new Error("OdxProxyClient has already been initialized.");
        }
        OdxProxyClient.instance = new OdxProxyClient(options);
        return OdxProxyClient.instance;
    }

    static getInstance(): OdxProxyClient {
        if (!OdxProxyClient.instance) {
            throw new Error("OdxProxyClient has not been initialized.");
        }
        return OdxProxyClient.instance;
    }

    /**
     * Main RPC entry point — `POST /api/odoo/execute`.
     * Throws a typed {@link OdxError} on any proxy-level failure (non-2xx) or Odoo
     * logic error (200 with an `error` body), per SYSTEM_ARCHITECTURE §6.
     */
    async postRequest<T = any>(request: OdxClientRequest, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> {
        const { res, raw } = await this.send("POST", "/api/odoo/execute", request, true, opts);
        return this.envelopeOrThrow(res, raw) as OdxServerResponse & {result?: T};
    }

    /**
     * Queries the target Odoo instance's version banner — `POST /api/odoo/version`.
     * Requires no Odoo credentials (the upstream endpoint is public).
     */
    async version<T = any>(url: string, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> {
        const reqId = id || newRequestId();
        const { res, raw } = await this.send("POST", "/api/odoo/version", { id: reqId, url }, true, opts);
        return this.envelopeOrThrow(res, raw) as OdxServerResponse & {result?: T};
    }

    /** Build info — `GET /_/about`. No API key required. */
    async about(opts?: OdxRequestOptions): Promise<OdxServerResponse> {
        const { res, raw } = await this.send("GET", "/_/about", undefined, false, opts);
        return this.envelopeOrThrow(res, raw);
    }

    /** License info — `GET /_/license`. No API key required. Returns a flat object, not an envelope. */
    async license(opts?: OdxRequestOptions): Promise<OdxLicenseInfo> {
        const { res, raw } = await this.send("GET", "/_/license", undefined, false, opts);
        if (!res.ok) {
            throw makeError(res.status, res.statusText || "Request failed", raw ?? null, res.status);
        }
        return raw as OdxLicenseInfo;
    }

    /** Prometheus metrics — `GET /_/metrics`. No API key required. Returns raw text. */
    async metrics(opts?: OdxRequestOptions): Promise<string> {
        const { res, raw } = await this.send("GET", "/_/metrics", undefined, false, opts);
        if (!res.ok) {
            throw makeError(res.status, res.statusText || "Request failed", raw ?? null, res.status);
        }
        return typeof raw === "string" ? raw : JSON.stringify(raw);
    }

    getOdooInstance(): OdxInstanceInfo {
        return this.OdooInstance;
    }

    /** Performs the fetch with timeout/abort handling and reads the body once. */
    private async send(
        method: string,
        path: string,
        body: any | undefined,
        withApiKey: boolean,
        opts?: OdxRequestOptions,
    ): Promise<{ res: Response; raw: any }> {
        const headers = this.buildHeaders(withApiKey, body !== undefined, opts);
        const init: RequestInit = { method, headers };
        if (body !== undefined) {
            init.body = JSON.stringify(body);
        }

        const controller = new AbortController();
        let didTimeout = false;
        const secs = opts?.timeoutSecs ?? this.defaultTimeoutSecs;
        // Give the proxy a 5s margin past its own upstream timeout so it can return -32003.
        const ceilingMs = (typeof secs === "number" && secs > 0) ? secs * 1000 + 5000 : DEFAULT_CLIENT_TIMEOUT_MS;
        const timer = setTimeout(() => { didTimeout = true; controller.abort(); }, ceilingMs);
        const onExternalAbort = () => controller.abort();
        if (opts?.signal) {
            if (opts.signal.aborted) controller.abort();
            else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
        }

        try {
            const res = await fetch(this.gatewayUrl + path, { ...init, signal: controller.signal });
            const raw = await this.readBody(res);
            return { res, raw };
        } catch (err: any) {
            if (err?.name === "AbortError") {
                if (didTimeout) {
                    throw new OdooTimeoutError(-32003, "Request Timeout: exceeded client limit of " + ceilingMs + "ms", null, 0);
                }
                throw err; // caller-initiated abort — propagate as-is
            }
            throw new OdooConnectError(-32004, err?.message ?? "Network request failed", null, 0);
        } finally {
            clearTimeout(timer);
            if (opts?.signal) opts.signal.removeEventListener("abort", onExternalAbort);
        }
    }

    private buildHeaders(withApiKey: boolean, hasBody: boolean, opts?: OdxRequestOptions): Record<string, string> {
        const headers: Record<string, string> = {
            "accept": "application/json",
            // Ignored by browsers (forbidden header) but enables br/gzip/deflate on Node/undici.
            "accept-encoding": "br, gzip, deflate",
        };
        if (hasBody) headers["content-type"] = "application/json";
        if (withApiKey) headers["x-api-key"] = this.apiKey;
        const secs = opts?.timeoutSecs ?? this.defaultTimeoutSecs;
        if (typeof secs === "number" && secs > 0) headers["x-request-timeout"] = String(Math.floor(secs));
        return headers;
    }

    /** Reads the response body once, parsing JSON when possible and falling back to text. */
    private async readBody(res: Response): Promise<any> {
        const text = await res.text();
        if (!text) return undefined;
        try { return JSON.parse(text); } catch { return text; }
    }

    /**
     * Applies the SYSTEM_ARCHITECTURE §6 two-step rule: non-2xx is a proxy-level
     * failure; a 200 carrying `error` is an Odoo logic error. Either way, throw a
     * typed error; otherwise return the envelope.
     */
    private envelopeOrThrow(res: Response, raw: any): OdxServerResponse {
        const errObj: OdxServerErrorResponse | undefined =
            (raw && typeof raw === "object") ? raw.error : undefined;

        if (!res.ok) {
            const code = typeof errObj?.code === "number" ? errObj.code : res.status;
            const message = errObj?.message ?? res.statusText ?? "Request failed";
            const data = errObj?.data ?? (typeof raw === "string" ? { text: raw } : raw ?? null);
            throw makeError(code, message, data, res.status);
        }

        if (errObj) {
            const code = typeof errObj.code === "number" ? errObj.code : 200;
            throw makeError(code, errObj.message ?? "Odoo error", errObj.data ?? null, 200);
        }

        return raw as OdxServerResponse;
    }
}