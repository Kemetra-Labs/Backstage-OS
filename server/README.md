# Synthetic Kawalys BFF (BACK-69, T0)

A minimal NestJS service that returns **synthetic** data only. It exists to prove the error and
request-id conventions before any real backend work. It has no database, no authentication, no
connectors, no outbound network calls and no secrets. Nothing in the prototype (`index.html`, `js/`,
`css/`) or `app/` calls it yet.

The `x-kawalys-demo-persona` header is a **display switch, not authorization**: any caller can set it.

## Commands

Node 24 is required (`.nvmrc`, `engines`). Run from `server/`. CI runs `npm run check` here on Node 24, in the required job (BACK-74). The suite also passes on Node 22 locally (npm prints an EBADENGINE warning).

```bash
npm ci
npm run check    # typecheck + Jest (NestJS 12, TypeScript 6.0.3, Jest 30)
npm run build    # emits dist/
npm start        # node dist/main.js
```

NestJS 12 is ESM-only, so `npm test` runs Jest in ESM mode (`node --experimental-vm-modules`, `useESM` in `jest.config.js`). The build still emits CommonJS, which loads NestJS through Node's `require(esm)`.

`KAWALYS_BFF_PORT` sets the port (default `8787`). The server binds `127.0.0.1` only.

## Routes

| Route | Behaviour |
| --- | --- |
| `GET /process` | Process liveness only: `{ service, process: "up", synthetic: true }`. Never says "healthy". |
| `GET /demo/evidence/:id` | Synthetic evidence. Fixture ids `E-1` (visible to all) and `E-5` (technical persona only). Persona comes from `x-kawalys-demo-persona`: `technical`, `owner` or `nontechnical` (default). |

## Error behaviour

Every error body is the envelope built in `src/errors/safe-error.ts`; `details` is never set and
messages are fixed:

| Code | Status | Message |
| --- | --- | --- |
| `not_found` | 404 | Not found. |
| `validation_error` | 400 | The request is not valid. |
| `rate_limited` | 429 | Too many requests. |
| `internal_error` | 500 | Something went wrong. |

- 401 and 403 are reported as 404 `not_found` (policy M05-D05-B), so there is no `forbidden` code.
- A record the persona may not see is indistinguishable from an absent one (`E-5` for a non-technical
  persona looks the same as an unknown id).
- An inbound `x-request-id` is echoed only if it is a single value of 8-64 characters from
  `[A-Za-z0-9-]`. Otherwise (CR/LF, too short, too long, other characters, repeated header, missing)
  a fresh UUID is used. The id is echoed in the `x-request-id` response header and in the envelope,
  and is only ever returned to the caller who sent it.

## Provenance

`src/errors/envelope.ts` is copied from Retail Tower. See [THIRD_PARTY.md](THIRD_PARTY.md) for paths,
pinned SHA and licence.

## Rollback

Delete `server/`, then revert the `CLAUDE.md` bullet, the root `NOTICE`, the root `LICENSE`, the
`license` field in the root `package.json`, and the "Synthetic BFF" section of the root `README.md`.

## Out of scope / still gated

- BACK-47 exit criteria for anything beyond this T0.
- BACK-55 (database), BACK-56 (authentication), BACK-58 (secrets).
- Correlation helper: deferred because it needs `@opentelemetry/api`.
- TypeScript 7 (native compiler): `ts-jest` 29 needs the JavaScript compiler API, so the toolchain stays on TypeScript 6.0.3 (BACK-75).
- A CI job for `server/` (BACK-72 / BACK-67).
