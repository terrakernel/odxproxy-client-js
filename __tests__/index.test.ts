// __tests__/index.test.ts
import {
    search,
    search_read,
    read,
    fields_get,
    search_count,
    create,
    remove,
    write,
    call_method, init,
} from "../src/index";
import {OdxProxyClientInfo} from "../src/client";

describe("All methods test", () => {
    let createdRecord: number;
    beforeAll(() => {
        let uid = process.env.uid || 2;
        uid = +uid;
        const options: OdxProxyClientInfo = {
            instance: {
                db: process.env.db || "",
                user_id: uid,
                url: process.env.url || "",
                api_key: process.env.api_key || "",
            },
            odx_api_key: process.env.odx_api_key || "",
        };
        init(options);
    });

    it("search", async () => {
        const res = await search("res.partner", [
            [
                ["is_company", "=", false]
            ]
        ], { context: { tz: "Asia/Jakarta", default_company_id: 1, allowed_company_ids: [1] } });
        expect(res.jsonrpc).toBe("2.0");
    }, 30000);

    it("search_read", async () => {
        const res = await search_read<{id: number, name?: string, email?: string}>("res.partner", [
            [
                ["is_company", "=", false]
            ]
        ], { context: { tz: "Asia/Jakarta", default_company_id: 1, allowed_company_ids: [1] }, limit: 10, fields: ["name","email"] });
        expect(res.jsonrpc).toBe("2.0");
    }, 30000);

    it("read", async () => {
        const res = await read<{id: number, name?: string, email?: string}>("res.partner", [[2]],
            { context: { tz: "Asia/Jakarta", default_company_id: 1, allowed_company_ids: [1] }, limit: 10, fields: ["name","email"] });
        expect(res.jsonrpc).toBe("2.0");
    }, 30000);

    it("fields_get", async () => {
        const res = await fields_get("res.partner",
            {
                context:
                    {
                        tz: "Asia/Jakarta",
                        default_company_id: 1,
                        allowed_company_ids: [1]
                    }
            });
        expect(res.jsonrpc).toBe("2.0");
    }, 30000);

    it("search_count", async () => {
        const res = await search_count("res.partner", [
            [
                ["is_company", "=", false]
            ]
        ], { context: { tz: "Asia/Jakarta", default_company_id: 1, allowed_company_ids: [1] }});
        expect(res.jsonrpc).toBe("2.0");
    }, 30000);

    it("create", async () => {
        const res = await create<number>("res.partner", [{ name: "Acme" }], { context: { tz: "UTC" } });
        expect(res.jsonrpc).toBe("2.0");
        createdRecord = res.result;
    }, 30000);

    it("write", async () => {
        if (createdRecord) {
            const res = await write("res.partner", [[createdRecord], {name: "ACME Updated"}], {context: {tz: "Asia/Jakarta"}})
            expect(res.jsonrpc).toBe("2.0");
        } else {
            expect(true).toBe(false);
        }
    }, 30000);

    it("remove", async () => {
        if (createdRecord) {
            const res = await remove("res.partner", [[createdRecord]], {context: {tz: "Asia/Jakarta"}})
            expect(res.jsonrpc).toBe("2.0");
        } else {
            expect(true).toBe(false);
        }
    }, 30000);

    it("call_method", async () => {
        const res = await call_method("account.move", [[5]], {context: {tz: "Asia/Jakarta"}}, "action_post")
        expect(res.jsonrpc).toBe("2.0");
    }, 30000);

    // it("search_read should call postRequest with action 'search_read'", async () => {
    //     await search_read("res.partner", [], { context: { tz: "UTC" } });
    //     expect(clientMock.postRequest).toHaveBeenCalledWith(
    //         expect.objectContaining({ action: "search_read" })
    //     );
    // });
    //
    // it("read should call postRequest with action 'read'", async () => {
    //     await read("res.partner", [2], { context: { tz: "UTC" } });
    //     expect(clientMock.postRequest).toHaveBeenCalledWith(
    //         expect.objectContaining({ action: "read" })
    //     );
    // });
    //
    // it("fields_get should call postRequest with action 'fields_get'", async () => {
    //     await fields_get("res.partner", { context: { tz: "UTC" } });
    //     expect(clientMock.postRequest).toHaveBeenCalledWith(
    //         expect.objectContaining({ action: "fields_get" })
    //     );
    // });
    //
    // it("search_count should call postRequest with action 'search_count'", async () => {
    //     await search_count("res.partner", [[]], { context: { tz: "UTC" } });
    //     expect(clientMock.postRequest).toHaveBeenCalledWith(
    //         expect.objectContaining({ action: "search_count" })
    //     );
    // });
    //
    // it("create should call postRequest with action 'create'", async () => {
    //     await create("res.partner", [{ name: "Acme" }], { context: { tz: "UTC" } });
    //     expect(clientMock.postRequest).toHaveBeenCalledWith(
    //         expect.objectContaining({ action: "create" })
    //     );
    // });

    // it("remove should call postRequest with action 'unlink'", async () => {
    //     await remove("res.partner", [1], { context: { tz: "UTC" } });
    //     expect(clientMock.postRequest).toHaveBeenCalledWith(
    //         expect.objectContaining({ action: "unlink" })
    //     );
    // });

    // it("update should call postRequest with action 'update'", async () => {
    //     await update("res.partner", [[1], { name: "Updated" }], { context: { tz: "UTC" } });
    //     expect(clientMock.postRequest).toHaveBeenCalledWith(
    //         expect.objectContaining({ action: "update" })
    //     );
    // });

    // it("call_method should call postRequest with action 'call_method'", async () => {
    //     await call_method("res.partner", [1], { context: { tz: "UTC" } }, "my_method");
    //     expect(clientMock.postRequest).toHaveBeenCalledWith(
    //         expect.objectContaining({ action: "call_method", fn_name: "my_method" })
    //     );
    // });
});