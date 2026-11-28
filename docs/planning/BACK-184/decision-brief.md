# BACK-184 — Decision brief: why pay for Kawalys if you already have Claude?

Status: **proposal for owner approval.** Nothing here changes Jira, the roadmap or production. Date: 2026-11-28. Repository baseline: `df529ce`.
Evidence: [sources.md](sources.md) (official Anthropic pages, fetched today) · [benchmark.md](benchmark.md) (side-by-side synthetic test) · [capability-matrix.md](capability-matrix.md) (inventory, substitutability, reuse, cost) · [review.md](review.md) (independent critique).

## 1. Short answer

Today, on the scenarios we could test, **a Claude user gets most of what Kawalys shows without Kawalys.** A connector dashboard with per-chart source and freshness is a first-party Claude feature (Claude Data). In our synthetic benchmark, one build pass of a Claude Data artifact passed the deploy → error → ticket, stale/conflict and decision-history scenarios. Kawalys has not built the correlation scenario at all.

What Claude Artifacts **cannot** do, by their documented design, is the part Kawalys has actually engineered: a server that keeps evidence after the page closes, ingests on a schedule, enforces who may see which piece of evidence, and audits it. An artifact is "one self-contained page with no backend" whose connector calls run as each viewer while the page is open. Attached files and shared rows are readable by every viewer.

That difference is real but **unproven as something anyone pays for.** Kawalys has no active real source, an empty pilot database and no users besides the owner. The differentiated capabilities are mostly server foundations; the visible product on top of them is mock data.

**Proposed decision: narrow and reposition** (option B below). Stop investing in UI layers that Claude generates on demand. Spend the next validation cycle proving the evidence ledger on real data and exposing it to Claude through MCP (BACK-168), so artifacts become a front end for Kawalys rather than a substitute. Set kill criteria now.

## 2. Target user (hypothesis, not validated)

A solo founder or small team (2–10) that already pays for Claude, runs AI coding agents across several repositories, and loses time re-establishing "what changed, what broke, what did we decide and why" in every new session. They need that context to persist, carry citations, and be shared with teammates, clients or agents **without** giving everyone the same raw access.

Secondary (weaker evidence): Arabic-first agencies showing scoped progress to non-technical clients (BACK-3). Needs a second principal type that does not exist yet.

Who is probably **not** a buyer: a solo developer who only wants a dashboard of their own GitHub/Sentry/Jira. Claude covers that for the plan they already pay ($17–20/month, Pro or above; sources S2, S7).

## 3. What the evidence shows

### 3.1 Platform facts (official, [sources.md](sources.md))
- Installable artifacts: beta since 2026-11-24 on Mac/Windows desktop, online and signed in; same artifact, so edits flow through (S1, S4).
- Connectors read and write as **the viewer**, after per-viewer approval; no credentials reach the page (S2, S3). Claude Data live sharing is the exception: it runs the editor's approved queries for the organization (S5, S6).
- Storage: personal or shared, 100 MB / 25,000 documents per artifact (S2). Strict CSP, no backend, no viewer authentication of its own, 16 MiB page (S3).
- No documented schedule, webhook, background ingestion, per-record access policy or storage export.
- Distribution needs a claude.ai account and the Anthropic API path; not Bedrock/Vertex/Foundry; not with CMEK, HIPAA or ZDR (S1, S3).

### 3.2 Benchmark (synthetic, same pinned fixture, [benchmark.md](benchmark.md))
Kawalys side: 10 existing e2e specs on the fixture build, 489 passed, 0 failed. Artifact side: logic run in Node, store and access rules checked with reduced access levels; the page itself was not seen rendered.

| Scenario | Claude Artifact (Data type) | Kawalys (fixture build at `df529ce`) |
|---|---|---|
| B1 Install / reopen | UNKNOWN: installing needs the owner's click in Claude Desktop | PASS for reopen by URL (static build); no install concept |
| B2 Operational state | PASS (logic); render not observed | PASS (tested: observatory, sources specs) |
| B3 Deploy → error → ticket | PASS (logic, one build pass) | NOT BUILT (BACK-182) |
| B4 Decision history | PASS (store persists, editor-only writes enforced) | PASS in live mode with audit (server tests, cited not re-run); fixture build shows canned decisions |
| B5 Stale / missing / conflicting | PASS (coded by the builder) | PARTIAL: stale/not-read tested; a conflict is recorded in the fixture, no detection logic |
| B6 Scoped visibility | FAIL: restricted item readable by any viewer through the data file | PARTIAL: UI non-disclosure tested; server deny-by-default and RLS tested; one role only |
| B7 Multi-provider agent workflow | UNKNOWN (documented, not tested: no live connectors allowed) | NOT BUILT |

Read the table carefully: on clean fixtures the correlation and conflict logic is a few dozen lines that Claude writes in minutes. The hard part of correlation on real data (history, entity resolution, releases, backfill, missing sources) was not tested on either side.

### 3.3 Inventory ([capability-matrix.md](capability-matrix.md))
- **Shipped and tested, differentiated by architecture:** evidence store with forced RLS and append-only audit; owner auth, deny-by-default, hidden = not found; HTTP hardening; source identity approval; decisions with audit; memory/retrieval/search; Unknown-never-Healthy semantics; EN/AR/RTL.
- **Built but inactive:** GitHub read-only transport (no App installed, no real data).
- **Mock only:** Mission Map, Observatory, Replay, Flight Deck (well tested, synthetic `WORLD`).
- **Unbuilt:** correlation (BACK-182), VIE scene and Code Review Room (BACK-119..125), Software Factory (BACK-126), agent execution, Sentry/Datadog connectors, Kawalys MCP (BACK-168).
- **Not found anywhere:** a durable record of the eight VIE workshops / 55 decisions (BACK-119 owns recovery).

## 4. Measurable differentiation hypotheses

Each needs a pass line set before the test. None is validated.

| # | Hypothesis | Test | Pass line (proposed) |
|---|---|---|---|
| H1 | **Durable memory beats per-session reconstruction.** After 30 days of real ingestion, Kawalys answers cited "what changed before X / what did we decide" questions that a fresh Claude session must rebuild from live connectors. | 10 pre-registered questions on one real repo, same model, with and without Kawalys context (BACK-168 Stage A). | ≥ 8/10 correct with citations, and ≥ 30% fewer tool calls or tokens than without |
| H2 | **Correlation on real data is not a weekend artifact.** | BACK-182 on fixtures, then on real GitHub + one more source. Compare with a Claude-written artifact rule on the same export. | Kawalys precision clearly higher on pre-labelled links; otherwise drop the claim |
| H3 | **Scoped sharing is a reason to pay.** | 6–8 interviews (BACK-3): founders/agencies who share project state with clients or contractors. | ≥ 3 describe a current workaround and a budget; else treat governance as hygiene, not product |
| H4 | **Self-hosted / no-Claude-seat matters to someone.** | Same interviews. | ≥ 2 name it as a blocker for Claude-only use |

Willingness to pay (hypotheses only): solo developer $0 (uses Claude); small team per-seat or per-workspace for a shared, cited project memory that their agents consume; agency per client workspace. No price is proposed until H1 and H3 have results.

## 5. Options

| Option | What it means | Cost ahead | Risk |
|---|---|---|---|
| A. Continue as planned | BACK-181..183, VIE-01..08, Software Factory planning, COG activation, in current order | Highest: months of UI and engine work | Builds what Claude generates; no market evidence |
| **B. Narrow and reposition (recommended)** | Kawalys = evidence ledger + scoped memory + correlation, served through an API/MCP and a thin owner UI. Freeze visual lenses; defer VIE and Software Factory; run H1–H4 | Moderate: BACK-52 activation, BACK-182, BACK-168 Stage A, BACK-154/155, interviews | Hypotheses may fail; MCP channel depends on Anthropic connector terms |
| C. Pivot | Drop the product UI entirely; ship only an MCP server / self-hosted evidence service | Lowest engineering, highest positioning risk | Loses the Arabic-first and non-technical-owner angle; still unvalidated |
| D. Pause | Stop feature work after the BACK-51 sign-off; keep the pilot running; revisit with interview data | Near zero | Momentum loss; foundations age |

Why B over C: B keeps the option of a human UI where a second principal (client, teammate) needs it, and it costs little more than C because the UI already exists and is frozen, not extended. Why B over D: the cheapest decisive evidence (H1 via BACK-168 Stage A, H3 via interviews) is a few weeks of work and reuses shipped code.

**Kill criteria for B** (proposed): if H1 fails its pass line and fewer than 2 of 6 interviewees would pay, move to D.

## 6. Proposed roadmap delta (for approval; nothing applied)

Priority order. "Reduce" and "defer" mean edit the ticket text after approval, not close it.

| P | Ticket | Proposal | Reason |
|---|---|---|---|
| P0 | [BACK-51](https://rahmaqanater.atlassian.net/browse/BACK-51) | **Retain**: finish owner sign-off only | Nearly done; closes a gate |
| P0 | [BACK-52](https://rahmaqanater.atlassian.net/browse/BACK-52) | **Retain**: owner activation of one real repo (App, BACK-128 key custody) | Every hypothesis needs real data; code is done |
| P0 | [BACK-3](https://rahmaqanater.atlassian.net/browse/BACK-3) | **Investigate now**: 6–8 interviews for H3/H4 (owner decides on contacting people) | Only source of willingness-to-pay evidence |
| P1 | [BACK-168](https://rahmaqanater.atlassian.net/browse/BACK-168) | **Promote**: Stage A as the main validation (H1), read-only, two tools | Turns Claude from substitute into channel; owner already recorded this direction today |
| P1 | [BACK-182](https://rahmaqanater.atlassian.net/browse/BACK-182) | **Retain, reframe**: correlation as a server capability over ingested history, exposed by API/MCP; fixture first, then real | The one differentiator that needs history; H2 |
| P1 | BACK-154 / BACK-155 | **Retain if BACK-168 proceeds**: bounded real-volume memory reads | Live memory read measured to fail closed at real volume (open PR #187) |
| P2 | [BACK-183](https://rahmaqanater.atlassian.net/browse/BACK-183) | **Reduce**: access log for API/MCP reads first; defer the permissions page until a second user exists | Needed by BACK-168 Stage B anyway |
| P2 | [BACK-181](https://rahmaqanater.atlassian.net/browse/BACK-181) | **Reduce**: keep the Unknown-never-Healthy contract as an API guarantee plus one regression test; drop the all-screens display program | Claude Data already shows source and freshness per figure |
| P2 | [BACK-180](https://rahmaqanater.atlassian.net/browse/BACK-180) | **Revise thesis** to "Kawalys keeps and scopes the evidence; any client can show it"; adopt the proposed team rule | Benchmark: artifact data files are readable by every viewer |
| P3 | [BACK-118](https://rahmaqanater.atlassian.net/browse/BACK-118) VIE-03 Code Review Room ([BACK-121](https://rahmaqanater.atlassian.net/browse/BACK-121)) | **Defer** | Claude Code already publishes PR walkthrough artifacts (S3) |
| P3 | VIE-04..07 ([BACK-122](https://rahmaqanater.atlassian.net/browse/BACK-122)–[BACK-125](https://rahmaqanater.atlassian.net/browse/BACK-125)) | **Defer** with re-entry trigger: H1 passes and a user asks for spatial views | Rendering is substitutable; data is not |
| P3 | [BACK-126](https://rahmaqanater.atlassian.net/browse/BACK-126) Software Factory | **Defer** | Vision only; depends on VIE proof |
| P3 | [BACK-119](https://rahmaqanater.atlassian.net/browse/BACK-119) | **Reduce** to recovering the workshop record (cheap, keeps provenance) | Decisions should not be lost even if deferred |
| P3 | [BACK-120](https://rahmaqanater.atlassian.net/browse/BACK-120) | **Merge into BACK-52 activation** | Same real GitHub evidence path |
| P3 | [BACK-103](https://rahmaqanater.atlassian.net/browse/BACK-103) COG-05 activation, BACK-156/157, COG-06 | **Defer** until real outcomes exist | Already gated; no change in substance |
| P3 | [BACK-163](https://rahmaqanater.atlassian.net/browse/BACK-163) metrics | **Defer** | Report views are substitutable by Claude Data |
| — | Mission Map, Observatory, Replay, Flight Deck | **Freeze** (maintain tests, no new lens work) | Mock data; keep as design reference |

No new tickets proposed: every item has an existing home. No ticket is closed.

### The eight design workshops
There is no durable record of them in the repository or Jira; their decisions live in an owner conversation (BACK-118, BACK-119). Their delivery homes are VIE-01..08 above. Under option B: **retain** the evidence-first principle and the "one app, one canonical model" rule; **reuse** VIE-02 inside BACK-52; **defer** the WebGL engine, scene model, Code Review Room and Software Factory; **investigate** only the record recovery. If the owner can share the workshop record, each decision should be mapped to retain/defer individually; this brief does not invent their content.

## 7. Remaining costs and risks

- **Option B, next 4–6 weeks (estimate):** BACK-52 activation (owner hours), BACK-182 fixture+real (engineering weeks), BACK-168 Stage A (1–2 weeks incl. measurement), BACK-154/155 (in PR), interviews (owner time). Running cost unchanged (~$12/month host + current Neon plan).
- **Platform risk:** Anthropic can add server-side scheduling or durable storage to artifacts; the "no backend" gap could shrink. Re-check sources quarterly.
- **Channel risk:** a Kawalys MCP connector must be a hosted remote MCP with its own auth; viewers connect it themselves (S3). Terms and review for custom connectors were not checked here.
- **Evidence risk:** the benchmark is synthetic, small and built by the same agent that wrote this brief. The Artifact score is a floor; a determined user could build more. See [review.md](review.md).

## 8. Open questions for the owner
1. Approve, amend or reject option B and its kill criteria?
2. May interviews (H3/H4) contact real people, and who?
3. Activate BACK-52 on which repository?
4. Can the eight-workshop record be shared so each decision is mapped individually?
5. Run the two-minute install check (B1) in Claude Desktop and note the result in `benchmark.md`?

## 9. Validation milestones
- M1 (after BACK-52 activation): one real repo ingesting; source states truthful on the pilot.
- M2: BACK-182 fixture scenario green in EN/AR, including the `down` → unknown case.
- M3: BACK-168 Stage A comparison run against H1's pass line, results recorded.
- M4: interview synthesis against H3/H4.
- Decision point after M3 + M4: continue B, move to C, or pause (D).
