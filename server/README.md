# Synthetic Kawalys BFF (BACK-69, T0)

A minimal NestJS service that returns **synthetic** data only. It exists to prove the error and
request-id conventions before any real backend work. With no `KAWALYS_*` variable set it has no database, no connectors and no secrets, and every
protected route is denied. It carries the owner-only authentication foundation (BACK-47, BACK-56, PR #76), and a PostgreSQL foundation, durable
sessions and an evidence API (BACK-55) that are active only when both database URLs are set. All of it is tested locally and nothing is provisioned:
no Descope project, no database, no hosting. Nothing in the prototype (`index.html`, `js/`, `css/`) or `app/` calls the server yet.

The `x-kawalys-demo-persona` header is a **display switch, not authorization**: any caller can set it. The auth
guard never reads it.

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

## Local run with synthetic data (BACK-61)

One command starts a disposable PostgreSQL and fills it with **synthetic** data. It needs Docker (with Compose) and no external credential. Run from `server/`:

```bash
npm ci
npm run local:up     # start Postgres, build, provision, migrate and seed (safe to run again)
npm run local:down   # stop it and delete its volume (all local data)
```

- `docker-compose.local.yml` starts `postgres:17-alpine`, published on `127.0.0.1:55432` only (`KAWALYS_LOCAL_PG_PORT` changes the port), and a named volume. No password is committed: on first run `local:up` generates four random passwords (container admin and the three roles) into `server/.local-stack/credentials.json` (gitignored, mode 0600) and reuses them afterwards. If that file is lost while the volume exists, run `npm run local:down` and start again. `local:up` runs Docker by absolute path (`/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, or Docker Desktop on Windows), never through `PATH`; set `KAWALYS_DOCKER_BIN` to another absolute path if yours is elsewhere.
- `node dist/ops/local-up.js` (`src/ops/local-up.ts`, `src/ops/local-stack.ts`) refuses a non-loopback host and `NODE_ENV=production`. It creates the three roles only when missing (`provisionRoles`, `provisionDatabase`, with the generated role passwords), applies pending migrations (`runMigrations`), then seeds through the production code: `DatabaseOwnerDirectory` binds the owner identity, `WorkspaceResolver` creates the owner workspace, and `EvidenceRepository` writes the rest. RLS, grants and audit rows apply as at runtime. Each step reuses its existing row, so a second run adds nothing.
- Seeded: one workspace and owner user, project `demo-storefront`, GitHub source `example-org/demo-storefront`, four Observations (`ok`, `stale`, `error`, `unknown`), one investigation, one Correlation and one HumanDecision citing the correlation and the failed run. Every payload is marked `synthetic: true`; nothing comes from GitHub.
- The owner is a synthetic identity (`LOCAL_SYNTHETIC_OWNER`) that no real token can match. If `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` are set when you run `local:up`, the seed binds that owner instead, so a later owner-lab sign-in sees the data. Only one owner can be bound: to switch, run `npm run local:down` and start again.

What you'll see (ids differ):

```
provisioned roles kawalys_migrator, kawalys_app, kawalys_auth and schema kawalys
applied: 0001_foundation.sql, 0002_identity.sql, 0003_evidence.sql, 0004_decision_audit.sql, 0005_atlassian_sources.sql
seeded for the synthetic local owner (no Descope configured):
...
evidence      6 visible to the owner (6 created by this run):
  HumanDecision ok      kawalys:decision  cites 2
  Observation   ok      github:example-org/demo-storefront#actions/runs/1001
  Observation   unknown github:example-org/demo-storefront#deployments
  Correlation   ok      github:example-org/demo-storefront#pull/42
  Observation   error   github:example-org/demo-storefront#actions/runs/1002
  Observation   stale   github:example-org/demo-storefront#pulls
audit rows    5: owner.bound, project.created, source.connected, investigation.created, decision.recorded
```

The command ends by printing the two `export KAWALYS_DATABASE_URL_*` lines for the local roles. With them set, `npm start` boots against the seeded database (`GET /process` answers 200), but **every protected route stays deny-all** (`GET /evidence` answers 404): there is no local sign-in and no auth bypass. The data becomes reachable over HTTP only after the owner configures Descope and signs in through the owner lab. Until then the seed is verified through the repository layer (the printed summary and `test/ops/local-stack.spec.ts`). The app (`app/`) and the prototype never call the server.

## Routes

| Route | Behaviour |
| --- | --- |
| `GET /process` | Public. Process liveness only: `{ service, process: "up", synthetic: true }`. Never says "healthy". |
| `POST /auth/session` | Public. The only route that accepts a Descope session JWT (`Authorization: Bearer <jwt>`). On success: 200, `{ user: { id, role }, expires_at }` and the session cookie. Over `KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE` attempts in 60 s it answers 429 `rate_limited` without checking the token. |
| `GET /auth/lab` | Public, **owner lab only**. Exists only when `KAWALYS_AUTH_LAB=1` and `KAWALYS_DESCOPE_PROJECT_ID` is set (never in production); otherwise 404. A loopback sign-in page that runs the Descope `sign-in` flow and exchanges the session JWT at `POST /auth/session`. See [the lab runbook](../docs/planning/BACK-56/K-ID-1b-lab-runbook.md). |
| `GET /auth/me` | Session required. The signed-in user. |
| `DELETE /auth/session` | Session required. Revokes the current session and clears the cookie (204). |
| `DELETE /auth/sessions` | Session required. Revokes every session of the signed-in user (204). |
| `GET /demo/evidence/:id` | Session required. Synthetic evidence. Fixture ids `E-1` (visible to all) and `E-5` (technical persona only). Persona comes from `x-kawalys-demo-persona`: `technical`, `owner` or `nontechnical` (default). |
| `GET /evidence`, `GET /evidence/:id`, `POST /investigations/:id/decisions`, `POST /investigations/:id/notes` | Exist **only when both database URLs are set** (see Evidence API below). Session plus a workspace capability required. Without the database they answer 404. |
| `GET /portfolio`, `GET /portfolio/:projectId` | Same conditions as the evidence routes, read-only, `evidence.read`. See Portfolio API below. |
| `GET /investigations`, `GET /investigations/:id` | Same conditions as the evidence routes, read-only, `evidence.read`. See Investigation API below. |
| `GET /decisions` | Same conditions as the evidence routes, read-only, `evidence.read`. Recent human decisions with creator and time. See Recent decisions below. |

Every route is protected unless it is marked `@Public()` (the guard is global), so a new controller is denied by default.

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

Local code and tests only (owner approved gate A on 2026-11-23). Nothing is provisioned in any cloud.
The server opens database pools only when both `KAWALYS_DATABASE_URL_APP` and `KAWALYS_DATABASE_URL_AUTH` are set (see "Durable sessions and owner identity" below).

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
- FK checks bypass RLS, so a foreign key can reveal whether a user id exists. The owner binding and workspace creation are described under "Durable sessions and owner identity" below.

## Authentication (BACK-47, BACK-56)

**Does nothing live until Kawalys Descope configuration is set.** Unconfigured, every protected route is denied and no
network call is made.

Chain: provider JWT, verified once at `POST /auth/session` -> the full `(providerKey, issuer, subject)` triple ->
exactly one configured owner identity (the issuer is part of the match) -> an opaque Kawalys session. Provider claims
(admin, email, groups) grant nothing, and a provider JWT is never accepted on any other route.

- **Verifier**: `src/auth/identity/descope-verifier.ts`, behind `IdentityVerificationPort` (jose, RS256 only, `exp` / `sub` / `iat`
  required, audience = project id and required, one pinned issuer, token-age cap, refresh tokens refused, impersonation tokens refused). Results are
  `verified`, `refused`, `unavailable` or `unconfigured`; all but the first deny, and clients cannot tell them apart.
- **Sessions**: 32 random bytes, base64url; only the SHA-256 is stored (`SessionStore`; in-memory unless the database is configured, see below). Absolute expiry
  (default 8 h) and idle expiry (default 1 h). Revocation ends the session. On every request the session's triple is
  rechecked against the current owner configuration, so changing the owner kills old sessions. With the in-memory store a restart drops all
  sessions (fail closed); the Postgres store below keeps them.
- **Transport**: one cookie, `__Host-kawalys_session`, `Secure; HttpOnly; SameSite=Strict; Path=/`, with `Cache-Control: no-store`
  on auth responses. A repeated session cookie is refused. No CORS is enabled and the session is never read from a header
  or query string.
- **Errors**: every denial is the standard `not_found` envelope (policy M05-D05-B), except the rate limit (429). The only log lines are fixed
  operator messages for an outage or a missing configuration; never a token, claim value or subject. In lab mode only, a refused token also logs
  `identity token refused: <code>` plus ` claim=<name>` when known (the code and the claim's name, never a value); it prints under Nest's ERROR label,
  which is not a server fault.
- **Rate limit** (`src/auth/sign-in-rate-limiter.ts`): `POST /auth/session` allows `KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE` attempts (default 10) per 60 s
  window, counted from the first attempt, and checks it before reading the token. State is process-local (a restart resets it). Behind loopback every
  caller shares one address, so the limit is effectively global.
- **Owner lab** (`src/auth/lab/`): with `KAWALYS_AUTH_LAB=1` the BFF serves `GET /auth/lab`, a one-page sign-in for the owner's own machine. It hosts
  `@descope/web-component@4.6.3` (pinned with SRI) under a strict CSP, posts the session JWT to `/auth/session`, then calls the SDK `logout()` so Descope
  revokes its refresh token and clears its own storage. Logout runs once the exchange settles (accepted or not), so a refused sign-in leaves no Descope token behind; still clear site data for the address after every
  check as a backstop. This is a lab tool, not a product UI: English only, loopback only, refused in production. Procedure and evidence checklist:
  [docs/planning/BACK-56/K-ID-1b-lab-runbook.md](../docs/planning/BACK-56/K-ID-1b-lab-runbook.md).
- **No passwords** are stored or handled. There is no sign-up and no team management.

Configuration (names only; none is a secret):

| Variable | Meaning |
| --- | --- |
| `KAWALYS_DESCOPE_PROJECT_ID` | The Kawalys Descope project id. Must be a separate project from Retail Tower's. |
| `KAWALYS_OWNER_SUBJECT` | The owner's Descope user id (`sub`). Exactly one owner. |
| `KAWALYS_DESCOPE_ISSUER` | Optional https issuer override (for example a custom domain). Default `https://api.descope.com/v1/apps/<project id>`. |
| `KAWALYS_DESCOPE_MAX_TOKEN_AGE_SECONDS` | Optional, 60-3600, default 900. |
| `KAWALYS_SESSION_ABSOLUTE_TTL_SECONDS` | Optional, 300-86400, default 28800. |
| `KAWALYS_SESSION_IDLE_TTL_SECONDS` | Optional, 60 up to the absolute TTL, default 3600. |
| `KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE` | Optional integer 1-100, default 10: sign-in attempts per 60 s window on `POST /auth/session`; over it, 429 `rate_limited`. A set but malformed value refuses to boot. |
| `KAWALYS_AUTH_LAB` | Optional. `1` enables `GET /auth/lab` (needs `KAWALYS_DESCOPE_PROJECT_ID`) and the lab refusal log line. Any other non-empty value refuses to boot; `1` with `NODE_ENV=production` refuses to boot. Unset by default. |

In production (`NODE_ENV=production`) the project id and owner subject are required, or the server refuses to boot. A
set but malformed value always refuses to boot. Retail Tower's `DESCOPE_*` variables are never read.

Test doubles (a fake verifier, clock, store, directory) exist only under `test/` and are injected through `createApp`;
`createApp` refuses any override in production, and `main.ts` passes none.

Still needed before a real sign-in (K-ID-1b): a separate Kawalys Descope project and a sign-in flow, the owner's user
id, confirmation of the real token's `iss` and `aud` against this verifier, and
an owner decision on session lifetimes and MFA. Not done here: any product sign-in UI (the owner lab page is a loopback lab tool only) and a real
sign-in run (see the lab runbook). A TLS front for the `Secure` cookie is needed only for hosting beyond loopback, not for the loopback lab
(browsers are expected to accept the cookie on `http://127.0.0.1`; not yet verified in a lab).

### Durable sessions and owner identity (BACK-55)

Local code and tests only (owner approved gate A on 2026-11-23). Active only when **both** `KAWALYS_DATABASE_URL_APP` and `KAWALYS_DATABASE_URL_AUTH` are set. Neither set: the behaviour above (in-memory sessions, no evidence routes). One set: boot fails naming the missing variable. The two URLs must be postgres URLs that name different roles (`src/config/database-config.ts`). At boot, `verifyRuntimeRole` checks both logins (`src/db/open-database.ts`) and boot fails on an unsafe one; both pools have an `error` listener so a dropped idle connection logs one fixed line instead of crashing the process. `src/main.ts` passes the checked pools to `createApp` as `{ database }`, and `src/create-app.ts` wires the pieces below through the `AuthPersistence` parameter of `buildAuth`. Test overrides are still refused in production; the persistence wiring is not an override.

- **Postgres session store** (`src/auth/session/postgres-session-store.ts`): the `SessionStore` port from #76 on the `kawalys_auth` pool. Only the SHA-256 hash of the token is stored. Revocation sets `revoked_at` (one-way, no DELETE grant), and a revoked row is never returned. A row past its `absolute_expires_at` by the database clock is never returned either, even if the app clock runs behind; activity times are capped at the database clock.
- **JSON bodies only** (`src/create-app.ts`): Nest's default urlencoded parser is off. A plain HTML form on another localhost port is the same site, so the `SameSite=Strict` cookie would be sent; its form body now never parses and the request is a 400, so it cannot create a decision.
- **Database owner directory** (`src/auth/identity/database-owner-directory.ts`): the `IdentityDirectory` for the same owner configured by `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` (the database never decides who the owner is). The first matching sign-in creates a stable uuid user, the identity link and the `owner_binding` row in one transaction. The singleton primary key makes a concurrent second binding fail, so the race is safe. If the configured owner changes after binding, the new identity cannot bind and every sign-in is refused (fail closed) until an operator moves the binding.
- **Workspace guard** (`src/auth/workspace-resolver.ts`, `src/auth/workspace.guard.ts`): runs after #76's global `AuthGuard`. It resolves the user's workspace, role and capabilities from the database; the owner workspace and membership are created on first use under RLS with an `owner.bound` audit row. A route behind `WorkspaceGuard` that declares no capability is refused, and a missing capability is refused; both answer 404.
- **Verifier additions** (`src/auth/identity/descope-verifier.ts`): beyond #76, an allowlist (only `drn` `DS`; `token_type` `refresh` is refused) and refusal of impersonation tokens (any token with an `act` or `dact` claim).
- **Migration** `migrations/0002_identity.sql`: `owner_binding` (singleton, no email), subject columns on `sessions`, a session lifetime cap (`absolute_expires_at` at most `created_at` plus 24 hours 5 minutes; `created_at` is not insertable by the auth role), a trigger (on insert and update) that makes revocation one-way and refuses a `last_seen_at` later than `now()`, and the `kawalys_auth` grants.
- **Database roles**: `kawalys_migrator` (applies migrations), `kawalys_app` (workspace data under forced RLS) and `kawalys_auth` (identity and session tables only: select and insert on users, identity links and the owner binding; on sessions select, insert of the credential columns, and update of `last_seen_at` and `revoked_at` only; no workspace table, no DELETE). `src/db/provision.ts` creates them.

**Capabilities** (`src/auth/capabilities.ts`): deny by default; only the `owner` role exists.

| Capability | owner |
| --- | --- |
| `evidence.read` | yes |
| `decision.create` | yes |
| `note.create` | yes (BACK-50: a user-written Correlation or Hypothesis) |
| `source.connect` | yes |
| `source.disconnect` | yes |
| `audit.read` | yes |
| `evidence.ingest` | no (server-internal connector path; no user role holds it) |

Effective permission for source data is the role capability AND an active source grant (see Evidence API below).

**Open for gate B:**

- The Descope project is not created.
- Real sign-in has never been run against Descope.
- Database TLS (`sslmode=verify-full`) for non-local hosts is not enforced yet.
- Provisioning as a non-superuser (Neon's owner role) is untested.
- Changing the owner after binding needs an operator step: the new identity is refused until the existing `owner_binding` is moved.

## Evidence API (BACK-55 S3)

Local code and tests only (owner approved gate A on 2026-11-23). Nothing is provisioned. Evidence routes exist only when both database URLs are set. They are protected by #76's global `AuthGuard` (a live session) and then by `WorkspaceGuard` (a capability). There is no Origin check: the session cookie is `SameSite=Strict` and no CORS is enabled, the same model as #76.

**Tables** (`migrations/0003_evidence.sql`): `projects`, `sources`, `source_grants`, `investigations`, `evidence` and `evidence_citations`. All are workspace-scoped with forced RLS. Every reference between them is a composite foreign key that includes `workspace_id`, because foreign-key checks bypass RLS; no row can point into another workspace. Evidence also references its source and investigation through `(workspace_id, project_id, id)`, and citations stay in the decision's project, so nothing links across projects either. GitHub repository names are stored lower-case (one repository is one source). `sources.provider` is `github`, `jira` or `confluence` (widened from `github` by `migrations/0005_atlassian_sources.sql`, BACK-99); any other value is refused by the database.

**Evidence model** (`src/evidence/evidence.types.ts`):

- Types: `Observation`, `Correlation`, `Hypothesis`, `HumanDecision`. A `HumanDecision` has no source and must belong to an investigation; every other type comes from exactly one source.
- States: `ok`, `stale`, `unknown`, `denied`, `error`. `state` has no default, so Unknown is stored as `unknown`, never dropped and never reported as healthy.
- Evidence is append-only: triggers (enabled ALWAYS, so they also fire in replica mode) refuse update, delete and truncate. Corrections are new rows.

**Source grants.** A grant is one user's permission to see one source's evidence. Revocation is one-way (a trigger permits only setting `revoked_at` once; no delete). Reads require an active grant for the reading user. Connecting reuses an existing source only in the same project and only for a user who held a grant on it before (reconnecting after their own disconnect, audited as `source.reconnected`); nobody can attach themselves to a source someone else connected. Connecting with an active grant is a no-op. The repository does not check capabilities: any future route must require `source.connect` / `source.disconnect` first.

**Decisions and citations.** What a `HumanDecision` cites is stored as `evidence_citations` rows, not in its payload (`{ decision, rationale }` only). A reader sees a decision only if every evidence row it cites is visible to that reader, so a decision (its citations or its rationale) never reveals that restricted evidence exists; the decider also loses sight of it after disconnecting a cited source. A reader also sees a decision only if they can see its project (the shared `PROJECT_VISIBLE` rule, the same as its investigation), so a decision that cites nothing never reveals a hidden project. Records carry `citations`: what a decision or a user note cites, empty for connector evidence. A note's citations all come from the note's own source (see Notes below).

**Ingestion** is server-internal: there is no HTTP route for it. A batch is all-or-nothing, and is refused for a source without an active grant or with an investigation of another project. Ingestion and decisions share-lock the grant rows they rely on, so a concurrent revocation cannot slip in between the check and the insert.

**Routes** (`src/evidence/evidence.controller.ts`):

| Route | Behaviour |
| --- | --- |
| `GET /evidence` | Needs a session and `evidence.read`. Optional filters `sourceId`, `investigationId`, `projectId`. An unknown, malformed or repeated filter value gives an empty list. Returns `{ items }`, newest first, capped at 500 rows. |
| `GET /evidence/:id` | Needs a session and `evidence.read`. 404 when the record is absent or not visible to the caller. |
| `POST /investigations/:id/decisions` | Needs a session and `decision.create`. Body `{ decision, rationale, evidenceIds }` (text without NUL or unpaired surrogates; at most 50 ids). The investigation must be visible to the caller (an active grant on a source of its project, the rule `GET /investigations/:id` uses), else 404 and nothing is written (tightened in the BACK-50 server slice). Every cited id must be source evidence of the investigation's project, visible to the caller. The decision and its audit row commit in one transaction. Returns 201 `{ id }`. |
| `POST /investigations/:id/notes` | Needs a session and `note.create`. Body `{ type, text, evidenceIds }`: `type` must be given and be `Correlation` or `Hypothesis` (BACK-54, no save without an explicit type), `text` up to 4000 characters with the same text rules, 1 to 50 ids. 404, nothing written, for an investigation or a cited id the caller cannot see; 400 for a missing or wrong type, no citations, or citations from two sources. The note and its audit row (`note.recorded`) commit in one transaction. Returns 201 `{ id }`. |

Failures follow the same fixed-envelope policy as authentication (404 for denied or invisible, 400 for an invalid body, 500 for a database failure).

### Recent decisions (BACK-59)

`GET /decisions` (`src/evidence/evidence.controller.ts`, `EvidenceRepository.recentDecisions`) lists human decisions, newest first by the time the database stored them. Read-only: there is no update or delete route.

- Needs a session and `evidence.read` (404 otherwise, like every refusal). Exists only when both database URLs are set.
- Query: `limit` (the page size) from 1 to 100, default 20; any other value, or a repeated one, is 400 `validation_error`. Optional `investigationId`: an unknown, malformed or repeated value gives `{ items: [], nextCursor: null }`, like the `GET /evidence` filter. Optional `cursor`: the `nextCursor` of the previous page.
- **Cursor pagination** (BACK-100 follow-up, `src/evidence/decision-cursor.ts`). Keyset on `(received_at, id)`, both descending, so decisions stored in one transaction (one `received_at`) still have a total order: walking the pages returns every visible decision exactly once, none repeated or skipped. The cursor keeps `received_at` to the microsecond (a JS `Date` would cut it to milliseconds and skip rows). It is opaque base64url and bound to the query it was issued for (workspace, reader and `investigationId` filter, as a digest); `limit` may change between pages. A cursor that is empty, repeated, malformed, re-encoded, or issued for another investigation, another filter or another reader is 400 `validation_error`, never a silent first page. It is not signed: a forged position only moves where the page starts, because visibility runs on every page. A decision hidden between two pages is absent from the later one. No index serves this order yet (the list sorted before paging too); an index on `(workspace_id, received_at DESC, id DESC)` for HumanDecision rows would be a migration and needs the owner's approval.
- Returns `{ items: [{ id, investigationId, decision, rationale, citations, createdBy, createdAt }], nextCursor }`, where `nextCursor` is a string when another page exists and `null` on the last page. `createdBy` is the user id of the `decision.recorded` audit row that `POST /investigations/:id/decisions` writes in the same transaction (joined at read time through the index `audit_events_by_target`, migration 0004). `createdAt` is the evidence row's `received_at`, which only the database sets. A decision row cannot exist without that audit row (BACK-100, below), so `createdBy` is always set; it is `null` only if the audit row's actor is (never written by the application).
- Visibility is the one `GET /evidence` uses: a decision is absent unless its project and every row it cites are visible to the reader, so a decision citing evidence of a disconnected source, an uncited decision of a hidden project, and another workspace's decisions never appear.
- Append-only: `kawalys_app` holds no UPDATE or DELETE on `evidence`, `evidence_citations` or `audit_events`, and ALWAYS-enabled triggers refuse both even for a superuser in replica mode. A changed decision is a new decision. `test/evidence/decisions-db.spec.ts` covers this, the visibility cases, the parameter bounds and cursor paging (ties, microseconds, visibility between pages, malformed and foreign cursors).
- **Decision audit row enforced (BACK-100, `migrations/0004_decision_audit.sql`).** A `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `evidence` (`evidence_decision_audited`, enabled ALWAYS) refuses at commit, with SQLSTATE 23000, any `HumanDecision` row without a `decision.recorded` audit row of the same workspace whose `target_type` is `evidence` and `target_id` is the decision id. `recordDecision()` writes the audit row after the evidence row in the same transaction, so it passes; `SET CONSTRAINTS ALL IMMEDIATE` only runs the check earlier. The function is SECURITY INVOKER (no definer rights; `kawalys_app` already reads `audit_events`) with a pinned `search_path` and a schema-qualified table, so it sees only the current workspace context: a context switched before commit fails closed. It also holds for a superuser. The index `audit_events_by_target (workspace_id, target_type, target_id, action, occurred_at, id)` serves the creator lookup (the subquery is `DECISION_CREATOR` in `evidence.repository.ts`). Tests: `test/evidence/decision-audit-db.spec.ts` (including an `EXPLAIN` that must name the index).

**Restart test.** `test/evidence/evidence-http.spec.ts` proves that evidence, decisions and sessions survive a full restart with new pools.

**Reuse strategy: BUILD.** The evidence contract is Kawalys-owned and no Retail Tower evidence code fits. It uses the S1 adapted workspace context and audit row writer.

**Known limits:**

- Projects and sources have no write routes, and investigations have read routes only (see Investigation API below).
- Correlation and Hypothesis evidence each come from one source, including user notes: a note cannot link evidence of two sources (for example a GitHub pull request and a monitoring alert). Doing that safely needs a schema change and its own visibility rule; it is not built. This already applies today to two repositories of one project: a note citing both is refused with 400.
- The list is capped at 500 rows and has no pagination or truncation flag yet.
- Database-role hardening is partial: since BACK-100 a `HumanDecision` row cannot commit without its audit row, but `kawalys_app` could still insert a grant for any user id, or an audit row of its own choosing; the application never does.
- There is no way yet for an administrator to revoke another user's grant (single owner).

## GitHub observation mapper (BACK-52 mock slice)

Code and canned-response tests only. **No transport, no network, no token, no GitHub App.** A real transport waits for the BACK-52 gates: X02/X04 and owner authorization of one exact repository and its scopes.

- `src/connectors/github/github.transport.ts`: the read-only port (`get` only, so a write cannot be expressed) and `GitHubTransportFailure` (`network` or `timeout`). Nothing in `src/` implements it.
- `src/connectors/github/github.observer.ts`: `observeRepository(transport, { sourceId, externalRef }, now)` reads the repository, then up to 20 open pull requests and 20 open issues (issues that are pull requests are skipped). It returns `ObservationInput[]` for `EvidenceRepository.ingest()`. Nothing calls it yet. Each list that was read also gets a `list_page` record, `{ endpoint, returned, pageSize }`. `returned` is the raw page length, so it includes the pull requests that `/issues` lists. A full page means there may be more.
- `observedAt` is the time of the read. The item's own update time is `payload.updatedAt`.
- Only allow-listed fields are stored (X04). Items keep number, title, state, draft and `updatedAt`. The repository keeps `fullName`, `defaultBranch`, `archived`, `private` and `pushedAt`. No bodies, logins, emails, avatars or descriptions.
- Text is cut to 300 whole characters. NUL is removed and an unpaired surrogate is replaced, because PostgreSQL `jsonb` rejects both and `ingest()` is all-or-nothing.
- A URL is kept only if it is `https://github.com/<this repo>/…` with no username, password or port. It is rebuilt from its path, so no query or fragment is stored.
- `externalRef` must be the stored lower-case `owner/repo`. Anything else makes no request and records `error` / `invalid_ref`. A repository answer whose `full_name` is another repository (a rename or redirect) records `error` / `ref_mismatch`, and nothing else is read.

Every failure becomes one `source_status` Observation per endpoint, with a fixed reason code and never GitHub's message text:

| Answer | `state` | `reason` |
| --- | --- | --- |
| 401, 403 | `denied` | `denied` |
| 404 (absent and not permitted look the same) | `denied` | `not_visible` |
| 429, or 403 with `x-ratelimit-remaining: 0` or `retry-after` | `unknown` | `rate_limited` |
| 5xx | `unknown` | `unavailable` |
| no answer | `unknown` | `network` / `timeout` |
| other status | `error` | `unexpected_status` |
| any other thrown error | `error` | `transport_error` |
| 2xx with an unexpected shape (one bad item fails its endpoint) | `error` | `malformed` |

A failed repository read stops the run. A failed pull-request or issue list is isolated from the other list. A status record is dated at the read like every other record, so readers must let `state` win over freshness.

**For the future reader (BACK-49 slice):** evidence is append-only. An item that drops off the open list (closed), or whose source later fails, gets no new record of its own. A reader must therefore not take "the latest record per `source_ref`". It should show items only from the source's latest read, and show a source whose latest read failed as that failure.

BACK-52's original acceptance criterion says 401/403 should become Unknown. The 23 Nov owner decision asks for truthful Unknown/unavailable/denied outcomes, so 401, 403 and 404 are `denied`. Neither is ever `ok`.

Tests: `test/connectors/github/` (canned responses, mutation-checked), plus a Docker database test that stores every state through `ingest()`.

## Investigation API (BACK-50 server slice)

Read-only routes for investigations. No new capability, schema or dependency.

| Route | Behaviour |
| --- | --- |
| `GET /investigations` | Session and `evidence.read`. `{ items }`: visible investigations (`id`, `projectId`, `title`, `status`, `createdAt`), newest first, at most 100. Optional `projectId`. An unknown, malformed or repeated filter gives `{ items: [] }`. |
| `GET /investigations/:id` | Session and `evidence.read`. The investigation plus `evidence`: its records as `GET /evidence?investigationId=` returns them, with `type` and `state` unchanged. Those two fields are the badges; no health is computed. 404 when the id is unknown, malformed or not visible. |

**Visibility** is one shared rule, `src/evidence/visibility.ts` (`PROJECT_VISIBLE`). An investigation is visible exactly when its project is: the caller holds an active grant on one of the project's sources. The portfolio (further narrowed to GitHub sources since BACK-99), the decision write path and decision reads in `GET /evidence` use the same rule; the write path share-locks the grant rows, so a concurrent revocation waits or wins outright. Another workspace is excluded by RLS, and the persona header is never read.

**What the room shows.** It shows investigation-scoped evidence only. Connector observations belong to no investigation (`investigation_id` is null), so they appear under `GET /portfolio/:projectId`; they are never linked to an investigation automatically.

**Notes** (owner decision 2026-11-25, option a). A user writes a `Correlation` or `Hypothesis` with `POST /investigations/:id/notes` (`note.create`). No schema change:
- It must cite at least one evidence row, and every cited row must come from the same source. The note is stored with that `source_id` (the schema requires one source for every non-decision row), so whoever can see the note can see everything it cites, and nobody else sees it.
- Cited rows must be visible source evidence of the investigation's project; another note of the same source may be cited, a decision may not.
- Its `state` is the worst state of what it cites, so a note built on `unknown` evidence never shows as `ok`. `source_ref` is `kawalys:note`; the payload is `{ text }`.
- Citations go to `evidence_citations` like a decision's. Notes do not change `GET /portfolio`, which reads connector observations only.

## Portfolio API (BACK-49 slice 2)

A read-only view of what is visible to the caller, built on the evidence store. No new capability, schema or dependency.

| Route | Behaviour |
| --- | --- |
| `GET /portfolio` | Session and `evidence.read`. `{ projects }`: each visible project with its granted sources, each source's read state and open-item counts with `complete`, **no items**. At most 100 projects, ordered by key. |
| `GET /portfolio/:projectId` | Session and `evidence.read`. One project with the items of each source's latest read. 404 when the id is unknown, malformed or not visible. |

**Response parity with the app (BACK-57).** The app does not call these routes. Its Portfolio screen renders a synthetic `GET /portfolio` body, `app/src/fixture/portfolio-response.json`, through its own copy of the response shapes. `test/portfolio/portfolio-parity.spec.ts` builds that body through the real read model and requires the file to match exactly, so the two copies cannot drift apart. After an intended model change, regenerate the file with `KAWALYS_WRITE_PORTFOLIO_FIXTURE=1` and review the diff. The test runs with the server suite, so an edit to the app file alone is not checked until the next server change.

**Visibility.**
- A project is listed only through a source the caller holds an active grant on. Only granted sources are listed and counted.
- **GitHub sources only (BACK-99).** The read model is GitHub-repository-shaped (a repository read, pull requests, issues). Jira and Confluence sources have no repository read and would read as `unknown` / `never_read` and drag their project to `unknown`, so the portfolio query ignores every provider but `github` (`PORTFOLIO_PROVIDER` in `portfolio.repository.ts`). A project appears only through a granted GitHub source: one whose granted sources are all Jira or Confluence is absent from `GET /portfolio` and 404 on `GET /portfolio/:id`, and takes no slot of the 100. Its evidence and investigations stay readable through their own routes (`PROJECT_VISIBLE` is provider-neutral). Test: `test/portfolio/portfolio-providers-db.spec.ts`.
- A project with no granted source, or with none at all, does not exist for that caller.
- Another workspace is excluded by RLS.
- The persona header is never read.

**The latest read.** It is the newest ingest batch of the source that holds a repository-level record (`kind: repository`, or a `source_status` for `endpoint: repository`). A batch is one `ingest()` transaction, so its rows share the database-set `received_at`, which the app role cannot write. Items come only from that batch, so:
- A closed pull request, gone from the newest read, is not shown.
- Newer rows of another kind (a later Hypothesis) never hide the read.

**States are facts, never derived as healthy** (`src/portfolio/portfolio.model.ts`):

| Case | Source `state` / `reason` |
| --- | --- |
| Connected, never read | `unknown` / `never_read`, no counts |
| Repository read failed | that failure (for example `denied` / `not_visible`), lists `unknown` / `not_read`, no items |
| A list failed | that list's failure; the other list keeps its count; the source is the worse of the two |
| A status row that claims `ok`, a repository record that is not `ok`, or a stored item that no longer reads as an item | `error` / `malformed` |
| Two repository-level records in one batch (two reads in one transaction) | `error` / `ambiguous_read`, no items; the reads are never mixed |
| Everything read | `ok`, with counts (0 is a real count) |

**Counts are counts of one page, not totals.**
- Each list's `complete` is `true` when GitHub returned less than a full page, so `count` is the total.
- It is `false` for a full page: there may be more, and `count` is only a lower bound (for example, show "20+").
- It is `null` when unknown (no `list_page` record) or not read.
- An issues page full of pull requests can give `count: 0, complete: false`.

A project's `state` is the worst of its sources, in the order `ok` < `stale` < `unknown` < `error` < `denied`. With no visible source it is `unknown`. The server never computes `stale`: it returns `lastReadAt`, and the client applies freshness, with `state` taking priority over freshness.

**Deferred.**
- BACK-49's role filter (Technical sees technical items): only the `owner` role exists, and the persona header is not authorization.
- Pagination beyond 100 projects, and real totals beyond one page per list.
- An index on `evidence (workspace_id, source_id, received_at DESC)`. Today the latest-read query scans each source's whole history through `evidence_by_source`, which is harmless with no real ingestion yet. Add it in a later migration, before a transport polls (schema changes are not part of this slice).
- Nothing ingests real data yet: there is still no GitHub transport.

## Jira and Confluence observation mappers (BACK-53 mock slice)

Mock only: code and canned-response tests. **No transport, no network, no token, no MCP connection, no dependency.** Nothing in `src/` implements the ports and nothing calls the mappers yet. A real transport waits for the BACK-53 gates (owner authorization of exact projects and spaces, and their scopes).

- `src/connectors/atlassian/atlassian.transport.ts`: the shared read-only port (`get` only) and `AtlassianTransportFailure` (`network` or `timeout`). `jira.transport.ts` and `confluence.transport.ts` name it per product.
- `src/connectors/jira/jira.observer.ts`: `observeJiraProjects(transport, { sourceId, site, projectKeys }, now, { ttlMs })` reads up to 20 most recently updated issues per project key and keeps `key`, `summary`, `statusCategory` (`new`, `indeterminate` or `done`), `updatedAt` and `url`.
- `src/connectors/confluence/confluence.observer.ts`: `observeConfluenceSpaces(transport, { sourceId, site, spaceKeys }, now, { ttlMs })` reads each space, then up to 20 most recently modified current pages, and keeps `pageId`, `title`, `spaceKey`, `lastModified`, `version` and `url`.
- Failures follow the GitHub table above (429 only for rate limits). A failed project or space is isolated from the others. A failed space read stops that space. One bad item fails its project or space list (`malformed`), and an item from another project or space is `ref_mismatch`: no record is invented or partly kept.
- Keys are validated before any request (at most 10, unique; Jira `^[A-Z][A-Z0-9_]{1,9}$`, Confluence `^[A-Z0-9]{1,32}$`); anything else makes no request and records `error` / `invalid_ref`.
- An answer whose `date` header is older than the TTL (default 15 minutes) yields `stale` items, never `ok`. An unreadable `date` is `malformed`.
- A link is built only as `https://<name>.atlassian.net/browse/<key>` or `/wiki/spaces/<key>/pages/<id>`, and only when the configured `site` is exactly an https `atlassian.net` origin. Otherwise `url` is null. Upstream `self` and `_links` values are never stored.
- Stored since BACK-99: `migrations/0005_atlassian_sources.sql` allows `sources.provider` `jira` and `confluence`, and `EvidenceRepository.connectSource()` accepts them. One source per site and product (for example `external_ref` = `kemetra-synthetic.atlassian.net`, lower-case like every `external_ref`). Their sources are not in the portfolio (see Portfolio API).

Tests: `test/connectors/jira/`, `test/connectors/confluence/` (mutation-checked; `jira-ingest-db.spec.ts` and `confluence-ingest-db.spec.ts` store the mapper output, every failure state included, through `ingest()` on Docker Postgres and read it back under RLS: `stale`, `denied`, `unknown` and `error` stay as such, another workspace and an ungranted user see nothing, and any other provider value is refused), and `test/connectors/read-only-guard.spec.ts`, which fails if a module under `src/connectors/{jira,confluence,atlassian}` imports a network library, calls `fetch` or reads the environment, or if the port gains a method other than `get`.

## Known limits

- Rate limiting on `POST /auth/session` is a process-local fixed window (one shared key behind loopback); a restart resets it.
- A database failure in the auth or evidence path answers 500 `internal_error` (fixed body, nothing leaked), not 404.
- Each evidence request resolves the workspace twice (in the directory recheck and in `WorkspaceGuard`); a performance cost only.
- Database TLS is not enforced; migrations must use a direct connection, not a transaction-mode pooler.
- Only the `owner` role exists; there is no sign-up, team management or administrator revocation of another user's grant.
- No product UI or prototype code calls the server. The only page it serves is the owner lab (`GET /auth/lab`), off by default and refused in production.
- Tests run against disposable local Docker Postgres and locally generated RS256 keys; no real database or Descope project has been used.

## Provenance

`src/errors/envelope.ts` and `src/auth/tokens.ts` are copied from Retail Tower, the Descope verifier and the database files listed in THIRD_PARTY.md are adapted from it, and the Postgres session store follows a Retail Tower pattern without copying code. See
[THIRD_PARTY.md](THIRD_PARTY.md) for paths, pinned SHAs, strategy and licence.

## Rollback

To remove only the Investigation API (BACK-50 server slice): delete `server/src/investigations/` and `server/test/investigations/`, remove its two imports and the `InvestigationModule.register` line from `server/src/create-app.ts`, and revert its README edits. The shared rule `server/src/evidence/visibility.ts` is also used by the portfolio and by `recordDecision`; to remove it, restore their previous predicates.

To remove only the Portfolio API (BACK-49 slice 2): delete `server/src/portfolio/` and `server/test/portfolio/`, remove its two imports and the `PortfolioModule.register` line from `server/src/create-app.ts`, and revert its README edits.

To remove only the Jira and Confluence mappers (BACK-53 mock slice): delete `server/src/connectors/{jira,confluence,atlassian}/`, `server/test/connectors/{jira,confluence}/` and `server/test/connectors/read-only-guard.spec.ts`, and revert their README section and `description` edit.

To remove only the GitHub observation mapper (BACK-52 mock slice): delete `server/src/connectors/` and `server/test/connectors/`, and revert its edits to `server/README.md`, `server/THIRD_PARTY.md` and the `description` in `server/package.json`. Nothing else imports it.

To remove only the durable layer (BACK-55): delete `server/src/auth/session/postgres-session-store.ts`, `server/src/auth/identity/database-owner-directory.ts`, `server/src/auth/workspace-resolver.ts`, `server/src/auth/workspace.guard.ts`, `server/src/evidence/`, `server/src/db/`, `server/src/audit/`, `server/src/config/database-config.ts`, `server/migrations/` and the matching tests, and restore `create-app.ts` and `main.ts` from `main`. To remove the authentication foundation: delete `server/src/auth/` and `server/test/auth/`, restore `create-app.ts`,
`health/process.controller.ts` and `test/http/app.spec.ts` from `main`, and remove `jose` from `server/package.json` and
the lockfile. To remove the whole BFF: delete `server/`, then revert the `CLAUDE.md` bullet, the root `NOTICE`, the root `LICENSE`, the
`license` field in the root `package.json`, and the "Synthetic BFF" section of the root `README.md`.

## Out of scope / still gated

- BACK-47 exit criteria for anything beyond this T0.
- BACK-55 (database) is in progress: S1 and S3 done locally; no provisioned DB.
- BACK-56 (authentication): the #76 foundation plus durable sessions are done locally; real sign-in is K-ID-1b.
- BACK-58 (secrets).
- Correlation helper: deferred because it needs `@opentelemetry/api`.
- TypeScript 7 (native compiler): `ts-jest` 29 needs the JavaScript compiler API, so the toolchain stays on TypeScript 6.0.3 (BACK-75).
