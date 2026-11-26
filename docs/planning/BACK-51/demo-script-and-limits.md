# BACK-51 (MVP-05): demo script and known limitations

Status: **draft for owner review. The pilot readiness gate is NOT PASSED.** This document is the "demo script" and
"known limitations" half of BACK-51. Owner sign-off and the end-to-end login flow are not done (see the gate table).
Missing evidence counts as NOT RUN/BLOCKED, never PASS.

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

## Known limitations

1. **No login in the app.** Customers never sign in; staff sign-in exists only as the owner-only BFF lab (BACK-56) and is
   off until `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` are set.
2. **The app calls the server only in live mode** (BACK-51 P1; owner decisions D1 (a) and D2 (a), 2026-11-26). By
   default, Portfolio and the Investigation Room's server-shaped records panel use committed synthetic fixtures, which
   parity tests keep equal to real server responses. With `VITE_KAWALYS_LIVE=1` they read `GET /portfolio`,
   `GET /investigations/:id` and `GET /decisions` same origin (`/api`, proxied), through `app/src/live/http.ts` only. There
   is no sign-in in the app yet (P2), so live reads answer "not found, or not signed in" until a session exists.
3. **No live connector.** GitHub, Jira and Confluence exist as mappers behind read-only ports with canned answers; there
   is no transport and no token. Jira and Confluence records can be stored since BACK-99 (migration 0005), but the
   portfolio reads GitHub sources only.
4. **Decisions are recorded through the API only** (`POST /investigations/:id/decisions`); the UI has no "record
   decision" control. `GET /decisions` (BACK-59) lists them with creator and time. Since BACK-100 (migration 0004) a
   decision cannot be stored without its audit row, so its creator is always recorded. `GET /decisions` has no cursor
   pagination (`limit` up to 100, optional `investigationId` filter).
5. **No hosting.** Nothing is deployed (BACK-64); no database, Descope project or secrets are provisioned.
6. **One role.** Only `owner` exists server-side; personas in the app are a display switch, never authorization.

## Pilot readiness gate (from the 22 Nov reconciliation)

| Requirement | State |
| --- | --- |
| Login → Portfolio → Investigation → record decision, end to end | **BLOCKED**: needs auth configured, app wiring approved, a decision UI |
| Demo script (5–10 min) | Draft above |
| Known limitations listed | Above |
| X02/X04 + BACK-30 restricted-existence security sign-off | NOT RUN |
| BACK-55/56/57/59/60/61/62 readiness | Code slices merged or in review; BACK-64 deployment NOT RUN |
| Negative / privacy / EN-AR / RTL / a11y checks documented | In CI (app e2e: `a11y`, `leaks`, `nondisclosure`, `arabic-copy`) |
| Owner signs off | **NOT RUN** (owner only, no auto-close) |
