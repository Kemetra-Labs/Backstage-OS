# BACK-51 gate path: staff login → Portfolio → Investigation → record a decision

Status: **D1–D5 approved by the owner as recommended (2026-11-26). Nothing is built yet; each phase still merges only
on owner approval.** It covers the one gate row that
is BLOCKED in [demo-script-and-limits.md](demo-script-and-limits.md): "Login → Portfolio → Investigation → record
decision, end to end". Deployment (BACK-64) and the security sign-offs (X02/X04, BACK-30) stay separate gates. This
plan only says where they plug in.

Facts are from `origin/main` f748762. The detailed TDD implementation plan comes after the decisions in section 2 are
made.

## 1. Where we are

**Server (ready for this path):**

| Piece | Today | Where |
| --- | --- | --- |
| Sign-in | `POST /auth/session` with `Authorization: Bearer <Descope JWT>` sets a cookie. `GET /auth/me`, `DELETE /auth/session`. Rate-limited to 10/min. | `server/src/auth/auth.controller.ts` |
| Token check | jose: RS256 only, audience = project id, pinned issuer, refresh and impersonation tokens refused | `auth/identity/descope-verifier.ts` |
| Session | `__Host-kawalys_session`: `Secure; HttpOnly; SameSite=Strict`, 1 h idle, 8 h absolute, Postgres store | `auth/session/session-cookie.ts`, `auth.config.ts` |
| CSRF | No token. Protection is SameSite=Strict, no CORS, and JSON-only bodies (form posts get 400). | `create-app.ts` |
| Off by default | Every route denied until `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` are set. Boot fails in production without them. | `auth.config.ts` |
| Reads | `GET /portfolio`, `/portfolio/:id`, `/investigations/:id`, `/evidence`, `/decisions` (capability `evidence.read`) | evidence, portfolio and investigation controllers |
| Decision write | `POST /investigations/:id/decisions` takes `{decision ≤2000, rationale ≤4000, evidenceIds 0–50}` and returns 201 `{id}`. One transaction: evidence row, citations and the `decision.recorded` audit row (enforced since BACK-100). | `evidence/evidence.body.ts`, `evidence.repository.ts` |
| Errors | Envelope `{error:{code,message,request_id}}`. Every auth failure and every invisible row is 404 `not_found`. | `http/safe-error.filter.ts` |
| Roles | One role, `owner`. The persona header is never authentication. | `auth/capabilities.ts` |

**App (blocked by rule, not by code):**
- `app/` makes no request. `api.guard.test.ts` forbids fetch, XHR and the rest, plus absolute URLs, and allows exactly
  two adapter files and four importers.
- The rule is written in `CLAUDE.md` (line 9), `app/README.md` and the demo doc.
- There is no env/config mechanism, no proxy and no "record decision" control.
- `StateBlock` already has `loading | empty | error | restricted | unavailable | not_configured | unknown`.

**Gaps that are not just wiring:**
- There is no idempotency key on the decision POST, so a double click records two decisions.
- No test spans app and server.
- The owner's first real Descope sign-in has not happened: `docs/planning/BACK-56/K-ID-1b-lab-runbook.md` is unrun.

## 2. Decisions for the owner

Each decision has a recommendation. Nothing starts until D1–D4 are answered.

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Lift "the app never calls the server"? | (a) Only in a **live mode** that is off by default; the fixture demo stays the default and keeps all of today's tests. (b) Replace the fixtures everywhere. (c) No. | **(a).** The demo and the CI suites keep working, and the change is confined to one module. |
| D2 | How the app reaches the server | (a) **Same origin**: the app calls relative `/api/...`, and a reverse proxy sends it to the BFF (Vite `preview.proxy` locally, the host's router when deployed). (b) The BFF serves the built app. (c) Add CORS with credentials. | **(a).** It keeps SameSite=Strict and no-CORS as the CSRF defence, unchanged. (c) would weaken it and is rejected. |
| D3 | How staff sign in from the app | (a) **Descope web SDK** in the app, which gets a JWT and POSTs it to `/auth/session`. This is a new dependency. (b) Hand off to the existing `/auth/lab` page; local only, never production. | **(b) first, then (a).** (b) unblocks the local end-to-end gate with no new dependency. (a) is needed before BACK-64 and needs your dependency approval. |
| D4 | Decision UI scope | A "Record decision" form in the Investigation Room, live mode, Owner and Technical only. Fields: decision (≤2000), rationale (≤4000), and cited evidence picked from that investigation's source evidence (0–50). On 201 it re-reads `GET /decisions`. | **As listed.** It records a decision but runs nothing. A recorded decision shows as recorded, never as Approved (the existing Approved rule stays). |
| D5 | Double submit | (a) Client only: disable on submit and keep the draft on failure. (b) Plus a server `Idempotency-Key` header, which needs a schema change. | **(a) now, (b) logged as a follow-up.** One owner in a pilot makes duplicates rare and visible, and the audit row records each one. |

## 3. Phases

Each phase is one PR with its own tests, merged only on your approval.

**P1 Live-mode plumbing (app).** Depends on D1, D2.
- **Mode switch.** A build-time flag `VITE_KAWALYS_LIVE=1` turns on live mode. Without it the build is byte-for-byte today's demo, so the existing e2e suites run unchanged.
- **HTTP client.** One new module, `app/src/api/http.ts`, is the only file allowed to call `fetch`.
  - Relative `/api/...` paths only, with `credentials: 'same-origin'` and `Content-Type: application/json`.
  - No absolute URLs.
  - It maps errors to typed results:
    - 401 or 404 → `not_found`. The server makes these identical on purpose: we never learn whether a row exists.
    - 400 → `invalid`
    - 429 → `rate_limited`
    - network failure → `unavailable`
    - 5xx → `error`
- **Guard.** `api.guard.test.ts` changes to allow exactly that file. All other bans stay, and new tests check that absolute URLs are still refused.
- **Reads.** Live Portfolio and Investigation reads reuse the existing `src/api` adapters, so the parity tests keep covering the shapes.
- **States.** Loading, empty and error use `StateBlock`. Unknown is never Healthy.
- **Proxy.** `app/vite.config.ts` gets `preview.proxy` and `server.proxy` from `/api` to `127.0.0.1:8787`, with the prefix stripped.

**P2 Session in the app.** Depends on D3.
- On start in live mode, the app calls `GET /api/auth/me`.
- Signed out, it shows a sign-in state that links to `/api/auth/lab` (local only).
- **Not verified yet:** whether the lab page's own `POST /auth/session` and its return work behind the `/api` prefix. P2 checks that first; if not, the lab page needs a small change (a configurable base path, no other behaviour change).
- It also shows who is signed in, plus sign-out (`DELETE /api/auth/session`).
- When the session expires mid-task, the app returns to sign-in and keeps any unsent decision draft in memory.

**P3 Record decision.** Depends on D4, D5.
- **Form.** The form, its validation copy in EN and AR (RTL), the evidence picker, and the submit button disabled while a submit is in flight.
- **Results:**
  - On 201, the decision list is re-read.
  - On 400, the reason is shown and the draft is kept.
  - On 404, the case reads as not visible, with nothing revealed.
- **Personas.** The persona switch hides the form for Nontechnical. That is display only: the server's capability check is the real gate.

**P4 End-to-end test and CI.**
- **Server.** A test-only server entry (`server/test/e2e/serve-e2e.ts`, never under `src/`) builds `createApp` with the existing `FakeIdentityVerifier` on Testcontainers Postgres, seeded like `local:up`.
- **Test.** A new Playwright config, `app/playwright.live.config.ts`, starts that server plus a live-mode `vite preview` with the proxy. It runs the full path: sign in, Portfolio, Investigation, record a decision, see it with its creator, and sign out.
- **Negative cases:**
  - signed out, every route reads as not found;
  - another workspace sees nothing;
  - a double click records one decision;
  - a session expiring mid-form keeps the draft;
  - Arabic copy is present for every new string.
- **Privacy.** The leak and nondisclosure checks run on live mode too.
- **CI.** One new job for this suite, added through `classify-changes.sh` and its test together. The required `gate` check name stays.

**P5 Real owner run (you do the provisioning).**
- Run the K-ID-1b runbook (Descope project and owner subject), then the same path locally with your real sign-in.
- Update the gate table in the demo doc. Rule text changes in `CLAUDE.md`, `app/README.md` and the demo doc go in P1 once D1 is approved.
- Then the separate gates: X02/X04 + BACK-30 sign-off, BACK-64 deployment (and D3 option (a) before it), and your sign-off.

## 4. Review focus: failure modes the tests must pin down

1. **The session expires while a decision is being typed.** Expected: the draft survives, the user signs in again, and it submits once.
2. **Double click or retry after a timeout.** Expected: one decision. Under D5 (a) this relies on the client. Any duplicate is visible in `GET /decisions` with its own audit row.
3. **A case that is hidden vs. one that doesn't exist.** Expected: both read the same, 404 → "not found". Neither the UI nor a count reveals that a hidden case exists (BACK-30).
4. **The BFF is down or the proxy is misrouted.** Expected: "unavailable" in words, never an empty list and never healthy.
5. **A decision posted while its evidence is revoked.** Expected: the server's share-locked grant check refuses it with 400 or 404, and the form says why without naming the hidden evidence.

## 5. Risks and limits

- **Same origin is mandatory.** The cookie is `__Host-` and `SameSite=Strict`, so anything other than D2 (a) or (b) breaks sign-in, by design.
- **Local transport.** Locally the cookie's `Secure` flag relies on browsers treating `127.0.0.1`/`localhost` as secure. Deployed, HTTPS is required (BACK-64).
- **No second role.** Personas stay a display switch. Any wider staff access needs a new role and capability design: out of scope here.
- **Live mode is real data.** It is no longer "demo only": every live screen must drop the demo marker and say where its data came from. Copy and tests change accordingly.
- **Size, roughly:** P1 is medium, P2 small, P3 medium, P4 medium. P5 is your provisioning time plus one run.
