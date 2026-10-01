# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@terrakernel/odxproxy-client-js` is the official JS/TS client SDK for ODXProxy — a gateway that exposes Odoo JSON-RPC over HTTPS with API-key auth. The SDK is a thin, typed, **dependency-free** wrapper that turns helper calls into a single POST to the gateway's `/api/odoo/execute` endpoint (plus a few auxiliary endpoints). There is no UI and no server here; this package is published to npm and runs both in Node (18+) and the browser.

`SYSTEM_ARCHITECTURE.md` is the **wire-protocol source of truth** for the gateway — consult it before changing request/response shapes, actions, or error handling.

## Commands

```bash
npm run build      # tsup → dist/ (ESM index.mjs, CJS index.js, minified, + .d.ts)
npm test           # jest in CI mode, writes junit.xml via jest-junit
npm run test:watch # jest --watch
npx jest unit.test.ts        # hermetic unit tests only (no creds needed)
npx jest -t "error model"    # run tests by name
```

`prepublishOnly` runs build + test, so a green `npm test` is required before publishing.

## Architecture

Three source files, with a deliberate split:

- **`src/client.ts`** — the `OdxProxyClient` **singleton**, all interfaces, and the typed error hierarchy. `init(options)` constructs the one instance and **throws if called twice**; `getInstance()` **throws if `init` was never called**. The client holds the gateway URL (default `https://gateway.odxproxy.io`, trailing slash trimmed), the proxy `x-api-key`, and the single bound Odoo instance. **There is intentionally one Odoo instance per process — this is not multi-tenant** (see the project memory; do not add `for_instance`/per-call instance overrides).

  All network I/O goes through one private `send()` method built on the **global `fetch`** (no axios) with an `AbortController` for timeouts. `send()` reads the body once, then `envelopeOrThrow()` applies the protocol's two-step error rule.

- **`src/index.ts`** — the public API: stateless module functions over the singleton. Data helpers (`search`, `search_read`, `read`, `fields_get`, `search_count`, `create`, `write`, `remove`, `call_method`) build an `OdxClientRequest` and call `postRequest`. Auxiliary helpers (`version`, `about`, `license`, `metrics`) map to the gateway's other endpoints. The file also re-exports all public types and error classes, and the v2 helpers as the `v2` namespace (`export * as v2 from "./v2"`).

- **`src/v2.ts`**: the **v2 API** (ODXProxy 0.9.0+ `/v2/odoo/*`, which reaches Odoo over JSON-2, Odoo 19+). It uses the **same singleton and bound instance** as v1; the single-instance rule applies to v2 too. There is no `for_instance`, unlike SYSTEM_ARCHITECTURE §7.1's "separate session type": the `v2` namespace takes its place.
  - Helpers (`search`, `search_read`, `search_count`, `read`, `fields_get`, `create`, `create_one`, `write`, `remove`, `call_method`, `version`, `is_supported`) build `{id, model_id, method, kwargs, odoo_instance}` and call `postV2Request`.
  - `kwargs` keys are Odoo's Python parameter names **verbatim**. Never camelCase them, because JSON-2 rejects unknown names with a 422.
  - `buildKwargs` drops `undefined` (explicit `null` is kept) and merges `init({ default_context })` under the call's `context`.
  - `odoo_instance` is sent without `user_id`.
  - `create` always wraps into `vals_list: [...]` and resolves to `number[]`; `create_one` unwraps `[0]`.
  - `remove` sends `unlink`, matching v1 naming.
  - The request id goes in `opts.id`, not positionally.

### Error model (matches SYSTEM_ARCHITECTURE §6)

Errors are **thrown**, not returned, and are typed. `OdxError` is the base (carries `code`, `message`, `data`, `httpStatus`); subclasses map to the JSON-RPC code catalog: `AuthError` (-32000), `InvalidActionError` (-32001), `MissingFnNameError` (-32002), `OdooTimeoutError` (-32003), `OdooConnectError` (-32004), `InternalProxyError` (-32005), `LicenseError` (0/403), `OdooLogicError` (Odoo's own code on a 200). The `code` is the **JSON-RPC code** (falling back to HTTP status when there's no body error) — *not* the HTTP status. Crucially, a **200 carrying an `error` body is thrown** as `OdooLogicError`, so callers use one `try/catch` for everything. When adding a code, update `makeError()` in `client.ts`.

v2 additions:
- `Json2UnavailableError` (-32006, on a 200): no JSON-2, or the DB is not selectable (`dbfilter`).
- `InvalidRequestError` (-32007, HTTP 400).
- On a **200 only**, Odoo-HTTP-status codes map to **subclasses of `OdooLogicError`** (so old `instanceof` checks still match): `OdooAuthError` 401, `OdooAccessError` 403, `OdooNotFoundError` 404, `OdooConflictError` 409, `OdooValidationError` 422, `OdooServerError` 5xx. The proxy forwards Odoo's status as `code` on every v2 Odoo error, and on v1 when Odoo itself answered non-2xx. A **non-2xx** 422 is axum rejecting the request body and stays a plain `OdxError`.
- `OdooLogicError.odooErrorName` reads `data.name`.

### Conventions that are easy to get wrong

- **Action name vs. function name don't always match.** `remove` sends `action: "unlink"`; `call_method` sends `action: "call_method"` plus a separate `fn_name` (and rejects client-side with `MissingFnNameError` if it's empty). `update` is a deprecated alias of `write`.
- **Keyword stripping.** All helpers *except `search_read`* strip `order`, `limit`, `offset`, `fields` (the `NON_QUERY_KEYS` constant) from the keyword before sending — those only apply to a combined search+read. The sort key is **`order`** (Odoo's `execute_kw` kwarg), not `sort`; the older `sort` naming was a bug and is gone.
- **`params` shape is positional and Odoo-specific**, varying per action: search domains are triple-nested (`[[ ["field","=",val] ]]`), `read`/`remove` wrap ID lists (`[[1,2]]`), `write` is `[[ids], {fields}]`, `create` is `[{fields}]`. Match the existing JSDoc rather than guessing. `params` is passed through unchanged (not copied).
- **Per-call options.** Every helper takes an optional trailing `opts: OdxRequestOptions` (`timeoutSecs` → `x-request-timeout` header; `signal` → cancellation). Default upstream timeout can be set once via `init({ ..., default_timeout_secs })`.
- **Isomorphic gotchas.** `crypto.randomUUID()` is unavailable in non-secure browser contexts, so `newRequestId()` falls back to `getRandomValues`. `accept-encoding` is set but browsers ignore it (forbidden header); it only takes effect on Node/undici.

## Testing

- **`__tests__/unit.test.ts`** — hermetic; mocks global `fetch`, needs no credentials. This is the suite to run/extend when changing transport, error mapping, header injection, or the auxiliary endpoints.
- **`__tests__/index.test.ts`** — **live integration** against a real ODXProxy/Odoo instance. Guarded by `describeLive` and **skipped unless `url` and `odx_api_key` env vars are set** (loaded from `.env` by `jest.setup.ts`, using lowercase names: `url`, `db`, `uid`, `api_key`, `odx_api_key`). These assert only `res.jsonrpc === "2.0"` and chain create→write→remove through a shared id, so they are order-dependent and fail if the backend returns any error (the new client throws on those).
- **`__tests__/v2.unit.test.ts`**: hermetic v2 suite. It asserts the exact `/v2/odoo/execute` wire body per helper, plus context merge, `undefined` omission, `create`/`create_one`, `is_supported` caching, and the error mapping. It is a separate file because `init()` can only run once per module registry and this suite needs `default_context`. Give each mocked call a **fresh `Response`**, since a body is single-use.
- **`__tests__/v2.live.test.ts`**: live v2 suite against **ODXProxy 0.9.0+ in front of Odoo 19+**. It is skipped unless `v2_gateway_url` and `v2_odx_api_key` are set, and uses its own `v2_*` env names (`v2_url`, `v2_db`, `v2_api_key`) so it can target a different proxy than the v1 suite. It creates and deletes one `res.partner` and checks the typed Odoo errors. It was verified passing on 2026-10-01 against a local ODXProxy 0.9.0 → Odoo 20.0+e.

## Build / publishing notes

- TypeScript is `strict`; `tsconfig` uses `lib: ["ES2020", "DOM"]` so `fetch`/`AbortController`/`crypto`/`Response` type without `@types/node`. tsup bundles to ESM + CJS (minified) + `.d.ts`; `package.json` `exports` maps `import`→`dist/index.mjs`, `require`→`dist/index.js`.
- **Zero runtime dependencies** and `"sideEffects": false` for clean browser tree-shaking. Runtime floor is **Node 18+** (`engines`), since global `fetch` is required.
- **Versioning tracks the proxy.** ODXProxy is now 0.9.0, so this package is 0.9.x. v2 needs proxy 0.9.0+. Don't jump to 1.0 ahead of the proxy (see project memory).