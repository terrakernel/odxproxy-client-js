// __tests__/unit.test.ts
// Pure unit tests — no live ODXProxy/Odoo instance required. `fetch` is mocked.
import {
    init,
    search,
    search_read,
    call_method,
    version,
    license,
    about,
    metrics,
    AuthError,
    InvalidActionError,
    MissingFnNameError,
    OdooTimeoutError,
    OdooConnectError,
    OdooLogicError,
    OdxError,
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

beforeAll(() => {
    (globalThis as any).fetch = (url: string, init: RequestInit) => {
        lastCall = { url, init };
        return fetchMock(url, init);
    };
    const options: OdxProxyClientInfo = {
        instance: { db: "db", user_id: 2, url: "https://erp.example.com", api_key: "odoo-key" },
        odx_api_key: "proxy-key",
        gateway_url: "https://gw.example.com/",
        default_timeout_secs: 15,
    };
    init(options);
});

beforeEach(() => {
    lastCall = undefined;
    fetchMock.mockReset();
});

describe("request shaping", () => {
    it("posts to /api/odoo/execute with the right action, headers, and body", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", result: [1, 2] }));
        const res = await search("res.partner", [[["is_company", "=", false]]], { context: { tz: "UTC" } });

        expect(res.result).toEqual([1, 2]);
        expect(lastCall!.url).toBe("https://gw.example.com/api/odoo/execute");
        expect(lastCall!.init.method).toBe("POST");
        const headers = lastCall!.init.headers as Record<string, string>;
        expect(headers["x-api-key"]).toBe("proxy-key");
        expect(headers["content-type"]).toBe("application/json");
        expect(headers["x-request-timeout"]).toBe("15"); // from default_timeout_secs
        const body = JSON.parse(lastCall!.init.body as string);
        expect(body.action).toBe("search");
        expect(body.odoo_instance.db).toBe("db");
        expect(typeof body.id).toBe("string");
    });

    it("strips order/limit/offset/fields for non-search_read actions", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", result: 3 }));
        await search("res.partner", [[]], { context: { tz: "UTC" }, limit: 10, fields: ["name"], order: "name asc" });
        const body = JSON.parse(lastCall!.init.body as string);
        expect(body.keyword).toEqual({ context: { tz: "UTC" } });
    });

    it("keeps order/limit/offset/fields for search_read", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", result: [] }));
        await search_read("res.partner", [[]], { context: { tz: "UTC" }, limit: 10, fields: ["name"] });
        const body = JSON.parse(lastCall!.init.body as string);
        expect(body.keyword.limit).toBe(10);
        expect(body.keyword.fields).toEqual(["name"]);
    });

    it("honors a per-call timeout override", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", result: 0 }));
        await search("res.partner", [[]], { context: { tz: "UTC" } }, undefined, { timeoutSecs: 60 });
        const headers = lastCall!.init.headers as Record<string, string>;
        expect(headers["x-request-timeout"]).toBe("60");
    });
});

describe("error model", () => {
    const cases: [number, number, new (...a: any[]) => OdxError][] = [
        [401, -32000, AuthError],
        [400, -32001, InvalidActionError],
        [504, -32003, OdooTimeoutError],
        [502, -32004, OdooConnectError],
    ];

    it.each(cases)("maps HTTP %s / code %s to the right typed error", async (status, code, Ctor) => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: null, error: { code, message: "boom", data: { x: 1 } } }, status));
        await expect(search("res.partner", [[]], { context: { tz: "UTC" } })).rejects.toBeInstanceOf(Ctor);
    });

    it("throws OdooLogicError on a 200 carrying an error body (two-step rule)", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", error: { code: 200, message: "ValidationError", data: null } }, 200));
        await expect(search("res.partner", [[]], { context: { tz: "UTC" } })).rejects.toBeInstanceOf(OdooLogicError);
    });

    it("preserves code/message/data on the thrown error", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "nope", data: { y: 2 } } }, 401));
        await expect(search("res.partner", [[]], { context: { tz: "UTC" } })).rejects.toMatchObject({ code: -32000, message: "nope", data: { y: 2 }, httpStatus: 401 });
    });

    it("maps a network failure to OdooConnectError", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        await expect(search("res.partner", [[]], { context: { tz: "UTC" } })).rejects.toBeInstanceOf(OdooConnectError);
    });

    it("rejects call_method with empty fn_name client-side", async () => {
        await expect(call_method("account.move", [[5]], { context: { tz: "UTC" } }, "")).rejects.toBeInstanceOf(MissingFnNameError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("auxiliary endpoints", () => {
    it("version posts to /api/odoo/version with url + id, no odoo creds", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "x", result: { server_version: "17.0" } }));
        await version("https://erp.example.com");
        expect(lastCall!.url).toBe("https://gw.example.com/api/odoo/version");
        const body = JSON.parse(lastCall!.init.body as string);
        expect(body.url).toBe("https://erp.example.com");
        expect(body.odoo_instance).toBeUndefined();
    });

    it("license GETs /_/license without an api key and returns the flat object", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ licensee: "ACME", valid_until: "2099-01-01", is_valid: true }));
        const lic = await license();
        expect(lic.is_valid).toBe(true);
        expect(lastCall!.url).toBe("https://gw.example.com/_/license");
        expect(lastCall!.init.method).toBe("GET");
        const headers = lastCall!.init.headers as Record<string, string>;
        expect(headers["x-api-key"]).toBeUndefined();
    });

    it("about returns the envelope", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: "about", result: { build: "01H", version: "0.1.7" } }));
        const res = await about();
        expect(res.result.version).toBe("0.1.7");
    });

    it("metrics returns raw text", async () => {
        fetchMock.mockResolvedValue(new Response("odoo_success_response 5\n", { status: 200, statusText: "OK" }));
        const text = await metrics();
        expect(text).toContain("odoo_success_response");
    });
});