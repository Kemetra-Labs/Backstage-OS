# BACK-172: shared HTTP write, audit and host hardening (Blueprint SEC-03/04, R4 A+)

**Status: IMPLEMENTED on branch `claude/back172-http-hardening` (owner approved the slice and H(a), I, J, K on 28 Nov 2026). Gate A proven locally (server 1441/1442 with only the Windows file-mode test failing, live e2e 22/22, pilot smoke ALL PASS). Gate B (deployed attribution, Host via Cloudflare) waits for the next deploy, which also needs `KAWALYS_ALLOWED_HOSTS=kawalys.kemetralabs.com,localhost,127.0.0.1` in `.env.pilot`.** Read-only preflight on `origin/main` `8bf802d` (27-28 Nov 2026 UTC).
Scope: the owner-approved Blueprint alignment on BACK-172 (L1, L4, L5, L7 from the X02/X04 evidence pack). Gate A is code and
security proof locally; Gate B proves the deployed settings with BACK-117. No Redis, new service, dependency or schema change
is proposed.

## 1. Preflight

| Check | Result |
| --- | --- |
| Newer work | BACK-131 (#173) and BACK-127 (#174) merged; neither touches these controls. No open PRs. |
| R1-R4 (BACK-51) | Still **owner rulings, not supplied**. This plan does not assume them. |
| Write routes in scope (representative existing endpoints) | `POST /investigations/:id/decisions`, `POST /investigations/:id/notes` (`server/src/evidence/evidence.controller.ts:109-129`). Sign-in already has its own limiter. |

## 2. Existing controls (kept as they are)

| Control | Where |
| --- | --- |
| Origin / Sec-Fetch-Site guard before any route; a refusal is the uniform 404 before the body is parsed | `server/src/http/origin-check.ts`; `create-app.ts:84-87` |
| JSON-only body parser, no CORS, SameSite=Strict cookie | `create-app.ts:87` |
| Uniform not_found, `no-store` on every error | `http/safe-error.filter.ts` |
| Trusted proxies only by explicit list (no `/0`, no `true`); Caddy takes the client address only from Cloudflare's ranges (`CF-Connecting-IP`) and forwards it as `X-Forwarded-For` | `config/trust-proxy.ts`; `deploy/pilot/Caddyfile:5-7,79-81` |
| Sign-in limiter keyed per client, before the verifier | `auth/sign-in-rate-limiter.ts`; `auth.controller.ts` |
| Audit rows append-only, `id` and `occurred_at` set by the database only, RLS by workspace; a decision cannot exist without its audit row | `migrations/0001_foundation.sql:74-103`; `0004_decision_audit.sql` |
| Granted rows share-locked when a decision cites them | `evidence/evidence.repository.ts` (C11) |
| Client: one submit at a time, the draft is kept on failure or unknown outcome | `app/src/live/decisions.ts`, `RecordDecision.tsx` |

## 3. Gaps

| # | Requirement | Today | Gap |
| --- | --- | --- | --- |
| G1 (L5) | Server-generated audit correlation, separate from sanitized client correlation | `request_id` in audit rows is the **client's** `x-request-id` when it passes the format check (`http/request-id.ts:15-17`, `audit-row.writer.ts`) | The authoritative correlation id is client-chosen |
| G2 (L7) | Per principal/workspace/action write limits and bounded payload before expensive writes | No write limit; body size is the framework default (~100 kB) | Missing limiter; payload cap implicit |
| G3 (D5 (b)) | Idempotency scoped to principal/workspace/action and request hash; same retry = same committed outcome, no duplicate audit; conflicting reuse rejected; concurrency and revoke races re-authorize | None: a retry after a timeout records a second decision with its own audit row | Missing contract and storage |
| G4 | Unknown network outcome: the UI keeps intent, never claims success, never silently decides twice | The draft is kept, but a manual retry sends a **new** request (a duplicate if the first one committed) | Retry must reuse the key |
| G5 (L4) | Reject unknown hosts; never trust arbitrary forwarded headers | Caddy serves only the site address, but the BFF has no Host allowlist | No BFF-level Host check |
| G6 (L1) | Real Cloudflare/Caddy client attribution proven; spoofed headers ignored; sign-in limit isolated per client | Unit-tested locally (`trust-proxy-http.spec.ts`); not proven on the deployed path | Gate B proof |

## 4. Design

1. **Audit correlation (G1).** `requestIdMiddleware` always generates a server UUID as `req.requestId` (the value stored in
   `audit_events.request_id`, echoed in `x-request-id` and in error envelopes). A sanitized client `x-request-id`, if present,
   is kept as `req.clientRequestId` and stored only in audit `metadata.client_request_id`. Actor ids keep coming from the
   session principal only. No schema change.
2. **Write limits (G2).** A small in-memory fixed-window limiter (same pattern as the sign-in limiter, no Redis) keyed by
   `workspace:principal:action`, applied in the controller before the repository call: decisions 30/min, notes 30/min. A refusal
   is 429 with `no-store` (as sign-in). Explicit JSON body limit `32kb` (the largest valid decision is about 12 kB).
3. **Idempotency (G3), storage in the existing audit rows.** Optional `Idempotency-Key` header (8-64 chars `[A-Za-z0-9-]`) on the
   two write routes. Inside the write transaction: `pg_advisory_xact_lock` on `(workspace, principal, action, key)`, then look up
   an audit row of that action by that actor with `metadata.idempotency_key_hash` (SHA-256 of the key) within 24 h. Found with
   the same `metadata.request_hash` (SHA-256 of the canonical body): return the same id and write nothing; found with a different
   hash: 422 `idempotency_conflict`; not found: write as today and store both hashes in the audit row's metadata. The replay is
   re-authorized: if the caller can no longer see the recorded decision (revoked citation), it answers the uniform 404, never the
   id. No key: today's behaviour.
4. **Client retry (G4).** The app generates the key with `crypto.randomUUID()` when a submit starts, keeps it in memory with the
   draft, sends the same key on a retry after an unknown outcome, and drops it when the draft changes or is recorded. The result
   copy never says "recorded" without a 201.
5. **Host allowlist (G5).** `KAWALYS_ALLOWED_HOSTS` (comma-separated host names, optional port), checked right after the request id
   and before the Origin check; an unknown `Host` gets the uniform 404. **Required in production** (boot fails without it, like
   the Descope settings); unset outside production keeps local and test runs unchanged. The pilot sets
   `kawalys.kemetralabs.com` in `.env.pilot` at the next deploy (BACK-117, with your deploy approval).
6. **Gate B (G6), at the next deploy:** prove from outside that a forged `X-Forwarded-For` / `CF-Connecting-IP` is ignored, that
   the sign-in limit counts per real client, that an unknown `Host` through Cloudflare gets 404, and that the Origin guard holds.

## 5. Affected files

| File | Change |
| --- | --- |
| `server/src/http/request-id.ts`, `server/src/audit/audit-row.writer.ts`, `server/src/errors/safe-error.ts` | Server correlation id; client id to metadata |
| `server/src/http/write-rate-limiter.ts` (new), `server/src/evidence/evidence.controller.ts` | Limiter before the two writes; idempotency header parsing |
| `server/src/evidence/idempotency.ts` (new), `server/src/evidence/evidence.repository.ts` | Lookup/store under the advisory lock, request hash, replay re-authorization |
| `server/src/config/allowed-hosts.ts` (new), `server/src/http/host-check.ts` (new), `server/src/create-app.ts` | Host allowlist, production-required; explicit body limit |
| `app/src/live/decisions.ts`, `app/src/live/http.ts`, `app/src/screens/investigation/RecordDecision.tsx` | Key per submit attempt, reused on retry |
| `deploy/pilot/` docs and `.env` example, runbook | `KAWALYS_ALLOWED_HOSTS` documented; Gate B checklist (no secret) |
| Tests | server: `request-id`, `write-rate-limit-http`, `idempotency-db` (concurrency, revoke, conflict), `host-check`; app: `decisions.test.ts`, `recordDecision.test.ts`; live e2e: retry after a dropped response records one decision |

## 6. Tests (red first)

- G1: a client `x-request-id` never reaches `audit_events.request_id`; it appears only in `metadata.client_request_id`; error envelopes carry the server id.
- G2: the 31st decision in a minute by one principal is 429 with `no-store`; another principal or workspace is unaffected; a 33 kB body is refused before the repository runs.
- G3: same key + same body twice: one decision, one audit row, same id; same key + different body: 422, nothing written; two concurrent requests with one key: one row; the replay after the cited source was revoked: uniform 404, no id; a key from another principal or workspace never matches; keys older than 24 h do not match.
- G4 (browser): the first decision response is dropped (route aborted after the server committed); the user retries; exactly one decision is listed and the result says recorded only after a 201.
- G5: unknown Host 404 with the same envelope as other refusals; listed host passes; production boot fails without `KAWALYS_ALLOWED_HOSTS`; loopback test runs unaffected when unset outside production.

## 7. Acceptance

Section 6 passes; full server suite, app unit, `app-e2e` and `live-e2e` green; no schema, dependency or new service; no-store,
uniform refusal and nondisclosure preserved. Gate B evidence recorded at the next deploy. Independent review, security review,
CodeRabbit. Merge on green and your approval.

## 8. Decisions for the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| H | Where idempotency records live | **(a) In the existing audit row's metadata** (no schema; the audit row is already mandatory and append-only). (b) A dedicated table: cleaner queries and expiry, but needs schema approval. |
| I | Limits and key lifetime | **Decisions and notes 30/min per principal per workspace; body 32 kB; key valid 24 h.** This amends D5 (a) to D5 (b). |
| J | Audit correlation | **Server UUID is authoritative; the client id is kept only as metadata.** |
| K | Host allowlist | **Required in production; the pilot value is set at the next deploy** (needs your deploy go-ahead then). |
