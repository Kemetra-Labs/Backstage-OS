# BACK-51 (MVP-05): demo script and known limitations

Status: **draft for owner review. The pilot readiness gate is NOT PASSED.** This document is the "demo script" and
"known limitations" half of BACK-51. The pilot is deployed and the owner has signed in for real; owner sign-off and the
live Portfolio-to-decision walk are not done (see the gate table and the
[evidence bundle](pilot-gate-evidence-bundle.md)). Missing evidence counts as NOT RUN/BLOCKED, never PASS.

## What can be demonstrated today (synthetic data only)

Serve the React app: `cd app && npm ci && npm run build && npx vite preview` and open `http://127.0.0.1:4178/`.
Every screen shows a demo marker. The default build calls nothing: the app calls the server only in live mode
(`VITE_KAWALYS_LIVE=1`, BACK-51 P1), same origin, through `app/src/live/http.ts`. See `app/README.md`, "Live mode".

### Script (about 9 minutes, Owner and Technical)

| Min | Step | Route | What to point out |
| --- | --- | --- | --- |
| 0–1 | Home, persona **Owner**, EN | `#/` | Source health in words; a source never read says "not read yet", not healthy. |
| 1–2 | Portfolio | `#/portfolio` | GitHub reads panel: current, stale, not read yet, unknown, unavailable, each with a reason in words. Counts are lower bounds when a page was full. Optional (BACK-62): open `/?github=error#/portfolio` (also `denied`, `timeout`, `malformed`, `empty`) to force a connector failure: every source reads unavailable with its reason, or the panel shows an explicit error or empty state. Never blank, never green. |
| 2–4 | Investigation Room | `#/investigation/INV-DEMO-7` | Every evidence row has a type badge (Observed / Correlated / Hypothesis / Proposed). Stale rows carry an amber side rule; unread rows say why. Customer impact is **Unknown**, not "none". |
| 4–5 | "Server-shaped demo records" panel, lower on the same page | same | Records of a separate synthetic case, shaped like the server's `GET /investigations/:id` and `GET /decisions` answers and read from a committed file (BACK-57; nothing is requested). It is marked as demo data. One record is a Hypothesis read as Stale. The other is Unknown and Not read, with "The source read failed." The decision is Proposed, with "Creator recorded" (BACK-59/100). It shows no health word and no link. Nontechnical gets no panel. |
| 5–6 | Open one evidence item, then the Evidence Explorer | drawer, then `#/evidence/E-5?from=INV-DEMO-7` | Freshness and age in words; demo links are inert. |
| 6–7 | Switch persona to **Technical** | same | Ids, rule text and raw output appear, and the server-shaped records show their source references. Nothing hidden from Owner is revealed by count or gap. |
| 7–8 | Decisions | `#/decisions` | A decision shows Approved only when its owning record was read and resolves as approved; otherwise Proposed. Kawalys records no decision and runs nothing in this version. |
| 8–9 | Switch language to **Arabic** | any | Full RTL layout, every string translated. |

Backend half (Technical only, optional): `cd server && npm run local:up` (BACK-61) brings up a loopback Postgres with
synthetic evidence, then prints what was seeded. The HTTP routes stay deny-all without a configured Descope owner.

### Live-mode variant (about 8 minutes, Owner)

Use this to show the real gate path: the app reading the Kawalys server and recording a decision. It is a variant, not the
default. The synthetic-fixture script above stays the default path. Data is still synthetic.

**Run it, option 1: the automated suite (no Descope, no secrets).** From the repo root:
`(cd server && npm ci) && cd app && npm ci`, then `npx playwright install chromium` once, then `npm run e2e:live` in `app/`
(needs Docker running; Chromium only). It starts a test-only BFF with a fake identity verifier on disposable Postgres and a
live-mode build behind `vite preview` (`app/README.md`, "Live end-to-end suite"). It runs the whole path below as a test
(`app/e2e-live/gate-path.spec.ts`). It is the same job CI runs as `live-e2e`. There is no browser to watch; show the passing run.

**Run it, option 2: by hand (owner's machine, needs a Descope project).** No Descope project exists yet (P5), so this
cannot run today. Once the owner has one, follow `docs/planning/BACK-56/K-ID-1b-lab-runbook.md` section 2: set
`KAWALYS_DESCOPE_PROJECT_ID`, `KAWALYS_OWNER_SUBJECT` and `KAWALYS_AUTH_LAB=1`, then `npm run build && npm start` in
`server/` (BFF on `127.0.0.1:8787`). To read the seeded data, run `npm run local:up` first and keep the two
`KAWALYS_DATABASE_URL_*` lines it prints, with the same Descope variables set so the seed binds the real owner
(`server/README.md`, local stack). Then `cd app && VITE_KAWALYS_LIVE=1 npx vite` (`app/README.md`, "Live mode"). Without
Descope, every protected route is deny-all and the app only shows "not found, or not signed in".

| Min | Step | What to point out |
| --- | --- | --- |
| 0–1 | Open the app. The session bar says signed out | Every live read says "not found, or not signed in" in words, never an empty list, never healthy. |
| 1–2 | Sign in (the session bar's link opens the lab page `/api/auth/lab`; the app then re-checks `GET /api/auth/me`) | The bar shows the owner role. Customers never sign in. |
| 2–4 | Portfolio | Panels say "Live: read from the Kawalys server". The GitHub sources come from the seed; stale or unread ones still say so. |
| 4–6 | Investigation Room (the newest case, or `?investigation=<uuid>` from `local:up`) | Evidence rows keep their type badges and Unknown customer impact. |
| 6–7 | **Record a decision** (Owner or Technical; Nontechnical sees no form) | Pick records, write the decision, submit once. A double click sends one request (client-side guard only). |
| 7–8 | The new decision in the list | It appears as Proposed, with its creator and time. Technical also sees source references. |
| 8 | Sign out | The page drops what it held; the in-memory draft is cleared. Reads answer "not found" again. |

## Known limitations

1. **No customer login; owner sign-in is Descope magic link.** Customers never sign in. The app has a session bar
   (`GET /api/auth/me`) and a sign-out (BACK-51 P2). In the deployed pilot the owner signs in at `/sign-in` (Descope web
   component, magic link; BACK-117 D3(a)); the owner-only lab page (`/api/auth/lab`) is loopback-only and refused in
   production. A real Descope sign-in was run on the deployed pilot on 27 Nov 2026 (P5 PASS, evidence bundle). Every
   protected route stays deny-all until `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` are set.
2. **The app calls the server only in live mode** (`VITE_KAWALYS_LIVE=1`, same origin `/api`, proxied; BACK-51 P1; owner
   decisions D1 (a) and D2 (a)). The default build reads committed synthetic fixtures and makes no request. Parity tests
   keep those fixtures equal to real server responses. A draft decision is kept in memory only and cleared on sign-out.
3. **No real connector, no transport.** GitHub, Jira and Confluence exist as mappers behind read-only ports with canned
   answers; there is no network transport and no token (BACK-52 has not run). Jira and Confluence records can be stored
   since BACK-99 (migration 0005), but the portfolio reads GitHub sources only.
4. **Decisions are recorded in the app** (P3: "Record a decision" in the Investigation Room, Owner and Technical only) and
   through `POST /investigations/:id/decisions`. `GET /decisions` lists them with creator and time, with an opaque cursor
   (`limit` up to 100, optional `investigationId` filter). A decision cannot be stored without its audit row (BACK-100,
   migration 0004), so the creator is always recorded. Nothing is approved or run by Kawalys: a new decision is Proposed.
5. **Duplicate guard is client-only (D5 (a)).** The form allows one submit at a time and keeps the draft on failure. The
   server has no `Idempotency-Key`. A retry after a timeout could record a second decision, visible in `GET /decisions` with
   its own audit row. A server key is a logged follow-up (D5 (b)).
6. **The live suite runs in Chromium only.** The session cookie is `__Host-` and `Secure`; whether WebKit accepts it over
   plain `http://127.0.0.1` is not verified. The default app suite still runs in Chromium and WebKit.
7. **One pilot host, empty database.** The pilot is deployed at `https://kawalys.kemetralabs.com` (BACK-64/117: Lightsail behind Cloudflare, Neon PostgreSQL 18, Descope). The Neon database holds the schema and no seeded cases, so the live Portfolio, Investigation and record-a-decision screens have nothing to show until data is seeded (owner decision O1 in the evidence bundle).
8. **One role.** Only `owner` exists server-side. Personas in the app are a display switch, never authorization.
9. **Synthetic data only.** No customer data, and no live telemetry is shown anywhere.

## Pilot readiness gate (from the 22 Nov reconciliation)

The gate is NOT PASSED. A row is PASS only with evidence; missing evidence stays NOT RUN or BLOCKED.

| Requirement | State |
| --- | --- |
| Login → Portfolio → Investigation → record decision, end to end | Passes in CI (`live-e2e`, 9 tests, Chromium) with the fake identity verifier. Real Descope sign-in on the deployed pilot: **PASS** (P5, 27 Nov 2026). Portfolio, Investigation and decision on the live pilot: **NOT RUN** (database not seeded; evidence bundle O1) |
| Demo script (5–10 min) | Written above: fixture script plus live-mode variant. Not yet rehearsed with the owner |
| Known limitations listed | Above |
| X02/X04 + BACK-30 restricted-existence security sign-off | Evidence pack ready ([link](x02-x04-back30-evidence.md)); owner rulings (M2 and others) and sign-off NOT RUN |
| BACK-55/56/57/59/60/61/62 readiness | Code slices merged; BACK-56 real sign-in run on the pilot (P5 PASS) |
| BACK-64 deployment | **PASS**: deployed 27 Nov 2026 and probed; rollback proven. Evidence: [pilot-gate-evidence-bundle.md](pilot-gate-evidence-bundle.md). Runbook: `docs/planning/BACK-64/pilot-deployment-runbook.md` |
| Negative / privacy / EN-AR / RTL / a11y checks documented | In CI (app e2e: `a11y`, `leaks`, `nondisclosure`, `arabic-copy`; live e2e: negative, Arabic and leak cases) |
| Owner signs off | **NOT RUN (owner only)** |
