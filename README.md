# @terrakernel/odxproxy-client-js

Official JavaScript/TypeScript client for ODXProxy. This SDK provides a simple, typed interface to execute Odoo JSON-RPC operations via the ODXProxy Gateway.

- Repository package name: `@terrakernel/odxproxy-client-js`
- License: MIT
- Runtime: Node.js 18+ (uses the global `fetch`) or any modern browser
- Dependencies: none at runtime
- Language: TypeScript (bundled to ESM and CJS)

## Table of Contents
- What is ODXProxy?
- Features
- Installation
- Quick Start
- Configuration
- API Reference
  - init
  - search
  - search_read
  - read
  - fields_get
  - search_count
  - create
  - write
  - remove
  - call_method
- v2 API (Odoo 19+, JSON-2)
- Error Handling
- Examples
- Testing
- Build
- Versioning
- License

## What is ODXProxy?
ODXProxy is a gateway that securely exposes Odoo RPC functionality over HTTPS with API key protection. Using this client, you can perform common CRUD operations and call arbitrary model methods without dealing with low-level JSON-RPC details.

## Features
- Friendly, typed wrapper around ODXProxy endpoints
- **Zero runtime dependencies** — built on the platform `fetch`, runs in Node 18+ and the browser
- Supports both ESM and CommonJS
- Works with TypeScript out of the box (bundled type definitions)
- Covers common Odoo actions: search, search_read, read, fields_get, search_count, create, write, unlink (remove), and call_method
- **v2 API** (`v2.*`) for Odoo 19+ over Odoo's JSON-2: named arguments, typed Odoo errors, ready for Odoo 22 (which removes the legacy `/jsonrpc` that v1 uses)
- Auxiliary endpoints: version, about, license, metrics
- Typed errors (`OdxError` and subclasses) thrown for every failure
- Request IDs are auto-generated (UUID via `crypto.randomUUID`, can be overridden)

## Installation

```
npm install @terrakernel/odxproxy-client-js
# or
yarn add @terrakernel/odxproxy-client-js
# or
pnpm add @terrakernel/odxproxy-client-js
```

## Quick Start

```ts
import { init, search_read } from "@terrakernel/odxproxy-client-js";

// Initialize once at app startup
init({
  instance: {
    url: process.env.ODOO_URL || "",
    db: process.env.ODOO_DB || "",
    user_id: Number(process.env.ODOO_UID || 2),
    api_key: process.env.ODOO_API_KEY || "",
  },
  odx_api_key: process.env.ODX_API_KEY || "",
  // gateway_url: "https://gateway.odxproxy.io" // optional, default shown
});

// Use any of the exported helpers thereafter
const res = await search_read<{ id: number; name?: string }>(
  "res.partner",
  [[ ["is_company", "=", false] ]],
  { context: { tz: "UTC" }, limit: 10, fields: ["name"] }
);

console.log(res.jsonrpc, res.result);
```

## Configuration
Call `init` once with the following structure:

```ts
// Type shape for init options
init({
  instance: {
    url: "https://your-odoo.example.com", // Base URL to your Odoo instance
    db: "your-db",                         // Odoo database name
    user_id: 2,                             // Odoo user ID
    api_key: "odoo-user-api-key",          // Odoo API key for that user
  },
  odx_api_key: "your-odxproxy-gateway-api-key", // ODXProxy Gateway API key
  gateway_url: "https://gateway.odxproxy.io",    // Optional. Default shown (trailing slash trimmed)
  default_timeout_secs: 15,                      // Optional. Upstream Odoo timeout (sent as x-request-timeout)
  default_context: { lang: "en_US", tz: "UTC", allowed_company_ids: [1] }, // Optional. v2 only: merged into every v2 call
});
```

Context (passed inside `keyword`) supports:

```json
{
  "context": {
    "tz": "UTC",
    "default_company_id": 1,
    "allowed_company_ids": [1]
  },
  "fields": ["name", "email"],
  "order": "name asc",
  "limit": 10,
  "offset": 0
}
```

Note: For actions other than `search_read`, the client strips `fields`/`order`/`limit`/`offset` before sending (they only apply to a combined search+read). The sort key is `order` (Odoo's `execute_kw` keyword).

Every helper also accepts an optional trailing `opts` argument for per-call control:

```ts
await search_read("res.partner", domain, keyword, /* id */ undefined, {
  timeoutSecs: 60,         // overrides default_timeout_secs for this call (x-request-timeout)
  signal: ac.signal,       // AbortController signal for cancellation
});
```

## API Reference
On success, data functions resolve to the JSON-RPC envelope (failures are **thrown** as `OdxError` — see Error Handling):

```
{
  jsonrpc: string;        // typically "2.0"
  id: string;             // request id (UUID by default)
  result?: any;           // the Odoo result
}
```

Each data function also accepts an optional trailing `opts?: OdxRequestOptions` ({ timeoutSecs?, signal? }) after `id`.

- init(options)
  - Initializes the singleton client. Must be called before any other function.

- search<T = number>(model, params, keyword, id?)
  - params: domain array (e.g., [[ ["is_company", "=", false] ]])
  - returns: result?: T[] (commonly record IDs unless fields requested via search_read)

- search_read<T = any>(model, params, keyword, id?)
  - params: domain array
  - keyword: can include fields, limit, offset, order, and context
  - returns: result?: T[] (records)

- read<T = any>(model, params, keyword, id?)
  - params: record IDs, with the field list passed positionally (e.g., [[1,2,3], ["name","email"]]); fields in `keyword` are ignored for read
  - returns: result?: T (array of records)

- fields_get<T = any>(model, keyword, id?)
  - returns: result?: T (object keyed by field name → field metadata)

- search_count<T = number>(model, params, keyword, id?)
  - returns: result?: T (count)

- create<T = any>(model, params, keyword, id?)
  - params: array with a single object of field values (e.g., [{ name: "Acme" }])
  - returns: result?: T (typically new record ID)

- write<T = any>(model, params, keyword, id?)
  - params: [[ids], { field: value }]
  - returns: result?: T

- remove<T = any>(model, params, keyword, id?)
  - params: [[ids]]
  - returns: result?: T

- call_method<T = any>(model, params, keyword, function_name, id?)
  - params: method parameters array
  - returns: result?: T

## v2 API (Odoo 19+, JSON-2)

ODXProxy 0.9.0 added `/v2` endpoints that reach Odoo over its **JSON-2** API instead of the legacy `/jsonrpc`. The SDK exposes them as the `v2` namespace, on the same `init()` and the same bound Odoo instance:

```ts
import { init, v2 } from "@terrakernel/odxproxy-client-js";

init({
  instance: { url: "https://erp.example.com", db: "prod", user_id: 2, api_key: "<odoo api key>" },
  odx_api_key: "<proxy key>",
  default_context: { lang: "en_US", tz: "Asia/Jakarta", allowed_company_ids: [1] },
});

const partners = await v2.search_read<{ id: number; name: string }>("res.partner", {
  domain: [["is_company", "=", true]],
  fields: ["name"],
  limit: 10,
});

const ids = await v2.create("res.partner", [{ name: "Acme" }, { name: "Globex" }]); // result: [41, 42]
const one = await v2.create_one("res.partner", { name: "Initech" });               // result: 43
await v2.write("res.partner", ids.result!, { comment: "via v2" });
await v2.remove("res.partner", ids.result!);

await v2.call_method("account.move", "action_post", { ids: [7] });
await v2.call_method("res.partner", "name_search", { name: "Acm", limit: 5 });
```

**When to use which:**
- Odoo **19–21** supports v1 and v2.
- Odoo **22+** supports only v2.
- Odoo **≤18** supports only v1.

v1 is not deprecated. `await v2.is_supported()` checks the bound instance once and caches the answer.

**How v2 differs from v1:**

- **Named arguments only.** Every helper takes an options object whose keys are sent to Odoo **exactly** as Odoo's Python parameter names (`domain`, `fields`, `vals_list`, `allfields`, `ids`, …). There are no positional `params` and no `keyword`. Odoo rejects an unknown or misspelled name with `OdooValidationError`.
- **Unset options are omitted**, so Odoo's own defaults apply. Don't pass `null` unless you mean Odoo's `None`.
- **`create` always resolves to an array of ids**, even for a single record. Use `create_one` for a single id.
- **The API key must be an Odoo API key**, not a password. On Odoo 20+ the key's scope must be `rpc` (the default). Keys of non-admin users expire. `instance.user_id` is not sent, because Odoo derives the user from the key.
- **Context:** `init({ default_context })` is merged into every v2 call, and a call's own `context` keys win. It does not affect v1 calls. Odoo applies no company selection unless `allowed_company_ids` is sent.
- **Multi-database hosts:** the database is selected by header and filtered by the server's `dbfilter`. If the host picks the database from the hostname, `instance.url` must be that database's own hostname. Otherwise v2 throws `Json2UnavailableError`.
- **Binary fields on Odoo 20+** read as `{ content, filename?, size }` rather than a bare base64 string. This is an Odoo 20 change and applies to v1 too.

| Helper | Odoo method | `kwargs` sent | `result` |
|---|---|---|---|
| `v2.search(model, { domain, offset?, limit?, order?, context? })` | `search` | same keys | `number[]` |
| `v2.search_read(model, { domain?, fields?, offset?, limit?, order?, context? }?)` | `search_read` | same keys | records |
| `v2.search_count(model, { domain, limit?, context? })` | `search_count` | same keys | `number` |
| `v2.read(model, ids, { fields?, load?, context? }?)` | `read` | `ids` + keys | records |
| `v2.fields_get(model, { allfields?, attributes?, context? }?)` | `fields_get` | same keys | object by field |
| `v2.create(model, vals \| vals[], { context? }?)` | `create` | `vals_list` (always an array) | `number[]` |
| `v2.create_one(model, vals, { context? }?)` | `create` | `vals_list: [vals]` | `number` |
| `v2.write(model, ids, vals, { context? }?)` | `write` | `ids`, `vals` | `true` |
| `v2.remove(model, ids, { context? }?)` | `unlink` | `ids` | `true` |
| `v2.call_method(model, method, kwargs?)` | *method* | `kwargs` as given (`ids` only for record methods) | method's return |
| `v2.version(url?)` | – | `POST /v2/odoo/version` | `{ version_info, version }` |
| `v2.is_supported(url?)` | – | uses `v2.version` | `boolean` (cached) |

Every v2 helper takes a trailing `opts?: { id?, timeoutSecs?, signal? }`. `id` sets the request id, which v1 takes positionally.

## Error Handling
Every failure is **thrown** as a typed error — proxy-level failures (non-2xx) *and* Odoo logic errors (an `error` body on a `200`). On success the helper resolves to the envelope with `result` set. Use a single `try/catch`:

```ts
import { search_read, AuthError, OdooLogicError, OdooTimeoutError, OdxError } from "@terrakernel/odxproxy-client-js";

try {
  const res = await search_read("res.partner", [[]], { context: { tz: "UTC" } });
  console.log(res.result);
} catch (err) {
  if (err instanceof AuthError) { /* bad x-api-key — reauth */ }
  else if (err instanceof OdooLogicError) { /* Odoo validation/access error */ }
  else if (err instanceof OdooTimeoutError) { /* upstream timed out — retry/backoff */ }
  else if (err instanceof OdxError) { console.error(err.code, err.message, err.data, err.httpStatus); }
  else { throw err; } // not from this SDK (e.g. a caller-initiated AbortError) — propagate
}
```

All errors extend `OdxError` and carry the JSON-RPC `code`, `message`, `data`, and the raw `httpStatus`. Note that `code` is the **JSON-RPC code** (the values below), *not* the HTTP status — that's on `httpStatus`. Subclasses map to the proxy's error catalog:

| Class | code | When |
|---|---|---|
| `AuthError` | -32000 | Missing/wrong `x-api-key` |
| `InvalidActionError` | -32001 | Action not allowed |
| `MissingFnNameError` | -32002 | `call_method` without `fn_name` (also raised client-side) |
| `OdooTimeoutError` | -32003 | Upstream Odoo timeout (also on client-side abort) |
| `OdooConnectError` | -32004 | Network failure reaching Odoo |
| `InternalProxyError` | -32005 | Internal proxy error |
| `LicenseError` | 0 | Proxy license expired/invalid (HTTP 403) |
| `OdooLogicError` | *Odoo's code* | Odoo-side logic error returned on a 200 |
| `Json2UnavailableError` | -32006 | **v2:** no JSON-2 on that Odoo (≤18, use v1), or the database is not selectable on that host (`dbfilter`) |
| `InvalidRequestError` | -32007 | **v2:** invalid model/method name, or `db`/`api_key` not valid as an HTTP header (HTTP 400; Odoo not contacted) |

For Odoo-side errors the proxy forwards Odoo's HTTP status as `code`. This always happens on v2, and on v1 only when Odoo itself answered with a non-2xx status. These errors are thrown as **subclasses of `OdooLogicError`**, so existing `instanceof OdooLogicError` checks still catch them:

| Class | code | Meaning | Retry? |
|---|---|---|---|
| `OdooAuthError` | 401 | Odoo rejected the API key (invalid, expired, wrong scope, or a password). Distinct from `AuthError` (the proxy key) | no |
| `OdooAccessError` | 403 | Access rights, or a private method | no |
| `OdooNotFoundError` | 404 | Unknown model/method, or record does not exist | no |
| `OdooConflictError` | 409 | Odoo lock conflict | yes, with backoff |
| `OdooValidationError` | 422 | Validation/user error, or bad arguments | no |
| `OdooServerError` | 5xx | Odoo server error | no |

`OdooLogicError` also exposes `odooErrorName` (from `data.name`, e.g. `"odoo.exceptions.ValidationError"`) for finer branching. Never parse `data.debug`.

Two behaviors worth knowing:

- **Caller-initiated aborts are not wrapped.** If you pass your own `opts.signal` and abort it, the original `AbortError` propagates unchanged — only the client's *own* timeout becomes an `OdooTimeoutError`. So an `instanceof OdxError` branch that re-throws everything else (as above) is the correct shape when you use cancellation.
- **`MissingFnNameError` from `call_method` is a rejected promise, not a synchronous throw.** It's raised client-side before any network call, but via `Promise.reject`, so it's still caught by a `try/catch` around `await` (or a `.catch()`) — just don't expect it to throw before the `await`.

## Auxiliary endpoints

```ts
import { version, about, license, metrics } from "@terrakernel/odxproxy-client-js";

await version("https://your-odoo.example.com"); // Odoo version banner (no Odoo creds needed)
await about();    // { jsonrpc, id, result: { build, version } }
await license();  // { licensee, valid_until, is_valid } — flat object, not an envelope
await metrics();  // Prometheus metrics as a string
```

## Examples
- Search partners (IDs only):

```ts
const res = await search<number>("res.partner", [[ ["is_company", "=", false] ]], { context: { tz: "UTC" } });
console.log(res.result); // [1,2,3,...]
```

- Search and read names and emails:

```ts
const res = await search_read<{ id: number; name?: string; email?: string }>(
  "res.partner",
  [[ ["is_company", "=", false] ]],
  { context: { tz: "UTC" }, limit: 10, fields: ["name", "email"] }
);
console.log(res.result);
```

- Create, write, remove:

```ts
const created = await create<number>("res.partner", [{ name: "Acme" }], { context: { tz: "UTC" } });
const id = created.result!;
await write("res.partner", [[id], { name: "ACME Updated" }], { context: { tz: "UTC" } });
await remove("res.partner", [[id]], { context: { tz: "UTC" } });
```

- Call arbitrary method:

```ts
await call_method("account.move", [[5]], { context: { tz: "UTC" } }, "action_post");
```

## Testing
This repo uses Jest with two suites:

- **Unit tests** (`__tests__/unit.test.ts`) mock `fetch` and need no credentials — run them anytime.
- **Integration tests** (`__tests__/index.test.ts`) hit a real ODXProxy/Odoo instance and are **skipped unless `url` and `odx_api_key` are set**.
- **v2 unit tests** (`__tests__/v2.unit.test.ts`) mock `fetch` and assert the exact `/v2/odoo/execute` wire shapes and error mapping.
- **v2 live tests** (`__tests__/v2.live.test.ts`) need an ODXProxy **0.9.0+** in front of an Odoo **19+** instance. They are **skipped unless `v2_gateway_url` and `v2_odx_api_key` are set**. The suite creates one `res.partner` and deletes it.

```
npm test                # all suites (live suites skipped without creds)
npx jest unit.test.ts   # unit tests only (v1 + v2)
```

Environment variables (loaded from `.env` by `jest.setup.ts`):
- v1 integration: url, db, uid, api_key, odx_api_key (+ optional gateway_url)
- v2 live: v2_gateway_url, v2_odx_api_key, v2_url, v2_db, v2_api_key

## Build
Build the package (generates ESM, CJS, and type definitions):

```
npm run build
```

Outputs are placed under `dist/` and are referenced via `exports` in package.json.

## Versioning
The package version tracks the ODXProxy server version. 0.9.x adds the `v2` API, which needs ODXProxy 0.9.0+. The v1 helpers work against any ODXProxy version.

## License
MIT © 2025 TERRAKERNEL PTE. LTD.
