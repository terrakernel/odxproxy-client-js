# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@terrakernel/odxproxy-client-js` is the official JS/TS client SDK for ODXProxy — a gateway that exposes Odoo JSON-RPC over HTTPS with API-key auth. The SDK is a thin, typed wrapper that turns helper calls into a single POST to the gateway's `/api/odoo/execute` endpoint. There is no UI and no server here; this package is published to npm.

## Commands

```bash
npm run build      # tsup → dist/ (ESM index.mjs, CJS index.js, and .d.ts)
npm test           # jest in CI mode, writes junit.xml via jest-junit
npm run test:watch # jest --watch
npx jest -t "search_read"  # run a single test by name
```

`prepublishOnly` runs build + test, so a green `npm test` is required before publishing.

## Architecture

Two source files, with a deliberate split:

- **`src/client.ts`** — the `OdxProxyClient` **singleton** plus all interfaces. `init(options)` constructs the one instance and **throws if called twice**; `getInstance()` **throws if `init` was never called**. The constructor builds an axios instance bound to `gateway_url` (default `https://gateway.odxproxy.io`, trailing slash trimmed) with the `x-api-key` header and a **45s timeout**. `postRequest` is the single network path and the only place errors are normalized: `ECONNABORTED` becomes a `{ code: 408, ... }` throw, all other axios failures throw `{ code, message, data }` (`OdxServerErrorResponse`).

- **`src/index.ts`** — the public API. Every exported helper (`search`, `search_read`, `read`, `fields_get`, `search_count`, `create`, `write`, `remove`, `call_method`) follows the same shape: build an `OdxClientRequest`, attach `odoo_instance` from `getInstance().getOdooInstance()`, default the request `id` to a `ulid()`, and delegate to `postRequest`. These are stateless module functions, not methods — they read the singleton on each call.

### Conventions that are easy to get wrong

- **Action name vs. function name don't always match.** `remove` sends `action: "unlink"`; `call_method` sends `action: "call_method"` plus a separate `fn_name`. `update` is a deprecated alias of `write` (use `write`).
- **Keyword stripping.** All helpers *except `search_read`* delete `sort`, `limit`, `offset`, `fields` from the keyword object before sending, since those only apply to a combined search+read. `search_read` passes the keyword through untouched. When adding a new helper, decide explicitly whether it keeps or strips these.
- **Field-name mismatch:** the strip list uses the literal `"sort"`, but `OdxClientKeywordRequest` actually declares the field as `order`. Be aware of this if you touch sorting — they are not the same key.
- **`params` shape is positional and Odoo-specific**, varying per action: search domains are triple-nested arrays (`[[ ["field","=",val] ]]`), `read`/`remove` wrap ID lists (`[[1,2]]`), `write` is `[[ids], {fields}]`, `create` is `[{fields}]`. Match the existing JSDoc on each function rather than guessing.

## Testing

Tests in `__tests__/index.test.ts` are **integration tests that hit a real ODXProxy/Odoo instance** — there is no mocking, and they assert only that `res.jsonrpc === "2.0"`. They will fail without working credentials. Config comes from a local `.env` loaded by `jest.setup.ts` (dotenv), using **lowercase** env var names: `url`, `db`, `uid`, `api_key`, `odx_api_key`. The create→write→remove tests chain through a shared `createdRecord` id, so they are order-dependent.

## Build / publishing notes

- TypeScript is `strict` and bundled by tsup to both ESM and CJS; `package.json` `exports` maps `import`→`dist/index.mjs`, `require`→`dist/index.js`. Keep public types exported from `src/index.ts` / `src/client.ts` so the generated `.d.ts` stays complete.
- Runtime target is Node 18+. Only runtime deps are `axios` and `ulid`.