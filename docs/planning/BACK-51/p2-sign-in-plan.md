# BACK-51 P2: session in the app (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, with superpowers:test-driven-development for every task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In live mode (`VITE_KAWALYS_LIVE=1`) the app knows whether the owner is signed in, offers the local lab sign-in and sign-out, notices an expired session, and keeps an unsent draft across it. The fixture demo is unchanged.

**Architecture:** One plain-TS session store in `src/live/session.ts` (state machine, injected fetcher, in-memory drafts) is the only new caller of `src/live/http.ts`. A thin React provider exposes it; `useLiveRead` reports `not_found` to it and re-reads after a new sign-in. A prop-driven `SessionBar` renders the state with `StateBlock`. On the server, the lab page derives its API base from its own address, so it works at `/auth/lab` and behind the `/api` proxy.

**Tech Stack:** React 19, Vite 5, Vitest 2 (node environment, `.test.ts` only), NestJS 12 + Jest + supertest, `node:vm` for the lab-script test. No new dependency.

**Spec:** [gate-path-plan.md](gate-path-plan.md) section 3 (P2), sections 4 and 5; owner decisions D1–D5 (2026-11-26). P1 hand-over: `p1-live-mode.md` in the session notes folder; P1 plan: [p1-live-mode-plan.md](p1-live-mode-plan.md).

## Global Constraints

- Live mode only. The default build stays the fixture demo: no request, no new visible element, every existing unit and e2e test green.
- No new dependency, no CORS, no change to the cookie, session or CSRF design. The persona switch stays display-only.
- `src/live/http.ts` stays the only file naming a request API. Its importers are listed in `live.guard.test.ts`; P2 adds `live/session.ts` (and its test) on purpose, and the "rule bites" cases stay.
- Every `/api/` path literal lives in `src/live` (the lab link is an exported constant).
- Signed in **only** from a `200` of `GET /api/auth/me` whose body is `{ user: { role: 'owner' } }`. A malformed 200 is an error. `user.id` is never rendered.
- `not_found` (401 and 404 alike) means signed out. A network failure or 502/503/504 means "unavailable", in words, never signed in and never healthy.
- All new copy in EN and AR; the copy snapshot changes by additions only.
- Drafts are in memory only: no `localStorage`, `sessionStorage` or cookie.

## Review Focus

1. **Startup race.** Panel reads and the first `/auth/me` start together; a signed-out visitor's panel 404s must not show "session ended". Only `signedIn` → recheck → `not_found` produces `ended` (Task 2 test `never shows ended to someone never signed in`).
2. **Hidden case vs expired session (BACK-30).** A panel 404 while the recheck answers 200 keeps the session signed in and leaves the panel's own not-found state; nothing else changes (Task 2 test `a 404 with a live session stays signed in`).
3. **Two panels 404 at once.** One `/auth/me` call, not two (Task 2 test `dedupes concurrent rechecks`).
4. **Sign-out while the server is unreachable.** The cookie may still be live, so the app must not say signed out; it says sign-out failed (Task 2 test `sign-out that cannot reach the server is not signed out`).
5. **Lab page opened at `/auth/lab/` (trailing slash).** Express serves it; plain relative URLs would post to `/auth/lab/session`. The derived base handles it (Task 1 vm test).

---

### Task 1: Lab page base path (server)

**Files:**
- Modify: `server/src/auth/lab/sign-in-page.ts`
- Test: `server/test/auth/lab.spec.ts`

**Interfaces:**
- Produces: `export const LAB_PATH_RE = /\/lab\/?$/;` and `export function labApiBase(pathname: string): string | null` (`'/auth/lab'` → `'/auth'`, `'/api/auth/lab'` → `'/api/auth'`, `'/auth/lab/'` → `'/auth'`, anything not ending in `/lab` → `null`).

- [ ] **Step 1: Failing tests.** `labApiBase` cases above. A `node:vm` test runs the rendered page's inline script with a stub `document` (`getElementById`, `querySelector` returning an element whose `success` listener is captured), a stub `location.pathname`, and a recording `fetch`; it fires `success` with `{ sessionJwt: 'x' }` and asserts the requests are `<base>/session` (POST, Bearer) then `<base>/me` for `/auth/lab`, `/api/auth/lab` and `/auth/lab/`. A bad pathname makes no request and shows `Sign-in did not complete`. The script holds no `'/auth/` literal. Supertest: `GET /auth/lab/` is served (200) like `/auth/lab`.
- [ ] **Step 2: Run, expect FAIL** (`npx jest test/auth/lab.spec.ts`).
- [ ] **Step 3: Implement.** The inline script computes `var base = location.pathname.replace(LAB_PATH_RE, '')` only when the path matches (else shows the failure line) and fetches `base + '/session'`, `base + '/me'`. Nothing else changes: CSP, nonce, Descope logout, copy, `Signed in as` line, `loadLab`/production refusal.
- [ ] **Step 4: Run, expect PASS**, plus `npm run lint`/`typecheck` scripts that exist in `server/`.

### Task 2: Session store (app, `src/live`)

**Files:**
- Create: `app/src/live/session.ts`, `app/src/live/session.test.ts`
- Modify: `app/src/live/live.guard.test.ts` (add the two files to `HTTP_IMPORTERS`)

**Interfaces:**
- Produces:
  - `export const LAB_SIGN_IN_PATH = '/api/auth/lab'`
  - `export type SessionStatus = 'checking' | 'signedIn' | 'signedOut' | 'ended' | 'unavailable' | 'error'`
  - `export interface SessionSnapshot { readonly status: SessionStatus; readonly generation: number; readonly signOutFailed: boolean }`
  - `export async function checkSession(signal?: AbortSignal, fetcher?: Fetcher): Promise<'signedIn' | 'signedOut' | 'unavailable' | 'error' | null>` (null when aborted)
  - `export function liveReadKey(key: string, s: SessionSnapshot | null): string` (a panel's read key: changes on sign-in and when the session is signed out or ended, so no panel keeps the owner's data on screen afterwards)
  - `export class SessionStore { constructor(fetcher?: Fetcher); subscribe(fn: () => void): () => void; getSnapshot(): SessionSnapshot; start(): Promise<void>; recheck(): Promise<void>; reportNotFound(): void; signOut(): Promise<void>; getDraft<T>(key: string): T | undefined; setDraft<T>(key: string, value: T | undefined): void }`

Rules the tests pin:
- `checkSession`: 200 + `user.role === 'owner'` → signedIn; 200 malformed or other role → error; not_found → signedOut; unavailable → unavailable; invalid/rate_limited/error → error.
- `generation` starts at 0 and increases each time the status becomes `signedIn` from anything else (panels re-read).
- `recheck`: concurrent calls share one request. A `signedOut` answer becomes `ended` when the previous status was `signedIn` or `ended`, else `signedOut`.
- `reportNotFound`: acts only when `signedIn`; while it rechecks, status stays `signedIn`.
- `signOut`: `DELETE /api/auth/session`; 204 or `not_found` → `signedOut` and all drafts cleared (a shared machine must not keep them); any other failure → status unchanged, `signOutFailed: true`.
- Drafts survive `ended` and the next `signedIn`; snapshots are new objects only when something changed.
- An explicit sign-out bumps an epoch: a check already in flight cannot apply its answer afterwards (no signing back in, no false `ended`). After a sign-out a `not_found` is plain `signedOut`; `ended` is kept across an `unavailable` blip while the owner had a session.

- [ ] Step 1: failing tests (`npx vitest run src/live/session.test.ts`), Step 2: FAIL, Step 3: implement, Step 4: PASS, guard test PASS.

### Task 3: Provider, `useLiveRead` wiring and draft hook (app)

**Files:**
- Create: `app/src/app/SessionContext.tsx`
- Modify: `app/src/app/useLiveRead.ts`, `app/src/App.tsx`

**Interfaces:**
- Consumes: `SessionStore`, `SessionSnapshot` (Task 2).
- Produces: `SessionContext` (`SessionStore | null`, null in fixture mode); `useSession(): SessionSnapshot | null`; `useSessionStore(): SessionStore | null`; `useSessionDraft<T>(key: string): readonly [T | undefined, (v: T | undefined) => void]` (P3 keys it `decision:<investigationId>`; fixture mode falls back to component state).
- `useLiveRead` keys its read with `liveReadKey`, waits for the first session check (one read per panel per page load), and calls `reportNotFound()` when a non-aborted read fails `not_found`. `App` creates the store once when `LIVE` and calls `start()` on mount.

- [ ] Typecheck + existing unit tests green; behaviour is covered by Task 2 and the browser check in Task 5.

### Task 4: Session bar and copy (app)

**Files:**
- Create: `app/src/shell/SessionBar.tsx`, `app/src/shell/sessionBar.test.ts`
- Modify: `app/src/shell/AppShell.tsx` (render at the top of `<main>` only when `LIVE`), `app/src/i18n/shell.ts` (`live.session` block, EN + AR), `app/src/i18n/__snapshots__/all-copy.json`, `app/src/styles/*` (one small rule set with existing tokens)

**Interfaces:**
- `SessionBarView(props: { snapshot: SessionSnapshot; onRecheck(): void; onSignOut(): void })`, rendered by `SessionBar` with the store.
- States: checking → `StateBlock loading` (role status); signedIn → "Signed in as the owner" + Sign out button (+ error `StateBlock` when `signOutFailed`); signedOut → `StateBlock unknown` + link to `LAB_SIGN_IN_PATH` (new tab, `rel="noopener noreferrer"`, so the app and its drafts stay loaded) + Check again; ended → same with the "session ended, your unsent work here is kept" copy; unavailable → `StateBlock unavailable` + Check again; error → `StateBlock error` + Check again.

- [ ] Failing render test (`react-dom/server`, EN and AR): each state's text, no `user.id`, link href and `target`, AR has `dir`-safe copy. Then implement, update snapshot (`npx vitest run -u src/i18n`), and check the snapshot diff is additions only.

### Task 5: Verify

- [x] `npm run check` in `app/`; Chromium e2e in `app/` (WebKit is flaky under load on the author's Windows laptop and fails the same way on `main`); server typecheck and the non-DB specs.
- [ ] `npm run check` in `server/` in full: needs Docker, which the author's laptop lacks. CI runs the 8 Testcontainers suites; not run locally.
- [x] Live build in a browser with the `/api` routes stubbed: signed out, signed in, ended, unavailable, in EN and AR, at 320 px and 1280 px.
- [x] `pr-review` in a fresh subagent (its Major finding, stale panel data after sign-out, and the cheap Minors are fixed); owner approval before commit, push or PR.

## Risks and hand-over

- The runbook's Descope magic-link redirect is `http://127.0.0.1:8787/auth/lab` (direct to the BFF). The gate path enters at `http://127.0.0.1:4178/api/auth/lab`; a cookie set on `:8787` is the same host (`127.0.0.1`, cookies ignore ports), but P5 should set the redirect to the proxied address and confirm. Logged for P5.
- Nothing tells the app that the lab tab finished signing in: the user returns and chooses Check again. A `visibilitychange` recheck is a possible later nicety.
- WebKit and `__Host-` cookies over http remain unverified (gate-path plan section 5); P4 starts Chromium-only.
