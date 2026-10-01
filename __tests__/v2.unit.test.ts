// __tests__/v2.unit.test.ts
// Pure unit tests for the v2 helpers. `fetch` is mocked. The wire shapes asserted
// here are the proxy's `/v2/odoo/execute` contract (SYSTEM_ARCHITECTURE §4.6 / §7.1).
// A separate file from unit.test.ts because the singleton can only be init()-ed once
// per module registry, and this suite needs `default_context`.
import {
    init,
    v2,
    search as v1Search,
    OdxError,
    AuthError,
    OdooLogicError,
    OdooAuthError,
    OdooAccessError,
    OdooNotFoundError,
    OdooConflictError,
    OdooValidationError,
    OdooServerError,
    Json2UnavailableError,
    InvalidRequestError,
    type OdxProxyClientInfo,
} from "../src/index";

type FetchArgs = { url: string; init: RequestInit };

let lastCall: FetchArgs | undefined;
const fetchMock = jest.fn();

function jsonResponse(body: any, status = 200): Response {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        statusText: status === 200 ? "OK" : "Error",
        headers: { "content-type": "application/json" },
    });
}

const ok = (result: any) => jsonResponse({ jsonrpc: "2.0", id: "x", result });
const sentBody = () => JSON.parse(lastCall!.init.body as string);

beforeAll(() => {
    (globalThis as any).fetch = (url: string, init: RequestInit) => {
        lastCall = { url, init };
        return fetchMock(url, init);
    };
    const options: OdxProxyClientInfo = {
        instance: { db: "prod", user_id: 2, url: "https://erp.example.com", api_key: "odoo-key" },
        odx_api_key: "proxy-key",
        gateway_url: "https://gw.example.com",
        default_context: { lang: "en_US", tz: "Asia/Jakarta" },
    };
    init(options);
});

beforeEach(() => {
    lastCall = undefined;
    fetchMock.mockReset();
});

describe("v2 request shaping", () => {
    it("posts to /v2/odoo/execute with model_id, method, kwargs and a user_id-free instance", async () => {
        fetchMock.mockResolvedValue(ok([{ id: 1, name: "Acme" }]));
        const res = await v2.search_read("res.partner", { domain: [["is_company", "=", true]], fields: ["name"], limit: 5 });

        expect(res.result).toEqual([{ id: 1, name: "Acme" }]);
        expect(lastCall!.url).toBe("https://gw.example.com/v2/odoo/execute");
        expect(lastCall!.init.method).toBe("POST");
        const headers = lastCall!.init.headers as Record<string, string>;
        expect(headers["x-api-key"]).toBe("proxy-key");
        expect(headers["content-type"]).toBe("application/json");

        const body = sentBody();
        expect(body).toEqual({
            id: expect.any(String),
            model_id: "res.partner",
            method: "search_read",
            kwargs: {
                domain: [["is_company", "=", true]],
                fields: ["name"],
                limit: 5,
                context: { lang: "en_US", tz: "Asia/Jakarta" },
            },
            odoo_instance: { url: "https://erp.example.com", db: "prod", api_key: "odoo-key" },
        });
        // No v1 fields leak into v2.
        expect(body.action).toBeUndefined();
        expect(body.params).toBeUndefined();
        expect(body.keyword).toBeUndefined();
        expect(body.odoo_instance.user_id).toBeUndefined();
    });

    // Wire kwargs per helper. Keys must be Odoo's Python parameter names, never camelCased.
    const cases: [string, () => Promise<any>, string, Record<string, any>][] = [
        ["search", () => v2.search("res.partner", { domain: [], limit: 3, order: "id desc" }), "search", { domain: [], limit: 3, order: "id desc" }],
        ["search_count", () => v2.search_count("res.partner", { domain: [["active", "=", true]] }), "search_count", { domain: [["active", "=", true]] }],
        ["read", () => v2.read("res.partner", [3, 4], { fields: ["name"] }), "read", { ids: [3, 4], fields: ["name"] }],
        ["fields_get", () => v2.fields_get("res.partner", { allfields: ["name"], attributes: ["type"] }), "fields_get", { allfields: ["name"], attributes: ["type"] }],
        ["create (list)", () => v2.create("res.partner", [{ name: "A" }, { name: "B" }]), "create", { vals_list: [{ name: "A" }, { name: "B" }] }],
        ["create (single dict is wrapped)", () => v2.create("res.partner", { name: "A" }), "create", { vals_list: [{ name: "A" }] }],
        ["write", () => v2.write("res.partner", [7], { comment: "x" }), "write", { ids: [7], vals: { comment: "x" } }],
        ["remove sends unlink", () => v2.remove("res.partner", [7]), "unlink", { ids: [7] }],
        ["call_method", () => v2.call_method("account.move", "action_post", { ids: [9] }), "action_post", { ids: [9] }],
    ];

    it.each(cases)("%s", async (_name, call, method, kwargs) => {
        fetchMock.mockResolvedValue(ok(true));
        await call();
        const body = sentBody();
        expect(body.method).toBe(method);
        expect(body.kwargs).toEqual({ ...kwargs, context: { lang: "en_US", tz: "Asia/Jakarta" } });
    });

    it("omits undefined arguments but keeps explicit null", async () => {
        fetchMock.mockResolvedValue(ok([]));
        await v2.search_read("res.partner", { domain: [], fields: undefined, limit: null as any });
        expect(sentBody().kwargs).toEqual({ domain: [], limit: null, context: { lang: "en_US", tz: "Asia/Jakarta" } });
    });

    it("merges call context over the default context (call wins)", async () => {
        fetchMock.mockResolvedValue(ok([]));
        await v2.search("res.partner", { domain: [], context: { tz: "UTC", allowed_company_ids: [1] } });
        expect(sentBody().kwargs.context).toEqual({ lang: "en_US", tz: "UTC", allowed_company_ids: [1] });
    });

    it("never sends ids for @api.model helpers", async () => {
        fetchMock.mockImplementation(async () => ok([])); // fresh Response per call: a body is single-use
        for (const call of [
            () => v2.search("res.partner", { domain: [] }),
            () => v2.search_read("res.partner"),
            () => v2.search_count("res.partner", { domain: [] }),
            () => v2.fields_get("res.partner"),
            () => v2.create("res.partner", { name: "A" }),
        ]) {
            await call();
            expect(sentBody().kwargs.ids).toBeUndefined();
        }
    });

    it("create_one resolves to the first id; create resolves to the array", async () => {
        fetchMock.mockResolvedValue(ok([42]));
        const one = await v2.create_one("res.partner", { name: "A" });
        expect(one.result).toBe(42);
        fetchMock.mockResolvedValue(ok([42]));
        const many = await v2.create("res.partner", { name: "A" });
        expect(many.result).toEqual([42]);
    });

    it("uses opts.id as the request id and honors timeoutSecs", async () => {
        fetchMock.mockResolvedValue(ok(0));
        await v2.search_count("res.partner", { domain: [] }, { id: "req-7", timeoutSecs: 60 });
        expect(sentBody().id).toBe("req-7");
        expect((lastCall!.init.headers as Record<string, string>)["x-request-timeout"]).toBe("60");
    });

    it("does not change v1 requests (default_context is v2-only)", async () => {
        fetchMock.mockResolvedValue(ok([1]));
        await v1Search("res.partner", [[]], { context: { tz: "UTC" } });
        const body = sentBody();
        expect(lastCall!.url).toBe("https://gw.example.com/api/odoo/execute");
        expect(body.keyword).toEqual({ context: { tz: "UTC" } });
        expect(body.odoo_instance.user_id).toBe(2);
    });
});

describe("v2 version / is_supported", () => {
    it("version posts {id, url} to /v2/odoo/version, defaulting to the bound instance url", async () => {
        fetchMock.mockResolvedValue(ok({ version_info: [20, 0, 0, "final", 0, "e"], version: "20.0+e" }));
        const res = await v2.version();
        expect(lastCall!.url).toBe("https://gw.example.com/v2/odoo/version");
        expect(sentBody()).toEqual({ id: expect.any(String), url: "https://erp.example.com" });
        expect(res.result?.version).toBe("20.0+e");
    });

    it("is_supported is true for 19+, false on -32006 or < 19, and caches per url", async () => {
        fetchMock.mockResolvedValue(ok({ version_info: [19, 0, 0, "final", 0, ""], version: "19.0" }));
        expect(await v2.is_supported("https://nineteen.example.com")).toBe(true);
        expect(await v2.is_supported("https://nineteen.example.com")).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", error: { code: -32006, message: "JSON-2 is not available" } }));
        expect(await v2.is_supported("https://seventeen.example.com")).toBe(false);

        fetchMock.mockResolvedValue(ok({ version_info: [18, 0, 0, "final", 0, ""], version: "18.0" }));
        expect(await v2.is_supported("https://eighteen.example.com")).toBe(false);
    });

    it("is_supported rethrows proxy errors without caching", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Authentication failed" } }, 401));
        await expect(v2.is_supported("https://flaky.example.com")).rejects.toBeInstanceOf(AuthError);
        fetchMock.mockResolvedValue(ok({ version_info: [20], version: "20.0" }));
        expect(await v2.is_supported("https://flaky.example.com")).toBe(true);
    });
});

describe("v2 error model", () => {
    // [http status, error.code, expected class]. Odoo errors arrive on a 200 with Odoo's HTTP status as code.
    const cases: [number, number, new (...a: any[]) => OdxError][] = [
        [200, 401, OdooAuthError],
        [200, 403, OdooAccessError],
        [200, 404, OdooNotFoundError],
        [200, 409, OdooConflictError],
        [200, 422, OdooValidationError],
        [200, 500, OdooServerError],
        [200, 502, OdooServerError],
        [200, -32006, Json2UnavailableError],
        [400, -32007, InvalidRequestError],
        [401, -32000, AuthError],
    ];

    it.each(cases)("HTTP %s / code %s", async (status, code, Ctor) => {
        const data = { name: "odoo.exceptions.ValidationError", message: "boom", arguments: ["boom"], context: {}, debug: "" };
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", error: { code, message: "boom", data } }, status));
        const err = await v2.search("res.partner", { domain: [] }).catch((e) => e);
        expect(err).toBeInstanceOf(Ctor);
        expect(err).toMatchObject({ code, message: "boom", httpStatus: status });
    });

    it("Odoo status errors are still OdooLogicError and expose odooErrorName", async () => {
        const data = { name: "odoo.exceptions.ValidationError", message: "Name is required" };
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", error: { code: 422, message: "Name is required", data } }));
        const err = await v2.create("res.partner", {}).catch((e) => e);
        expect(err).toBeInstanceOf(OdooValidationError);
        expect(err).toBeInstanceOf(OdooLogicError);
        expect(err.odooErrorName).toBe("odoo.exceptions.ValidationError");
        expect(err.data).toEqual(data);
    });

    it("a non-2xx 422 is the proxy rejecting the body, not an Odoo validation error", async () => {
        fetchMock.mockResolvedValue(new Response("Failed to deserialize the JSON body", { status: 422, statusText: "Unprocessable Entity" }));
        const err = await v2.call_method("res.partner", "search", [] as any).catch((e) => e);
        expect(err).toBeInstanceOf(OdxError);
        expect(err).not.toBeInstanceOf(OdooLogicError);
        expect(err.httpStatus).toBe(422);
    });
});
