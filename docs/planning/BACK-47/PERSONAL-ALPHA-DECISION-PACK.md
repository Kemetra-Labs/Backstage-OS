# BACK-47 Personal Alpha gate closure: decision pack (proposal for owner approval)

Date: 2026-11-23. Status: **PROPOSAL, not approved.** Nothing here is an owner decision until the owner accepts it on BACK-47.
Scope: unblock real implementation of BACK-55 (evidence persistence) and BACK-56 (authentication) for the single-owner Personal Alpha, then BACK-52 (GitHub read-only), then real UI integration.
This document is planning only. No code, database, provider access, credential, commit, push, PR or merge was made for it.

Legend: **APPROVED** = already owner-approved (source cited). **RECOMMENDED** = my default, needs owner acceptance. **OPEN** = needs an owner value or fact.

## 1. What was inspected (not re-researched)

| Source | Result |
| --- | --- |
| BACK-47, 55, 56, 52, 58, 48, 69 (Jira, read 2026-11-23) | BACK-47 is To Do. Owner accepted ADR-002 v2 as **direction only**. BACK-69 (synthetic T0) is Done. The 23 Nov owner decision narrows scope to one owner, passwordless, one GitHub repo. |
| ADR-002 v2 and Reuse Matrix v2 (Confluence 89423937, 89423971) | PS-01..PS-12 approved as direction. Matrix: 26 candidates screened, **file-level copies not yet authorized**. |
| `server/` at Kawalys `d814cea` | NestJS **12.6.0**, TypeScript 6.0.3, Jest 30, Node >=24. Only `/process` and a synthetic `/demo/evidence/:id`. No DB, auth, secrets. Donor `envelope.ts` already copied (see `server/THIRD_PARTY.md`). Own Apache-2.0 `LICENSE` and `NOTICE` now exist. |
| Retail Tower donor (`Kemetra-Labs/Retail-Tower-Erp`) | Pinned SHA `dea1adc3...` still valid. Local clone HEAD is `3c60dc0` (17 commits later) with **no diff** in `auth/`, `context/`, `audit/`, `packages/db`, `shared/src/errors`. Re-run `git diff` at slice start. |
| Retail dependencies | Nest 11.1.19, `pg` 8.20.0, `drizzle-orm` 0.45.2, `jose` 5.10.0, tests on `postgres:16-alpine` through `@testcontainers/postgresql`. |
| Local tooling | Docker 29.9.3 is available, so real-Postgres RLS tests can run locally with no cloud resource. |
| GitHub | All eight `Kemetra-Labs` repos are **public**, including `Backstage-OS`. |

Findings that change the plan:

1. ADR-002 names Nest 11 as the compatibility baseline, but `server/` is already Nest 12 (ESM). Every Retail file is Nest 11 / CommonJS-era code, so reuse is **ADAPT**, never a verbatim copy.
2. The donor session code imports `@data-pulse-2/auth` (`hashToken`), `@data-pulse-2/db/schema` and `@data-pulse-2/shared` (`newId`). These workspace packages must **not** be imported. The few functions needed are re-implemented (SHA-256 + `timingSafeEqual`, `crypto.randomUUID`).
3. The donor Descope verification is `jose` + remote JWKS with issuer, audience and max token age (`pos-operators/descope-verifier.ts`). It does not use the Descope SDK, so Kawalys needs no `@descope/node-sdk` for verification.
4. The donor RLS GUC carries a platform-admin branch and a NIL-UUID sentinel. Both are dropped. An unset GUC must return zero rows (fail closed).
5. Every candidate repository is public, so the first source proves plumbing, grant and revocation behaviour, not confidentiality.

## 2. BACK-47 reconciliation against Personal-first, Team-ready

BACK-47 acceptance criteria versus current evidence. BACK-47 stays **To Do** until the owner accepts this pack and the open gates in section 11 are evidenced.

| BACK-47 criterion | State | What closes it |
| --- | --- | --- |
| Confluence decision record exists and is linked | Partly: ADR-002 v2 and the matrix are linked | Add a "Personal Alpha addendum" to ADR-002 (this pack's sections 3 to 8), owner records it |
| Names the choice for backend, storage, auth, credential custody | Backend, storage, auth APPROVED as direction. Custody APPROVED as policy only | Sections 3, 6, 7 give concrete defaults |
| States "Pilot only, can be replaced without rewriting product contracts" | Present in the BACK-47 description | Repeat in the addendum |
| Owner comments "Accepted" | 22 Nov comment accepts **direction only** and says the ticket stays To Do | Owner accepts this pack (section 12) |
| Done before any connector moves to In Progress | Not met | Applies to **real** BACK-52 only. A contract-test adapter slice is allowed earlier (BACK-52 text) |
| No secrets in the record | Met | Keep it so |

Scope reconciliation: single owner, one workspace, one project, one source. Stable identifiers and grant checks stay so teams can be added later without rewriting evidence contracts. **Not claimed**: multi-tenant readiness, cross-user isolation, or any team RBAC.

## 3. Identity and ownership model

**RECOMMENDED**, adapting Retail identity-link and session patterns (matrix #01-#03).

- **Principals.** `users(id uuid, status, created_at)`. `external_identity_links(provider_key, issuer, subject, user_id, status)` with `UNIQUE(provider_key, issuer, subject)`. Provider fields never leave the adapter.
- **Ownership chain.** `UserId` owns `WorkspaceId` (kind `personal`). A workspace has `ProjectId`s. A project has `SourceId`s. Every domain row carries `workspace_id` (RLS key) and, where relevant, `project_id` and `source_id`. A `memberships(workspace_id, user_id, role)` table exists with role limited by `CHECK (role = 'owner')` and **no API that writes it** in the alpha. Teams later relax the CHECK.
- **Single-owner binding (OPEN, default below).** No unauthenticated mode and no owner-bypass header. Default: runtime config `KAWALYS_OWNER_EMAIL`; the **first** verified sign-in whose verified email matches creates the owner user, workspace, membership and identity link in one transaction, guarded by "no owner exists yet". After that the link is pinned to the Descope `subject`. Any other subject gets the same 404 as an unknown route.
- **Personas.** `x-kawalys-demo-persona` and the UI lenses stay display-only. Real routes ignore them. A test proves a forged persona or owner header changes nothing.

## 4. Passwordless sign-in (Descope)

- **Provider (APPROVED direction):** a **separate** Kawalys Descope project. No Retail users, sessions or settings.
- **Method (RECOMMENDED):** **email magic link** first, using Descope Flows. It works on localhost and any host with no relying-party domain lock-in. Add passkey enrolment once the hosting domain is fixed. Descope documents magic link, OTP and passkey support; the project must be configured and checked at provisioning (gate B).
- **Server verification (ADAPT matrix #02):** the SPA completes the flow and sends the Descope session JWT. The backend verifies signature (remote JWKS), issuer, audience, expiry and a max token age with `jose`, rejects anything else with a generic refusal, then maps `(issuer, subject)` to the local user.
- **Kawalys session (ADAPT matrix #03):** opaque random cookie, `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Strict`, stored only as a SHA-256 hash. Idle timeout 12 h, absolute cap 24 h (donor values), server-side revoke, sign-out revokes. State-changing routes require an `Origin` check (inspect donor `origin-check.ts` at the slice).
- **Fail closed:** missing or invalid token, revoked, idle or expired session, unlinked subject: all map to 404 under policy M05-D05-B.

## 5. Minimal capability and source-grant matrix

**RECOMMENDED.** Effective permission = role capability ∩ project scope ∩ **current, unrevoked source grant**. Deny by default, nondisclosing 404.

| Capability | Owner role | Needs an active source grant | Notes |
| --- | --- | --- | --- |
| `evidence.read` | yes | yes, per `source_id` | Counts, rollups, ARIA text and search are computed after authorization |
| `evidence.ingest` | server-internal only, never a user capability | yes | Written only by the connector path |
| `decision.create` | yes | yes (decision target must be readable) | Atomic with an audit row |
| `source.connect` / `source.disconnect` | yes | n/a | Creates or revokes the grant row |
| `audit.read` | yes | n/a | Own workspace only |

`source_grants(id, workspace_id, source_id, user_id, capabilities, granted_at, revoked_at)`. Revoking sets `revoked_at` and takes effect on the next request. The connector refuses to make any outbound call without an active grant.

## 6. PostgreSQL schema and RLS strategy

**RECOMMENDED**, adapting matrix #06, #07, #09, #10 and referencing #08.

- **Engine and access.** Standard PostgreSQL. `pg` 8.x with hand-written SQL migrations and thin repositories. **No ORM** (drops donor `drizzle-orm`; fewer dependencies).
- **Roles (three):** `kawalys_migrator` (DDL owner, not used at runtime), `kawalys_app` (runtime DML; `NOSUPERUSER NOBYPASSRLS`), `kawalys_auth_lookup` (identity link and session lookup before a workspace is known; minimal columns). Boot refuses to serve if the app role is superuser, has `BYPASSRLS`, shares a login with another role, or uses `SET ROLE`/`options=-c role=` (donor boot checks, RT-357 pattern).
- **Context.** `runWithWorkspaceContext(pool, workspaceId, work)`: `BEGIN`, `set_config('app.current_workspace', $1, true)`, work, `COMMIT` / `ROLLBACK`, always release. **No platform-admin GUC.** Policy predicate: `workspace_id = nullif(current_setting('app.current_workspace', true), '')::uuid`, so an unset context matches nothing.
- **Every workspace table:** `ENABLE` and `FORCE` row level security plus at least one policy. Enforced by the extracted catalog invariant test (see section 9).
- **Core tables (names indicative):** `users`, `external_identity_links`, `sessions`, `workspaces`, `memberships`, `projects`, `sources`, `source_grants`, `evidence`, `investigations`, `human_decisions`, `audit_events`.
- **Typed evidence at the storage layer (BACK-55 AC).** `evidence.type` is `NOT NULL` with `CHECK (type IN ('Observation','Correlation','Hypothesis','HumanDecision'))`. Provenance columns (`source_id`, `source_ref`, `observed_at`, `received_at`) are `NOT NULL`. `state` is a constrained enum `ok | stale | unknown | denied | error`, so **Unknown is stored, never dropped and never defaulted to healthy**. Rows are append-only; a correction is a new row.
- **Atomic decision and audit (matrix #09).** A `human_decisions` insert and its `audit_events` insert run on the same client in one transaction. A forced audit failure must roll the decision back.
- **Append-only audit (matrix #10).** Trigger refuses `UPDATE`, `DELETE` and `TRUNCATE` for every role. The donor's retention-marking and FK `SET NULL` exceptions are **omitted** until a retention policy is accepted.
- **IDs.** UUID v4 by default (`gen_random_uuid()`). No Retail `newId`.

## 7. Neon, backup, retention, hosting and secret custody

- **Neon (APPROVED as candidate only; nothing provisioned).** Region **OPEN but effectively fixed**: Neon's regions page (updated 2026-11-18) lists only `aws-eu-central-1` (Frankfurt). Confirm in the console at provisioning. Plan **RECOMMENDED: Launch** (pay per use) for a **7-day** history window. Neon's own FAQ lists history windows of 6 h on Free, up to 7 days on Launch and up to 30 days on Scale. Monthly spend alert value is an owner number (OPEN).
- **Postgres major.** Pin the **same major** in Neon, the local test container and CI. The donor tests use 16. RECOMMENDED: 17, if Neon offers it at provisioning; **not verified here**.
- **Restore proof.** One restore drill (restore to a branch, run the persistence test) before the DB is called usable. **Not run.**
- **Retention (RECOMMENDED):** Observations and Correlations 180 days rolling, with a purge job deferred (schema keeps `observed_at`, nullable `expires_at`). Human decisions and audit rows kept until the owner deletes the workspace. Erasure of an append-only audit table needs a documented break-glass step. **That policy is OPEN for owner acceptance**; no auto-delete is built in the first slices.
- **Hosting (RECOMMENDED: defer, because it is gate D).** Local-first. Portable OCI container later. The ADR names a small Lightsail VM as a cost candidate only. No host, domain or spend cap is approved. None is needed for gate A.
- **Runtime secrets (RECOMMENDED, host-neutral per PS-06).** Local: gitignored `.env.local`, optionally filled with `op run`. Deployed: protected host env or secret file mounted into the container. GitHub Actions secrets are for CI only, and CI holds **no** provider secrets (Postgres service container plus fixtures). Secrets: two DB URLs (`app`, `migrator`), Descope project ID (public), GitHub App ID and private key. Config fails fast on any missing required value and never logs one (BACK-58 AC). Never in the image, repo or client bundle.

## 8. First GitHub source and exact read-only permissions

- **Repository (RECOMMENDED, OPEN to confirm):** `Kemetra-Labs/Backstage-OS` (the owner's own repo, public). Dogfood value is high, confidentiality risk is nil. A private repo would stress the grant path harder but adds exposure; owner's call.
- **App (RECOMMENDED):** one new GitHub App, e.g. "Kawalys Alpha Observer", owned by the owner or org, installed on **only** that repository (`repository_selection = selected`).
- **Permissions:** Repository **Metadata: Read** (mandatory), **Pull requests: Read**, **Issues: Read**. **Everything else: No access.** No Contents (the MVP never reads source code, per X02-D04), no Actions, no write of any kind, no organization or account permissions, no user-to-server OAuth, **webhook inactive** (polling only).
- **Calls (all GET):** repository metadata, list pull requests, list repository issues (filter out items that carry a `pull_request` key). GitHub's permission table confirms list-PR needs Pull requests read and list-issues needs Issues read.
- **Tokens:** sign a short-lived app JWT, mint an installation token in memory (GitHub states installation tokens expire after one hour), request it with the `repositories` and `permissions` parameters narrowed to the three read permissions above. Never persist or log it.
- **Revocation and failure (BACK-52 rules):** owner removes the repo, uninstalls or suspends the app, or Kawalys revokes the grant. Result: no call is made once the grant is revoked; if GitHub answers 401/403/404 or the network fails, the observation state is `denied` or `unknown`, **never Healthy**, and no existence or count leaks to an unauthorized caller.
- **Key rotation:** generate the new private key in the app settings, deploy it, then delete the old key. Needs a documented drill; not run.

## 9. Security-negative and persistence tests (acceptance evidence)

Gate A tests, all on a **real Postgres** container (no in-memory store):

1. RLS coverage invariant: every `workspace_id` table has RLS enabled, forced and a policy; negative fixtures prove each failure mode (matrix #07, extracted).
2. Cross-workspace raw SQL as `kawalys_app` returns zero rows. Unset GUC returns zero rows. GUC is gone after the connection returns to the pool. Role flags (`rolsuper`, `rolbypassrls`) are false.
3. Typed evidence: bad `type` rejected by the database; `unknown` and `error` rows persist; failed write surfaces an error, never silent loss.
4. Restart persistence: write through the API, restart the process, read the same rows (BACK-55 AC1).
5. Auth: forged Descope token (wrong issuer, audience, expired, `alg:none`, bad signature) refused; unlinked subject refused; revoked, idle and expired sessions refused; cookie stored only as a hash; forged persona header ignored; every real evidence route returns 404 unauthenticated; Origin check on state-changing routes.
6. Authorization: revoked or missing source grant returns 404 and a spy proves no outbound call; no count, status, ARIA or log leak of restricted rows.
7. Atomicity: forced audit failure rolls the `HumanDecision` back; audit rows cannot be updated or deleted by any role.
8. BACK-52 contract tests (fixtures): 401, 403, 404, 5xx and network errors map to `denied` or `unknown`; the client contains no non-GET method (type and test); tokens never reach logs or responses.

## 10. Exact Retail Tower reuse (donor `dea1adc3...`, no drift found)

Strategy per the Reuse Before Build rule. Keep provenance rows in `server/THIRD_PARTY.md`; Retail Tower is not modified; no runtime dependency on `@data-pulse-2/*`.

| # | Donor path (under `services/backend-core/`) | Strategy | Kawalys change |
| --- | --- | --- | --- |
| 11 | `packages/shared/src/errors/envelope.ts` | already COPY (BACK-69) | none |
| 06 | `packages/db/src/middleware/tenant-context.ts` (154 lines, read) | ADAPT | rename GUC to `app.current_workspace`; delete `isPlatformAdmin` and the NIL sentinel; keep `BEGIN` + `set_config(...,true)` + rollback + release |
| 07 | `packages/db/__tests__/rls-coverage.invariant.spec.ts` and its `_helpers` (266 lines, read) | EXTRACT TESTS | `tenant_id` to `workspace_id`; `RT-` key regex to `BACK-`; table-count guard; testcontainers helper extracted too |
| 10 | `packages/db/drizzle/0034_audit_events_append_only.sql` (read) | ADAPT | keep refuse UPDATE/DELETE/TRUNCATE; drop retention-marking and FK-SET-NULL branches |
| 09 | `apps/api/src/audit/audit-row.writer.ts` (92 lines, read) | ADAPT | tenant to workspace; drop store; UUID via `crypto.randomUUID` |
| 03 | `apps/api/src/auth/session.repository.ts` (289 lines, read) | ADAPT | plain `pg`, no drizzle, no cache interface, no active tenant/store; keep hashed lookup, idle and absolute expiry, revoke |
| 01 | `apps/api/src/auth/identity-provider.port.ts` (130 lines, read) | ADAPT | keep `VerifiedSubject`, `verifyIdentityToken`, `linkExternalIdentity`, `disableIdentity`; drop invite, create, password reset |
| 02 | `apps/api/src/pos-operators/descope-verifier.ts` (verification) and `auth/descope-auth.client.ts` | ADAPT | `jose` + JWKS with issuer, audience, max age; separate Kawalys project and config |
| 04, 05 | `context/tenant-context.guard.ts` (412), `auth/roles.guard.ts` (286) | ADAPT, mostly REFERENCE | **not read in detail**: inspect at slice start; expected to shrink to a small workspace guard and capability guard with no platform-admin or support-session logic |
| 08 | `docs/operations/database-roles.md` (1127 lines) | REFERENCE | write a short Kawalys roles doc and boot checks |
| 14 | `connector-health/connector-health.service.ts` | REFERENCE (BACK-52) | four independent status axes; no heartbeat means healthy. Inspect at that slice |
| rest | Redis session cache, idempotency, outbox, BullMQ, AI ports, POS/ERP, pricing, platform-admin | DEFER / REJECT | none |

Licence: donor Apache-2.0 (root `LICENSE`); Kawalys has its own Apache-2.0 `LICENSE`, `NOTICE` and `server/THIRD_PARTY.md`, so the earlier "no root LICENSE" blocker is resolved. Per-file rights and notices are still recorded per copied file.

## 11. Dependencies, version checks, remaining gates

npm registry check on 2026-11-23 (latest published; **pin exact versions and re-check at install**):

| Package | Latest | Use | Note |
| --- | --- | --- | --- |
| `pg` / `@types/pg` | 8.23.1 | DB driver | donor pin 8.20.0 |
| `jose` | 6.2.18 | JWT verify | donor pin 5.10.0 (a major behind; confirm ESM and API under Nest 12) |
| `testcontainers`, `@testcontainers/postgresql` | 12.2.2 | local real-Postgres tests | dev only; needs Docker (present) |
| `@octokit/auth-app` | 8.3.1 | GitHub App tokens (BACK-52) | alternative: hand-rolled JWT with `jose`; decide at BACK-52 |
| `@descope/node-sdk` | 2.22.0 | **not needed** for verification | skip unless a server-side Descope call appears |

Already in `server/`: NestJS 12.6.0, TypeScript 6.0.3, Jest 30.5.2, `@types/node` 24.19.2. **Not run yet:** Nest 12 plus `pg` plus `jose` clean import, any migration, any RLS test, Descope sessions, GitHub authorization, restore drill, key-rotation drill, exact-SHA CI.
Known debt: BACK-48 still has legacy "blocks" links to BACK-49, 50, 57 (the connected Atlassian tool cannot delete links). BACK-57 and the UI wiring wait on BACK-52.

## 12. Four separate authorizations

None is granted by this document.

| | Authorization | What it would allow | What it excludes |
| --- | --- | --- | --- |
| **A** | Implement local code and tests | Work on a feature branch from `main`; add the pinned dev and runtime dependencies in section 11; SQL migrations and tests against **disposable local Docker Postgres**; local identity tests with generated keys and a fake IdP; `.env.example` with no values; local commits | Any cloud resource, real provider, real credential, real data, push, PR, merge, deploy |
| **B** | Provision cloud resources | Neon project (Frankfurt, plan, spend alert); separate Kawalys Descope project and passwordless method; GitHub App **registration** with the section 8 permissions; creating the secrets | Installing the app on a repo, reading GitHub data, deployment |
| **C** | Access real GitHub data | Install the app on the one named repo; mint tokens; ingest Observations; run revocation drills | Any other repo, any write, Jira or Confluence |
| **D** | Deploy | Host, domain, TLS, spend cap, production secrets, release | Anything beyond the Personal Alpha |

## 13. Smallest implementation sequence

Each step is a separately reviewable PR (PR approval is separate). Stop at each gate.

1. **Gate A approved**, then **S1 (BACK-55 foundation):** migrator and app roles, workspace context, RLS invariant and cross-workspace tests, boot role checks, local Postgres harness, `audit_events` append-only trigger. Proof: items 1, 2 and 7 (audit part) of section 9.
2. **S2 (BACK-56):** identity port, Descope verifier with fake IdP, sessions, owner bootstrap, workspace and capability guards, 404 policy, `.env.example` and fail-fast config (the BACK-58 slice needed here). Proof: items 5 and 6.
3. **S3 (BACK-55 evidence):** typed evidence, investigations, human decisions with atomic audit, authorized read API, restart persistence. Proof: items 3, 4, 7.
4. **Stop for gate B** (Neon plus Descope project). Run migrations on Neon, one restore drill, one real passwordless sign-in. Do not call BACK-55 or BACK-56 Done before this evidence.
5. **BACK-52:** fixture contract adapter (gate A), then real repo ingestion (gate C). Proof: item 8 plus a live revocation drill. Do not close BACK-52 on fixture tests alone.
6. **Real UI integration (BACK-49, 50, 57):** the app calls the real authorized evidence API behind an explicit mode. Synthetic demo mode and the persona header stay for demos only. Unknown or denied must render as such, never Healthy. Keep V1, V2 and Arabic/RTL working.

## 14. Owner approval checklist

Only genuinely unresolved choices. Tick or replace the recommended default.

- [ ] **1. Accept this pack as the BACK-47 Personal Alpha addendum** (record on ADR-002 and BACK-47). BACK-47 stays To Do until section 11 evidence exists.
- [ ] **2. Grant gate A.** Include local commits on a feature branch, and a PR to `main` that I never merge? (default: yes to commits and PR, no merge)
- [ ] **3. Owner binding:** one-shot bootstrap by verified email in `KAWALYS_OWNER_EMAIL`, then subject-pinned (default), or another method?
- [ ] **4. Passwordless method:** email magic link first, passkey later (default), or passkey first?
- [ ] **5. First repo:** `Kemetra-Labs/Backstage-OS` (default), or name a different one (all org repos are public).
- [x] **6. Retention defaults:** Observations 180 days, decisions and audit kept until workspace deletion (default). *Accepted 2026-11-27 under the owner's delegation ([BACK-105 DEC-4](../BACK-105/cog-02-decisions.md)); no purge job is built, and the purge mechanism stays open.*
- [ ] **7. Neon (only needed for gate B):** Frankfurt, Launch plan, 7-day window, and **your monthly spend alert value**: `____`.
- [ ] **8. Dependencies:** approve `pg`, `jose` (exact pins chosen at install), `@testcontainers/postgresql` (dev); decide `@octokit/auth-app` vs hand-rolled JWT at BACK-52.
- [ ] **9. Hosting:** defer to gate D (default), nothing decided now.
