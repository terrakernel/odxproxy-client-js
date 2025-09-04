# @terrakernel/odxproxy-client

Official JavaScript/TypeScript client for ODXProxy. This SDK provides a simple, typed interface to execute Odoo JSON-RPC operations via the ODXProxy Gateway.

- Repository package name: `@terrakernel/odxproxy-client-js`
- License: MIT
- Runtime: Node.js 18+
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
  - update
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
- Supports both ESM and CommonJS
- Works with TypeScript out of the box (bundled type definitions)
- Covers common Odoo actions: search, search_read, read, fields_get, search_count, create, write (update), unlink (remove), and call_method
- Request IDs are auto-generated with ULID (can be overridden)

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
  "sort": "name asc",
  "limit": 10,
  "offset": 0
}
```

Note: For actions that do not use fields/sort/limit/offset, the client will strip those keys before sending.

## API Reference
All functions return a promise resolving to:

```
{
  jsonrpc: string;        // typically "2.0"
  id: string;             // request id (ULID by default)
  result?: any;           // present on success
  error?: {               // present on error
    code: number;
    message: string;
    data: any;
  };
}
```

- init(options)
  - Initializes the singleton client. Must be called before any other function.

- search<T = number>(model, params, keyword, id?)
  - params: domain array (e.g., [[ ["is_company", "=", false] ]])
  - returns: result?: T[] (commonly record IDs unless fields requested via search_read)

- search_read<T = any>(model, params, keyword, id?)
  - params: domain array
  - keyword: can include fields, limit, offset, sort, and context
  - returns: result?: T[] (records)

- read<T = any>(model, params, keyword, id?)
  - params: array of record IDs wrapped (e.g., [[1,2,3]])
  - returns: result?: T

- fields_get<T = any>(model, keyword, id?)
  - returns: result?: T[] (field metadata)

- search_count<T = number>(model, params, keyword, id?)
  - returns: result?: T (count)

- create<T = any>(model, params, keyword, id?)
  - params: array with a single object of field values (e.g., [{ name: "Acme" }])
  - returns: result?: T (typically new record ID)

- update<T = any>(model, params, keyword, id?)
  - params: [[ids], { field: value }]
  - returns: result?: T

- remove<T = any>(model, params, keyword, id?)
  - params: [[ids]]
  - returns: result?: T

- call_method<T = any>(model, params, keyword, function_name, id?)
  - params: method parameters array
  - returns: result?: T

## Error Handling
The client normalizes errors from Axios into a consistent structure. Timeouts (default 45s) surface as:

```
{ code: 408, message: "Request Timeout: exceeded client limit of 45000ms", data: null }
```

For other HTTP errors, you will receive:

```
{ code: number, message: string, data: any }
```

Wrap calls in try/catch if you prefer exceptions, or check for `error` on the returned object if you treat it as a value.

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

- Create, update, remove:

```ts
const created = await create<number>("res.partner", [{ name: "Acme" }], { context: { tz: "UTC" } });
const id = created.result!;
await update("res.partner", [[id], { name: "ACME Updated" }], { context: { tz: "UTC" } });
await remove("res.partner", [[id]], { context: { tz: "UTC" } });
```

- Call arbitrary method:

```ts
await call_method("account.move", [[5]], { context: { tz: "UTC" } }, "action_post");
```

## Testing
This repo uses Jest. You can run tests locally (requires valid environment variables to hit a real ODXProxy/Odoo instance):

```
npm test
```

Environment variables used in tests:
- url, db, uid, api_key, odx_api_key

You can define them in a local .env and load with dotenv in your test runner setup if desired.

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
