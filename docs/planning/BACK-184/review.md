# BACK-184 — Independent critical review and disposition

A separate reviewer agent was given the brief's files and the repository, not the author's conclusions, and asked to find overclaims, bias and unfair scoring. It re-checked sources S1, S2, S3 and S6 live, and spot-checked the capability matrix against code (all spot-checks held). Below: its findings in short, and what changed. The brief was revised after this review; the first draft is commit `0fd5634`.

| # | Sev. | Finding (reviewer) | Disposition |
|---|---|---|---|
| 1 | HIGH | B1 asked the owner to install a **Data-template** artifact, which S1 says can't be installed (S2 lists Data as a template). Reopen by stable URL was PASS for Kawalys but UNKNOWN for the artifact. | **Accepted.** B1 artifact: reopen PASS, install FAIL by documentation; non-template install untested. Owner check now uses a plain artifact. |
| 2 | HIGH | "No documented schedule/background ingestion" overstated: S6 interval refresh on open, scheduled routines, tray apps that keep running. A routine writing to an artifact store is a Claude-native ledger. | **Accepted.** sources.md and matrix downgraded to "narrower than it looks"; the brief no longer rests on "no backend". |
| 3 | HIGH | B6 asymmetric: artifact FAIL came from the builder's choice of shared upload (personal storage and per-viewer connector scoping exist); Kawalys has `Role = 'owner'` only (`server/src/auth/capabilities.ts:17`). | **Accepted.** Artifact B6 PARTIAL, Kawalys NOT BUILT. Scoped sharing is a hypothesis, not a demonstrated edge. |
| 4 | HIGH | Kill criteria nearly unfireable (AND logic, 2-of-6 limbo, no date, H2/H4 without consequence). | **Accepted.** OR logic, one threshold, dated decision point. |
| 5 | HIGH | H1 baseline is a strawman (bare session); 30 days of ingestion doesn't fit 4–6 weeks; H1 measures usefulness, not payment. | **Accepted.** Baseline is now a Claude-native setup (decision log, artifact store, scheduled routine); timeline corrected; H1 labelled usefulness. |
| 6 | HIGH | Competitors other than Claude missing (error tracking/APM deploy tracking, developer portals, agent-memory services). | **Accepted as a gap.** Not researched in this ticket; proposed as a short follow-up inside BACK-3 before any engineering. |
| 7 | MED | B4 over-credited on both sides: page form never submitted; Kawalys server tests cited, not run. | **Accepted** (both PARTIAL). Note: the page reads decisions through the `decisions` dataset (store source), so the binding exists; the form path is still unexercised. |
| 8 | MED | `review.md` cited but missing. | **Fixed** (this file). |
| 9 | MED | "Same pinned fixture" false for Kawalys; 489 passes are mostly mock screens, i18n, a11y. | **Accepted.** Wording and limitations corrected. |
| 10 | MED | Artifact logic fitted to the fixture by the same author; effort figure optimistic. | **Accepted.** Stated in limitations. |
| 11 | MED | Sunk cost leak: "B over C because the UI already exists"; a frozen UI still costs CI; BACK-182 kept as "the one differentiator" right after B3 showed its logic is substitutable. | **Accepted.** Argument removed; frozen-UI CI cost named; BACK-182 now gated behind the evidence gate and justified only by real-data difficulty (H2), with the vendor scan able to remove it. |
| 12 | MED | Distribution limits (Bedrock/Vertex/Foundry, CMEK/HIPAA/ZDR) belong to publishing from Claude Code, not artifacts in general; ZDR orgs can install apps. | **Accepted.** Scoped correctly in sources, matrix and brief. |
| 13 | LOW | PR-walkthrough citation: comes from S2 ("pull-request walkthrough with annotated diffs"); S3 has a "Walk through a change" section. | **Fixed** (cite S2/S3 section). |
| 14 | LOW | Channel risk overweighted (MCP is multi-client); owner hours and token spend not counted. | **Accepted.** Brief §7 updated. |

## Reviewer's strongest alternative (adopted in part)
"Interviews first, engineering paused behind a gate": finish BACK-51 sign-off and BACK-52 activation (owner hours), run interviews now, have the owner dogfood a Claude-native baseline for 2–3 weeks, and start BACK-168 Stage A / BACK-182 / BACK-154-155 only if ≥3 interviewees describe a workaround and budget **and** the owner finds the Claude-native version insufficient. The reviewer also argued option C (MCP-only) is stronger than the draft allowed, because dropping the frozen UI removes its CI cost.

**Disposition:** the revised recommendation is option B **with this evidence gate first** (called B-gated in the brief). The direction (freeze UI, Kawalys as an evidence service behind MCP) is unchanged; the order now puts no engineering weeks before buyer evidence. Option C is kept as the named fallback if the gate passes but the owner UI shows no use.

## What the reviewer said would change the recommendation
- A working Claude-native pipeline that keeps history → points to D or C.
- ≥3 interviewees with a budget for scoped sharing → supports B, and second principal (BACK-170/171) before correlation.
- Vendors already correlating deploys and errors → drop H2 and BACK-182.
- Owner dogfooding data.
- Install retest with a non-template artifact; B6 rerun with personal storage.
