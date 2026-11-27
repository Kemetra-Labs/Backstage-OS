# BACK-108 (COG-05) decisions

Status: **decided 2026-11-27.** The owner delegated the COG-05 and COG-07 decisions to the implementing session and asked it to consult the advisor tool. The advisor's rule was: take the most conservative, reversible option each time, and record the reason. The owner can overrule any item below.

| # | Decision | Reason |
| --- | --- | --- |
| D1 | O1 to O6 of [cog-05-design.md](cog-05-design.md) are approved as drafted, without widening. | The draft already forbids rule, gate and permission changes. |
| D2 | O5: review authority is the workspace owner only. The implementing session and agents are never lesson reviewers. | Otherwise the builder would approve its own lessons. |
| D3 | O2: N = 5 for review-only candidates; a contested candidate cannot be approved as written. | Conservative; the owner can change N later. |
| D4 | O6: a lesson is an advisory note only, and the COG-04 validator ignores it. | A lesson must not be able to forge a result. |
| D5 | Build only the deterministic machinery, tested on synthetic episodes: episode and candidate generation, abstention below N, lifecycle transitions, invalidation on corrected or revoked evidence, byte-for-byte rollback. | It needs no approval evidence. |
| D6 | **Activation stays blocked.** Section 5 needs BACK-45 approval evidence and real outcomes, and neither exists. | Synthetic episodes cannot justify a lesson. |
| D7 | The `episodes` and `lessons` tables (forced RLS, citation rows) go in their own migration PR, after the pure logic, with negative RLS tests and an independent database or security review. | Schema and RLS are security-sensitive; the reuse policy does not authorize schema changes. |

Order: this record, then the pure logic (test-first), then the migration PR.

## Built: pure machinery (2026-11-27, D5)

- `server/src/learning/learning.core.ts`: `candidatesOf` (O2: deterministic; abstains below N = 5 visible, observation-labelled episodes with both decision and outcome cited; contested when episodes disagree), `approve` (O3, O5: owner-only, non-contested, expiry after approval, append-only hash chain), `rollback` (restores an earlier version byte for byte as a new row), `readLesson` (O4, O6: suspended when any cited evidence is not visible, expired at expiry, invalid on a tampered chain, otherwise an advisory note with no state, gate, recommendation or rule).
- Tests: `test/learning/learning.spec.ts` (synthetic episodes only) and `learning.guard.spec.ts` (pure; nothing in `src` imports it, so it is not activated).
- **Not built:** the `episodes` and `lessons` tables (D7, own migration PR) and any activation (D6).
