# BACK-51 P1: live-mode plumbing, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A build-time live mode (`VITE_KAWALYS_LIVE=1`, off by default) in which Portfolio and the Investigation Room read the
Kawalys server through one request module. Without the flag, the app behaves exactly like today's fixture demo.

**Architecture:** `src/live/http.ts` is the only file that may call `fetch`. One loader module, `src/live/reads.ts`, is the
only file that may import it. It returns typed results that the two panels map to `StateBlock` states. The read views
(`githubReadView`, `investigationReadView`) already take their body as a parameter, with the committed fixture as the default.
P1 adds an `origin` parameter so a live body is never marked as demo data and is aged against the real clock. Vite proxies
`/api` to the BFF on `127.0.0.1:8787` and strips the prefix, so requests stay same-origin and there is no CORS.

**Tech stack:** React 19, Vite 5.4 (`server.proxy`, `preview.proxy`), Vitest 2 (node environment), Playwright 1.65. No new
dependency.

**Spec:** [gate-path-plan.md](gate-path-plan.md), section 3 P1. D1 (a) and D2 (a) were approved by the owner on 2026-11-26.

**Revision (2026-11-26, review of the gate-path plan, PR #112):** the request module and its loader live in `src/live/`, not
`src/api/` and `src/view/`. `src/api` stays a pure adapter folder, and `api.guard.test.ts` keeps every rule it had (only its
header comment changes). A separate `src/live/live.guard.test.ts` holds the request rules. A `not_found` result carries
`recheckSession: true` and the module exports `SESSION_CHECK_PATH = '/api/auth/me'`, so P2 can tell an expired session from a
hidden case. The lab page (`server/src/auth/lab/sign-in-page.ts`) is not touched: that is P2.

## Global constraints

- `VITE_KAWALYS_LIVE=1` (exactly the string `1`) turns on live mode. Unset, `0`, `true` or anything else means fixture mode.
- Fixture mode: every existing unit and e2e test passes unchanged. The one exception is the copy snapshot
  (`src/i18n/__snapshots__/all-copy.json`): it is regenerated for the new strings, and its diff must contain added keys only.
- Requests: relative `/api/...` paths only, `credentials: 'same-origin'`, JSON. No absolute URL, no CORS, no new dependency.
- Result mapping: 401 or 404 → `not_found`. 400 → `invalid`. 429 → `rate_limited`. A network failure → `unavailable`. 5xx → `error`.
  Deviations: 502, 503 and 504 → `unavailable` (see Review focus 1). Any other non-2xx status, or a 2xx body that is not JSON → `error`.
- Unknown is never Healthy. Loading, empty, error, unavailable and not-found all show through `StateBlock` with live copy,
  never with the default copy, which talks about demo data.
- Live panels drop the demo marker and say where the data came from, in EN and AR. In AR, Latin names go in `{braces}`.
- Out of scope: sign-in UI (P2), the decision form (P3) and the end-to-end test across app and server (P4).
- No commit, push or PR without the owner's explicit approval (repo `CLAUDE.md`). Where a task below says "commit", read that as
  "stage for the single PR".

## Decisions made in this plan (flag for the owner)

1. **Which investigation is read in live mode.** `seedLocal` creates random ids. Live mode reads the investigation named by
   `?investigation=<uuid>` (`npm run local:up` prints it). **Owner decision, 2026-11-26 (PR #115):** with no valid id it reads
   a fourth route, `GET /investigations` (newest first, visible projects only), opens the first item, and says in a note
   that the newest visible case is shown. An id in the address always wins and the list is then never read. An empty list
   reads "No investigation to show"; a malformed list, or a first item without a UUID id, is an error, never a guessed case.
   A real picker is a later step.
2. **Proxy errors.** When the BFF is down, Vite's proxy answers a plain 500. That would read as "the server failed" rather than
   "the server is unreachable". So the proxy's `configure` hook answers 502 on a proxy error, and `http.ts` maps 502/503/504 to `unavailable`.
3. **The `?github=` review seeds are ignored in live mode.** A URL must not be able to make live data look like a forced failure.

## Review focus

1. **The BFF is down, or the proxy is missing.** Expected: "unavailable" in words, never an empty list. Covered by the 502
   mapping and by the "200 with an HTML body is `error`" test: a static host without the proxy serves `index.html` for `/api/*`.
2. **No session (401).** Expected: the same words as a missing record ("not found, or not signed in"), with nothing about
   whether the record exists.
3. **The panel unmounts, or the persona changes, mid-request.** Expected: the request is aborted and no state is set
   afterwards. An abort never shows as `unavailable`.
4. **`?investigation=` is malformed (not a UUID, or a path like `../x`).** Expected: it is ignored, never sent; the newest
   visible investigation is opened instead (decision 1), and an empty list reads "No investigation to show".
5. **`GET /decisions` fails while `GET /investigations/:id` succeeds.** Expected: records are shown and the list says it is
   incomplete. Decisions are never shown as "none".

---

### Task 1: `src/live/http.ts`, the request module

**Files:**
- Create: `app/src/live/http.ts`
- Test: `app/src/live/http.test.ts`

**Interfaces:**
- Produces:
  - `type HttpFailure = 'not_found' | 'invalid' | 'rate_limited' | 'unavailable' | 'error'`
  - `type HttpResult = { ok: true; status: number; body: unknown } | { ok: false; failure: HttpFailure; status: number | null; aborted?: true }`
  - `function apiPath(path: string): string | null`. Returns the path only when it matches `^/api/` with no `//`, no `\`, no
    `..` segment and no scheme, otherwise null.
  - `function failureOf(status: number): HttpFailure`
  - `function apiRequest(path: string, init?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; signal?: AbortSignal; fetcher?: typeof fetch }): Promise<HttpResult>`

- [ ] **Step 1: Write failing tests** in `http.test.ts`, using an injected `fetcher`:
  - `apiPath` accepts `/api/portfolio` and `/api/decisions?investigationId=x`. It returns null for `https://evil.test/api/x`,
    `//evil.test/api`, `/\evil`, `/api/../auth`, `/api/%2e%2e/portfolio` (a browser decodes it as `..`), `/portfolio`,
    `api/x` and `''`.
  - 401 and 404 results carry `recheckSession: true`, and no other result does. `SESSION_CHECK_PATH` is `'/api/auth/me'`.
  - With a rejected path, `fetcher` is never called and the result is `{ ok: false, failure: 'invalid', status: null }`.
  - `fetcher` is called with the exact path, `credentials: 'same-origin'`, `Accept: application/json`, and with
    `Content-Type: application/json` plus `JSON.stringify(body)` only when a body is given.
  - Status mapping: 401 and 404 → `not_found`. 400 → `invalid`. 429 → `rate_limited`. 500 → `error`. 502, 503 and 504 →
    `unavailable`. 403 and 409 → `error`.
  - 200 with a JSON body → `{ ok: true, status: 200, body }`. 200 with `<!doctype html>` → `error`. 204 → `{ ok: true, body: null }`.
  - When `fetcher` rejects with a `TypeError` → `unavailable`. An `AbortError` → `{ ok: false, failure: 'unavailable', aborted: true }`.
  - The error body is never returned: a 404 with an `{error:{...}}` envelope gives no `body` field.
- [ ] **Step 2:** Run `npx vitest run src/live/http.test.ts`. Expected: FAIL, the module is missing.
- [ ] **Step 3:** Implement. The default `fetcher` is `globalThis.fetch`. Read the body as text, then `JSON.parse`.
- [ ] **Step 4:** Run the same command. Expected: PASS.

### Task 2: `src/live/live.guard.test.ts`, the request guard

**Files:**
- Create: `app/src/live/live.guard.test.ts`
- Modify: `app/src/api/api.guard.test.ts`, the header comment only. Every rule stays as it is.

**Interfaces:** Consumes Task 1's file. Produces these rules:
- Only `live/http.ts` names a request API anywhere in `src/`.
- Only `live/reads.ts` imports it.
- Every `/api/` path literal is in `src/live`.

- [ ] **Step 1: Write the guard, with self-tests that prove each rule bites:**
  - **Request APIs.** The scan for `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` covers every non-test file in `src/`. The only file allowed through is `live/http.ts`.
  - **No absolute URLs.** Non-test files in `src/live` hold no `http(s)://` or `ws(s)://` literal and no protocol-relative `'//host'`.
  - **Path literals.** No non-test file outside `src/live` holds a `'/api/` path literal.
  - **Imports.** `live/http` is imported only by `live/reads.ts` and the tests. A specifier is resolved against the importing file with `posix.normalize`, so `../live/./http`, `../live//http` and `../x/../live/http` are all caught.
  - **File list.** The guard finds exactly `live/http.ts` and `live/reads.ts` in `src/live`.
- [ ] **Step 2:** Run `npx vitest run src/live src/api`. Expected: PASS against the tree. Every bite test passes because its sample is refused.

### Task 3: `src/live/reads.ts`, the mode switch and the loaders

**Files:**
- Create: `app/src/live/reads.ts`
- Test: `app/src/live/reads.test.ts`

**Interfaces:**
- Consumes: `apiRequest`, `HttpFailure` (Task 1).
- Produces:
  - `function liveMode(env: { readonly VITE_KAWALYS_LIVE?: string }): boolean`
  - `const LIVE: boolean = import.meta.env.VITE_KAWALYS_LIVE === '1'`. Written inline, so Rollup folds it to `false` in a
    fixture build.
  - `type LiveFailure = HttpFailure | 'notChosen'`
  - `type LiveRead<T> = { status: 'loading' } | { status: 'ok'; body: T } | { status: 'failed'; failure: LiveFailure }`
  - `function investigationIdFrom(search: string): string | null`. Returns the `investigation` param only when it is a UUID.
  - `function readPortfolio(signal?: AbortSignal, fetcher?: typeof fetch): Promise<LiveRead<unknown> | null>`. Calls `GET /api/portfolio`.
  - `function readInvestigation(id: string | null, signal?: AbortSignal, fetcher?: typeof fetch): Promise<LiveRead<{ investigation: unknown; decisions: unknown }> | null>`.
    Calls `GET /api/investigations/:id` and `GET /api/decisions?investigationId=:id` in parallel. A failed decisions read
    gives `decisions: null`, so the view marks the list incomplete.
  - Both return `null` when the request was aborted. The caller sets no state.

- [ ] **Step 1: Write failing tests:**
  - `liveMode({})`, `liveMode({VITE_KAWALYS_LIVE:'0'})` and `liveMode({VITE_KAWALYS_LIVE:'true'})` are false;
    `liveMode({VITE_KAWALYS_LIVE:'1'})` is true. Under vitest, `LIVE` is false.
  - `investigationIdFrom('?investigation=00000000-0000-4000-8000-000000000004')` returns the id. `'?investigation=../x'`, `''`
    and `'?investigation=abc'` return null.
  - `readInvestigation(null)` reads `GET /api/investigations` and opens its first item, with `chosen: 'newest'`. An empty list
    gives `notChosen`; a malformed list or a non-UUID id gives `error`. With an id, the list is never read (`chosen: 'address'`).
  - `readPortfolio` with a 200 gives `{status:'ok', body}`. With a 404 it gives `failure:'not_found'`.
  - `readInvestigation(id)` requests exactly `/api/investigations/<id>` and `/api/decisions?investigationId=<id>`. If the
    investigation read fails, the result fails with that failure. If only decisions fail, the result is ok with `decisions: null`.
  - An aborted signal returns `null`.
- [ ] **Step 2:** Run `npx vitest run src/live`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS, including the guard from Task 2.

### Task 4: the read views take an origin

**Files:**
- Modify: `app/src/view/githubReadView.ts`, `app/src/view/investigationReadView.ts`
- Test: append to `githubReadView.test.ts` and `investigationReadView.test.ts`. Existing cases stay unchanged.

**Interfaces:**
- Produces:
  - `type ReadOrigin = 'fixture' | 'live'`, exported from `githubReadView.ts`.
  - `githubReadView(body: unknown = RESPONSE, now: Date = FIXTURE_NOW, origin: ReadOrigin = 'fixture')`
  - `investigationReadView(persona, body = INVESTIGATION, decisions = DECISIONS, now = FIXTURE_NOW, origin: ReadOrigin = 'fixture')`
  - In both, `demo === (origin === 'fixture')`, and `SourceAuthority.synthetic` follows the origin. The result shape does
    not change, because existing tests use `toEqual` on it.
  - `githubReadViewFor(search, now, origin = 'fixture')` ignores `?github=` when `origin === 'live'`.

- [ ] **Step 1: Write failing tests:**
  - `githubReadView({projects:[]}, NOW, 'live')` equals `{projects:[], state:'empty', demo:false, incomplete:false}`.
  - A live read at `FIXTURE_NOW` gives the same statuses as the fixture, with `demo:false`.
  - `githubReadViewFor('?github=error', NOW, 'live')` equals `githubReadView(RESPONSE, NOW, 'live')`.
  - `investigationReadView('technical', INVESTIGATION, null, FIXTURE_NOW, 'live')` gives `demo:false`, `incomplete:true`, and
    records present.
- [ ] **Step 2:** Run `npx vitest run src/view`. Expected: the new cases FAIL.
- [ ] **Step 3:** Implement by threading the origin parameter. Replace `const SYNTHETIC = true` with the parameter. Update the
  header comments ("nothing in app/ calls the server" becomes the live-mode rule).
- [ ] **Step 4:** Run `npx vitest run src/view src/api`. Expected: PASS.

### Task 5: live copy (EN/AR) and the panels

**Files:**
- Modify: `app/src/i18n/shell.ts`. Add `SHELL.live`: `source`, `loading`, `failure: Record<LiveFailure, {title, body}>`.
- Modify: `app/src/i18n/__snapshots__/all-copy.json` (regenerated; additions only).
- Create: `app/src/app/useLiveRead.ts`. A hook: `useLiveRead<T>(load: ((signal: AbortSignal) => Promise<LiveRead<T> | null>) | null, deps): LiveRead<T> | null`.
  It aborts on cleanup and ignores a `null` result.
- Create: `app/src/components/LiveState.tsx`. Maps a `LiveRead` that is not ok to `StateBlock` with live copy: loading →
  `loading`, not_found and notChosen → `unknown`, unavailable → `unavailable`, invalid, rate_limited and error → `error`.
- Modify: `app/src/screens/portfolio/GitHubReads.tsx`, `app/src/screens/investigation/ServerRecords.tsx`.

**Copy (exact):**

| key | EN | AR |
| --- | --- | --- |
| `source` | Live: read from the Kawalys server | مباشر: مقروء من خادم {Kawalys} |
| `loading` | Reading the Kawalys server / Asking the server for the latest stored reads. | جارٍ القراءة من خادم {Kawalys} / نطلب من الخادم آخر القراءات المحفوظة. |
| `not_found` | Not found, or not signed in / The server did not return this. It may not exist, or this session may not see it. | غير موجود، أو لم يتم تسجيل الدخول / لم يُرجع الخادم هذا. قد لا يكون موجودًا، أو قد لا تراه هذه الجلسة. |
| `notChosen` | No investigation to show / The server listed no investigation this session can see. To open one, add {?investigation=} and its id to the address ({npm run local:up} prints one). | لا يوجد تحقيق لعرضه / لم يُدرج الخادم أي تحقيق تراه هذه الجلسة. لفتح تحقيق، أضف {?investigation=} ومعرّفه إلى العنوان (يطبعه {npm run local:up}). |
| `newest` (note) | Showing the newest investigation this session can see. To open another, add {?investigation=} and its id to the address. | نعرض أحدث تحقيق تراه هذه الجلسة. لفتح تحقيق آخر، أضف {?investigation=} ومعرّفه إلى العنوان. |
| `unavailable` | The server could not be reached / Nothing was read. This is unknown, not healthy. | تعذّر الوصول إلى الخادم / لم يُقرأ شيء. الحالة غير معروفة وليست سليمة. |
| `invalid` | The server refused the request / The request was not accepted. Nothing is shown. | رفض الخادم الطلب / لم يُقبل الطلب. لا يُعرض شيء. |
| `rate_limited` | Too many requests / The server asked us to slow down. Try again in a minute. | طلبات كثيرة جدًا / طلب الخادم الإبطاء. حاول بعد دقيقة. |
| `error` | The server answered with an error / Nothing is shown. This is unknown, not healthy. | أجاب الخادم بخطأ / لا يُعرض شيء. الحالة غير معروفة وليست سليمة. |

- [ ] **Step 1: Write failing tests:**
  - A test in `src/i18n` checks that `SHELL.live` exists in EN and AR with the same keys and that the copy rules pass. The
    existing `copy-rules.test.ts` covers this once the tree is in `HOST_COPY`.
  - A pure `liveStateKind(f: LiveFailure | 'loading'): StateKind` in `live/reads.ts` is unit-tested against the mapping above.
- [ ] **Step 2:** Implement the copy, then run `npx vitest run src/i18n -u` once. Check
  `git diff --stat src/i18n/__snapshots__`: the diff must contain added lines only.
- [ ] **Step 3:** Wire the panels:
  - In fixture mode (`!LIVE`), the panels are unchanged; `useLiveRead(null)` returns null.
  - In live mode: a read that is not ok renders `<LiveState>`. An ok read renders the view with
    `origin 'live', now = new Date()`.
  - The `aside` shows `SHELL.live.source` with `data-testid="github-live"` and `data-testid="server-records-live"` in place of
    the demo marker.
- [ ] **Step 4:** Run `npm run check`. Expected: tsc clean, all tests pass, coverage ≥ 80%.

### Task 6: the Vite proxy

**Files:**
- Modify: `app/vite.config.ts`

- [ ] **Step 1:** Add `const API_PROXY = { '^/api(/|$)': { target: 'http://127.0.0.1:8787', changeOrigin: false, rewrite: (p) => p.replace(/^\/api/, ''), configure: (proxy) => proxy.on('error', (_e, _req, res) => { /* 502 if headers not sent */ }) } }`
  to both `server.proxy` and `preview.proxy`. `changeOrigin` stays false: the BFF does no Host or Origin check, and the cookie
  is host-only (`__Host-`, `Path=/`).
- [ ] **Step 2:** Manual check. Run `VITE_KAWALYS_LIVE=1 npx vite build && npx vite preview` with no BFF running, open
  `/#/portfolio`, and see "The server could not be reached". Proving the proxy end to end is P4.

### Task 7: rule text

**Files:**
- Modify: `CLAUDE.md` (line 9), `app/README.md`, `docs/planning/BACK-51/demo-script-and-limits.md`.
- Modify the comments in `src/api/portfolio.ts` and `src/api/evidence.ts` that say "nothing in app/ calls the server".

New rule, in each file: *The app calls the server only in live mode (`VITE_KAWALYS_LIVE=1`, off by default), same origin
(`/api`, proxied), through `src/live/http.ts`. The default build reads committed fixtures and makes no request.*

### Task 8: verification

- [ ] `npm run check` in `app/`: tsc clean, every test green, coverage ≥ 80%.
- [ ] `npm run e2e` in `app/`: every existing spec green, unchanged.
- [ ] Fixture bundle check: after `npx vite build`, `grep -c "same-origin" dist/assets/*.js` returns 0. The live code is
  tree-shaken out of the default build.
- [ ] Run the `pr-review` skill in a fresh subagent, then ask the owner before any commit.
