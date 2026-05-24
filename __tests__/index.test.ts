// __tests__/index.test.ts
// Integration tests against a real ODXProxy/Odoo instance, exercising the full
// res.partner lifecycle. Skipped unless `url` and `odx_api_key` env vars are set
// (loaded from .env by jest.setup.ts). Under the current error model every failure
// throws an OdxError, so a successful call always carries `result`.
import {
    init,
    search,
    search_read,
    read,
    fields_get,
    search_count,
    create,
    write,
    remove,
} from "../src/index";
import { OdxProxyClientInfo } from "../src/client";

const runLive = !!process.env.url && !!process.env.odx_api_key;
const describeLive = runLive ? describe : describe.skip;

const ctx = { tz: "Asia/Jakarta", default_company_id: 1, allowed_company_ids: [1] };
const PARTNER_NAME = "ODX Test Partner";

describeLive("res.partner lifecycle", () => {
    // Shared across the ordered tests below — the record we create, mutate, then delete.
    let partnerId: number;

    beforeAll(() => {
        const uid = +(process.env.uid || process.env.user_id || 2);
        const options: OdxProxyClientInfo = {
            instance: {
                db: process.env.db || "",
                user_id: uid,
                url: process.env.url || "",
                api_key: process.env.api_key || "",
            },
            odx_api_key: process.env.odx_api_key || "",
            // Defaults to https://gateway.odxproxy.io; set gateway_url for a self-hosted proxy.
            ...(process.env.gateway_url ? { gateway_url: process.env.gateway_url } : {}),
        };
        init(options);
    });

    it("create returns a numeric id", async () => {
        const res = await create<number>(
            "res.partner",
            [{ name: PARTNER_NAME, email: "odx-test@example.com", is_company: false }],
            { context: ctx },
        );
        expect(res.jsonrpc).toBe("2.0");
        expect(typeof res.result).toBe("number");
        partnerId = res.result as number;
    }, 30000);

    it("read returns the created record (fields passed positionally)", async () => {
        expect(partnerId).toBeDefined();
        const res = await read<Array<{ id: number; name: string; email: string }>>(
            "res.partner",
            [[partnerId], ["name", "email"]],
            { context: ctx },
        );
        expect(res.result?.[0]?.id).toBe(partnerId);
        expect(res.result?.[0]?.name).toBe(PARTNER_NAME);
    }, 30000);

    it("search finds the id by domain", async () => {
        const res = await search<number>("res.partner", [[["id", "=", partnerId]]], { context: ctx });
        expect(res.result).toContain(partnerId);
    }, 30000);

    it("search_read returns matching records with selected fields", async () => {
        const res = await search_read<Array<{ id: number; name: string }>>(
            "res.partner",
            [[["id", "=", partnerId]]],
            { context: ctx, fields: ["name"], limit: 5 },
        );
        expect(res.result?.[0]?.id).toBe(partnerId);
        expect(res.result?.[0]?.name).toBe(PARTNER_NAME);
    }, 30000);

    it("search_count counts matching records", async () => {
        const res = await search_count<number>("res.partner", [[["id", "=", partnerId]]], { context: ctx });
        expect(res.result).toBe(1);
    }, 30000);

    it("fields_get describes the model's fields", async () => {
        const res = await fields_get("res.partner", { context: ctx });
        expect(res.result).toHaveProperty("name");
        expect(res.result).toHaveProperty("email");
    }, 30000);

    it("write updates the record", async () => {
        const updated = await write<boolean>(
            "res.partner",
            [[partnerId], { name: `${PARTNER_NAME} (updated)` }],
            { context: ctx },
        );
        expect(updated.result).toBe(true);

        const after = await read<Array<{ name: string }>>("res.partner", [[partnerId], ["name"]], { context: ctx });
        expect(after.result?.[0]?.name).toBe(`${PARTNER_NAME} (updated)`);
    }, 30000);

    it("remove deletes the record", async () => {
        const removed = await remove<boolean>("res.partner", [[partnerId]], { context: ctx });
        expect(removed.result).toBe(true);

        const count = await search_count<number>("res.partner", [[["id", "=", partnerId]]], { context: ctx });
        expect(count.result).toBe(0);
    }, 30000);
});