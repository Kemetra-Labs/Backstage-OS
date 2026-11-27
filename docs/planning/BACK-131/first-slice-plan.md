# BACK-131 first slice: approved source identity, grant enforcement, revocation and reconnect

**Status: IMPLEMENTED on branch `claude/back131-source-identity` (owner approved the slice and decisions A-D as recommended, 27 Nov 2026). Review fixes applied: no per-call clock on `reconnectSource` (it uses the server clock), a runtime-unforgeable `Reauthorization`, a comment-proof caller guard, and the unique-violation race mapped to the uniform refusal. Evidence: server suite 1374/1375 (the one failure is a Windows-only file-mode test in untouched code); mutation checks (history check, freshness check, project lock removed) each fail tests.** Original preflight on
`origin/main` `92989d1` (27 Nov 2026 UTC). No real GitHub access, credentials, schema, role or dependency change is
proposed. Source of scope: the owner-approved "Final Execution Blueprint alignment" section on BACK-131 (Blueprint
SEC-01, R1 A+), BACK-52, BACK-127, BACK-172, BACK-128. The Confluence blueprint page was not found by title; the
alignment sections on the nine Jira issues were used as the blueprint.

## 1. Preflight result

| Check | Result |
| --- | --- |
| Entry condition (PR #160 merged, refresh main, inspect newer PRs) | Met. `main` = `92989d1`. No open PRs. PRs since the blueprint checkpoint (`ba2f1ed`) touch deploy, app sign-in and docs only: `git log ba2f1ed..origin/main -- server/src server/migrations` is empty, so the source/grant code is unchanged. |
| Overlapping Jira scope | BACK-52 (transport, immutable repository id, provider consent) is a **separate** slice. BACK-172 owns Blueprint SEC-03/04 (not this). BACK-127 owns SEC-02 (not this). BACK-128 (credential rotation) and BACK-116 (least-privilege AWS) are **open gates before real protected data**, not part of this slice. |
| GitHub write permissions | None possible today: `GitHubReadTransport` has a single `get(path)` and no implementation exists in `src/` (no fetch, client library or token). |
| Production reach of connect/disconnect/ingest | **None.** No controller exposes them. Their only non-test caller is `src/ops/local-stack.ts` (`local:up`), which refuses `NODE_ENV=production` (`:53`) and non-loopback databases. |

## 2. Existing controls (reuse, do not rebuild)

| Control | Where |
| --- | --- |
| A source is one row per `(workspace, provider, external_ref)`; `external_ref` is stored lower-case; the runtime role can only `SELECT`/`INSERT` it (no UPDATE or DELETE), so identities are immutable and never deleted | `server/migrations/0003_evidence.sql:34-53` |
| Grants are append-only history: revocation is one-way (`revoked_at`), a trigger refuses any other change, deletes and truncates are refused, one active grant per `(source, user)` | `0003_evidence.sql:56-91` |
| RLS forced and scoped by workspace on `sources` and `source_grants`; composite FKs keep source, project and investigation in one workspace and one project | `0003_evidence.sql:48-71` |
| Grant checked on every read path: evidence, decisions, investigations, portfolio, and the memory projection that feeds retrieval, reasoning and cognition | `evidence/visibility.ts:13`; `evidence.repository.ts:59,246,426,447`; `portfolio.repository.ts:17`; `memory/memory.sql.ts:34`; `investigation.repository.ts` |
| `connectSource`: reuse an existing source only in the same project and only by a user who held a grant before; nobody attaches to someone else's source; idempotent for an active grant | `evidence.repository.ts:180-209` |
| `disconnectSource`: revokes the actor's grant, audited, effective on the next read | `:212-221` |
| `ingest`: all-or-nothing; refuses a source with no active grant; the grant row is share-locked so a concurrent revoke waits or wins | `:238-262` |
| Real PG18.7 harness and least-privilege roles (`kawalys_app`) in tests | `test/db/pg-container.ts` (`postgres:18.7-alpine`), `test/db/store-harness.ts`, `test/db/db-security.spec.ts` |
| Existing tests for these controls | `test/evidence/evidence-db.spec.ts:89-152` (grants), `notes-db.spec.ts`, `decisions-db.spec.ts`, `portfolio-db.spec.ts`, `memory-db.spec.ts`, `retrieval-db.spec.ts`, `github-ingest-db.spec.ts` |

## 3. Missing controls (gaps against the BACK-131 acceptance)

| # | Blueprint requirement | Today | Gap |
| --- | --- | --- | --- |
| G1 | Reject an **unapproved initial binding**; an arbitrary first connect is not consent | Any actor can create any new source for any project (`:188-196`) | There is no notion of an approved identity |
| G2 | Reject an **unapproved second identity** in a pilot project (a second identity is allowed only if it is in that project's approved set) | A project can hold any number of sources | No approved set per project |
| G3 | Reject **replacement after revoke** and **conflicting historical identities** | After revoking X, connecting Y succeeds; X's history is ignored | Pin must survive revocation (history is already kept in `sources`) |
| G4 | **Reconnect only after explicit reauthorization; no caller bypass flag** | `connectSource` silently reconnects after the user's own revoke (`:199-207`); the path has **no test** | Reconnect is a side effect of connect; no reauthorization concept |
| G5 | Refused operations never create a successful grant or audit, or revive uncited project records | Refusals throw `NotVisibleError` before any write (good) but nothing asserts "no row, no audit, no revived record" | Missing negative assertions |
| G6 | **Cross-workspace calls** are refused cleanly | A foreign project id fails on a composite FK (a raw database error), rolled back | Needs a uniform refusal and a test |
| G7 | **Atomic** check-and-mutate under PG18.7 least-privilege roles, with **real concurrent** tests | Single transaction, but the "does this project already have a source" read is not serialised: two concurrent first-connects can both pass it | Needs a lock and concurrency tests (revoke vs reconnect, connect vs connect, ingest vs revoke) |
| G8 | Negatives for revocation, reconnect and ingest across **Portfolio, Investigations, decisions and Cognitive retrieval** | Covered one reader at a time | No single matrix proving all readers together, including after a refused reconnect |
| G9 | **Inventory every connect/disconnect/ingest caller; no production bypass** | Verified by hand above | No test fails if a production caller appears |

## 4. Proposed design (no schema, role or dependency change)

1. **Approved identity policy (server-side, fail-closed).** A small port `SourceApprovalPolicy` with
   `approvedIdentities(projectKey): readonly { provider, externalRef }[]` (owner ruling: a SET of approved identities per
   project key, not a single one), injected into `EvidenceRepository`. Production wiring reads it from server
   configuration, `KAWALYS_APPROVED_SOURCES` = comma-separated `<project-key>=<provider>:<owner>/<repo>` (the same key may
   repeat; lower-case refs; a malformed entry throws at startup); with nothing configured every connect is refused. New file `server/src/evidence/source-approval.ts`. The immutable provider
   repository id stays a BACK-52 prerequisite, so the identity here is `(provider, external_ref)`.
2. **`connectSource` becomes first-connect only.** Inside the transaction: take `pg_advisory_xact_lock` on the
   `(workspace, project)` key (needs no table privilege; `SELECT ... FOR UPDATE` on `projects` would need an UPDATE
   privilege the app role does not have), then: refuse unless the requested identity is in the approved set for the project's key; refuse if the
   project already has **any** source (active or revoked) outside that set (unapproved second identity, replacement,
   conflicting history); return the id idempotently for an active grant; **refuse** (do not reconnect) when the only grants
   are revoked; otherwise insert source, grant and the `source.connected` audit row. All refusals are `NotVisibleError`
   (same uniform 404 as today), before any write.
3. **`reconnectSource(workspaceId, actor, sourceId, reauthorization)`** is the only way back. The caller must pass a
   `Reauthorization` value (not a boolean): the sign-in time of the actor's current session, read by the server from the
   session record (`issuedAt` from `sessions.created_at`, `auth/session/postgres-session-store.ts:29`; the column is a database default that the login role cannot insert, `migrations/0002_identity.sql:27`). The repository enforces that it is recent
   (proposed: 5 minutes), that the source's identity is still in the approved set and every identity of the project is, that the actor held a grant before,
   and writes a new grant plus `source.reconnected` audit. History is preserved: no row is deleted or replaced.
4. **Nothing else changes:** `disconnectSource`, `ingest` and every reader keep their semantics, so the generic
   multi-source behaviour and all existing grant tests stay as they are.

## 5. Affected files

| File | Change |
| --- | --- |
| `server/src/evidence/source-approval.ts` (new) | `SourceApprovalPolicy` port, config-backed implementation, `Reauthorization` type and freshness rule |
| `server/src/evidence/evidence.repository.ts` | `connectSource` per section 4; new `reconnectSource`; constructor takes the policy; map foreign-workspace FK failure to `NotVisibleError` (G6) |
| `server/src/create-app.ts` | Wire the config-backed policy (fail-closed) |
| `server/src/ops/local-stack.ts` | `local:up` seeds through a policy that approves only its seed repository |
| `server/test/db/store-harness.ts` and the 12 other `new EvidenceRepository(` sites in `test/` | Pass a test policy (a helper under `test/` only, never exported from `src/`) |
| `server/test/evidence/evidence-db.spec.ts` | Keep existing cases green; add G1-G6 cases |
| `server/test/evidence/source-approval.spec.ts` (new) | Policy and reauthorization unit tests |
| `server/test/evidence/source-lifecycle-db.spec.ts` (new) | Concurrency (G7) and the all-readers matrix (G8) on real PG18.7 |
| `server/test/evidence/source-callers.guard.spec.ts` (new) | Fails if any `src/` file other than the repository and `ops/local-stack.ts` calls `connectSource`, `reconnectSource`, `disconnectSource` or `ingest` (G9) |

No migration, no new role or grant, no dependency, no app/UI change, no deploy.

## 6. Regression tests (write first, see them fail, then implement)

All DB tests run on disposable `postgres:18.7-alpine` as `kawalys_app`.

1. **G1** unapproved first connect: refused (`/not visible/`); `sources`, `source_grants` and `audit_events` row counts unchanged.
2. **G2** approved X connected, then Y in the same project: refused; counts unchanged.
3. **G3** X connected, disconnected, then Y: refused; then X by `connectSource`: refused; the source row, the revoked grant and the two audit rows are untouched.
4. **G3** an identity already bound in another project of the workspace: refused as today.
5. **G4** reconnect: `reconnectSource` with a stale reauthorization refuses; with a fresh one succeeds, writes `source.reconnected`, and the old revoked grant row is still present; `reconnectSource` for another user's source or an unapproved identity refuses. No parameter or option makes the stale case succeed (type-level: `Reauthorization` is not assignable from `boolean`).
6. **G5** after a refused connect or reconnect: no new grant or audit row, and an uncited decision of the revoked project stays hidden.
7. **G6** `connectSource` with a project id of another workspace: refused with the uniform error; no row in either workspace.
8. **G7 concurrency** (two real connections): (a) connect Y racing disconnect X, Y never wins; (b) reconnect racing disconnect: exactly one active grant or none, never two, audit order consistent; (c) two concurrent first connects of the approved identity: one source, one grant; (d) ingest racing revoke: either the evidence was committed before the revoke (and is hidden afterwards) or ingest is refused; **never** visible after a committed revoke.
9. **G8 matrix**: after revoke, and again after a refused reconnect, evidence list/get, decisions list, investigations, portfolio rollups (no counts, no health) and the memory read behind retrieval/cognition all return the same answer as for a source that never existed; compare against a never-existed baseline.
10. **G9** the caller guard above, plus a test that `GitHubReadTransport` still exposes only `get` (no write can be expressed).

## 7. Acceptance criteria

- All of section 6 passes locally on PG18.7; the existing server suite (`npm run check` in `server/`, Docker) and the other CI jobs stay green.
- Each refused operation: same uniform not-found, **zero** new rows in `sources`, `source_grants`, `audit_events`, `evidence`.
- No bypass: no boolean/force parameter; `connectSource` cannot reconnect; the caller guard test fails on a new production caller.
- No new dependency, migration, role or privilege; no secret, token or provider call anywhere in the diff or tests (the transport stays a port).
- Generic multi-source regressions (several sources per project through the test policy) still pass.
- Reviewed with the existing flow: independent review, `security-review`, and an auth review of the policy and reauthorization logic. Merge only on green and on your approval of this plan.

## 8. Decisions needed from the owner before building

| # | Decision | Recommendation |
| --- | --- | --- |
| A | Where the approved identity lives for this slice | **Server configuration, fail-closed** (no schema): a set of approved identities per project key, read from `KAWALYS_APPROVED_SOURCES`. A database table of approvals is better later, once BACK-52 needs an operator flow and immutable repository ids; it needs its own schema approval. |
| B | What counts as "explicit reauthorization" | **Sign-in of the current session within 5 minutes** (the owner signs in again by magic link, then reconnects). Alternative: a separate step-up flow, which needs a Descope flow and is a larger slice. |
| C | Constructor change touches 13 call sites (tests mostly) | Accept; the test policy lives under `test/` only |
| D | Refused attempts: log only vs a separate refusal audit row | Log a fixed line only; the blueprint says refused operations create no successful grant or audit |

## 9. Out of scope here, and the order after this slice

- **BACK-127 (SEC-02):** protected-screen and draft locking, expiry, reauthentication in the app. Next, app and session code.
- **BACK-172 (SEC-03/04):** server-generated audit operation id, server-side write rate and idempotency, Host allowlist and trusted-client attribution (L1/L4/L5/L7). Some items may need schema, which stays separately gated.
- **BACK-52:** real read-only GitHub App for one explicitly approved repository: exact app, scopes and immutable repository id, owner approval of installation, grant check before every network request, **no provider call after a committed revoke** (tested with a spying transport), BACK-128 custody first.
- **BACK-49 / 148 / 50:** Portfolio and Investigation on the authorized observations.
- **Real-source gate (not satisfied):** BACK-128 (rotate the exposed Neon passwords) and BACK-116 (least-privilege AWS identity) are open; no real GitHub data is read until they and this slice are done.

## 10. How the required security checks map to slices

| Required verification | Proven by |
| --- | --- |
| Unauthenticated and unauthorized access | Existing (`auth-http.spec.ts`, live probes in the evidence bundle); extended per slice |
| Expired and revoked sessions | Existing server tests; app-side locking is BACK-127 |
| Revoked source grants | This slice (G5, G7, G8) |
| Cross-project and cross-workspace isolation | Existing RLS tests; this slice adds G3 (4) and G6 |
| No provider calls after committed revocation | BACK-52 (no transport exists yet, so none can happen today); the policy that gates calls is built in this slice |
| No restricted data, counts or derived status leakage | This slice (G8 matrix against a never-existed baseline) |
| No GitHub write permissions | Structural today (read-only port, no client); asserted by test 10 |
| No credentials in browser storage, logs or documentation | Browser storage checked (evidence bundle section 2); logs and docs reviewed per slice; BACK-128 for custody |
