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
