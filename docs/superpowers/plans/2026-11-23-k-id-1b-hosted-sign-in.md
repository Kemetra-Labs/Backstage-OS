# K-ID-1b: Real Hosted Sign-in (Owner Lab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner signs in through a real, separate Kawalys Descope project, in an isolated loopback lab, and gets a Kawalys session from the BFF; a Retail Tower token and a non-owner Kawalys user are refused.

**Architecture:** The merged foundation (PR #76, plus durable Postgres sessions and owner binding from PR #77) already verifies Descope JWTs and issues sessions; it has never seen a real token. This slice adds three things: a lab-only sign-in page served by the BFF (Descope web component, same origin, so no CORS and the `__Host-` cookie works), a rate limit on `POST /auth/session`, and operator-safe refusal reasons, so a real `iss` / `aud` mismatch can be diagnosed without logging claims. The rest is owner decisions, Descope console configuration and a runbook with recorded evidence. React screens stay unchanged; wiring `app/` to sign-in is a later slice.

**Tech Stack:** NestJS 12 BFF (`server/`), `jose` 5.10.0, Descope web component `@descope/web-component@4.6.3` (MIT, published 2026-11-05) from a pinned CDN URL with SRI, Jest 30.

**Spec:** `docs/planning/BACK-14/README.md` sections 3, 4 and 7 (K-ID-1b row and STOP list); `server/README.md` "Authentication (BACK-47, BACK-56)".

## Global Constraints

- Separate Kawalys Descope project. Never the Retail Tower project, its keys, users or `DESCOPE_*` variables (BACK-14 section 3).
- No secret is needed or allowed. Project id and owner user id are identifiers, not secrets. No Descope management key, access key or SMTP credential enters the repo, env files or transcript.
- Lab is loopback only (`127.0.0.1`), owner-run, owner-approved. Production never serves the lab page: `KAWALYS_AUTH_LAB=1` with `NODE_ENV=production` refuses to boot.
- Unknown is never healthy; every denial stays the `not_found` envelope (M05-D05-B). A rate-limit hit is `rate_limited` (429), the existing code.
- No new npm dependency. The web component is loaded by the lab page only, from `https://unpkg.com/@descope/web-component@4.6.3/dist/index.js` with an `integrity="sha384-…"` hash and `crossorigin="anonymous"`.
- Tokens are never stored by the page (no localStorage, sessionStorage or cookie writes from script) and never logged by the server. Claude never receives a real token; owner-run steps paste nothing into chat.
- English-first copy; the lab page is an operator tool, not a product screen, so Arabic is not required (state this on the page).
- Commit format `<type>: <description>`; no commit, push or merge without owner approval.

## Review Focus

1. **The web component reports success but sends no `sessionJwt`** (for example the flow ended in a pending MFA state): the page must show "Sign-in did not complete" and call nothing. Test in Task 2 asserts the page script guards `detail.sessionJwt`.
2. **Repeated sign-in clicks or a refresh loop**: the limiter must answer 429 after the limit without calling the verifier. Test in Task 1 asserts the verifier saw at most `limit` tokens.
3. **Lab flag set by accident in production**: boot must fail with a variable-name-only message. Test in Task 2.
4. **A real token refused for a claim mismatch**: the operator log must name the jose code and the claim name (`iss`, `aud`, `exp`, `nbf`, `iat`, `sub`) and nothing else. Test in Task 3 asserts no claim value appears.
5. **Clock skew between the laptop and Descope larger than 5 s**: a fresh token is refused with `ERR_JWT_CLAIM_VALIDATION_FAILED claim=nbf|iat`. The runbook's troubleshooting table covers it; no code change.

---

### Task 0: Owner decisions and Descope project (owner-run, no code)

These are the K-ID-1b gates in BACK-14 section 7. Record each answer in the runbook (Task 4) before Task 5.

| Gate | Decision needed | Recommendation |
| --- | --- | --- |
| Entitlement | Descope plan, renewal and overage | Free tier is enough for one owner; confirm the current limits in the Descope console |
| Region | Data region of the new project | The region closest to the owner that Descope offers; record it |
| Sign-up | Who can create an account | Self sign-up **off**; the owner user is created in the console |
| Methods / MFA | Login methods (decision pack section 14, item 4) | Email magic link first, passkey once the hosting domain is fixed (the pack's default; it needs no relying-party domain). No password |
| Session lifetime | Descope session JWT TTL and refresh TTL | Keep Descope's session JWT short (10 min default); Kawalys session stays 8 h absolute / 1 h idle unless you change `KAWALYS_SESSION_*` |
| Revocation | How access is pulled | Disable the user in Descope (blocks new sign-ins) plus `DELETE /auth/sessions` (kills existing Kawalys sessions) |
| Secrets | Storage | None needed for this slice (no management key) |
| Lab | Approval | Owner approves a loopback-only lab run on their machine |
| Gate B | Authorization to provision | Creating the Kawalys Descope project is part of gate B (`docs/planning/BACK-47/PERSONAL-ALPHA-DECISION-PACK.md` section 12), not yet approved. Tasks 1-4 need no gate; Task 0 Step 1 and Task 5 wait for it |

- [ ] **Step 1:** Owner creates a new Descope project named `Kawalys` (console, or Claude via the Descope MCP only after an explicit yes in chat). Never reuse or copy the Retail Tower project.
- [ ] **Step 2:** In that project: disable self sign-up; configure the `sign-in` flow with the chosen methods; add `http://127.0.0.1:8787` to approved domains.
- [ ] **Step 3:** Create the owner user and one test user (`lab-stranger`) for the refusal check. Record the owner user id (`U…`) and project id (`P…`) in the runbook. These are identifiers, not secrets.

### Task 1: Rate limit on `POST /auth/session`

**Files:**
- Create: `server/src/auth/sign-in-rate-limiter.ts`
- Modify: `server/src/auth/auth.controller.ts` (call the limiter before `bearerFrom`), `server/src/auth/build-auth.ts` (construct it), `server/src/auth/auth.module.ts` (provide it), `server/src/auth/auth.tokens.ts` (`SIGN_IN_LIMITER` symbol), `server/src/auth/auth.config.ts` (new setting)
- Test: `server/test/auth/sign-in-rate-limiter.spec.ts`, `server/test/auth/auth-http.spec.ts`

**Interfaces:**
- Consumes: `AuthOverrides.clock: () => number`, `AuthConfig`.
- Produces: `class SignInRateLimiter { constructor(now: () => number, limitPerMinute: number); tryAcquire(key: string): boolean }`; `AuthConfig.signInLimitPerMinute: number` from `KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE` (integer 1-100, default 10, malformed throws `AuthConfigError`); `AuthDeps.limiter: SignInRateLimiter`.

- [ ] **Step 1: Write the failing tests**

In `sign-in-rate-limiter.spec.ts`: `allows the limit within one minute, refuses the next` (limit 3: three `true`, fourth `false`); `a new window starts 60 s after the first attempt` (advance clock 60_000, `true` again); `keys are independent` (`'a'` exhausted, `'b'` still `true`); `memory stays bounded: expired keys are dropped` (1000 keys, advance 61 s, one new acquire, internal size is 1; expose `size(): number` for the test).

In `auth-http.spec.ts`: `answers 429 rate_limited after the limit and never calls the verifier for refused attempts`: 10 POSTs with `TOKENS.refused`, then an 11th with `TOKENS.owner`. Expect the 11th status 429, `body.error.code === 'rate_limited'`, no `set-cookie`, and `t.verifier.seen.length === 10`. Then advance the clock 60_000 and expect the owner sign-in to return 200.

In `auth.config.spec.ts`, add `KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE` values `'0'`, `'101'` and `'ten'` to the malformed table, plus a default assertion of 10.

- [ ] **Step 2:** Run `node --experimental-vm-modules node_modules/jest/bin/jest.js --testMatch "**/test/auth/**/*.spec.ts"` from `server/`. Expected: FAIL, the module is missing and the 11th call is 404.
- [ ] **Step 3: Implement.** A fixed window per key: a `Map<string, { start: number; count: number }>` replaced immutably, sweeping entries older than 60 s on each acquire. The key is the request's remote address (`req.socket.remoteAddress ?? 'unknown'`); with a loopback BFF this is effectively a global limit, which is intended. On refusal the controller throws `new HttpException('', 429)` before reading the Authorization header. The existing filter maps it to `rate_limited`.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run the full suite with `--testMatch "**/test/**/*.spec.ts"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: rate limit the sign-in exchange (K-ID-1b)`

### Task 2: Lab sign-in page (loopback lab only)

**Files:**
- Create: `server/src/auth/lab/lab.controller.ts`, `server/src/auth/lab/sign-in-page.ts`
- Modify: `server/src/auth/auth.config.ts` (`lab: boolean`), `server/src/auth/auth.module.ts` (register `LabController` only when `deps.lab`), `server/src/auth/build-auth.ts` (pass `lab`)
- Test: `server/test/auth/lab.spec.ts`

**Interfaces:**
- Consumes: `AuthConfig.descope.projectId`, `@Public()`.
- Produces:
  - `AuthConfig.lab: boolean`. It is true only when `KAWALYS_AUTH_LAB === '1'`; any other non-empty value throws, and `'1'` together with `NODE_ENV=production` throws `AuthConfigError` naming `KAWALYS_AUTH_LAB`.
  - `renderSignInPage(projectId: string, nonce: string): string`.
  - Route `GET /auth/lab`, public, which exists only when lab is on and the project is configured.
  - `AuthDeps.lab: boolean`, which `AuthModule.register` reads.
- Tests turn the lab on through `process.env` (`KAWALYS_AUTH_LAB`, `KAWALYS_DESCOPE_PROJECT_ID`, `KAWALYS_OWNER_SUBJECT`), saved and restored as in the `boot configuration` block of `auth-http.spec.ts`. There is no lab override in `AuthOverrides`.

- [ ] **Step 1: Write the failing tests** in `lab.spec.ts`:
  - `GET /auth/lab is absent (404 envelope) when the lab flag is off`
  - `production refuses KAWALYS_AUTH_LAB=1`, which rejects with `AuthConfigError`
  - `serves the page with a strict CSP and no caching when on`. The page answers 200 with `content-type` `text/html`, `cache-control: no-store`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, and a `content-security-policy` that contains `default-src 'none'`, `script-src 'nonce-<n>' https://unpkg.com`, `connect-src 'self' https://api.descope.com`, `frame-ancestors 'none'`. The nonce in the header must equal the nonce on the inline `<script>` and must change per request.
  - `pins the web component by exact version and SRI`. The body contains `https://unpkg.com/@descope/web-component@4.6.3/dist/index.js`, `integrity="sha384-` and `crossorigin="anonymous"`.
  - `never stores a token and only posts the session JWT`. The body does not match `/localStorage|sessionStorage|document\.cookie|refreshJwt/`, and it contains `if (!detail || typeof detail.sessionJwt !== 'string')`.
  - `injects only the validated project id`. Expect `renderSignInPage('P<script>', 'n')` to throw.
- [ ] **Step 2:** Run with `--testMatch "**/test/auth/lab.spec.ts"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The page has `<descope-wc project-id flow-id="sign-in">` and one nonce'd inline script. On `success`, it reads `detail.sessionJwt`, POSTs it to `/auth/session` with `Authorization: Bearer`, then GETs `/auth/me` and prints only the returned `user.id`. On `error`, or when `sessionJwt` is missing, it prints "Sign-in did not complete".
  - The page also states: "Lab tool. Loopback only. English only."
  - The SRI value is computed once, at implementation time, as `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`, and written as a constant with that command in a comment.
  - If the owner run in Task 5 shows the component needs more CSP hosts (for example `https://static.descope.com` for flow assets), add exactly those to the test and the header, and record them in the runbook.
- [ ] **Step 4:** Run the lab spec, then the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: loopback-only lab sign-in page for the Descope owner lab (K-ID-1b)`

### Task 3: Operator-safe refusal reasons

**Files:**
- Modify: `server/src/auth/identity/identity-verification.port.ts`, `server/src/auth/identity/descope-verifier.ts`, `server/src/auth/auth.controller.ts`
- Test: `server/test/auth/descope-verifier.spec.ts`, `server/test/auth/auth-http.spec.ts`

**Interfaces:**
- Produces:
  - The refused variant becomes `{ kind: "refused"; reason?: RefusalReason }`.
  - `type RefusalReason = { code: string; claim?: "iss" | "aud" | "exp" | "nbf" | "iat" | "sub" | "drn" }`. `code` is a jose `ERR_*` value from `REFUSED_CODES`, or `"KAWALYS_TOKEN_KIND"` (`drn` is not `DS`, or `token_type` is `refresh`; the #77 allowlist), `"KAWALYS_IMPERSONATION"` (`act` or `dact` present), `"KAWALYS_BAD_SUBJECT"` or `"KAWALYS_INPUT"`.
  - The claim is taken from jose's `err.claim` only when it is in the allowlist.
  - Clients still see nothing: the controller response is unchanged.

- [ ] **Step 1: Write the failing tests:**
  - In `descope-verifier.spec.ts`:
    - a wrong audience gives `{ kind: 'refused', reason: { code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'aud' } }`
    - a wrong issuer gives `claim: 'iss'`
    - a refresh token (`drn: 'DSR'`) and a token with no `drn` both give `code: 'KAWALYS_TOKEN_KIND'`
    - a token carrying `act` gives `code: 'KAWALYS_IMPERSONATION'`
    - a Retail Tower shaped token gives a reason whose `JSON.stringify` contains neither `P2rtProject0001` nor the subject
    - update the existing `nothing leaks` test so its key check allows `kind` and `reason` only
  - In `auth-http.spec.ts`, `in lab mode a refusal logs one fixed line with code and claim; outside lab mode it logs nothing`. Expect `['identity token refused: ERR_JWT_CLAIM_VALIDATION_FAILED claim=aud']` when the lab is on, and no call otherwise. The HTTP response stays identical (reuse `shape`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `classify` builds the reason from `code` and the allowlisted `claim` only. The controller logs refusals only when `deps.lab` is true, so a refusal in normal operation stays silent (attack noise).
- [ ] **Step 4:** Run the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: operator-safe refusal reasons for lab diagnosis (K-ID-1b)`

### Task 4: Lab runbook and evidence template

**Files:**
- Create: `docs/planning/BACK-56/K-ID-1b-lab-runbook.md`
- Modify: `server/README.md` (routes table: `GET /auth/lab`; config table: `KAWALYS_AUTH_LAB`, `KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE`; drop "rate limiting" from "Not done here")

- [ ] **Step 1:** Write the runbook with these parts:
  1. **Gates.** The Task 0 table, with an answer column the owner fills in.
  2. **Start the lab.** The exact commands, in PowerShell:
     ```powershell
     $env:KAWALYS_DESCOPE_PROJECT_ID='P…'
     $env:KAWALYS_OWNER_SUBJECT='U…'
     $env:KAWALYS_AUTH_LAB='1'
     npm run build && npm start
     ```
     Then open `http://127.0.0.1:8787/auth/lab`. Run the first pass with no `KAWALYS_DATABASE_URL_*` set (in-memory sessions). With the database, the first owner sign-in writes the permanent `owner_binding` row, so bind only after (f) has confirmed the real issuer; a wrong issuer bound there fails closed until an operator moves the binding.
  3. **Evidence checklist.** Each item records only the date, the result and the server's fixed log line, never a token or email:
     - (a) the owner signs in, the page shows the owner's user id (`kawalys-owner` in memory, a uuid with the database), and `/auth/me` returns 200;
     - (b) `lab-stranger` signs in and is refused (`not_found`);
     - (c) a Retail Tower session token is refused. The owner gets it from their own RT lab sign-in and sends it themself with `curl -X POST -H "Authorization: Bearer <token>" http://127.0.0.1:8787/auth/session`. Expect 404 and a log line with `iss`/`aud` or `ERR_JWKS_NO_MATCHING_KEY`. Never paste the token into chat or a file;
     - (d) `DELETE /auth/sessions` from the page's session ends it, and `/auth/me` returns 404;
     - (e) disabling `lab-stranger`, or the owner, in Descope blocks a new sign-in;
     - (f) the observed `iss` matches `https://api.descope.com/v1/apps/<project id>`, shown by sign-in success; if it differs, set `KAWALYS_DESCOPE_ISSUER`.
  4. **Troubleshooting.** A table keyed by the refusal log line: `claim=aud`, `claim=iss`, `claim=nbf|iat` (clock skew), `ERR_JWKS_*` / `identity provider unavailable` (network), and 429 (wait 60 s).
  5. **Stop and clean up.** Stop the server, unset the env vars, keep the project for K-ID-2.
- [ ] **Step 2:** Run `git diff --check`. Expected: no whitespace errors.
- [ ] **Step 3: Commit** `docs: K-ID-1b owner lab runbook and evidence checklist`

### Task 5: Owner lab run and acceptance (owner-run)

- [ ] **Step 1:** Owner completes Task 0 and runs the runbook's evidence checklist (a)-(f) on their machine.
- [ ] **Step 2:** Owner fills the evidence section (dates, pass/fail, fixed log lines only). Claude reviews it. A claim is PASS only if it is backed by a recorded line; any missing item is reported as not verified.
- [ ] **Step 3:** If (f) needed `KAWALYS_DESCOPE_ISSUER` or extra CSP hosts, add a regression test for the observed real values (Task 2 / Task 3 files), run the suite, commit `fix: align verifier with the observed Kawalys Descope token shape`.
- [ ] **Step 4:** One draft PR for Tasks 1-5 with the reuse report; owner approves merge.

## Out of this slice

Wiring `app/` (React) to sign-in and the BFF, an `Origin` check on state-changing routes (decision pack section 4; the lab is same-origin and #77 parses JSON bodies only), Neon provisioning and the restore drill (gate B, BACK-55), deployment and TLS, team members, and the first GitHub source connection (K-SRC-0, after ADR-04 and the BACK-7 gate).
