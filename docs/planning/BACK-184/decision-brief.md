# BACK-184 — Decision brief: why pay for Kawalys if you already have Claude?

Status: **proposal for owner approval.** Nothing here changes Jira, the roadmap or production. Date: 2026-11-28. Repository baseline: `df529ce`.
Evidence: [sources.md](sources.md) (official Anthropic pages, fetched today) · [benchmark.md](benchmark.md) (side-by-side synthetic test) · [capability-matrix.md](capability-matrix.md) (inventory, substitutability, reuse, cost) · [review.md](review.md) (independent critique and what changed).

## 1. Short answer

**Today there is no demonstrated reason for a Claude user to pay for Kawalys.** A connector dashboard that shows each figure's source and freshness is a first-party Claude feature (Claude Data). In our synthetic benchmark, one build pass of a Claude Data artifact produced correct deploy → error → ticket links, stale and conflict handling, and a persistent decision log. Kawalys has not built the correlation scenario, has no active real source, an empty pilot database and one user (the owner).

Kawalys does have something Claude Artifacts are not designed to be: a server that owns evidence, enforces row-level access, and audits writes. But the gap is **narrower than "artifacts have no backend"**: artifacts keep up to 100 MB of shared or personal data, Claude Data re-queries on an interval when opened, and a scheduled Claude routine can keep an artifact's data current. And the one place Kawalys is structurally stronger, scoping evidence between different people, cannot be shown yet: Kawalys has a single role.

**Proposed decision: B-gated.** Keep the direction "Kawalys = evidence service behind MCP, thin owner UI, no more UI layers", but spend **no engineering weeks** until a short evidence gate passes: owner-only steps already coded (BACK-51 sign-off, BACK-52 activation), 6–8 interviews, a competitor category scan, and 2–3 weeks of the owner using a Claude-native baseline on real repos. If the gate fails, pause (D).

## 2. Target user (hypothesis, not validated)

A small team (2–10) that already pays for Claude, runs AI coding agents across several repositories, and shares project state with people who should not get the same raw access: contractors, clients, a non-technical founder. They need context that persists, carries citations and is scoped per person.

Probably **not** a buyer: a solo developer who wants a view of their own GitHub/Sentry/Jira. Claude covers that within a plan they already pay ($17–20/month, Pro or above; S2, S7). This removes the owner-as-solo-user case as evidence of demand.

Secondary, weaker: Arabic-first agencies reporting to non-technical clients (BACK-3). Same blocker: needs a second principal.

## 3. What the evidence shows

### 3.1 Platform facts (official, [sources.md](sources.md))
- Installable apps: beta since 2026-11-24, Mac/Windows desktop, online and signed in. Template artifacts (Docs, Slides, Sheets; S2 also lists Data) can't be installed (S1, S2, S4).
- Connectors read and write as **the viewer**, after per-viewer approval; Claude Data live sharing runs the editor's approved queries for the organization (S2, S3, S5, S6).
- Storage per artifact: personal or shared, 100 MB / 25,000 documents; attached files and shared rows are readable by everyone who can open the artifact (S2; Data type guide).
- No backend of its own, strict CSP, no viewer authentication (S3). Interval refresh on open (S6); scheduled routines can update data (Data type guide, untested).
- Publishing from Claude Code needs a claude.ai account and the Anthropic API path, and no CMEK/HIPAA/ZDR (S3). Installed apps: not for HIPAA-ready orgs; ZDR orgs can install but apps aren't covered by ZDR (S1).

### 3.2 Benchmark ([benchmark.md](benchmark.md))
Same pre-registered criteria for both. The Artifact used the pinned synthetic fixture. Kawalys did **not** read it; it was scored on its own fixtures that express similar situations. Kawalys: 10 existing e2e specs on the fixture build, 489 passed, 0 failed (mostly mock screens, i18n, accessibility). Artifact: page logic run in Node, store and access rules checked at reduced access levels; the page was not seen rendered.

| Scenario | Claude Artifact (Data type) | Kawalys (fixture build) |
|---|---|---|
| B1 Install / reopen | Reopen PASS; install FAIL by documentation for template artifacts; non-template install untested | Reopen PASS (URL); no install concept |
| B2 Operational state | PASS (logic) | PASS (tested) |
| B3 Deploy → error → ticket | PASS (logic, one pass, fixture shaped by the same author) | NOT BUILT |
| B4 Decision history | PARTIAL (store persists, editor-only writes enforced; form not exercised) | PARTIAL (server persistence with audit cited from tests, not run) |
| B5 Stale / missing / conflicting | PASS (logic) | PARTIAL (stale/not-read tested; conflict only recorded in fixture) |
| B6 Scoped visibility | PARTIAL (per user or per source only; shared data readable by all viewers) | NOT BUILT (one role; server RLS and hidden = not found tested) |
| B7 Multi-provider agent workflow | UNKNOWN (documented, not tested) | NOT BUILT |

On clean fixtures, correlation and conflict logic is a few dozen lines Claude writes in minutes. Real-data difficulty (history, entity resolution, release mapping, backfill) was not tested on either side.

### 3.3 Inventory ([capability-matrix.md](capability-matrix.md))
- **Shipped and tested:** evidence store with forced RLS and append-only audit; owner auth, deny-by-default, hidden = not found; HTTP hardening; source approval; decisions with audit; memory/retrieval/search; Unknown-never-Healthy; EN/AR/RTL.
- **Built, inactive:** GitHub read-only transport. **Mock:** Mission Map, Observatory, Replay, Flight Deck.
- **Unbuilt:** correlation, second principal, VIE, Software Factory, agent execution, Sentry/Datadog connectors, Kawalys MCP.
- **Not found:** a durable record of the eight VIE workshops (BACK-119 owns recovery).
- **Not assessed:** competitors other than Claude: error-tracking/APM deploy tracking, developer portals, agent-memory services.

## 4. Hypotheses and the evidence gate

| # | Hypothesis | Test | Pass line |
|---|---|---|---|
| H3 | **Scoped sharing is worth paying for.** | 6–8 interviews (BACK-3) with founders/teams/agencies who share project state with clients or contractors | ≥ 3 describe a current workaround **and** a budget |
| H5 | **Claude-native is not enough for the owner either.** | Owner uses a Claude-native baseline for 2–3 weeks on real repos: decision log in repo or artifact store, a Claude Data dashboard, optionally a scheduled routine | Owner records ≥ 3 concrete failures that Kawalys' server would fix (lost history, wrong scope, no audit) |
| H6 | **Nobody already sells the correlation.** | Desk scan of error-tracking/APM deploy tracking, developer portals, agent memory (1–2 days) | No mainstream tool covers deploy → error → ticket with citations for small teams at their price point; otherwise drop H2 and BACK-182 |
| H4 | **Self-hosting / no Claude seat matters.** | Same interviews | ≥ 2 name it as a blocker |
| H1 | **Kawalys context makes agents better** (usefulness, not payment). Only after the gate. | BACK-168 Stage A: 10 pre-registered questions on one real repo, same model, Kawalys MCP vs the Claude-native baseline from H5 | ≥ 8/10 correct with citations and ≥ 30% fewer tool calls or tokens than the baseline |
| H2 | **Correlation on real data is hard enough to be a product.** Only after the gate and H6. | BACK-182 fixtures, then real GitHub + one more source, vs a Claude-written rule on the same export | Clearly higher precision on pre-labelled links |

**Gate (decision on or before 2027-01-15, proposed):** proceed to engineering only if H3 passes **and** H5 passes. If H3 **or** H5 fails, choose D (pause). H6 failing removes BACK-182 from scope; H4 passing raises the weight of a self-hosted offer.

Willingness to pay stays a hypothesis: solo developer $0; small team per workspace or per seat for scoped, cited, shared project memory their agents consume; agency per client workspace. No price until H3 has results.

## 5. Options

| Option | What it means | Cost ahead | Risk |
|---|---|---|---|
| A. Continue as planned | BACK-181..183, VIE-01..08, Software Factory, COG activation, in current order | Highest: months of solo engineering | Builds what Claude generates; no buyer evidence |
| **B-gated (recommended)** | Freeze UI; run the gate (owner hours + interviews + scan + dogfood); then BACK-168 Stage A, second principal or BACK-182 depending on results | Gate: owner time only, ~2–4 weeks. After: weeks of engineering | Gate may fail; owner time is the scarce input |
| C. Pivot to MCP-only | Kawalys as a self-hosted evidence service with an MCP surface; retire the UI and its CI cost | Low engineering; lower CI maintenance | Loses the human-facing and Arabic-first angle; still unvalidated |
| D. Pause | Stop feature work after BACK-51 sign-off; keep the pilot running; revisit with evidence | Near zero | Momentum loss; foundations age |

B-gated vs D: the gate costs owner time, not engineering, and it is the only cheap way to learn whether anyone pays. B-gated vs C: C is the right fallback **if** the gate passes but the owner UI shows no use; a frozen UI still costs CI time (about 489 app e2e tests across chromium and webkit shards), so C stays on the table. Sunk cost (the existing UI, the cognitive core review rounds) is not an argument for either.

## 6. Proposed roadmap delta (for approval; nothing applied)

"Reduce" and "defer" mean editing ticket text after approval. No ticket is closed and no new ticket is proposed: every item has a home.

| P | Ticket | Proposal | Reason |
|---|---|---|---|
| P0 | [BACK-51](https://rahmaqanater.atlassian.net/browse/BACK-51) | **Retain**: owner sign-off only | Code done; closes a gate |
| P0 | [BACK-52](https://rahmaqanater.atlassian.net/browse/BACK-52) | **Retain**: owner activation of one real repo (App, BACK-128 key custody) | Code done; real data for H5/H1 |
| P0 | [BACK-3](https://rahmaqanater.atlassian.net/browse/BACK-3) | **Investigate now**: interviews (H3/H4) and the competitor scan (H6); owner decides whom to contact | Only source of buyer evidence |
| P0 | — (owner) | **Dogfood** the Claude-native baseline for 2–3 weeks (H5) | Fair baseline; costs no engineering |
| Gate | [BACK-168](https://rahmaqanater.atlassian.net/browse/BACK-168) | **Promote after the gate**: Stage A (H1), read-only, two tools; the owner recorded this direction on 2026-11-28 | Makes Claude a channel instead of a substitute; MCP also serves other clients |
| Gate | [BACK-170](https://rahmaqanater.atlassian.net/browse/BACK-170) / [BACK-171](https://rahmaqanater.atlassian.net/browse/BACK-171) | **Bring forward if H3 passes**: a second principal before correlation | B6: scoped sharing cannot be shown with one role |
| Gate | [BACK-182](https://rahmaqanater.atlassian.net/browse/BACK-182) | **Retain only if H6 passes**, reframed as server-side correlation over ingested history | B3: the logic itself is substitutable |
| Gate | BACK-154 / BACK-155 | **Retain if BACK-168 proceeds** | Live memory read measured to fail closed at real volume (open PR #187) |
| P2 | [BACK-183](https://rahmaqanater.atlassian.net/browse/BACK-183) | **Reduce**: access log for API/MCP reads; permissions page waits for a second user | Needed by BACK-168 Stage B anyway |
| P2 | [BACK-181](https://rahmaqanater.atlassian.net/browse/BACK-181) | **Reduce**: Unknown-never-Healthy as an API guarantee plus one regression test; drop the all-screens display program | Claude Data already shows source and freshness per figure |
| P2 | [BACK-180](https://rahmaqanater.atlassian.net/browse/BACK-180) | **Revise thesis** to "Kawalys keeps and scopes the evidence; any client can show it"; adopt the proposed team rule | Benchmark: shared artifact data is readable by every viewer |
| P3 | [BACK-121](https://rahmaqanater.atlassian.net/browse/BACK-121) VIE-03 Code Review Room | **Defer** | Claude Code publishes pull-request walkthrough artifacts (S2; S3 "Walk through a change") |
| P3 | [BACK-122](https://rahmaqanater.atlassian.net/browse/BACK-122)–[BACK-125](https://rahmaqanater.atlassian.net/browse/BACK-125) VIE-04..07 | **Defer**; re-entry: gate passed and a user asks for spatial views | Rendering is substitutable |
| P3 | [BACK-126](https://rahmaqanater.atlassian.net/browse/BACK-126) Software Factory | **Defer** | Vision only; depends on VIE |
| P3 | [BACK-119](https://rahmaqanater.atlassian.net/browse/BACK-119) | **Reduce** to recovering the workshop record | Keep provenance even if deferred |
| P3 | [BACK-120](https://rahmaqanater.atlassian.net/browse/BACK-120) | **Merge into BACK-52 activation** | Same real GitHub path |
| P3 | [BACK-103](https://rahmaqanater.atlassian.net/browse/BACK-103) COG-05 activation, BACK-156/157, COG-06 | **Defer** until real outcomes exist | Already gated |
| P3 | [BACK-163](https://rahmaqanater.atlassian.net/browse/BACK-163) metrics | **Defer** | Substitutable by Claude Data |
| — | Mission Map, Observatory, Replay, Flight Deck | **Freeze** (keep tests green, no new lens work); revisit retiring them under option C | Mock data |

### The eight design workshops
No durable record exists in the repository or Jira; their decisions live in an owner conversation (BACK-118, BACK-119). Their delivery homes are VIE-01..08. Under B-gated: **retain** "evidence first" and "one app, one canonical model"; **reuse** VIE-02 inside BACK-52; **defer** the WebGL engine, scene model, Code Review Room and Software Factory; **investigate** only the record recovery. If the owner shares the record, each decision should be mapped individually; this brief does not invent their content.

## 7. Remaining costs and risks
- **Gate:** owner time (activation, interviews, dogfooding, scan): roughly 2–4 weeks part-time. Hosting unchanged (~$12/month + current Neon plan). Token spend for dogfooding falls within the owner's Claude plan limits.
- **After the gate:** BACK-168 Stage A 1–2 weeks; second principal or BACK-182 several weeks each; H1 needs weeks of real ingestion first, so it cannot report inside the gate window.
- **Platform risk:** Anthropic can add server-side scheduling or richer storage scoping to artifacts. Re-check sources before the gate decision.
- **Channel risk:** a Kawalys MCP must be a hosted remote MCP with its own auth, connected by each viewer (S3). It also works with non-Anthropic clients, which limits dependence on one vendor. Connector terms were not checked.
- **Evidence risk:** synthetic, small benchmark built by the brief's author; artifact page not seen rendered; Kawalys server tests cited, not run. See [review.md](review.md).

## 8. Open questions for the owner
1. Approve, amend or reject B-gated, the gate, and its date?
2. Whom may the interviews contact?
3. Activate BACK-52 on which repository?
4. Can the eight-workshop record be shared?
5. Optional: install a plain (non-template) artifact as an app in Claude Desktop and note the result in `benchmark.md` (B1).

## 9. Milestones
- M1: BACK-51 signed off; BACK-52 ingesting one real repo with truthful source states.
- M2: interviews and competitor scan written up against H3, H4, H6.
- M3: owner dogfooding notes against H5.
- **Gate decision (≤ 2027-01-15):** B continues (BACK-168 Stage A, then second principal or BACK-182), C, or D.
