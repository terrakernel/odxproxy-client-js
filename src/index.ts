/*
 * MIT License
 * Copyright (c) 2025 TERRAKERNEL PTE. LTD.
 * Author Julian Richie Wajong
 */
import {
    OdxProxyClient,
    OdxProxyClientInfo,
    OdxServerResponse,
    OdxClientRequest,
    OdxClientKeywordRequest,
    OdxRequestOptions,
    OdxLicenseInfo,
    MissingFnNameError,
    newRequestId,
} from "./client";

// Re-export the public surface so consumers can import types and error classes from the root.
export type {
    OdxInstanceInfo,
    OdxProxyClientInfo,
    OdxServerResponse,
    OdxServerErrorResponse,
    OdxClientRequest,
    OdxClientRequestContext,
    OdxClientKeywordRequest,
    OdxRequestOptions,
    OdxLicenseInfo,
} from "./client";
export {
    OdxProxyClient,
    OdxError,
    AuthError,
    InvalidActionError,
    MissingFnNameError,
    OdooTimeoutError,
    OdooConnectError,
    InternalProxyError,
    LicenseError,
    OdooLogicError,
    newRequestId,
} from "./client";

export const init = (options: OdxProxyClientInfo) => OdxProxyClient.init(options);

const client = () => OdxProxyClient.getInstance();

/** Keyword keys that only apply to `search_read`; stripped from every other action's request. */
const NON_QUERY_KEYS: (keyof OdxClientKeywordRequest)[] = ["order", "limit", "offset", "fields"];

/** Returns a shallow copy of `keyword` with the search-read-only keys removed. */
const stripQueryKeys = (keyword: OdxClientKeywordRequest): OdxClientKeywordRequest => {
    const k = { ...keyword };
    for (const key of NON_QUERY_KEYS) {
        delete k[key];
    }
    return k;
};

/**
* Performs a search on the specified Odoo model using the given domain/filter.
* @template T
* @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
* @param {any[]} params - The search domain/filter as an array of conditions.
* @param {OdxClientKeywordRequest} keyword - Additional keyword arguments for the search (order, limit, offset, fields, etc).
* @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
* @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
* @returns {Promise<OdxServerResponse & {result?: T[]}>} Promise resolving to the Odoo server response with a result array of records.
 **/
export const search = <T = number>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T[]}> => {
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "search",
        model_id: model,
        keyword: stripQueryKeys(keyword),
        params,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T[]>(body, opts);
}

/**
 * Performs a combined search and read on the specified Odoo model, returning matching records.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - The search domain/filter as an array of conditions.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments (order, limit, offset, fields, etc).
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T[]}>} Promise resolving to the Odoo server response with a result array of records.
 */
export const search_read = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T[]}> => {
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "search_read",
        model_id: model,
        keyword: { ...keyword },
        params,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T[]>(body, opts);
}


/**
 * Reads records from the specified Odoo model by IDs.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array of record IDs to read.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response with the record(s) data.
 */
export const read = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> => {
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "read",
        model_id: model,
        keyword: stripQueryKeys(keyword),
        params,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T>(body, opts);
}


/**
 * Retrieves metadata for fields of the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments for fields_get.
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T[]}>} Promise resolving to the Odoo server response with field metadata.
 */
export const fields_get = <T = any>( model: string, keyword: OdxClientKeywordRequest, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T[]}> => {
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "fields_get",
        model_id: model,
        keyword: stripQueryKeys(keyword),
        params: [],
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T[]>(body, opts);
}


/**
 * Counts the number of records matching the domain/filter in the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - The search domain/filter as an array of conditions.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response with the count result.
 */
export const search_count = <T = number>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> => {
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "search_count",
        model_id: model,
        keyword: stripQueryKeys(keyword),
        params,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T>(body, opts);
}


/**
 * Creates a new record in the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array with a dictionary of field values for the new record.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response with the ID of the created record.
 */
export const create = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> => {
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "create",
        model_id: model,
        keyword: stripQueryKeys(keyword),
        params,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T>(body, opts);
}


/**
 * Deletes (unlinks) records from the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array of record IDs to delete.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response indicating success.
 */
export const remove = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> => {
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "unlink",
        model_id: model,
        keyword: stripQueryKeys(keyword),
        params,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T>(body, opts);
}


/**
 * Updates records in the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array: first element is a list of record IDs, second is a dictionary of fields to update.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response indicating update result.
 */
export const write = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> => {
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "write",
        model_id: model,
        keyword: stripQueryKeys(keyword),
        params,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T>(body, opts);
}


/**
 * @deprecated Use {@link write} instead.
 */
export const update = write


/**
 * Calls an arbitrary method on the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array of parameters for the method call.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} function_name - The name of the Odoo method to call. Must be non-empty.
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response with the method result.
 * @throws {MissingFnNameError} If `function_name` is missing or empty (mirrors proxy error -32002).
 */
export const call_method = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, function_name: string, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> => {
    if (!function_name) {
        return Promise.reject(new MissingFnNameError(-32002, "call_method requires a non-empty fn_name", null, 400));
    }
    const body: OdxClientRequest = {
        id: id || newRequestId(),
        action: "call_method",
        model_id: model,
        keyword: stripQueryKeys(keyword),
        params,
        fn_name: function_name,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest<T>(body, opts);
}


/**
 * Queries the target Odoo instance's version banner (no Odoo credentials required).
 * @template T
 * @param {string} url - Base URL of the Odoo server to query.
 * @param {string} [id] - Optional request ID; if not provided, a UUID will be generated.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo version_info envelope.
 */
export const version = <T = any>(url: string, id?: string, opts?: OdxRequestOptions): Promise<OdxServerResponse & {result?: T}> =>
    client().version<T>(url, id, opts);

/**
 * Returns the running proxy build's identifiers (`GET /_/about`). No API key required.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 */
export const about = (opts?: OdxRequestOptions): Promise<OdxServerResponse> => client().about(opts);

/**
 * Returns the proxy's license info (`GET /_/license`). No API key required. Flat object, not an envelope.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 */
export const license = (opts?: OdxRequestOptions): Promise<OdxLicenseInfo> => client().license(opts);

/**
 * Returns the proxy's Prometheus metrics as text (`GET /_/metrics`). No API key required.
 * @param {OdxRequestOptions} [opts] - Optional per-call options (timeoutSecs, signal).
 */
export const metrics = (opts?: OdxRequestOptions): Promise<string> => client().metrics(opts);