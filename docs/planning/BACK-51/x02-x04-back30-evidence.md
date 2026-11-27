# X02/X04 + BACK-30 restricted-existence: evidence pack

**Status: Evidence ready for owner review. NOT signed off.**
Date: 2026-11-27. Branch: `claude/x02-x04-evidence`. Gate row: "X02/X04 + BACK-30 restricted-existence security sign-off" in [demo-script-and-limits.md](demo-script-and-limits.md).

## 1. Scope

**Covered.** The single-owner Personal Alpha live path: the app in live mode (`VITE_KAWALYS_LIVE=1`), the Vite same-origin proxy, the Kawalys BFF (`server/src`) and PostgreSQL (`server/migrations/0001..0005`).

**Unauthorized viewers that exist on this path.** Only these three can reach it:

1. A signed-out caller, or one with an expired or revoked session.
2. Another workspace (row-level security).
3. The owner, after a source grant is revoked.

**Not claimed.**

- The full ADR-03 X02/X04 multi-user model (three roles per project). Only the `owner` role exists. `docs/ENGINEERING-REUSE-BEFORE-BUILD.md:37` still says X02/X04 are not delivered.
- User isolation inside one workspace beyond the database level. A second user cannot sign in over HTTP (`owner_binding` is a singleton), so that case is proven only in repository and database tests.
- Item-level permissions inside a source. Visibility is per source.
- A real Descope project, and deployed HTTPS.

**Method.** The audit was a code read plus the existing tests. It was not a penetration test. Its line references were re-checked on this branch on 2026-11-27. Files not touched since the audit base (`96ed80e`) keep the audit's line numbers. The files this branch changed have new numbers, shown below.

## 2. Controls

Code paths are relative to `server/src/` unless they start with `server/` or `app/`. Test paths are relative to `server/test/` unless they start with `app/`.

| # | Control | Code | Locking test |
|---|---|---|---|
| C1 | Global deny-by-default auth guard. Only `@Public()` routes skip it. | `auth/auth.module.ts:24`; `auth/auth.guard.ts:36-61`; `auth/public.decorator.ts:9`; `health/process.controller.ts:8`; `auth/auth.controller.ts:52`; `auth/lab/lab.controller.ts:20` | `auth/auth-http.spec.ts:134,139` |
| C2 | The owner directory is rechecked on every request. A changed or disabled owner ends the session. | `auth/auth.guard.ts:54-58`; `auth/identity/database-owner-directory.ts:26-33`; `auth/workspace-resolver.ts:26-39` | `auth/auth-http.spec.ts:222,231` |
| C3 | Capability check, deny by default. A refusal is a 404. | `auth/workspace.guard.ts:26-34`; `@RequireCapability` on every data route (`evidence/evidence.controller.ts:60,74,90,110,121`; `investigations/investigation.controller.ts:36,45`; `portfolio/portfolio.controller.ts:23,31`) | `auth/workspace.guard.spec.ts:38,42,46`; `evidence/decisions-db.spec.ts:393` |
| C4 | 401, 403 and 404 give the same `not_found` envelope, with a fixed message. | `http/safe-error.filter.ts:14,52-68`; `errors/safe-error.ts:16-28` | `auth/auth-http.spec.ts:96`; `app/e2e-live/negatives.spec.ts:21-34,41-46` |
| C5 | The persona header is never authorization on real routes. | `auth/auth.guard.ts:25-26`; `auth/workspace.guard.ts:3`; only `demo/evidence.controller.ts:18` reads it | `auth/auth-http.spec.ts:144,152`; `evidence/evidence-http.spec.ts:91`; `evidence/decisions-db.spec.ts:389`; `investigations/investigations-db.spec.ts:121`; `portfolio/portfolio-db.spec.ts:161`; `app/e2e-live/negatives.spec.ts:25` |
| C6 | Workspace isolation: RLS enabled, forced and scoped on every workspace table. A missing GUC returns no rows. | `server/migrations/0001_foundation.sql:10-12,53-91`; `0003_evidence.sql:26-172`; `db/workspace-context.ts:14-39` | `db/rls-coverage.invariant.spec.ts:138-215`; `db/db-security.spec.ts:40-124` |
| C7 | The runtime role cannot bypass RLS. | `db/runtime-role.ts:49-50` and the checks after it | `db/db-security.spec.ts:150-210` |
| C8 | All repository access goes through `runWithWorkspaceContext`. | `evidence/evidence.repository.ts:143-145`; `investigations/investigation.repository.ts:44,59`; `portfolio/portfolio.repository.ts:70`; `auth/workspace-resolver.ts:43` | `db/db-security.spec.ts:49,78` |
| C9 | Source-grant scoping. A decision is visible only if its project and every cited row are visible. | `evidence/evidence.repository.ts:58-71,264-288`; `evidence/visibility.ts:11-14` | `evidence/evidence-db.spec.ts:96,103,178,191,203`; `evidence/decisions-db.spec.ts:90,106,117` |
| C10 | Hidden ids and unknown ids give the same answer (one record: 404, a filter: `[]`). | `evidence/evidence.controller.ts:67-79`; `evidence/evidence.repository.ts:265-287`; `investigations/investigation.repository.ts:43,58`; `portfolio/portfolio.repository.ts:69` | `evidence/evidence-http.spec.ts:104`; `investigations/investigations-db.spec.ts:145`; `portfolio/portfolio-db.spec.ts:172`; `evidence/decisions-db.spec.ts:164` |
| C11 | A decision citing hidden, revoked, other-project or decision evidence is a 404, the same as absent. Grant rows are share-locked against a concurrent revoke. | `evidence/evidence.controller.ts:112-117,132-139`; `evidence/evidence.body.ts:30-34`; `evidence/evidence.repository.ts:350-366,412-455` | `evidence/evidence-db.spec.ts:220`; `evidence/evidence-http.spec.ts:136`; `investigations/investigations-db.spec.ts:93,154`; `evidence/notes-db.spec.ts:126,142,218` |
| C12 | The pagination cursor is bound to workspace, user and filter. Visibility is re-applied on every page. | `evidence/decision-cursor.ts:36-75`; `evidence/evidence.repository.ts:303-343`; `evidence/evidence.controller.ts:91-107` | `evidence/decision-cursor.spec.ts:12-53`; `evidence/decisions-db.spec.ts:290,314,347` |
| C13 | Rollups use granted rows only. Never-read is `unknown`, never ok. | `portfolio/portfolio.repository.ts:16-17,49-62,71-86`; `portfolio/portfolio.model.ts:124-156`; `evidence/evidence.types.ts:18-21` | `portfolio/portfolio-db.spec.ts:42,103,110,117,131`; `evidence/notes-db.spec.ts:89` |
| C14 | Session cookie `__Host-kawalys_session`: Secure, HttpOnly, SameSite=Strict. Only the hash is stored. Idle 1 h, absolute 8 h. | `auth/session/session-cookie.ts:6-32`; `auth/session/session.service.ts:34-61`; `auth/auth.config.ts:34-36` | `auth/auth-http.spec.ts:50,158,163,170,179,189`; `auth/session.spec.ts` |
| C15 | JSON-only body parser, no CORS, SameSite=Strict. | `server/src/create-app.ts:80` (`useBodyParser("json")`, after the Origin check) | `evidence/evidence-http.spec.ts:141`; `http/origin-check.spec.ts:41` (a refused request is never parsed) |
| C16 | The sign-in rate limit runs before the verifier. | `auth/auth.controller.ts:62-65`; `auth/sign-in-rate-limiter.ts:20-33` | `auth/auth-http.spec.ts:74`; `auth/sign-in-rate-limiter.spec.ts`; `auth/trust-proxy-http.spec.ts:38` |
| C17 | Unconfigured Descope denies all, with no network call. Production refuses to boot without the config. | `auth/auth.config.ts:95-111`; `auth/build-auth.ts:40-50` | `auth/auth-http.spec.ts:124,388,399,412`; `auth/auth.config.spec.ts:38,45` |
| C18 | The lab page needs `KAWALYS_AUTH_LAB=1`, is refused in production, and has a strict CSP. | `auth/auth.config.ts:75-81`; `auth/auth.module.ts:13-16`; `auth/lab/lab.controller.ts:22-29` | `auth/lab.spec.ts:46,55,78,86,93` |
| C19 | Errors never echo exception text. The request id is sanitized. `x-powered-by` is off. | `http/safe-error.filter.ts:52-68`; `errors/safe-error.ts:34-39`; `server/src/create-app.ts:73` | `http/app.spec.ts:125,135,142,152,163,174,179` |
| C20 | Evidence, citations and audit are append-only. A decision needs its audit row. | `server/migrations/0003_evidence.sql:146-178`; `0001_foundation.sql:104-123`; `0004_decision_audit.sql:25-51` | `evidence/evidence-db.spec.ts:73,167`; `db/db-security.spec.ts:249,264`; `evidence/decisions-db.spec.ts:417` |
| C21 | App: 401 and 404 both read as `not_found`, shown as unknown, never empty or healthy. | `app/src/live/http.ts:53-59,84-87`; `app/src/live/reads.ts:96-105`; `app/src/screens/investigation/RecordDecision.tsx:36-43` | `app/src/live/http.test.ts:24,94`; `app/e2e-live/negatives.spec.ts:57-59` |
| C22 | App: after sign-out or expiry no panel keeps the owner's data. | `app/src/live/session.ts:40-43,99-106`; `app/src/app/useLiveRead.ts:17-40`; `app/src/screens/investigation/ServerRecords.tsx:47-51` | `app/src/live/session.test.ts:219-242`; **e2e (new, L9):** `app/e2e-live/negatives.spec.ts:94-97` (after expiry), `:112-134` (after sign-out, with a positive control), `app/e2e-live/gate-path.spec.ts:46-49` |
| C23 | App: the Owner persona sees no source refs. Nontechnical gets no panel and no request. | `app/src/view/investigationReadView.ts:102-176`; `app/src/screens/investigation/ServerRecords.tsx:33-38,43`; `RecordDecision.tsx:105` | `app/e2e-live/negatives.spec.ts:169-189,191-206`; `app/src/view/investigationReadView.test.ts` |
| C24 | App: requests only through `src/live/http.ts`, relative `/api/`, same-origin credentials. | `app/src/live/http.ts:46-51,72-78` | `app/src/live/live.guard.test.ts:65,93,97,122`; `app/src/live/http.test.ts:17` |
| C25 | Fixture-mode nondisclosure (BACK-30 surface rules). | prototype path | `app/e2e/nondisclosure.spec.ts:26,36,45,64,80`; `app/src/view/nondisclosure.test.ts` |
| **N1** | **Origin / Sec-Fetch-Site guard on state-changing routes (M1).** Same-origin or an allowlisted Origin passes. A refusal is the standard 404, before the body is parsed. With neither header: allowed outside production, refused in production. | `http/origin-check.ts:24-39`; `config/allowed-origins.ts:12-28`; registered at `server/src/create-app.ts:71,78` | `http/origin-check.spec.ts:32,41,46,57,63,81,102,111,130,145`; `config/allowed-origins.spec.ts`; `deploy/pilot/smoke.sh:171-178` |
| **N2** | **Uniform error headers (L2).** Every error response carries `cache-control: no-store`, so a signed-out 404, an unknown-route 404 and an Origin refusal are identical. | `http/safe-error.filter.ts:66` | `http/error-hardening.spec.ts:41,52,64,88` |
| **N3** | **Demo route off with a database (L3).** `GET /demo/evidence/:id` is registered only when no database is configured. | `server/src/create-app.ts:57-59`; `demo/demo.module.ts`; `app.module.ts:4` | `http/error-hardening.spec.ts:137` |
| **N4** | **5xx log line (L6).** One fixed line: request id and exception class name, never the message. The class-name read cannot throw. | `http/safe-error.filter.ts:34-45,67` | `http/error-hardening.spec.ts:88,97,108`; `http/app.spec.ts:142` |
| **N5** | **Live sign-out and expiry leave no residue (L9).** | see C22 | `app/e2e-live/negatives.spec.ts:79,112`; `app/e2e-live/gate-path.spec.ts:5` |

Timing: a visible and a hidden id run the same single query. Only a malformed UUID short-circuits, and the caller already knows its own input is malformed.

## 3. Findings and disposition

No Critical or High finding.

| ID | Finding | Disposition |
|---|---|---|
| M1 | No Origin check on state-changing routes (decision pack item 9.5 not met). | **FIXED** in `cfe1193`. Tests: `origin-check.spec.ts`, `allowed-origins.spec.ts`, smoke checks `deploy/pilot/smoke.sh:171-178`. Reuse provenance: Retail-Tower-Erp `services/backend-core/apps/api/src/auth/origin-check.ts`, last commit touching it `e173468`. ADAPT of the origin-parsing idea only. The rule is different (exact-match allowlist, no Host-derived origin). |
| M2 | Project-level visibility keeps investigations and uncited decisions visible after a source is revoked (BACK-30 "derivatives" clause). Reachable only with more than one source per project; the alpha seed has one. | **OWNER RULING NEEDED** (R1). |
| L1 | The sign-in rate limit is shared by every caller behind a proxy, so one caller could lock the owner out of sign-in. | **DEFERRED to gate D.** Mitigated in the BACK-64 pilot stack: `KAWALYS_TRUST_PROXY` (`server/src/config/trust-proxy.ts`, present on this branch) makes the limiter key on the client address behind Caddy (`auth/auth.controller.ts:62-65`, test `auth/trust-proxy-http.spec.ts:38`). Without it, the single-bucket behaviour remains. Real-client behaviour behind deployed HTTPS is not testable locally. |
| L2 | A 404 header differential reveals which routes exist. | **FIXED** in `1d18aca` (N2). |
| L3 | The demo route is registered in every build and is gated by a display persona header. | **FIXED** in `1d18aca` (N3). |
| L4 | No Host allowlist. The `__Host-` cookie on `127.0.0.1` goes to every local port. | **DEFERRED to gate D.** Reason: needs a dedicated hostname, which does not exist before deployment. Partly eased by the Origin allowlist (N1). |
| L5 | A client-supplied `x-request-id` is stored in audit rows. | **DEFERRED to gate D.** Reason: the format is constrained, no injection is possible, and the fix changes the audit schema. |
| L6 | 5xx errors were not logged. | **FIXED** in `1d18aca` (N4). |
| L7 | Writes have no server-side rate limit or duplicate check. | **DEFERRED to gate D.** Reason: owner decision D5 (a); only the owner's own session can write. |
| L8 | Decision drafts stay in memory after the session expires. | **ACCEPTED by design** (owner decision D3 (b)), pending owner confirmation (R2). |
| L9 | No end-to-end test for records leaving the screen after sign-out or expiry. | **FIXED** in `1d18aca` (N5). |

**Info items (no action).**

- `sources.classification` is stored but never read. Visibility is grant-only, as the decision pack says. If a "restricted" source must ever need more than a grant, that becomes a High gap.
- `GET /decisions` returns `createdBy` (an internal user id). Matters only once there are several users.
- `audit.read` is a granted capability with no route. Nothing is exposed.
- `DELETE /auth/session` with an already-expired cookie is a 404 and does not clear the cookie. The app treats it as signed out. Harmless server-side.
- Item-level restrictions inside a source (for example Jira issue security levels) are not modelled. No connector is wired to HTTP, so this is outside this gate. Design it before a connector reads such a source.
- The decision pack's "spy proves no outbound call on a revoked grant" concerns the connector path, which is not on the live path. The repository-level refusal is `evidence/evidence-db.spec.ts:147`.

**Not testable locally:** a real Descope project; deployed HTTPS and `NODE_ENV=production` on the host; a provisioned managed PostgreSQL; a second real user over HTTP; real assistive-technology review; WebKit live e2e (CI only).

## 4. Owner rulings needed

1. **R1, M2.** Recommended: **option (a)**. Rule that investigations and uncited decisions are project-scoped, user-authored records, not derivatives of restricted evidence. Record the ruling on BACK-30. Option (b): require uncited decisions to cite at least one row, or bind an investigation to a source set. Option (a) is enough for the alpha because the alpha has one source per project.
2. **R2, L8.** Recommended: **accept**. Drafts staying in memory after expiry is owner decision D3 (b). Mention it in pilot guidance.
3. **R3, scope.** Recommended: **confirm** that sign-off covers only the Personal Alpha subset: the three viewer classes above, cross-user isolation proven at the database level only, and the full ADR-03 X02/X04 model not delivered.
4. **R4, deferred to gate D.** Recommended: **approve** the list L1, L4, L5, L7, plus real Descope verification and deployed HTTPS with `NODE_ENV=production` confirmed.

## 5. Sign-off

Owner name: ______________________

Date: ______________________

Decision (circle one): approve / approve with conditions / reject

Conditions or notes: ______________________
