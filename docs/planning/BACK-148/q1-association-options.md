# BACK-148 Q1: how a real observation reaches an investigation (options card)

**Status: DECIDED 28 Nov 2026. The owner approved L, L2, M and N as recommended ("approve L, L2, M, N as
recommended"). L and L2 are built and merged (PR #181, `8818b12`). M ("Yes, build M", 28 Nov 2026) is built on branch
`claude/back148-m-create-investigation`: owner-only `POST /investigations` behind the BACK-172 controls, not yet merged.
Real validation waits for BACK-52. Q2 and Q3 remain open.** Prepared 28 Nov 2026 against `main` `8bf802d`. Answers BACK-148 Q1
("explicit linking versus scoped read projection, and does the first path need case creation?"), which the ticket
requires before any schema or API change. Q2 (correction, revocation and ownership of a linked case) and Q3 (which real
observation is permitted) stay open and are only noted where an option touches them. Nothing here authorizes code,
schema, credentials, source access, dependencies, deployment or spend.

Coordination: BACK-172 (shared write limits, idempotency, request ids) and BACK-52 (the one consented real source) are
in progress in another session. Every option below that adds a write route must sit behind BACK-172's controls, so no
implementation starts before BACK-172 merges. Fixture work may start after this decision.

## 1. What exists today (inspected, not assumed)

| Fact | Where |
| --- | --- |
| Evidence is append-only. `investigation_id` is fixed at insert; the runtime role has no `UPDATE`, and triggers refuse UPDATE/DELETE/TRUNCATE. A connector observation that was ingested without a case can never be moved into one. | `server/migrations/0003_evidence.sql` (evidence table, `refuse_change` triggers) |
| Connector ingest writes `investigation_id` NULL unless told otherwise; ingest is server-internal (no route) and refuses a source without an active grant (grant row share-locked). | `server/src/evidence/evidence.repository.ts` `ingest()` |
| The room's evidence list is `investigation_id = :id` only, so project observations never appear in it. | `investigation.controller.ts` `get()`; `evidence.repository.ts` `list()` |
| **Citations already reach any visible observation of the case's project, whatever its `investigation_id`.** `visibleCitations()` checks project, active grant (share-locked) and `type <> 'HumanDecision'`, nothing about the case. | `evidence.repository.ts` `visibleCitations()`, used by `recordNote()` and `recordDecision()` |
| A note must cite rows of exactly one source and inherits it; its state is the worst cited state. A decision may cite up to 50 rows and is hidden unless every cited row is visible. | `recordNote()`, `VISIBLE`, `app/src/live/decisions.ts` (`EVIDENCE_MAX`) |
| Citations are rows in `evidence_citations` (append-only, same workspace and project via composite keys), written in the same transaction as the note or decision and its audit row (`note.recorded` / `decision.recorded`, with `requestId`). | `0003_evidence.sql`, `0004_decision_audit.sql`, `insertCitations()` |
| `GET /evidence?projectId=` already returns the caller's visible evidence of one project, newest first, capped at 500. It has no type filter: notes and decisions of every case in the project share the same 500 rows. | `evidence.controller.ts` `list()`, `LIST_LIMIT = 500` |
| `visibleCitations()` excludes only `HumanDecision`, so a note in case A can already cite a Correlation or Hypothesis written in case B of the same project. | `evidence.repository.ts` `visibleCitations()` |
| `GET /evidence/:id` returns one visible record (404 otherwise). | `evidence.controller.ts` `get()` |
| Cases can only be created by `createInvestigation()` (audited `investigation.created`). Its only caller is the `local:up` seed, which refuses production. There is no route and no `investigation.create` capability. | `evidence.repository.ts`, `src/ops/local-stack.ts`, `src/auth/capabilities.ts` |
| The live room cites only records it currently lists, and drops citations that left the list (revoked, hidden) before sending. | `app/src/live/decisions.ts` |

Consequence: the server can already record "this note/decision is about that real observation" safely. What is missing
is (a) the room showing project observations as candidates, and (b) a way to have a case at all in production.

## 2. Option A (recommended): citation is the association, plus a scoped read projection

The room also reads `GET /evidence?projectId=<case project>` (existing endpoint) and shows those rows in a separate,
labelled list, for example "Project observations, not part of this case", each with type, source, `observedAt` and state
badges. The user cites one in the existing note or decision form. The citation row is the association.

- **Schema/API delta:** none for the association itself (no schema, no new write route). One small read change is
  likely worth it and is a separate decision (**L2** below): a `type=Observation` filter on `GET /evidence`, because
  without it the 500-row cap is shared with every case's notes and decisions, and filtering in the browser leaves fewer,
  possibly older, observations.
- **What the projection offers:** Observations only. Citing another case's Correlation/Hypothesis is already possible on
  the server; whether the room should offer it (an inference built on an inference) is left to Q2/BACK-150, not added here.
- **Citations survive reload:** a cited observation has no `investigation_id`, so the room must resolve each citation with
  `GET /evidence/:id` (existing), not only through the capped projection; otherwise a citation that fell past row 500
  shows as a bare id. Projection ids must also feed the existing `citable` list in `app/src/live/decisions.ts`, or the
  SEC-02 draft pruning drops them.
- **Source identity and revision:** a citation pins one immutable evidence row (`source_id`, `source_ref`, `observed_at`,
  payload). A later correction is a new row; the old citation keeps pointing at what the user actually saw.
- **Meaning:** a citation says "this human note or decision refers to that record". It is never shown as causal proof or
  as an observed incident; the note keeps its Correlation/Hypothesis badge.
- **Grants and races:** reuse what exists. Visibility rechecked on read; grants share-locked on every write; a decision
  disappears for a reader who loses any cited source, a note disappears with its source. Cross-project and invisible ids
  answer exactly like absent ones (`NotVisibleError` to 404).
- **Retry/idempotency:** no new write route. The note and decision writes are expected to be covered by BACK-172's
  shared controls; confirm against its merged scope (its ticket promises representative existing-endpoint proof, not
  every route).
- **Limits to state honestly:** the projection is capped (500, newest first) and must show the cap and a lower-bound count
  (BACK-49 rule); without L2 the count must also say the cap includes notes and decisions. An observation is only "associated" once someone writes a note or decision about it; there is no bare
  "attach" without a human statement. A single note still cites one source (unchanged rule; multi-source belongs to
  BACK-150).
- **Tests to add:** project observation listed and citable from the room; reload shows the citation; revoke between list
  and submit refuses and changes nothing; another project's observation, an invisible one and an absent one all look the
  same; stale/unknown never green; cross-workspace refusal.
- **Q2 impact:** small (plus the cross-case inference question above). Revocation already hides the citing note/decision; correction semantics are "new row, old citation
  stays" unless the reviewer rules otherwise.

## 3. Option B: an explicit link table

Migration 0007 adds an append-only `investigation_evidence` link (workspace, project, investigation, evidence, linked by,
linked at), composite same-project keys, forced RLS, plus `POST /investigations/:id/links`, a new capability and an
`evidence.linked` audit row. The room then lists linked rows like its own evidence.

- **Gain:** an observation can be attached without writing a note; the case has a curated evidence list.
- **Cost:** schema and role grants (independent DB review), a new write route under BACK-172 limits and idempotency, a new
  capability, unlink semantics (append-only means "unlinked" is another row), and Q2 must be answered *before* building,
  not after. Larger than the bounded MVP outcome the ticket describes.

## 4. Option C (rejected): copy the observation into the case

Re-ingesting a second Observation row with `investigation_id` set duplicates connector evidence, makes counts double,
blurs which row the provider actually sent, and needs a new path into the server-internal `ingest`. It conflicts with
"no fabricated correlation" and canonical source identity.

## 5. Sub-question: does the first path need case creation?

In production there is no way to create a case today, so the first real path needs one of:

| | How | Cost | Notes |
| --- | --- | --- | --- |
| **(i) recommended** | Owner-only `POST /investigations` reusing `createInvestigation()` and its `investigation.created` audit; new `investigation.create` capability for the owner role only; project must be visible to the caller (same predicate as reads); behind BACK-172 limits and idempotency | One small write route, one capability, no schema | Start only after BACK-172 merges. Optional `observationId` on create is out of scope. |
| (ii) | Operator runs a one-off creation on the host | No app change | Needs database access on the host, which touches BACK-116 (non-root operator access) and BACK-128 (secret custody). Not recommended. |
| (iii) | No creation: fixtures only until later | None now | Blocks the real acceptance step of BACK-148/50. |

## 6. Decisions requested

Letters continue after BACK-131 (A-D), BACK-127 (E-G) and BACK-172 (H-K).

| | Decision | Recommendation |
| --- | --- | --- |
| **L** | Association mechanism | **A**: citation is the association; room adds a labelled, capped list of project Observations and resolves citations by id. B only if a no-note "attach" is required for the pilot. |
| **L2** | Read filter | **Yes**: add an optional `type=Observation` filter to `GET /evidence` (read-only, same visibility, malformed value matches nothing like the other filters). No: keep the shared cap and say so in the count. |
| **M** | First-path case creation | **(i)**: owner-only `POST /investigations` reusing `createInvestigation()`, after BACK-172 merges. |
| **N** | Order | Fixture-backed app work for L starts after this decision; the M route and real validation wait for BACK-172 (merged) and BACK-52 (one consented source, Q3). |

Owner rulings: **L = A, L2 = yes, M = (i), N as written**, approved by the owner on 28 Nov 2026. Option B and the
copy option C are not pursued.
