# Synthetic Kawalys BFF (BACK-69, T0)

A minimal NestJS service that returns **synthetic** data only. It exists to prove the error and
request-id conventions before any real backend work. By default (synthetic mode) the running service
has no database connection, no authentication, no connectors, no outbound network calls and no secrets.
`server/` also holds a PostgreSQL foundation (BACK-55 S1), real-mode authentication (BACK-56 S2) and an
evidence API (BACK-55 S3); see below. All are tested locally and stay off unless every `KAWALYS_*` variable in `.env.example` is set.
Nothing is provisioned: no Descope project, no database, no hosting. Nothing in the prototype
(`index.html`, `js/`, `css/`) or `app/` calls the server yet.

The `x-kawalys-demo-persona` header is a **display switch, not authorization**: any caller can set it,
and it is never used as authentication.

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
| `POST /auth/session`, `POST /auth/signout`, `GET /me` | Exist **only in real mode** (see Authentication below). In synthetic mode they are not registered and answer 404. |
| `GET /evidence`, `GET /evidence/:id`, `POST /investigations/:id/decisions` | Exist **only in real mode** and always require a session (see Evidence API below). In synthetic mode they answer 404. |

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
and the synthetic service does not use this code. Only real mode (Authentication, below) opens database pools.

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

## Authentication (BACK-56 S2)

Local code and tests only (owner approved gate A on 2026-11-23). Nothing is provisioned: no Descope project, no database, no hosting. Tests use locally generated RS256 keys (no network) and disposable Docker Postgres.

**Real mode vs synthetic mode.** `src/config/runtime-config.ts` reads five required variables (`KAWALYS_DATABASE_URL_APP`, `KAWALYS_DATABASE_URL_AUTH`, `KAWALYS_DESCOPE_PROJECT_ID`, `KAWALYS_OWNER_EMAIL`, `KAWALYS_ALLOWED_ORIGIN`) and one optional variable (`KAWALYS_OWNER_SUBJECT`); see `.env.example`. With none of the five set, the service runs in synthetic mode: only the synthetic routes exist and there are **no auth routes**, so there is no unauthenticated fallback. With any of the five set, all five are required, or boot fails naming the missing variables (never their values). `KAWALYS_OWNER_EMAIL` must be ASCII (checked before lower-casing) and `KAWALYS_OWNER_SUBJECT`, when set, must be 1-256 printable ASCII characters. The two database URLs must use different roles, and the origin must be https (http only for localhost) with no path. `src/main.ts` calls `src/real-mode.ts`, which builds the dependencies, and `src/create-app.ts` registers `AuthModule` only when they exist.

**Routes (real mode only).**

| Route | Behaviour |
| --- | --- |
| `POST /auth/session` | `Origin` must equal `KAWALYS_ALLOWED_ORIGIN` exactly. Body `{ "token": "<Descope session JWT>" }`. On success: 204 and a `Set-Cookie` session cookie. |
| `POST /auth/signout` | Needs the same `Origin` and a live session. Revokes the session and clears the cookie (204). |
| `GET /me` | Needs a live session. Returns `{ userId, workspaceId, role, capabilities }`. |

**Cookie** (`src/auth/cookie.ts`): name `__Host-kawalys_session`; attributes `Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`, with no `Domain`. Sign-out sends the same name with an empty value and `Max-Age=0`. A request carrying the cookie more than once is treated as having no session.

**Sessions** (`src/auth/session-store.ts`): an opaque 256-bit token; only its SHA-256 hash is stored. Idle timeout 12 hours (sliding), absolute cap 24 hours; activity never extends the absolute cap. A session is live only while its user is active **and** the user has an active identity link: disabling the identity link (or the user) ends live sessions, not only new sign-ins. Signing in again revokes the session the browser already holds (if its cookie is still live) before creating the new one, so sessions do not pile up and a planted cookie cannot survive a fresh sign-in.

**Descope verification** (`src/auth/descope-verifier.ts`, behind the provider-neutral port in `identity-provider.port.ts`):

- RS256 only (no `none`, no HMAC), signature checked against this project's JWKS.
- Issuer: the canonical `https://api.descope.com/v1/apps/<projectId>`, or the legacy forms `https://api.descope.com/<projectId>` and the bare project id. Audience: the project id.
- `exp`, `iat` and `sub` are required. The token may be at most 15 minutes old (it is exchanged once for a local session). Clock tolerance 5 seconds.
- Only Descope session tokens are accepted: `drn` must be exactly `DS`. Refresh tokens (`DSR`), any other kind and `token_type` `refresh` are refused.
- Impersonation tokens are refused: any token with an `act` or `dact` claim.
- The email must be ASCII (printable, 3-320 characters), checked before lower-casing, so non-ASCII characters that fold to ASCII on lower-casing (for example U+212A) cannot collide. The same rule applies to `KAWALYS_OWNER_EMAIL`.
- Any failure throws one generic error; only jose's fixed `ERR_*` code is kept, never claims.

**Single-owner binding** (`src/auth/principal-resolver.ts`, `migrations/0002_identity.sql`): the first sign-in whose provider-verified email (`email_verified` must be `true`) equals `KAWALYS_OWNER_EMAIL` becomes the single owner. The user, the identity link and the `owner_binding` row are written in one transaction. The singleton primary key on `owner_binding` makes a concurrent second binding fail and roll back, so the race is safe. After that the owner is pinned to (provider, issuer, subject): the email is no longer consulted and every other subject is refused. The owner workspace and membership are created on first use, under RLS, with an `owner.bound` audit row.

**Owner subject pin (optional).** If `KAWALYS_OWNER_SUBJECT` is set, only the Descope subject equal to it may become the owner; a token with the verified owner email but another subject is refused. Setting it is recommended before the first real sign-in. Without it, the first token carrying the verified owner email wins permanently.

**Capabilities** (`src/auth/capabilities.ts`, `src/auth/capability.guard.ts`): deny by default. A route behind `CapabilityGuard` that declares no capability is refused, and a missing capability is a 404.

| Capability | owner |
| --- | --- |
| `evidence.read` | yes |
| `decision.create` | yes |
| `source.connect` | yes |
| `source.disconnect` | yes |
| `audit.read` | yes |
| `evidence.ingest` | no (server-internal connector path; no user role holds it) |

Effective permission for source data is the role capability AND an active source grant (see Evidence API below). The evidence routes use `CapabilityGuard`.

**Every authentication failure is a 404** (policy M05-D05-B): bad or missing token, wrong or missing `Origin`, unknown or expired session, refused owner binding, missing capability. The body is the fixed envelope; no reason, claim or token is echoed. The persona header is never authentication.

**Stated exceptions to "every failure is 404".** Both use the fixed envelope and neither depends on who the caller is:

- A database failure on an auth route is a 500 `internal_error`.
- Malformed or oversized JSON is rejected by the global body parser for every path (not only auth routes) with the fixed `validation_error` envelope (status 400).

**Database limits on sessions** (`migrations/0002_identity.sql`). Even a compromised `kawalys_auth` login cannot mint a long session, undo a revocation or push activity into the future: `created_at` is set by a database default and is not insertable by the auth role, and a CHECK caps `absolute_expires_at` at `created_at` plus 24 hours; a trigger (enabled ALWAYS) makes revocation one-way and refuses a `last_seen_at` later than `now()`.

**Pool errors.** Both pools (app and auth) have an `error` listener (`src/real-mode.ts`), so a dropped idle connection (for example a serverless database scaling to zero) logs one fixed line instead of crashing the process.

**Database roles.** There are now three: `kawalys_migrator` (applies migrations), `kawalys_app` (workspace data under forced RLS) and `kawalys_auth` (identity and session tables only: select and insert on users, identity links and the owner binding; on sessions select, insert of the credential columns, and update of `last_seen_at` and `revoked_at` only; no workspace table, no DELETE). `src/db/provision.ts` creates them. At boot, `verifyRuntimeRole` runs against both the app and the auth login and refuses an unsafe one (the checks listed under the database foundation) before the server listens.

**Dependency.** `jose` 6.2.16, exact pin (6.2.18 was skipped because it was only 5 days old). Provenance of the adapted files is in [THIRD_PARTY.md](THIRD_PARTY.md).

**Open for gate B:**

- The Descope project is not created.
- Whether Descope session JWTs carry the `email` and `email_verified` claims must be checked; a JWT template may be needed. Without them the owner binding refuses every sign-in.
- Real sign-in has never been run against Descope.
- Decide whether to set `KAWALYS_OWNER_SUBJECT` (recommended before the first real sign-in).
- Database TLS (`sslmode=verify-full`) for non-local hosts is not enforced yet.
- Deny-by-default global guards, rate limiting and security event logging are follow-ups.

## Evidence API (BACK-55 S3)

Local code and tests only (owner approved gate A on 2026-11-23). Nothing is provisioned. Evidence routes exist only in real mode, are registered together with `AuthModule` (`createApp` refuses evidence without auth), and always require a session and a capability.

**Tables** (`migrations/0003_evidence.sql`): `projects`, `sources`, `source_grants`, `investigations`, `evidence` and `evidence_citations`. All are workspace-scoped with forced RLS. Every reference between them is a composite foreign key that includes `workspace_id`, because foreign-key checks bypass RLS; no row can point into another workspace. Evidence also references its source and investigation through `(workspace_id, project_id, id)`, and citations stay in the decision's project, so nothing links across projects either. GitHub repository names are stored lower-case (one repository is one source).

**Evidence model** (`src/evidence/evidence.types.ts`):

- Types: `Observation`, `Correlation`, `Hypothesis`, `HumanDecision`. A `HumanDecision` has no source and must belong to an investigation; every other type comes from exactly one source.
- States: `ok`, `stale`, `unknown`, `denied`, `error`. `state` has no default, so Unknown is stored as `unknown`, never dropped and never reported as healthy.
- Evidence is append-only: triggers (enabled ALWAYS, so they also fire in replica mode) refuse update, delete and truncate. Corrections are new rows.

**Source grants.** A grant is one user's permission to see one source's evidence. Revocation is one-way (a trigger permits only setting `revoked_at` once; no delete). Reads require an active grant for the reading user. Connecting reuses an existing source only in the same project and only for a user who held a grant on it before (reconnecting after their own disconnect, audited as `source.reconnected`); nobody can attach themselves to a source someone else connected. Connecting with an active grant is a no-op. The repository does not check capabilities: any future route must require `source.connect` / `source.disconnect` first.

**Decisions and citations.** What a `HumanDecision` cites is stored as `evidence_citations` rows, not in its payload (`{ decision, rationale }` only). A reader sees a decision only if every evidence row it cites is visible to that reader, so a decision (its citations or its rationale) never reveals that restricted evidence exists; the decider also loses sight of it after disconnecting a cited source. A decision that cites nothing is visible to members with `evidence.read`. Records carry `citations` (empty for non-decisions).

**Ingestion** is server-internal: there is no HTTP route for it. A batch is all-or-nothing, and is refused for a source without an active grant or with an investigation of another project. Ingestion and decisions share-lock the grant rows they rely on, so a concurrent revocation cannot slip in between the check and the insert.

**Routes** (`src/evidence/evidence.controller.ts`):

| Route | Behaviour |
| --- | --- |
| `GET /evidence` | Needs a session and `evidence.read`. Optional filters `sourceId`, `investigationId`, `projectId`. An unknown, malformed or repeated filter value gives an empty list. Returns `{ items }`, newest first, capped at 500 rows. |
| `GET /evidence/:id` | Needs a session and `evidence.read`. 404 when the record is absent or not visible to the caller. |
| `POST /investigations/:id/decisions` | Needs the allowed `Origin`, a session and `decision.create`. Body `{ decision, rationale, evidenceIds }` (text without NUL or unpaired surrogates; at most 50 ids). Every cited id must be source evidence of the investigation's project, visible to the caller. The decision and its audit row commit in one transaction. Returns 201 `{ id }`. |

Failures follow the same fixed-envelope policy as authentication (404 for denied or invisible, 400 for an invalid body).

**Restart test.** `test/evidence/evidence-http.spec.ts` proves that evidence, decisions and sessions survive a full restart with new pools.

**Reuse strategy: BUILD.** The evidence contract is Kawalys-owned and no Retail Tower evidence code fits. It uses the S1 adapted workspace context and audit row writer.

**Known limits:**

- Projects, sources and investigations have no HTTP routes yet (repository only, for BACK-52 and the UI slice).
- Correlation and Hypothesis evidence each come from one source; multi-source derivation needs a later design.
- The list is capped at 500 rows and has no pagination or truncation flag yet.
- Database-role hardening not done yet: `kawalys_app` could insert a `HumanDecision` row directly without an audit row, or a grant for any user id; the application never does, and a later slice can enforce it in the database.
- There is no way yet for an administrator to revoke another user's grant (single owner).

## Provenance

`src/errors/envelope.ts` is copied from Retail Tower, and the database files listed in THIRD_PARTY.md are adapted from it. See [THIRD_PARTY.md](THIRD_PARTY.md) for paths,
pinned SHA and licence.

## Rollback

Delete `server/`, then revert the `CLAUDE.md` bullet, the root `NOTICE`, the root `LICENSE`, the
`license` field in the root `package.json`, and the "Synthetic BFF" section of the root `README.md`.

## Out of scope / still gated

- BACK-47 exit criteria for anything beyond this T0.
- BACK-55 (database) is in progress: S1 and S3 done locally; no provisioned DB.
- BACK-56 (authentication) is in progress: S2 is done locally (code and tests only; no Descope project, no real sign-in, no provisioned database or hosting).
- BACK-58 (secrets).
- Correlation helper: deferred because it needs `@opentelemetry/api`.
- TypeScript 7 (native compiler): `ts-jest` 29 needs the JavaScript compiler API, so the toolchain stays on TypeScript 6.0.3 (BACK-75).
