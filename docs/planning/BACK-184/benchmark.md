# BACK-184 — Synthetic side-by-side benchmark

Part 1 (protocol) was written and committed in this file **before** either side was run. Part 2 holds the results.

## Part 1 — Protocol (pre-registered)

### Input
- One pinned synthetic fixture: [`fixtures/bench-fixture.v1.json`](fixtures/bench-fixture.v1.json), sha256 in [`fixtures/bench-fixture.v1.json.sha256`](fixtures/bench-fixture.v1.json.sha256).
- Its shape follows Kawalys' own committed synthetic fixtures at `df529ce` (`app/src/fixture/investigation-response.json`: example-org/demo-storefront, PR #42, checkout-e2e). It adds facts Kawalys does not model yet (a deployment, Sentry error issues, a Jira ticket) so the deploy → error → ticket scenario can be posed. No real names, hosts, ids, secrets or Kawalys data.
- **Claude Artifact side:** the same JSON embedded verbatim in a private artifact. No `mcp` capability, no live connectors (BACK-184 guardrail).
- **Kawalys side:** the unmodified fixture build of `app/` at `df529ce` (`npx vite build`, default mode, no live mode, no server). Kawalys reads its own committed fixtures, not this JSON; where its fixtures express the same situation, that is scored. Server behaviour is cited from existing tests and not re-run unless stated.

### Scale (per scenario, per side)
`PASS` meets every criterion · `PARTIAL` meets some · `FAIL` attempted, criteria not met · `NOT BUILT` no implementation exists · `UNKNOWN (blocker)` could not be tested, with the reason. Untestable is never scored as failure.

### Scenarios and criteria (fixed in advance)
| ID | Scenario | Criteria for PASS |
|---|---|---|
| B1 | Install / reopen a dashboard | Opens as a stand-alone window or stable URL; reopening shows the same state without rebuilding. |
| B2 | Visualize operational state | Shows per-source state for all four sources; Jira `down` and Datadog `not_configured` are visibly distinct from `ok`; Sentry `stale` is labelled with its age. |
| B3 | Deploy → error → ticket with traceable evidence | Links deploy 501 → error 7001 (same release, first seen after deploy); does **not** link error 6990 (earlier, other release); ticket link shown as **unknown** because Jira is down; every link cites evidence ids. |
| B4 | Decision history across sessions | Decision dec-1 with its citations is visible after closing and reopening; a newly recorded decision persists across a reload and is attributed and timestamped. |
| B5 | Stale / missing / conflicting evidence | Sentry "payments healthy" (stale, 11:10) vs CI `payments-contract` failure (11:40) is shown as a **conflict** or **unknown**, never as Healthy; missing Jira evidence shown as not read. |
| B6 | Scoped visibility / approval boundary | A `viewer` cannot see ev-sec-1 **and** cannot infer it (no count, no gap); the boundary is enforced by something the viewer cannot change. |
| B7 | Multi-provider agent workflow | An agent proposes an action across ≥2 providers, a human approves, the action runs, the run is audited. |

### Recorded per side
Build effort (wall-clock, iterations), reproducibility (can a second person get the same result from the same input), maintenance burden, accuracy against criteria, access boundary (who can see what, who enforces it), portability (where the result can move), cost assumptions.

### Time-box
Artifact side: one build pass plus up to three fix rounds, built the way a Claude user would (ask Claude for the page). A determined user could go further; the score is a floor, not a ceiling.

### Manual check left to the owner (agent must not click Install/Allow)
B1 for the Artifact: in Claude Desktop ≥ 6.28899.0 open the benchmark artifact → title menu → *Install as app* → open from the Start menu; close; reopen; note whether decisions recorded in B4 are still there. About two minutes.

## Part 2 — Results (2026-11-28)

Part 1 was written before either side ran and committed in `0794747` before these results. The fixture sha256 is of the committed (LF) bytes; the uploaded copy in the artifact store reported the same hash.

### Claude Artifact side
- **Artifact:** private, made from Claude's first-party **Data** (dashboard) type, which the Artifact quickstart selects for a dashboard. URL kept out of this file; the owner can open it from their artifact gallery as "Demo Storefront Ops Bench". No `mcp` connector calls; data = the pinned fixture uploaded as a file; decisions in the artifact's shared store.
- **What was built:** the page source is in [`artifact-side/dashboard-page.html`](artifact-side/dashboard-page.html): four `dash.calc` functions (source states, visible evidence, deploy/error/ticket links, conflicts) and a decision form writing to `data/team/decisions`.
- **Effort:** one build pass, no fix rounds. About 15–20 minutes of agent time, most of it reading the Data type's guide (`one-writer`, `design-defaults`, `features`). Built by the same agent that wrote this brief, so a floor, not a ceiling.
- **Verification method:** the page could not be rendered: the built-in browser was not signed in to claude.ai, the Chrome extension was not connected, and the agent may not sign in. So the logic was checked by running the page's own calc functions against the fixture in Node ([`artifact-side/calc-harness.js`](artifact-side/calc-harness.js) → [`calc-output.json`](artifact-side/calc-output.json)), and storage and access rules were checked with the artifact database tool at reduced access levels.

| ID | Score | Observation |
|---|---|---|
| B1 | UNKNOWN (blocker: install needs the owner's confirmation in Claude Desktop) | Documented: same artifact, online and signed in (S1). Manual check in Part 1 |
| B2 | PASS (logic) · render not observed | github ok (10 min), sentry **stale** (50 min vs 15 min budget), jira **down**, datadog **not_configured** |
| B3 | PASS (logic) | deploy 501 → error 7001 "supported, error source stale", basis "release r-2026.11.25.1; first seen 6 min after deploy", cites ev-deploy-1, ev-err-1. Error 6990 **not** linked. 7001 → SHOP-101 **unknown**, "ticket source down; not read" |
| B4 | PASS (store) · form render not observed | dec-1 with three citations persisted and readable at `view` level; a write at `interact` level (any signed-in non-editor) was **refused**; writes are editor-only (Data type rule) |
| B5 | PASS (logic) | payments health → "conflict, unknown": "healthy" from stale source at 11:10 vs payments-contract failed at 11:40; SHOP-101 "not read" |
| B6 | FAIL | Persona switch is a client-side filter the viewer chooses (owner 8 rows, viewer 7). The restricted item stays in the uploaded file, which "everyone who can open the artifact can load" (upload result; Data type guide says the same of attached files and shared rows). Per-viewer scoping exists only through each viewer's own connector permissions at the source |
| B7 | UNKNOWN (blocker: live connectors and write actions are out of scope) | Documented: connector writes run as the viewer who presses the control; artifacts can call Claude (S2, S3). No approval queue or run audit is documented inside the page |

Other criteria:
- **Reproducibility:** high for the page (stored HTML + fixture); answers in live mode would vary per viewer because connector calls use each viewer's access (S3).
- **Maintenance:** page code is regenerated by asking Claude; nothing to host. Connector schemas drifting would break calcs silently (the type reports mismatches only when someone opens the page).
- **Access boundary:** platform-enforced at the connector (viewer's own access) and at write level (editor-only shared rows). Not enforceable per evidence item inside one artifact.
- **Portability:** page HTML is readable; store and connector setup have no documented export (sources.md).
- **Cost:** included in a Pro+ plan ($17–20/user/month); every Claude call from the page counts against the viewer's plan limits (S1, S6).

### Kawalys side
- **Build:** `app/` at `df529ce`, `npm ci && npx vite build`, default (fixture) mode. No server, no live mode.
- **Run:** existing Playwright specs that map to the scenarios, chromium, 1 worker: investigation, investigation-integration, source-observatory, sources, decisions, evidence, nondisclosure, lens-nondisclosure, arabic-copy, agent-flight-deck. Log: [`evidence-kawalys-e2e.log`](evidence-kawalys-e2e.log). Result: **489 passed, 0 failed (3.4 min)**.
- **Server behaviour** (persistence, RLS, hidden = not found) is **cited** from `server/test/evidence`, `server/test/auth`, `server/test/db`, not re-run here (they need Docker).
- **Effort:** none for this benchmark; the capabilities existed. Historical effort is sunk (capability-matrix.md §4).
- Kawalys does not read `bench-fixture.v1.json`; it was scored on its own committed fixtures expressing the same situations (PR #42 → failed checkout-e2e, stale Sentry claiming healthy → Unknown, withheld Technical-only evidence).

| ID | Score | Observation |
|---|---|---|
| B1 | PASS (reopen by URL) · install N/A | Static build or pilot URL; no desktop install |
| B2 | PASS | Observatory and sources specs: per-source connectivity/freshness, never Healthy when stale/down |
| B3 | NOT BUILT | Fixture has a user-written `Correlation` evidence item (PR #42 → failed run) with citations; no deploy → error → ticket correlation exists (BACK-182 To Do) |
| B4 | PASS (server, cited) · fixture UI shows canned decisions | Decisions persisted with append-only audit and citations (migration 0004, `decisions-db.spec.ts`, `decision-audit-db.spec.ts`); recording in live mode #122 |
| B5 | PARTIAL | Stale/not-read handled and tested ("claimed healthy on a stale read: Unknown", `world.ts:401`); a conflict is recorded in the fixture (`world.ts:120`) but there is no conflict-detection logic |
| B6 | PARTIAL | UI: withheld evidence not detectable in DOM, same not-found state for a direct route (`nondisclosure.spec.ts`), but the persona is "a display switch on synthetic demo data, not authorization" (spec header). Server: forced RLS, deny-by-default, identical 404 for hidden items (tested). Only one real role (owner), so a second-principal boundary is not exercisable today |
| B7 | NOT BUILT | Flight Deck agents are simulated |

### Limitations
- Synthetic, eight evidence items, one project. Real-data difficulty (history, entity resolution, backfill, rate limits) is untested on both sides.
- The Artifact page was not seen rendered; B2/B4 UI parts are unobserved.
- One account: second-viewer behaviour of the Artifact is documented, not tested.
- Same author for both sides and for the brief; see `review.md`.
