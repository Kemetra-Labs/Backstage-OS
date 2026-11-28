# COG-05 write path: design (BACK-108)

Status: **design only. Not built.** Prepared 2026-11-28 on `main` at `7dd3fcb`. **D6 is preserved:** nothing here adds runtime persistence, a route or an activation. Building it needs the owner's explicit approval, and activating it needs BACK-45 approval evidence and real outcomes.

## 1. What already exists

- **Pure core** (`server/src/learning/learning.core.ts`):
  - `candidatesOf`;
  - `approve(rows, candidate, grant, basis)`: owner only, re-derives the candidate, canonical ISO times, 180-day cap;
  - `rollback`;
  - `readLesson(rows, basis, now, owner)`: checks the chain, who approved it, its time window and that the episodes still support it; a malformed `now` throws;
  - `fromStored(rows, scope)`.
- **Tables** (migration 0006): `learning_episodes`, `learning_episode_citations`, `learning_lessons`, `learning_lesson_citations`. They have forced RLS, composite keys within one workspace and project, append-only triggers, and `UNIQUE (workspace_id, project_id, applicability_key, version)`. The reviewer is a foreign key to `memberships`.
- **Reusable primitives:**
  - `runWithWorkspaceContext` (one transaction, forced RLS);
  - BACK-172 idempotency: `Idempotency-Key`, the key and request hashes recorded in the write's audit row, checked under `pg_advisory_xact_lock`;
  - the per-principal write limiter;
  - the safe error envelope.

## 2. The write path: `LessonRepository.approve` and `.rollback`

Both are database-mode only and run in **one transaction** via `runWithWorkspaceContext`. In order:

1. **Lock:** `pg_advisory_xact_lock(hashtextextended('lesson:' || workspace || ':' || project || ':' || key, 0))`. This serializes writers of one lesson. Other lessons are not blocked.
2. **Idempotency:** when an `Idempotency-Key` is present, look up the `audit_events` row for `lesson.approved` or `lesson.rolled-back` with the same key hash within the 24-hour window.
   - Same request hash: return that row's lesson id and version. Nothing new is written.
   - Different request hash: 422.
   - Replay the caller can no longer see: the uniform 404.

   This reuses the BACK-172 design unchanged.
3. **Owner, from the database, never from the request:** read `workspaces.owner_user_id` in the same transaction. The reviewer is the session's user id (from the global AuthGuard and WorkspaceGuard). A reviewer who is not the owner gets 404, the same as hidden (O5, D2). The membership foreign key stays as a second check.
4. **Server time:** `SELECT now()` in the same transaction gives `at`, formatted as canonical UTC ISO. The request never supplies `at` or `approvedAt`. The client supplies only `expiresAt`, which the core bounds to 180 days.
5. **Basis, read under the reader's grants:**
   - the episodes for the key, with their citations;
   - the citation ids that are currently visible: the same grant join as memory, with HumanDecisions visible through their investigation;
   - which of those citations are HumanDecisions.

   Nothing hidden enters the basis, so a lesson can never be derived from evidence the owner cannot see.
6. **Chain:** read the lesson's rows ordered by version, `fromStored(rows, {workspaceId, projectId})`, then call the pure `approve` or `rollback` with the owner, the server time and the basis. A refusal maps to:
   - `not-owner` → 404;
   - `contested`, `not-a-candidate` or `bad-expiry` → 422;
   - `invalid-chain` → 409, plus an operator alert line.

   The safe-error envelope has no 409 code today; a 409 would become the generic 500. So the build adds a `conflict` safe-error code (409, fixed message) under its own review.
7. **Persist:**
   - `INSERT` the new `learning_lessons` row. `version = last + 1`, and the unique constraint also stops a concurrent writer that somehow bypassed the lock: 23505 → 409.
   - `INSERT` one `learning_lesson_citations` row per `evidenceIds` entry.
   - Write the audit row (`lesson.approved` or `lesson.rolled-back`, with the idempotency hashes, version and key, but no content).

   It is all-or-nothing in one transaction.
8. **Verify after write:** within the transaction, re-read the chain and call `readLesson(rows, basis, at, owner)`. Anything but `approved` rolls back. This catches drift between what the database stores and what the pure core produced, such as jsonb round-tripping or hash coverage. Rollbacks follow the same rule: a rollback to a version that has expired, or that the current episodes no longer support, would not read `approved`, so it is refused (422) rather than written.

## 3. Episodes

An episode needs a decision citation (a visible HumanDecision) and an outcome citation (observation evidence).

**Open owner question:** what counts as an outcome. For example, a Jira issue reaching `done`, or a PR closed after a decision. Until it is answered, there is no episode writer. Under D6 episodes would be **proposed by a pure function from evidence, and confirmed by the owner**. They are never auto-written by an observer.

## 4. Read path (for activation only)

`LessonRepository.read(key)` assembles the same basis under the reader's grants, uses the database's `now()`, and takes the owner from the workspace row. It returns `readLesson(...)`'s state. There is no route until activation is approved. The first consumer would be reasoning reasons (advisory note only, D4) or BACK-168 `retrieve_lessons`, each behind its own gate.

## 5. Tests the build must include

All run against a real PostgreSQL as `kawalys_app`:
- **Owner check:** a non-owner reviewer gets 404, even though they are a member. If membership ever widens, the reviewer is still checked against `owner_user_id`.
- **Server time:**
  - a request field `approvedAt` is ignored or refused;
  - the stored `approvedAt` equals the transaction's `now()`;
  - the time is not in the future, and stays in order across versions.
- **Citations:** every evidence id has a `learning_lesson_citations` row. Revoking one source makes the lesson `suspended` on the next read.
- **Idempotency:** the same key and body give one row and the same id. The same key with a different body gives 422. Two parallel writers give two sequential versions or one 409, never a gap or a duplicate.
- **Isolation:** another workspace and project see nothing. A hidden episode or citation never enters the basis, which a second project with the same reader tests.
- **Rollback:** the restored content equals the earlier version. The audit row is written.
- **D6 guard:** no route imports `LessonRepository` until activation, the same way the current guard pins `src/learning`.

## 6. Decisions needed before building

1. Approve building `LessonRepository` with no route. It stays dormant, and D6 still blocks activation.
2. Define what counts as an outcome for an episode (section 3), with the BACK-45 owner.
3. When a lesson's own evidence is revoked, does the owner expect the lesson to show as `suspended` (current design), or to need a fresh approval?
