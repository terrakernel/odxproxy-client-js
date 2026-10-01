// __tests__/v2.live.test.ts
// Live v2 tests against a real ODXProxy (0.9.0+, with /v2) in front of an Odoo 19+
// instance. Skipped unless `v2_gateway_url` and `v2_odx_api_key` are set. Uses its own
// `v2_*` env names so it can target a different proxy/Odoo than the v1 suite in
// index.test.ts. Creates one res.partner and deletes it again.
import {
    init,
    v2,
    OdooAccessError,
    OdooNotFoundError,
    OdooValidationError,
    InvalidRequestError,
    type OdxProxyClientInfo,
} from "../src/index";

const env = process.env;
const runLive = !!env.v2_gateway_url && !!env.v2_odx_api_key;
const describeLive = runLive ? describe : describe.skip;

describeLive("v2 against a live proxy + Odoo 19+", () => {
    let partnerId: number;

    beforeAll(() => {
        const options: OdxProxyClientInfo = {
            instance: { url: env.v2_url || "", db: env.v2_db || "", api_key: env.v2_api_key || "", user_id: 0 },
            odx_api_key: env.v2_odx_api_key || "",
            gateway_url: env.v2_gateway_url,
            default_context: { lang: "en_US" },
        };
        init(options);
    });

    it("version reports Odoo 19+ and is_supported is true", async () => {
        const res = await v2.version();
        expect(Number(res.result?.version_info[0])).toBeGreaterThanOrEqual(19);
        expect(await v2.is_supported()).toBe(true);
    });

    it("create_one returns a numeric id", async () => {
        const res = await v2.create_one("res.partner", { name: "ODX v2 Test Partner", comment: "created by v2.live.test.ts" });
        expect(typeof res.result).toBe("number");
        partnerId = res.result!;
    });

    it("read returns the record with the selected fields", async () => {
        const res = await v2.read<{ id: number; name: string }>("res.partner", [partnerId], { fields: ["name"] });
        expect(res.result).toEqual([{ id: partnerId, name: "ODX v2 Test Partner" }]);
    });

    it("write returns true and the change is visible to search_read", async () => {
        const w = await v2.write("res.partner", [partnerId], { name: "ODX v2 Test Partner (edited)" });
        expect(w.result).toBe(true);
        const res = await v2.search_read<{ id: number; name: string }>("res.partner", {
            domain: [["id", "=", partnerId]],
            fields: ["name"],
        });
        expect(res.result?.[0].name).toBe("ODX v2 Test Partner (edited)");
    });

    it("search, search_count and fields_get agree with the record", async () => {
        const ids = await v2.search("res.partner", { domain: [["id", "=", partnerId]] });
        expect(ids.result).toEqual([partnerId]);
        const count = await v2.search_count("res.partner", { domain: [["id", "=", partnerId]] });
        expect(count.result).toBe(1);
        const fields = await v2.fields_get("res.partner", { allfields: ["name"], attributes: ["type"] });
        expect(fields.result?.name?.type).toBe("char");
    });

    it("call_method runs a non-CRUD method with named kwargs", async () => {
        const res = await v2.call_method<[number, string][]>("res.partner", "name_search", { name: "ODX v2 Test Partner", limit: 5 });
        expect(res.result?.some(([id]: [number, string]) => id === partnerId)).toBe(true);
    });

    it("Odoo errors arrive as typed OdooLogicError subclasses", async () => {
        // `ids` on an @api.model method -> Odoo 422
        await expect(v2.call_method("res.partner", "search", { ids: [partnerId], domain: [] })).rejects.toBeInstanceOf(OdooValidationError);
        // unknown kwarg -> Odoo 422
        await expect(v2.call_method("res.partner", "search_count", { filter: [] })).rejects.toBeInstanceOf(OdooValidationError);
        // unknown model -> Odoo 404
        await expect(v2.search_count("no.such.model", { domain: [] })).rejects.toBeInstanceOf(OdooNotFoundError);
        // private method -> Odoo 403
        await expect(v2.call_method("res.partner", "_compute_display_name", { ids: [partnerId] })).rejects.toBeInstanceOf(OdooAccessError);
        // path-unsafe model -> rejected by the proxy before Odoo (-32007)
        await expect(v2.search_count("..", { domain: [] })).rejects.toBeInstanceOf(InvalidRequestError);
    });

    it("remove deletes the record", async () => {
        const res = await v2.remove("res.partner", [partnerId]);
        expect(res.result).toBe(true);
        const count = await v2.search_count("res.partner", { domain: [["id", "=", partnerId]] });
        expect(count.result).toBe(0);
    });
});
