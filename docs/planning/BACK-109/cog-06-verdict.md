# BACK-109 (COG-06) verdict: defer, gather evidence first

Status: **verdict recorded 2026-11-27 under the owner's delegation ("go, let's complete the engine brain").** BACK-109 names three possible verdicts: keep rules, gather evidence, or a bounded candidate experiment. This one is **gather evidence (defer)**. Nothing is installed, no library is evaluated and no probability is produced. The owner can override.

## Why defer

BACK-109's preconditions are not met, and the ticket says the work may be deferred without blocking the rules-only shadow pilot:

| Precondition | State on 2026-11-27 |
| --- | --- |
| COG-04 evidence quality sufficient | COG-04 S1/S2 exist ([cog-04-design.md](../BACK-107/cog-04-design.md)). Approvals cannot pass yet (T3), and no recommendation has met a real outcome. |
| COG-05 outcome quality sufficient | COG-05 is not built. There are **zero** recorded decision–outcome episodes, so there is no denominator for any rate. |
| Explicit evaluation authorization | Not given. |
| Labelled, representative inputs | None. All data is synthetic. |
| The rules baseline fails a predeclared criterion | Not shown. COG-04 abstains (`insufficient-evidence`) rather than guessing, which is the intended behaviour. |

Any percentage computed now would be a made-up number, which BACK-109 forbids.

## What the deterministic baseline already covers

- **Unknown, not quantified:** stale, missing, conflicting or hidden inputs give `unknown`, never a probability (COG-04 T2, T4).
- **Qualitative what-if:** a caller can re-run COG-04 with a changed task spec. Each run is deterministic and independently validated. This is a scenario comparison with no invented likelihoods.
- **Feasibility:** cycles are refused and bounds are enforced (T1, T5). Scheduling optimization stays with BACK-97.

## Predeclared criterion for reopening (proposed; owner to confirm)

Reopen COG-06 for a bounded candidate experiment only when **all** of these hold:
1. COG-05 holds at least **30 reviewed decision–outcome episodes** for one decision type, from real (not synthetic) use, with a **leakage-safe holdout** frozen before any fitting.
2. On that holdout, the rules baseline is wrong or abstains on a share of cases the owner judges costly, stated as a number **before** the comparison.
3. A specific candidate (for example `pgmpy` or a constrained solver) has separate package and licence approval and a cost budget.

The comparison would then report calibration and error on the holdout, and keep infeasible, timeout and unknown outcomes apart. Association would never be reported as cause.

## Reconciliation

BACK-97 owns mission scheduling; this verdict refers to it and does not duplicate it. The rules-only shadow pilot (COG-07) does not depend on COG-06.
