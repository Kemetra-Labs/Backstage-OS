# BACK-184 — Decision brief v2: Kawalys vs connector-backed Claude Artifacts (B+, gated)

Status: **proposal and research plan for owner ratification.** Nothing here changes Jira, the Blueprint, the roadmap or production. Date: 2026-11-28. Repository baseline: `df529ce` (branch base of this PR).
Evidence: [sources.md](sources.md) (official Anthropic pages, fetched 2026-11-28) · [benchmark.md](benchmark.md) (Claude-only synthetic side-by-side, historical) · [capability-matrix.md](capability-matrix.md) (inventory, substitutability, reuse, cost) · [review.md](review.md) (independent review of **v1**) · [decision-brief.v1-b-gated.md](decision-brief.v1-b-gated.md) (v1, unchanged).

## 0. Revision status (read first)

| | v1 | v2 (this file) |
|---|---|---|
| Direction | B-gated: freeze UI layers, evidence service behind MCP, spend no engineering until an interview and dogfooding gate passes | **B+: strategic repositioning and gated growth.** Research and planning direction only |
| Basis | Claude-only benchmark, independent review ([review.md](review.md)), commit `0cd272b` | v1 evidence kept as history, plus Jira BACK-184 comments 19203 (proposed reconciliation) and 19204 (delegated decision) |
| Review | Independent reviewer agent, 14 findings | **Not independently reviewed.** Comment 19203 is a self-described simulated multidisciplinary review. This revision's reviewer is the owner |

**How the decision was made.** In comment 19204 the owner's delegate selected B+ as the research and planning direction, acting on the owner's delegation ("انا بفوضك") in the project conversation. That delegation covers research direction and preparation. It is **not** approval of product implementation, a launch, a real source, a customer contact, a paid run or a package install. The 27 Nov execution/security Blueprint (BACK-118/119/126, BACK-166/169) is not superseded: owner-only Alpha and the sequence Code Review Room → accepted preview → selected Factory slice stand unless the owner amends them.

**What this revision did not do.** It ran no new tests and no new benchmark, fetched no competitor or provider page, and recorded no market data. Every competitor, pricing and provider-terms statement below is either an official Anthropic fact from sources.md (verified 2026-11-28) or a pointer taken from comment 19203 and marked *unverified*. CI and SonarCloud results shown on the PR belong to the commit they ran on.

### Evidence vocabulary (used in every table below)
**Implemented** (code exists), **Tested** (a named test or run passed), **Mock** (demo data only), **Unbuilt**, **Verified** (official source read 2026-11-28), **Unverified** (pointer, not read), **Unknown** (not testable yet), **Hypothesis** (proposed, no data). A hypothesis is never presented as customer-validated.

## 1. Short answer

1. **What still stands from v1.** Today there is no *demonstrated* reason for a Claude user to pay for Kawalys. A connector dashboard that shows each figure's source and freshness is a first-party Claude feature (Claude Data). In the v1 benchmark, one build pass of a Claude Data artifact produced correct deploy → error → ticket links and stale/conflict handling (logic checked; page not seen rendered). Kawalys has no active real source, an empty pilot database and one user. Its structural advantage (server-owned evidence, row-level access, audited writes) cannot be shown yet because there is one role.
2. **What v1 over-reached, per comment 19203.** (a) It excluded solo users commercially on a $0 assumption the benchmark does not establish. (b) It recommended a blanket UI and Software Factory freeze, although the benchmark tested substitutability of logic on clean fixtures, not value of the combined outcome. (c) It assessed Claude only; Port, Cortex, Conductor, DeepSeek Harness and visual-agent projects occupy overlapping ground and were not examined. (d) Kawalys was scored on its own fixtures, not the pinned one, so the side-by-side is not like for like.
3. **What B+ proposes.** Keep the four product pillars (Cognitive Core, Visual Intelligence, Software Factory, multi-provider agent integration) as *hypotheses to test fairly*, with the evidence core as the base. Offer a read-only Intelligence API/MCP as an optional distribution surface. Evaluate official subscription and BYOK economics before any claim of "free" or "unlimited". Test the **combined user outcome** against first-party CLI/manual setups and the closest competitors, because a multi-provider launcher, a subscription integration, an attractive scene or an evidence store alone is copyable.
4. **What B+ is not.** Not a moat claim, not a launch decision, not approval of full VIE, a new agent runtime or commercial packaging, and not a blanket freeze. Work already approved, and research or planning that needs no new access, continues independently of unapproved feature work.

## 2. Target user and willingness to pay (hypotheses)

- **Segments to test (proposed in 19203, not ratified):** solo developers or founders running AI coding agents across repos (6), nontechnical builders (3), small teams of 2–10 (3). v1's "probably not a buyer: solo developer" is **withdrawn as a conclusion** and kept as one hypothesis among the others. Founder utility is not external demand; the two are recorded separately.
- **Willingness to pay:** no price, no revenue claim. Search interest and site traffic seen in earlier Firecrawl/Alexandria research are not buyers (19203). The demand signal being proposed is at least 3 credible paid-pilot commitments or equivalent budget-backed evidence. No payment is collected and no customer is onboarded.

## 3. What the evidence shows today

### 3.1 Platform facts (Verified, official, [sources.md](sources.md))
- Installable apps: beta since 2026-11-24, Mac/Windows desktop, online and signed in. Template artifacts (Docs, Slides, Sheets; S2 also lists Data) cannot be installed (S1, S2, S4).
- Connectors read and write as **the viewer**, after per-viewer approval. Claude Data live sharing runs the editor's approved queries for the organization (S2, S3, S5, S6).
- Storage per artifact: personal or shared, 100 MB / 25,000 documents. Attached files and shared rows are readable by everyone who can open the artifact (S2, S8).
- No backend of its own, strict CSP, no viewer authentication (S3). Interval refresh on open (S6). Scheduled routines can update data (S8, untested).
- Publishing from Claude Code needs a claude.ai account and the Anthropic API path, and no CMEK/HIPAA/ZDR (S3). Installed apps: not for HIPAA-ready orgs; ZDR orgs can install but apps are not covered by ZDR (S1).
- These are consumer-product facts as of 2026-11-28. Beta status, entitlements and prices can change; re-check before any gate decision.

### 3.2 v1 benchmark (historical, [benchmark.md](benchmark.md))
Pre-registered criteria, one author, synthetic data. **Limitations that now weigh more:** the Artifact used the pinned fixture, Kawalys did not read it and was scored on fixtures expressing similar situations; the Artifact page was not seen rendered; Kawalys server tests were cited, not run; the Kawalys 489 passes are mostly mock screens, i18n and accessibility; the Artifact logic was fitted to the fixture by the same author. The table is evidence about *logic substitutability on clean data*, nothing more.

| Scenario | Claude Artifact (Data type) | Kawalys (fixture build) |
|---|---|---|
| B1 Install / reopen | Reopen PASS; install FAIL by documentation for template artifacts; non-template install untested | Reopen PASS (URL); no install concept |
| B2 Operational state | PASS (logic) | PASS (tested) |
| B3 Deploy → error → ticket | PASS (logic, one pass) | Unbuilt |
| B4 Decision history | PARTIAL (store persists, editor-only writes enforced; form not exercised) | PARTIAL (server persistence with audit, cited not run) |
| B5 Stale / missing / conflicting | PASS (logic) | PARTIAL (stale/not-read tested; conflict only recorded in fixture) |
| B6 Scoped visibility | PARTIAL (per user or per source; shared data readable by all viewers) | Unbuilt (one role; server RLS and hidden = not found tested) |
| B7 Multi-provider agent workflow | Unknown | Unbuilt |

### 3.3 Capability inventory ([capability-matrix.md](capability-matrix.md))
- **Implemented and tested:** evidence store with forced RLS and append-only audit; owner auth, deny-by-default, hidden = not found; HTTP hardening; source approval; decisions with audit; memory/retrieval/search; Unknown-never-Healthy; EN/AR/RTL.
- **Implemented, inactive:** GitHub read-only transport (BACK-52 slice A).
- **Mock:** Mission Map, Observatory, Replay, Flight Deck.
- **Unbuilt:** correlation, second principal, VIE, Software Factory, agent execution, Sentry/Datadog connectors, Kawalys MCP.
- **Not found:** a durable record of the eight VIE workshops (BACK-119 owns recovery) and the earlier Retail Tower Harness study (needs recovery; reuse the method, not the retail domain).

## 4. Competitive and provider landscape

Only the Claude rows are Verified. The rest are starting points from comment 19203 that **must be read, dated and recorded in a feature/pricing/terms matrix** before they inform any decision.

| Item | Why it matters | Status |
|---|---|---|
| Claude Artifacts / Claude Data | First-party dashboards, per-viewer connectors, 100 MB store | **Verified** (S1–S8) |
| Install as app — `claude.com/resources/articles/install-as-app` | Install path and limits | **Unverified** (S1 is a help-center article on the same topic, and was read) |
| Use the Claude Agent SDK with your Claude plan — `support.claude.com/en/articles/15036540` | Whether subscription auth may back a third-party multi-provider launcher | **Unverified; decisive for the factory pillar.** A provider subscription is not a general-purpose API license |
| Port, Cortex | Developer portals / catalogues with scorecards | **Unverified** |
| Conductor — `conductor.build` | Parallel agent workspaces, closest "factory" comparison | **Unverified** |
| DeepSeek Harness — releases and discussion 10265 | Candidate agent harness. 19203 reports release `v0.2.3-alpha.3` observed 28 Nov: an alpha, not proof of production stability | **Unverified** |
| Native APM / error-tracking deploy tracking | Competes with correlation (BACK-182) | **Unverified**, was in v1 review finding 6 |

**Provider-terms and Harness risks to settle before any live run (all Unknown today):** which local CLI/SDK interfaces are officially supported for Claude Code and Codex; subscription versus BYOK terms and quotas; visibility of usage and cost; explicit user consent; support policy; Harness licence, SDK and event lifecycle, subagents, worktrees, isolation, approval and cancel, secrets handling, Windows/macOS/Linux support and known regressions; replaceability and rollback. No unofficial OAuth or token copying, no quota bypass, and no claim of free or unlimited usage.

## 5. B+ hypotheses and pre-registered thresholds

All thresholds are **proposed**, to be ratified by the owner **before** any test runs. Missing data is not proof of failure; a failed branch is deferred, not silently dropped.

| # | Hypothesis | Test | Proposed pass line |
|---|---|---|---|
| M1 | **There is external demand for some segment.** | 12 interviews (6 solo, 3 nontechnical builders, 3 small teams); record workaround, frequency, budget and willingness to try a paid pilot (BACK-3) | ≥ 3 credible paid-pilot commitments or equivalent budget-backed evidence. Founder utility is logged separately |
| E1 | **Provider economics are feasible and permitted.** | Claude Code and Codex first: terms, BYOK, quotas, consent. Equivalent runs: task success, elapsed time, paid API cost, allocated subscription cost, quota cost | Documented permitted path with a measured cost per accepted task. Stop paid fallback by default |
| O1 | **A truthful read-only one-repo baseline exists.** | BACK-52 on one owner-chosen repo with source identity, scope, revocation and truthful status | Evidence shown with source states; Unknown never Healthy |
| F1 | **A factory workflow beats the alternatives.** | One synthetic task in a disposable repo: approved plan → one provider implements → second reviews → deterministic tests → human decision → verified evidence. Compare manual two-CLI baseline, Claude-native/Artifact where feasible, Conductor or closest available, and Kawalys, on the same fixture, task and success oracle | Fewer handoffs and less rework or time at equal quality; cost recorded as actual or Unknown |
| V1 | **A visual prototype is faster than lists.** | Same authorized data and question, list/cards baseline vs one Code Review Room prototype, counterbalanced order | ≥ 25% lower median time-to-correct-answer, no accuracy or accessibility regression. Otherwise keep list-first |
| C1 | **Kawalys evidence makes agents better** (usefulness, not payment). | 10 pinned context questions, same model and client, with vs without permitted Kawalys evidence (BACK-168 Stage A) | ≥ 8/10 correct with citations, ≥ 30% fewer tool calls or context tokens, zero unauthorized disclosure |
| X1 | **Real correlation or team governance is needed** (conditional). | Only on a selected workflow: correlation vs native APM and a same-fixture rule (BACK-182); second-principal policy before team/audit (BACK-170/171/183) | Higher precision on pre-labelled links; no causal claim without evidence |

**v1's H3 and H5** (≥ 3 of 6–8 interviewees with workaround and budget; owner logs ≥ 3 concrete Claude-only failures) remain valid readings of the *scoped-sharing small-team* hypothesis. They are not the decision rule for segments they did not test.

### Fair-comparison rules (apply to every row above)
Pre-register the fixture hash, tool versions, success oracle and metrics before running. Use **identical** fixtures and tasks on every side (v1 did not). Counterbalance task order for human timing. Record failures, Unknown and NOT RUN alongside wins. Separate operator effort, elapsed time, quality and cost (actual or Unknown). No new credentials, paid calls, user data, source writes, deployments, dependencies or agent execution without the existing separate gate.

## 6. Work packages mapped to existing tickets

Reuse existing Jira homes; no new issue is needed yet. A discovery-only child of BACK-180 for the Harness review would be proposed only after owner approval. Nothing below edits a ticket's status, priority or description.

| Pri. | Package, accountable ticket | Deliverable | Decision at trigger |
|---|---|---|---|
| P0 | Competitive and market validation — BACK-184, BACK-3 | Dated feature/pricing/terms matrix; 12 interviews (M1) | Owner ratifies segment, contacts and criteria before outreach |
| P0 | Provider entitlement and economics — BACK-166 D02/D04, BACK-168 Stage A where relevant | Terms, BYOK, quota and cost study (E1) | Owner approves one runtime and exact permitted auth and budget before live runs |
| P0 | Operational baseline — BACK-131/128/52/49/51, applicable BACK-127/172/117 | Approved read-only one-repo proof (O1). BACK-154/155 only if live cognitive search is selected, otherwise fail closed | Exact owner consent, custody and rotation, safe live source proof before real access |
| P1 | Harness reference vs adapter — BACK-166 D02, BACK-14 | Recover the Retail Tower Harness evidence, diff against the pinned upstream release, licence and isolation review; report REFERENCE / ADAPT / DEFER with replaceability and rollback | Read-only analysis first; separate approval for any isolated synthetic PoC or install; never mandate an alpha runtime |
| P1 | Factory outcome test — BACK-126, BACK-166/167/169 | F1, starting with manual handoff and read-only observation | Each isolated action approved individually after M14 governance and security; no merge or deploy, no production data; no integrated rollout before BACK-125 and applicable Alpha gates |
| P1 | Visual value — BACK-119/120/121/125, BACK-118 | V1 | Owner ratifies metric, sample, device and workload; no full 3D, GPU infrastructure, asset purchase or second app |
| P1 | Cognitive value and MCP — BACK-103/168/154/155, applicable BACK-45/157 | C1. Retain the delivered core; no learning activation without independently verified outcome and approval | Stage A may defer; Stage B explicitly authorized, read-only, scoped; no agent dispatch or new mandatory inference |
| P2 cond. | Evidence/correlation and team governance — BACK-181/182/183/170/171 | X1; reuse evidence components on the selected workflow only; no duplicate RLS or permissions model | Re-enter when the chosen journey and demand need it and gates pass |
| Future | Digital Technology Campus, broad factory — BACK-126/118/3 | Vision kept, no delivery commitment | Separate owner decision after proven incremental value |

**Compared with v1's roadmap delta:** v1 proposed deferring BACK-121 to BACK-125, BACK-126, BACK-163 and the cognitive activation items, reducing BACK-181 and BACK-183, and freezing the mock lenses. Under B+ those become *tests with triggers* (V1, F1, C1, X1) rather than blanket deferrals. The v1 table remains in [decision-brief.v1-b-gated.md](decision-brief.v1-b-gated.md) §6 for reference and is **not** applied. The v1 items that carry over unchanged are BACK-51 sign-off and BACK-52 activation (owner-gated).

## 7. Options

| Option | Meaning | Status |
|---|---|---|
| A. Continue as planned | BACK-181..183, VIE-01..08, Software Factory, COG activation in current order, no new validation | Not recommended: builds before any buyer or economics evidence |
| B-gated (v1) | Freeze UI; interviews plus owner dogfooding gate; then BACK-168 Stage A | Superseded by B+ for this brief; kept as the more conservative fallback |
| **B+ (selected research direction)** | Four pillars as hypotheses, fair identical-fixture tests, provider economics first, no blanket freeze, existing gates unchanged | Selected in 19204 for research and planning only |
| C. Narrow to evidence + MCP | Self-hosted evidence service, thin owner UI | The outcome if only C1 passes |
| D. Pause commercial expansion | Keep Alpha and the pilot running, revisit with evidence | The outcome if M1 and E1 both fail |

## 8. Staged decision gates

0. **Ratify (owner).** Segment and contacts, interview and test criteria, the 2027-01-15 checkpoint, and which runtime and budget (if any) may be used. Nothing below starts until this is done.
1. **Desk work, no new access.** Competitor and provider-terms matrix, Harness recovery and reference review, existing operational work (BACK-51/52 and listed security gates). Output: dated tables, REFERENCE/ADAPT/DEFER recommendations.
2. **Per-action gates.** Each real source, customer contact, package install, paid run, action dispatch, access expansion, deployment, merge or commercial commitment needs its own existing approval. Completing a ticket is never runtime authority.
3. **Checkpoint (proposed 2027-01-15).** Judge market evidence **and** at least one repeatable workflow advantage **and** compliant, feasible economics and safety. If only evidence/MCP is supported, narrow to C. If factory or visual value passes, authorize one smallest slice. If evidence is insufficient, defer the failed branch and revisit, or pause commercial expansion (D). Do not equate personal usefulness with paid demand.

## 9. Risks

- **Provider terms** can forbid or limit the integration the factory pillar assumes; quotas and prices change. Unknown until E1.
- **Harness is an alpha** (as reported in 19203); licence, isolation and secrets handling are unreviewed. Never depend on it unreplaceably.
- **Copyability:** a launcher, a scene or an evidence store alone is reproducible by the platforms and by competitors.
- **Evidence risk:** the v1 benchmark is synthetic, small, single-author, and not like for like. v2 adds no evidence of its own.
- **Owner time** is the scarce input for interviews, dogfooding, recovery of the workshop record and approvals. Hosting is unchanged (about $12/month plus the current Neon plan).
- **Scope drift:** B+ must not erode owner-only Alpha, the BACK-172 controls, or the Blueprint sequence.
- **Review gap:** this v2 has had no independent review; 19203's review is simulated and not a runtime, security or customer test.

## 10. Open questions for the owner
1. Ratify B+ as the research direction, or choose B-gated, C or D? Confirm the 2027-01-15 checkpoint.
2. Which interview segment first, and whom may be contacted?
3. Which one runtime and exact auth and budget (if any) may be used for E1?
4. Which repository for BACK-52 activation?
5. Can the eight-workshop record and the Retail Tower Harness study be shared?
6. Ratify V1, C1 and F1 thresholds, sample and devices?
7. Optional carry-over from v1: install a plain (non-template) artifact as an app and note the result in `benchmark.md` (B1).
