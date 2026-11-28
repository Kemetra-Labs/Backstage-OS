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

## Built: storage (2026-11-27, D7)

- `server/migrations/0006_learning.sql`: `learning_episodes`, `learning_episode_citations`, `learning_lessons`, `learning_lesson_citations`. Forced workspace RLS, composite keys within one workspace and project, column-level INSERT grants, append-only (also for a superuser and under replica). Version 1 has no previous hash; later versions cite one; one row per version. A lesson reviewer must be a member of the workspace.
- Tests: `test/learning/learning-db.spec.ts` (as `kawalys_app`).
- **Independent database review: GO**, no blockers. Fixed: reviewer membership; an index for reads by key; a test that a citation cannot point at another workspace's episode. Accepted: global primary keys on the citation tables (same as `evidence_citations` in 0003; an oracle only with two known random UUIDs).
- **Requirements for the read and write path (when activation is approved):** an episode needs at least one decision and one outcome citation, and a lesson at least one citation, or it is not shown; a `decision` citation must be a HumanDecision; the hash chain is verified in `src` (no gaps, `previous_hash` equals the previous version's hash, the hash covers the content); owner-only review (O5) is checked on write.
- Nothing in `src` reads or writes these tables; activation stays blocked (D6).

## Built: read and write path requirements in the pure core (2026-11-28)

The requirements above are now enforced in `server/src/learning/learning.core.ts`, still without activation (D6):

- **Decision citations are HumanDecisions.** `candidatesOf` takes the set of visible HumanDecision evidence ids; an episode whose decision citation is not in it does not count.
- **At least one citation.** `approve` takes the basis (episodes, visible evidence, HumanDecisions), re-derives the candidate and refuses anything else (`not-a-candidate`): a hand-made, relabelled or stale candidate cannot be sealed, and the sealed content comes from the derived candidate. `readLesson` returns `uncited` for a lesson with no evidence or no episode.
- **Chain verified in src.** Design fix: the hash used to cover an approval time the table cannot store (`recorded_at` is set by the database), so a stored chain could never be re-verified. The approval time now lives in the content (`approvedAt`), and the hash covers exactly the stored columns (version, previous hash, kind, reviewer, content). The chain check also refuses a key switch between versions. `fromStored` maps database rows (strict content keys and types, key column equal to the content key) and sorts them by version; `test/learning/learning-db.spec.ts` writes a chain as `kawalys_app`, reads it back and verifies it, and a tampered stored row reads as `invalid-chain`.
- **Owner-only on write.** `approve` and `rollback` refuse a reviewer who is not the owner. At the database level this holds because every membership is `owner` (0001); a test now fails if that role is ever widened. **For activation:** the write path must read the owner from `workspaces.owner_user_id`, never from the request, and must write the lesson citation rows from the content.
- Tests: `test/learning/learning.hardening.spec.ts` (pure) and the new cases in `learning-db.spec.ts`. No schema change.
