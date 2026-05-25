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

```
npm test                # both suites (integration skipped without creds)
npx jest unit.test.ts   # unit tests only
```

Environment variables for the integration suite (loaded from `.env` by `jest.setup.ts`):
- url, db, uid, api_key, odx_api_key

## Build
Build the package (generates ESM, CJS, and type definitions):

```
npm run build
```

Outputs are placed under `dist/` and are referenced via `exports` in package.json.

## Versioning
This package follows semantic versioning when published to npm. Current version is defined in package.json.

## License
MIT © 2025 TERRAKERNEL PTE. LTD.
