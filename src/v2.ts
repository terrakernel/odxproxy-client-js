/*
 * MIT License
 * Copyright (c) 2025 TERRAKERNEL PTE. LTD.
 * Author Julian Richie Wajong
 */

/**
 * v2 helpers: ODXProxy `/v2/odoo/*`, which reaches Odoo over JSON-2 (Odoo 19+).
 * Exposed from the package root as the `v2` namespace:
 *
 * ```ts
 * import { init, v2 } from "@terrakernel/odxproxy-client-js";
 * const res = await v2.search_read("res.partner", { domain: [["is_company", "=", true]], fields: ["name"] });
 * ```
 *
 * They use the same `init()` singleton and bound Odoo instance as the v1 helpers.
 * `instance.user_id` is not sent, because JSON-2 derives the user from the API key,
 * which must be an Odoo API key (not a password).
 *
 * Differences from v1 (SYSTEM_ARCHITECTURE §4.6 / §7.1):
 * - Arguments are **named only**. Each helper sends `kwargs` keys exactly as Odoo's
 *   Python parameter names (`domain`, `fields`, `vals_list`, `allfields`, `ids`, ...).
 *   Odoo rejects unknown names with {@link OdooValidationError}.
 * - Arguments left `undefined` are omitted, so Odoo's own defaults apply.
 * - `create` always returns an array of ids. Use {@link create_one} for a single id.
 * - Odoo errors are thrown as {@link OdooLogicError} subclasses keyed by Odoo's HTTP
 *   status (e.g. {@link OdooValidationError} for 422), so existing
 *   `instanceof OdooLogicError` checks still match.
 */
import {
    OdxProxyClient,
    OdxContext,
    OdxRequestOptions,
    OdxServerResponse,
    OdxV2Request,
    Json2UnavailableError,
    newRequestId,
} from "./client";
// Type-only, for the doc links above.
import type { OdooLogicError, OdooValidationError } from "./client";

/** Per-call options for v2 helpers: the v1 options plus an optional request id. */
export interface OdxV2RequestOptions extends OdxRequestOptions {
    /** Request id echoed back in the response; a UUID is generated when omitted. */
    id?: string;
}

/** An Odoo domain, e.g. `[["state", "=", "posted"], "|", ["a", "=", 1], ["b", "=", 2]]`. */
export type OdxDomain = any[];

/** Odoo field values for `create` / `write`, keyed by Odoo field name (never case-converted). */
export type OdxValues = Record<string, any>;

export interface OdxV2ContextArgs {
    /** Merged over `init({ default_context })`; these keys win. */
    context?: OdxContext;
}

export interface OdxV2SearchArgs extends OdxV2ContextArgs {
    domain: OdxDomain;
    offset?: number;
    limit?: number;
    order?: string;
}

export interface OdxV2SearchReadArgs extends OdxV2ContextArgs {
    domain?: OdxDomain;
    fields?: string[];
    offset?: number;
    limit?: number;
    order?: string;
}

export interface OdxV2SearchCountArgs extends OdxV2ContextArgs {
    domain: OdxDomain;
    limit?: number;
}

export interface OdxV2ReadArgs extends OdxV2ContextArgs {
    fields?: string[];
    load?: string;
}

export interface OdxV2FieldsGetArgs extends OdxV2ContextArgs {
    allfields?: string[];
    attributes?: string[];
}

/** Result of {@link version}: Odoo's `GET /json/version`. */
export interface OdxV2VersionInfo {
    version_info: (number | string)[];
    version: string;
}

type V2Response<T> = Promise<OdxServerResponse & { result?: T }>;

const client = () => OdxProxyClient.getInstance();

/**
 * Builds the wire `kwargs`. Drops `undefined` values, so Odoo defaults apply; an
 * explicit `null` is kept and reaches Odoo as `None`. Merges the init-level
 * default context under the call's own `context`, and omits `context` when both
 * are empty.
 */
function buildKwargs(kwargs: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(kwargs)) {
        if (value !== undefined && key !== "context") out[key] = value;
    }
    const context = { ...client().getDefaultContext(), ...kwargs.context };
    if (Object.keys(context).length > 0) out.context = context;
    return out;
}

function execute<T>(model: string, method: string, kwargs: Record<string, any>, opts?: OdxV2RequestOptions): V2Response<T> {
    const { url, db, api_key } = client().getOdooInstance();
    const body: OdxV2Request = {
        id: opts?.id || newRequestId(),
        model_id: model,
        method,
        kwargs: buildKwargs(kwargs),
        odoo_instance: { url, db, api_key },
    };
    return client().postV2Request<T>(body, opts);
}

/**
 * Searches `model` and returns the matching ids.
 * @example await v2.search("res.partner", { domain: [["customer_rank", ">", 0]], limit: 10 })
 */
export const search = (model: string, args: OdxV2SearchArgs, opts?: OdxV2RequestOptions): V2Response<number[]> =>
    execute<number[]>(model, "search", { ...args }, opts);

/**
 * Searches `model` and reads the matching records. With no `domain`, every record matches.
 * @example await v2.search_read<Partner>("res.partner", { domain: [["is_company", "=", true]], fields: ["name"], limit: 5 })
 */
export const search_read = <T = any>(model: string, args: OdxV2SearchReadArgs = {}, opts?: OdxV2RequestOptions): V2Response<T[]> =>
    execute<T[]>(model, "search_read", { ...args }, opts);

/** Counts the records of `model` that match `domain`. */
export const search_count = (model: string, args: OdxV2SearchCountArgs, opts?: OdxV2RequestOptions): V2Response<number> =>
    execute<number>(model, "search_count", { ...args }, opts);

/** Reads the records `ids` of `model`. */
export const read = <T = any>(model: string, ids: number[], args: OdxV2ReadArgs = {}, opts?: OdxV2RequestOptions): V2Response<T[]> =>
    execute<T[]>(model, "read", { ...args, ids }, opts);

/** Describes the fields of `model`, keyed by field name. */
export const fields_get = <T = Record<string, any>>(model: string, args: OdxV2FieldsGetArgs = {}, opts?: OdxV2RequestOptions): V2Response<T> =>
    execute<T>(model, "fields_get", { ...args }, opts);

/**
 * Creates one or more records. Always sends `vals_list` as an array, and **always
 * resolves to an array of ids**, even for a single record. See {@link create_one}.
 */
export const create = (model: string, vals: OdxValues | OdxValues[], args: OdxV2ContextArgs = {}, opts?: OdxV2RequestOptions): V2Response<number[]> =>
    execute<number[]>(model, "create", { ...args, vals_list: Array.isArray(vals) ? vals : [vals] }, opts);

/** Creates a single record and resolves to its id (the first element of {@link create}'s result). */
export const create_one = async (model: string, vals: OdxValues, args: OdxV2ContextArgs = {}, opts?: OdxV2RequestOptions): V2Response<number> => {
    const res = await create(model, vals, args, opts);
    return { ...res, result: res.result?.[0] };
};

/** Writes `vals` to the records `ids`. Resolves to `true`. */
export const write = (model: string, ids: number[], vals: OdxValues, args: OdxV2ContextArgs = {}, opts?: OdxV2RequestOptions): V2Response<boolean> =>
    execute<boolean>(model, "write", { ...args, ids, vals }, opts);

/** Deletes (unlinks) the records `ids`. Resolves to `true`. */
export const remove = (model: string, ids: number[], args: OdxV2ContextArgs = {}, opts?: OdxV2RequestOptions): V2Response<boolean> =>
    execute<boolean>(model, "unlink", { ...args, ids }, opts);

/**
 * Calls any public method of `model`. `kwargs` is sent as-is (plus the merged
 * context): put record ids in `kwargs.ids` (only for record methods, not
 * `@api.model` ones) and every other argument under its Python parameter name.
 * There are no positional arguments in v2.
 * @example await v2.call_method("account.move", "action_post", { ids: [7] })
 * @example await v2.call_method("res.partner", "name_search", { name: "Acm", limit: 5 })
 */
export const call_method = <T = any>(model: string, method: string, kwargs: Record<string, any> = {}, opts?: OdxV2RequestOptions): V2Response<T> =>
    execute<T>(model, method, kwargs, opts);

/**
 * Odoo's version over JSON-2 (`POST /v2/odoo/version`). Defaults to the bound
 * instance's URL. Throws {@link Json2UnavailableError} when the server has no
 * JSON-2 endpoint.
 */
export const version = (url?: string, opts?: OdxV2RequestOptions): V2Response<OdxV2VersionInfo> =>
    client().versionV2<OdxV2VersionInfo>(url ?? client().getOdooInstance().url, opts?.id, opts);

const supportCache = new Map<string, boolean>();

/**
 * Whether the Odoo at `url` (default: the bound instance) can be reached through v2,
 * i.e. runs Odoo 19+. The answer is cached per URL for the life of the process.
 * Network and proxy errors are thrown, not cached.
 */
export const is_supported = async (url?: string, opts?: OdxV2RequestOptions): Promise<boolean> => {
    const target = url ?? client().getOdooInstance().url;
    const cached = supportCache.get(target);
    if (cached !== undefined) return cached;
    let supported: boolean;
    try {
        const res = await version(target, opts);
        supported = Number(res.result?.version_info?.[0]) >= 19;
    } catch (err) {
        if (!(err instanceof Json2UnavailableError)) throw err;
        supported = false;
    }
    supportCache.set(target, supported);
    return supported;
};
