# BACK-108 (COG-05) design draft: governed learning from verified outcomes

Status: **draft for owner approval, 2026-11-27.** BACK-108 requires an approved evidence-linked outcome contract, review authority, a version and retention design, and a rollback design **before** building. This document proposes all four. **Nothing is built:** it needs a schema change and a review authority, both owner decisions. No model training, automatic rule, prompt, code or permission change, agent dispatch, external write or spend.

Inputs: COG-04 results ([cog-04-design.md](../BACK-107/cog-04-design.md)), COG-02 memory and retention ([cog-02-decisions.md](../BACK-105/cog-02-decisions.md) DEC-4), BACK-45 Decision Studio governance (reused, not duplicated), Confluence KMC 95256578 W4.

## 1. Intent

Remember what happened after a recommendation was acted on. Turn repeated, verified outcomes into **candidate lessons** that a person reviews, and apply an approved lesson only within its stated scope, until it expires or is revoked. When examples are too few, abstain.

## 2. Approaches

| | Approach | Verdict |
| --- | --- | --- |
| A | **Episodes as cited evidence + lessons as versioned, reviewed records** (append-only, like `evidence`) | **Proposed.** Reuses the evidence citation and visibility rules: an episode or lesson is visible only if every cited row is. |
| B | Lessons as edits to COG-04 rules | Rejected: BACK-108 forbids automatic rule changes. A lesson can only **annotate** a result ("a similar case went wrong before"), never change a classification or a gate. |
| C | Statistical or ML extraction | Rejected for the baseline. Any extraction model needs separate approval and a budget. |

## 3. Proposed contract (decisions for the owner)

**O1 — Episode.**
- Contents: the COG-04 result fingerprint and validator verdict; the HumanDecision that acted on it (BACK-45); the outcome evidence rows; context (source refs, clocks); applicability (task kind, rule version); and an explicit label of **observation**, **correlation** or **hypothesis**.
- An episode exists only when its decision and outcome are both cited evidence. Nothing is inferred.

**O2 — Candidate lesson.**
- Generated deterministically: when at least **N verified episodes** share an applicability key and an outcome pattern, a candidate is proposed. N is proposed as 5 for review-only candidates and is the owner's to set.
- Below N the generator abstains.
- Exceptions and competing explanations are kept on the candidate. A candidate whose episodes disagree is marked **contested** and cannot be approved as written.

**O3 — Lifecycle.**
- Stages: `candidate` → `reviewed` (by the review authority, O5) → `approved vN` with bounded applicability and an **expiry date** → `expired`, `revoked` or `rolled-back`.
- Records are append-only: each transition is a new row citing the previous one.

**O4 — Invalidation.**
- A correction to cited evidence, or the revocation of a grant on a cited source, **suspends** every dependent lesson on the next read: the same visibility rule as HumanDecisions.
- Retention follows DEC-4. A lesson citing purged evidence becomes `insufficient-history`.

**O5 — Review authority.** Proposed: the workspace owner only, as for the BACK-47 owner-only foundation. A broader authority is a separate decision.

**O6 — Effect.**
- An approved lesson appears as an **advisory note** on a matching COG-04 task result, with its evidence.
- It never changes a state, a gate, a recommendation or a rule.
- The COG-04 validator ignores notes, so a lesson cannot forge a result.

## 4. Evaluation plan (before any activation)

- Freeze training and holdout episodes by time, never at random.
- Measure recurrence, false matches and regressions with an independent oracle.
- Demonstrate:
  - rejection of a deliberately broad false lesson;
  - a scoped candidate that stays review-only;
  - replay determinism;
  - rollback restoring the earlier version byte for byte.

## 5. What it needs from the owner

1. Approval of O1–O6, or changes to them.
2. A **schema change**: append-only `episodes` and `lessons` tables with forced RLS and citation rows. This is a migration PR with its own review.
3. BACK-45 approval evidence, which is also needed by COG-04 S3.
4. Real outcomes. Synthetic episodes can test the machinery but cannot justify a lesson.

## 6. Stop conditions

Stop if a lesson would change a classification or gate, if any activation path lacks human review, if a hidden or revoked source would still support a lesson, or if the episode count is below N.
