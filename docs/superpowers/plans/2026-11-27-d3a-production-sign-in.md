# D3(a) Production Sign-in (option B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can sign in on the deployed pilot through a `/sign-in` route inside the React app (Descope magic link), using the existing server exchange and Kawalys session cookie.

**Architecture:** In live mode only, the path `/sign-in` renders a page that lazy-loads `@descope/web-component` (flow `sign-in`), receives the Descope session JWT in the component's `success` event, sends it once to `POST /api/auth/session` through the request module, then calls the component SDK `logout()` so no Descope token stays in browser storage, then returns to `/`. The server, cookie and `SessionStore` are unchanged. The fixture build contains no sign-in code path and makes no request.

**Tech Stack:** React 19, Vite, Vitest (node environment), `@descope/web-component@4.6.3` (MIT; its dependencies include `@descope/web-js-sdk` and `@fingerprintjs/fingerprintjs-pro`: list them in the PR).

**Spec:** `docs/planning/BACK-51/d3a-production-sign-in-design.md` (option B, owner-approved 27 Nov 2026 with "Do all recomnded").

## Global Constraints

- Only `app/src/live/http.ts` may name a request API; only listed modules may import it (`app/src/live/live.guard.test.ts`). Extend the guard's importer list deliberately, with its test, for the one new module.
- No absolute URL in `app/src/live/*`; every `/api/` path literal lives in `app/src/live`.
- The default (fixture) build makes no request and ships no Descope code: `@descope/web-component` is imported only by a dynamic `import()` inside a branch on `LIVE`.
- English-first with working Arabic/RTL: every user-visible string has `en` and `ar`.
- Unknown is never signed in. 401 and 404 stay indistinguishable. A refused or failed sign-in shows one neutral message with no cause.
- Descope token handling: the JWT lives in a local variable only. Never write it to storage, a URL, a log or an error message. `logout()` runs after the exchange settles in every outcome (ok, refused, rate limited, network error).
- Production project id is a build-time value `VITE_KAWALYS_DESCOPE_PROJECT_ID` (a public identifier, validated against `/^P[A-Za-z0-9]{20,}$/` style: reuse `PROJECT_ID_RE` from `server/src/auth/identity/descope-verifier.ts` as the reference rule, copied, not imported across packages). Missing or invalid shows the neutral "sign-in not configured" state.
- Descope plugin guidance (`descope-skills:descope-auth`, checked 27 Nov 2026): valid flow id is `sign-in`; never parse the JWT in the client; always validate on the backend (the BFF does). Its React example keeps the Descope session in the browser (`useSession`); Kawalys deliberately does not: the BFF session cookie is the only session, Descope is used once, then `logout()`. `@descope/react-sdk@3.6.0` is the alternative wrapper; use `@descope/web-component` unless Task 2 proves the React SDK's `persistTokens={false}` really stops persistence (report what you measured either way).
- No commit of secrets or `.env` files. Work on this branch; do not push or merge (the controller does).

## Review Focus

- Exchange returns 401, 429 or a network error: the page shows one neutral message, `logout()` still runs, nothing Descope-related remains in `localStorage` or `sessionStorage`.
- `success` event arrives twice (component re-render): the JWT is exchanged once only.
- The sign-in page is opened in the fixture build (`/sign-in` without `VITE_KAWALYS_LIVE=1`): it is the normal app (not-found behaviour), not a sign-in page.
- Project id env missing or malformed: neutral "not configured", the component is never loaded.
- Arabic UI: the page and the neutral messages are RTL-correct and translated.

---

### Task 1: Exchange and sign-in logic (no UI)

**Files:**
- Modify: `app/src/live/http.ts` (add the exchange request)
- Create: `app/src/live/signIn.ts`, `app/src/live/signIn.test.ts`
- Modify: `app/src/live/live.guard.test.ts` (add `live/signIn.ts` and `live/signIn.test.ts` to `HTTP_IMPORTERS`; add a guard that only `live/signInPage.tsx` may name `@descope/web-component` and only in a dynamic `import()`)
- Modify: `app/src/live/http.test.ts` (tests for the new request)

**Interfaces:**
- Consumes: `apiRequest`, `HttpFailure`, `Fetcher` from `app/src/live/http.ts`; `SESSION_CHECK_PATH`.
- Produces:
  - in `http.ts`: `export const SESSION_EXCHANGE_PATH = '/api/auth/session'` and `export async function exchangeSessionToken(jwt: string, opts?: { signal?: AbortSignal; fetcher?: Fetcher }): Promise<HttpResult>` — `POST`, header `Authorization: Bearer <jwt>`, **no body**, `Accept: application/json`, credentials as the other calls use; same failure mapping as `apiRequest` (401 and 404 both `not_found`, 429 `rate_limited`, 502/503/504 and network `unavailable`).
  - in `signIn.ts`: `export type SignInOutcome = 'signedIn' | 'refused' | 'unavailable'`; `export interface DescopeSdkLike { logout(): Promise<unknown> | unknown }`; `export function isProjectId(v: unknown): v is string`; `export async function completeSignIn(jwt: string, sdk: DescopeSdkLike, fetcher?: Fetcher): Promise<SignInOutcome>` — exchanges once; maps ok to `signedIn`, `unavailable`/`rate_limited`... to the three outcomes (`not_found`, `invalid`, `rate_limited`, `error` → `refused`; `unavailable` → `unavailable`); calls `sdk.logout()` in a `finally`, swallowing a thrown or rejected logout (it must never change the outcome or throw); never stores the token.

- [ ] **Step 1: Write failing tests** in `http.test.ts` and `signIn.test.ts` (names and assertions):
  - `exchangeSessionToken sends POST with a Bearer header and no body` (assert method, header value exact, `body` undefined).
  - `exchangeSessionToken maps 401 and 404 to the same not_found failure`; `maps 429 to rate_limited`; `maps a thrown fetch to unavailable`.
  - `completeSignIn returns signedIn on 200 and calls logout once`.
  - `completeSignIn returns refused on 401, 429 and 500 and still calls logout`.
  - `completeSignIn returns unavailable on a network error and still calls logout`.
  - `completeSignIn ignores a logout that throws or rejects` (outcome unchanged).
  - `completeSignIn writes nothing to localStorage or sessionStorage` (use a stub `globalThis.localStorage`/`sessionStorage` that throws on set).
  - `isProjectId accepts a real-shaped id and rejects empty, undefined, spaces and too-short values`.
- [ ] **Step 2: Run** `cd app && npx vitest run src/live` — expected: the new tests FAIL (not defined).
- [ ] **Step 3: Implement** `exchangeSessionToken` in `http.ts` and `signIn.ts` as specified. `exchangeSessionToken` must not put the token in the URL or log it, and must reuse the existing response handling (do not duplicate it: factor the shared part).
- [ ] **Step 4: Extend the guard test** as listed and run `cd app && npx vitest run` — expected: all pass, including the guard.
- [ ] **Step 5: Commit** `git add app/src/live && git commit -m "feat: owner sign-in exchange and logout logic (D3(a))"` with the standard trailer.

---

### Task 2: Sign-in page, route, link, dependency

**Files:**
- Modify: `app/package.json`, `app/package-lock.json` (add `@descope/web-component` at exactly `4.6.3`, no caret)
- Create: `app/src/live/signInPage.tsx`
- Modify: `app/src/App.tsx` (route on the path), `app/src/shell/SessionBar.tsx` (sign-in link), the i18n shell copy files (EN and AR strings), `app/src/live/session.ts` (replace the lab path constant with `SIGN_IN_PATH = '/sign-in'` for the link; keep the lab constant only if still referenced)
- Test: `app/src/live/signInPage.test.ts`, update `app/src/shell/sessionBar.test.ts`

**Interfaces:**
- Consumes: `completeSignIn`, `isProjectId`, `DescopeSdkLike` (Task 1); `LIVE` from `live/reads.ts`; `SessionContext`.
- Produces: `export function SignInPage(props: { projectId: string | undefined }): JSX.Element` in `signInPage.tsx`; `export const SIGN_IN_PATH = '/sign-in'` in `session.ts`.

- [ ] **Step 1: Add the dependency**: `cd app && npm install --save-exact @descope/web-component@4.6.3`. Record the added transitive packages and licenses in the task report.
- [ ] **Step 2: Write failing tests**:
  - `signInPage.test.ts` (node environment; test the pure parts you export): a function `signInView(projectId, lang)` returning one of `{ kind: 'unconfigured' } | { kind: 'flow', projectId }` — `unconfigured` for undefined/invalid; and `onSuccess(event, deps)` handler logic: exchanges once even if called twice, ignores an event without a string `detail.sessionJwt`, navigates to `/` only on `signedIn`.
  - `sessionBar.test.ts`: the sign-in link target is `SIGN_IN_PATH` and keeps `rel="noopener noreferrer"`.
  - A route test (extend `app/src/nav/routes` tests if a path helper is added): `/sign-in` is the sign-in page only when `LIVE` is true.
- [ ] **Step 3: Run** `npx vitest run` — expected: new tests FAIL.
- [ ] **Step 4: Implement** `SignInPage`: when `signInView` says `flow`, dynamically `import('@descope/web-component')` inside an effect, render `<descope-wc project-id=… flow-id="sign-in" store-last-authenticated-user="false">` (declare the custom element JSX typing in a local `.d.ts`), attach the `success` listener, call `completeSignIn(detail.sessionJwt, el.sdk)`, show one neutral message on `refused`/`unavailable` (distinct only between "could not sign in" and "service unreachable, try again"; neither names a cause), and `window.location.replace('/')` on `signedIn`. Add the EN/AR strings in the shell copy. In `App.tsx`, when `LIVE && window.location.pathname === SIGN_IN_PATH`, render `SignInPage` with `import.meta.env.VITE_KAWALYS_DESCOPE_PROJECT_ID` inside the shell as the app does for other screens (or the bare page; pick the smaller diff and say which). Point the `SessionBar` link at `SIGN_IN_PATH`.
- [ ] **Step 5: Verify the fixture build is clean**: `cd app && npx vite build && grep -ril descope dist | wc -l` — expected `0`. Then `VITE_KAWALYS_LIVE=1 npx vite build` — expected: a separate chunk contains the Descope code (`grep -ril descope dist | wc -l` is greater than 0) and the main chunk does not statically import it.
- [ ] **Step 6: Run** `cd app && npx tsc --noEmit && npx vitest run` — expected: pass. Then run the app e2e suite for chromium only: `npx playwright test --project=chromium` if the project exposes it (see `app/package.json` scripts); report the result.
- [ ] **Step 7: Commit** `git add app && git commit -m "feat: /sign-in route with the Descope flow, live mode only (D3(a))"` with the trailer.

---

### Task 3: Deploy wiring and report-only CSP

**Files:**
- Modify: `deploy/pilot/web.Dockerfile` (build arg → env), `.github/workflows/images.yml` (pass the build arg from a literal workflow env), `deploy/pilot/Caddyfile` (add `Content-Security-Policy-Report-Only`), `deploy/pilot/smoke.sh` (checks), `docs/planning/BACK-64/pilot-deployment-runbook.md` (a short "Sign-in" note), `docs/planning/BACK-117/execution-plan.md` (status line)
- Do not touch: the Origin CA files, `compose.*.yml`.

**Interfaces:**
- Consumes: the env name `VITE_KAWALYS_DESCOPE_PROJECT_ID` (Task 2).
- Produces: a web image whose build reads `ARG VITE_KAWALYS_DESCOPE_PROJECT_ID` (no default in the Dockerfile) and `ENV`s it before `vite build`; a Caddy header `Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://imgs.descope.com; font-src 'self' data:; connect-src 'self' https://api.descope.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (report-only first, as the card requires; the component injects styles inline, hence `'unsafe-inline'` for style only).

- [ ] **Step 1: Write the smoke checks first** in `smoke.sh` (they must fail before the change): the built web image has the header `Content-Security-Policy-Report-Only` containing `connect-src 'self' https://api.descope.com` and no `script-src` that allows `'unsafe-inline'` or `unpkg`; building the web image **without** the build arg still succeeds (the sign-in page then shows "not configured"); building with a sample id `PSAMPLE000000000000000000000000` puts that string in the built assets and nowhere else.
- [ ] **Step 2: Run** `bash deploy/pilot/smoke.sh` (needs Docker; if Docker is unavailable say so and skip, do not claim a pass) — expected before the change: the new checks FAIL.
- [ ] **Step 3: Implement** the Dockerfile ARG/ENV, the `images.yml` build-arg (literal env `VITE_KAWALYS_DESCOPE_PROJECT_ID: P3MW4c80PMtyApvtGSONYmXy9fGt`, a public id, with a comment saying so), and the Caddy header. Keep `caddy validate` passing.
- [ ] **Step 4: Run** `bash deploy/pilot/smoke.sh` — expected: `SMOKE RESULT: ALL PASS` with the new count.
- [ ] **Step 5: Docs**: runbook note (sign-in is Descope magic link; Descope console items the owner sets: App URL and approved domain `kawalys.kemetralabs.com`; CSP is report-only first; where to read reports: browser console on the pilot) and the execution-plan status line. State honestly what is not run (real Descope sign-in = P5).
- [ ] **Step 6: Commit** `git add deploy .github docs && git commit -m "feat: web image reads the Descope project id; report-only CSP (D3(a))"` with the trailer.
