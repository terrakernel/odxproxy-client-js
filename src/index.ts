/*
 * MIT License
 * Copyright (c) 2025 TERRAKERNEL PTE. LTD.
 * Author Julian Richie Wajong
 */
import {OdxProxyClient, OdxProxyClientInfo, OdxServerResponse, OdxClientRequest, OdxClientKeywordRequest} from "./client";
import ulid from "ulid";
export const init = (options: OdxProxyClientInfo) => OdxProxyClient.init(options);

const client = () => OdxProxyClient.getInstance();

/**
* Performs a search on the specified Odoo model using the given domain/filter.
* @template T
* @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
* @param {any[]} params - The search domain/filter as an array of conditions.
* @param {OdxClientKeywordRequest} keyword - Additional keyword arguments for the search (sort, limit, offset, fields, etc).
* @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
* @returns {Promise<OdxServerResponse & {result?: T[]}>} Promise resolving to the Odoo server response with a result array of records.
 **/
export const search = <T = number>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string): Promise<OdxServerResponse & {result?: T[]}> => {
    const kCopy = {...keyword};
    const paramsCopy = [...params];
    for (const key of ["sort", "limit", "offset", "fields"]) {
        delete kCopy[key as keyof OdxClientKeywordRequest];
    }
    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "search",
        model_id: model,
        keyword: kCopy,
        params: paramsCopy,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}

/**
 * Performs a combined search and read on the specified Odoo model, returning matching records.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - The search domain/filter as an array of conditions.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments (sort, limit, offset, fields, etc).
 * @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
 * @returns {Promise<OdxServerResponse & {result?: T[]}>} Promise resolving to the Odoo server response with a result array of records.
 */
export const search_read = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string): Promise<OdxServerResponse & {result?: T[]}> => {
    const kCopy = {...keyword};
    const paramsCopy = [...params];
    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "search_read",
        model_id: model,
        keyword: kCopy,
        params: paramsCopy,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}


/**
 * Reads records from the specified Odoo model by IDs.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array of record IDs to read.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response with the record(s) data.
 */
export const read = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string): Promise<OdxServerResponse & {result?: T}> => {
    const kCopy = {...keyword};
    const paramsCopy = [...params];
    for (const key of ["sort", "limit", "offset", "fields"]) {
        delete kCopy[key as keyof OdxClientKeywordRequest];
    }
    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "read",
        model_id: model,
        keyword: kCopy,
        params: paramsCopy,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}


/**
 * Retrieves metadata for fields of the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments for fields_get.
 * @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
 * @returns {Promise<OdxServerResponse & {result?: T[]}>} Promise resolving to the Odoo server response with field metadata.
 */
export const fields_get = <T = any>( model: string, keyword: OdxClientKeywordRequest, id?: string): Promise<OdxServerResponse & {result?: T[]}> => {
    const kCopy = {...keyword};
    for (const key of ["sort", "limit", "offset", "fields"]) {
        delete kCopy[key as keyof OdxClientKeywordRequest];
    }
    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "fields_get",
        model_id: model,
        keyword: kCopy,
        params: [],
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}


/**
 * Counts the number of records matching the domain/filter in the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - The search domain/filter as an array of conditions.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response with the count result.
 */
export const search_count = <T = number>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string): Promise<OdxServerResponse & {result?: T}> => {
    const kCopy = {...keyword};
    const paramsCopy = [...params];
    for (const key of ["sort", "limit", "offset", "fields"]) {
        delete kCopy[key as keyof OdxClientKeywordRequest];
    }

    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "search_count",
        model_id: model,
        keyword: kCopy,
        params: paramsCopy,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}


/**
 * Creates a new record in the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array with a dictionary of field values for the new record.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response with the ID of the created record.
 */
export const create = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string): Promise<OdxServerResponse & {result?: T}> => {
    const paramsCopy = [...params];
    const kCopy = {...keyword};
    for (const key of ["sort", "limit", "offset", "fields"]) {
        delete kCopy[key as keyof OdxClientKeywordRequest];
    }
    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "create",
        model_id: model,
        keyword: kCopy,
        params: paramsCopy,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}


/**
 * Deletes (unlinks) records from the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array of record IDs to delete.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response indicating success.
 */
export const remove = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string): Promise<OdxServerResponse & {result?: T}> => {
    const paramsCopy = [...params];
    const kCopy = {...keyword};
    for (const key of ["sort", "limit", "offset", "fields"]) {
        delete kCopy[key as keyof OdxClientKeywordRequest];
    }
    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "unlink",
        model_id: model,
        keyword: kCopy,
        params: paramsCopy,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}


/**
 * Updates records in the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array: first element is a list of record IDs, second is a dictionary of fields to update.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response indicating update result.
 */
export const update = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, id?: string): Promise<OdxServerResponse & {result?: T}> => {
    const paramsCopy = [...params];
    const kCopy = {...keyword};
    for (const key of ["sort", "limit", "offset", "fields"]) {
        delete kCopy[key as keyof OdxClientKeywordRequest];
    }
    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "write",
        model_id: model,
        keyword: kCopy,
        params: paramsCopy,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}


/**
 * Calls an arbitrary method on the specified Odoo model.
 * @template T
 * @param {string} model - The Odoo model name in dot notation (e.g. 'res.partner').
 * @param {any[]} params - Array of parameters for the method call.
 * @param {OdxClientKeywordRequest} keyword - Additional keyword arguments.
 * @param {string} function_name - The name of the Odoo method to call.
 * @param {string} [id] - Optional request ID; if not provided, a ULID will be generated.
 * @returns {Promise<OdxServerResponse & {result?: T}>} Promise resolving to the Odoo server response with the method result.
 */
export const call_method = <T = any>( model: string, params: any[], keyword: OdxClientKeywordRequest, function_name: string, id?: string): Promise<OdxServerResponse & {result?: T}> => {
    const paramsCopy = [...params];
    const kCopy = {...keyword};
    for (const key of ["sort", "limit", "offset", "fields"]) {
        delete kCopy[key as keyof OdxClientKeywordRequest];
    }
    let body: OdxClientRequest = {
        id: id || ulid.ulid(),
        action: "call_method",
        model_id: model,
        keyword: kCopy,
        params: paramsCopy,
        fn_name: function_name,
        odoo_instance: client().getOdooInstance()
    };
    return client().postRequest(body)
}