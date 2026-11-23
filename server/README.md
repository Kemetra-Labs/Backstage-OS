# Synthetic Kawalys BFF (BACK-69, T0)

A minimal NestJS service that returns **synthetic** data only. It exists to prove the error and
request-id conventions before any real backend work. The running service has no database connection,
no authentication, no connectors, no outbound network calls and no secrets. `server/` also holds a
PostgreSQL foundation (BACK-55 S1, see below) that is tested locally but not wired into the service.
Nothing in the prototype (`index.html`, `js/`, `css/`) or `app/` calls the server yet.

The `x-kawalys-demo-persona` header is a **display switch, not authorization**: any caller can set it.

## Commands

Node 24 is required (`.nvmrc`, `engines`). Run from `server/`. CI runs `npm run check` here on Node 24, in the required job (BACK-74). The suite also passes on Node 22 locally (npm prints an EBADENGINE warning).

```bash
npm ci
npm run check    # typecheck + Jest (NestJS 12, TypeScript 6.0.3, Jest 30); needs Docker
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

## Database foundation (BACK-55 S1)

Local code and tests only (owner approved gate A on 2026-11-23). Nothing is provisioned in any cloud,
and the NestJS app does not use this code yet: no database module is wired and there are no new HTTP routes.

- `migrations/0001_foundation.sql` and `migrations/README.md`: the first migration, applied by our own runner `src/db/migrate.ts` into schema `kawalys`.
- Roles: `kawalys_migrator` applies migrations; `kawalys_app` is the runtime role with table-by-table grants. `src/db/provision.ts` and `src/db/runtime-role.ts` create the roles and schema (operator step).
- Row-level security: every workspace-scoped table has RLS enabled and forced, with a policy using `current_workspace_id()`. `src/db/workspace-context.ts` sets the workspace for a transaction.
- `audit_events` is append-only (triggers block update, delete and truncate); `src/audit/audit-row.writer.ts` inserts single rows.
- Tests (`test/db/`) run against a disposable local Docker container (`postgres:17-alpine` through `@testcontainers/postgresql`). There is deliberately no skip when Docker is missing, so `npm run check` needs Docker. GitHub `ubuntu` runners have it.
- New dependency: `pg` 8.23.1. Dev: `@types/pg`, `@testcontainers/postgresql` and `testcontainers`, all exact pins.
- The boot check (`verifyRuntimeRole`) refuses a runtime login that is a superuser, has BYPASSRLS, CREATEROLE, CREATEDB or REPLICATION, is a member of any role, owns any object, switched role through connection options, or has a stored default for `app.current_workspace`.
- Provisioning sends only SCRAM-SHA-256 verifiers, never plaintext passwords.

What this does **not** protect against (by design, state it in reviews):

- **SQL injection.** RLS here stops code that forgets to scope a query. SQL injected into an app-role connection can call `set_config('app.current_workspace', …)` itself. Parameterised queries remain mandatory.
- **The table owner.** `kawalys_migrator` (and a superuser) can disable or drop the audit triggers with DDL. Migrations are reviewed; an external audit sink is future work.
- **Poolers.** Run migrations through a direct connection, not a transaction-mode pooler (the runner's advisory lock needs a session).
- **Non-superuser provisioning** (Neon's owner role) is not tested yet; checked at gate B.
- FK checks bypass RLS, so a foreign key can reveal whether a user id exists. Owner insertion rules arrive with BACK-56.

## Provenance

`src/errors/envelope.ts` is copied from Retail Tower, and the database files listed in THIRD_PARTY.md are adapted from it. See [THIRD_PARTY.md](THIRD_PARTY.md) for paths,
pinned SHA and licence.

## Rollback

Delete `server/`, then revert the `CLAUDE.md` bullet, the root `NOTICE`, the root `LICENSE`, the
`license` field in the root `package.json`, and the "Synthetic BFF" section of the root `README.md`.

## Out of scope / still gated

- BACK-47 exit criteria for anything beyond this T0.
- BACK-55 (database) is in progress: S1 (the foundation above) is done locally; there is still no provisioned database, no runtime wiring and no cloud resource.
- BACK-56 (authentication), BACK-58 (secrets).
- Correlation helper: deferred because it needs `@opentelemetry/api`.
- TypeScript 7 (native compiler): `ts-jest` 29 needs the JavaScript compiler API, so the toolchain stays on TypeScript 6.0.3 (BACK-75).
