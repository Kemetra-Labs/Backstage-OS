# BACK-105 (COG-02) design: evidence-backed memory projection

Status: **D1–D6 decided under the owner's delegation (2026-11-26, "I delegate and authorize you").** That delegation covers the design choices in this document. It does not approve a schema change: **slice 1 needs none**, and any later migration (D6) is its own owner decision, at its PR. Nothing is built yet. Each implementation PR still stops for owner review before merge, as BACK-105 requires.

**Needs the owner's explicit acceptance (outside the design delegation):**
1. **D1 re-scopes the ticket title.** "PostgreSQL persistence" is met by the existing `evidence` table, with no new memory table. If a durable memory table is wanted anyway, D1 changes.
2. **Retention** stays BACK-47 decision pack item 6 (OPEN). Memory inherits whatever is accepted there.

Epic [BACK-103](https://rahmaqanater.atlassian.net/browse/BACK-103). Predecessor [BACK-104](https://rahmaqanater.atlassian.net/browse/BACK-104) (COG-01) is Done: PR #116 put the synthetic COG-P0 prototype under `server/test/research/cognitive-core/`. Design inputs: Confluence KMC 95256578 (draft) §11 (W1 contract) and §12.1 (W2 memory). Facts below are from `origin/main` f256ba6.

## 1. Where we are

| Piece | Today | Where |
| --- | --- | --- |
| Evidence store | `evidence` rows: `type`, `state` (`ok/stale/unknown/denied/error`, no default), `source_ref`, `observed_at`, `received_at` (database-set), `payload` (jsonb ≤ 64 KiB). **Append-only** by trigger; corrections are new rows. Forced workspace RLS. | `server/migrations/0003_evidence.sql` |
| Visibility | Source evidence needs an active `source_grants` row for the reader. A HumanDecision is hidden unless every cited row is visible. | `GRANTED`, `VISIBLE` in `server/src/evidence/evidence.repository.ts`; `PROJECT_VISIBLE` in `evidence/visibility.ts` |
| Grants | One active grant per (source, user). Revocation is one-way (`revoked_at`, trigger-enforced); granting again inserts a **new row with a new id**. No grant version exists. | `0003_evidence.sql` |
| Ingest | `ingest()` writes every observation of a poll in one transaction under a share lock on the grant. **No de-duplication**: an unchanged item is stored again on every poll. | `evidence.repository.ts` |
| Item identity | Observers emit one row per item with a canonical `source_ref`: `github:<owner/repo>#pull/<n>` and `#issue/<n>`, `jira:<KEY>#issue/<KEY-n>`, `confluence:<SPACE>#page/<id>`. Read failures are `source_status` rows on the endpoint ref; GitHub also writes a `list_page` row (returned vs page size). | `server/src/connectors/*/…observer.ts` |
| Provider time and order | GitHub items: `updatedAt` (ISO, second precision). Jira: `updatedAt`. Confluence: `version` (integer, provider-ordered) and `lastModified`. `observed_at` is the **poll time**, not the item's change time. | observers |
| Freshness today | Per-source TTL against read time: the app marks `age > ttl` stale (`app/src/contract/rules.ts`); the Atlassian reader's default TTL is 15 minutes (`atlassian.read.ts`). The portfolio server returns `lastReadAt` and leaves `stale` to the client. | as listed |
| Audit | `audit_events`, append-only, workspace RLS, database-set `occurred_at`. | `0001_foundation.sql` |
| Retention | **OPEN.** BACK-47 decision pack item 6 recommends Observations 180 days, decisions and audit until workspace deletion; not yet accepted. Nothing purges today. | `docs/planning/BACK-47/PERSONAL-ALPHA-DECISION-PACK.md` |
| Prototype | Pure projector, reasoner and validator over synthetic tasks, with a hand-written oracle. Not imported by `src/`. | `server/test/research/cognitive-core/` |

## 2. Scope

**In:** a typed, read-only **memory projection** over existing evidence. For every visible item it gives the current fact and its history, with explicit `verified / stale / unknown / conflict / missing`, effective and recorded time, citations to evidence ids, deterministic replay and idempotency. Enforced against real grants in PostgreSQL integration tests.

**Out:** HTTP routes and UI (COG-07), retrieval and relationships (COG-03), task readiness and decisions (COG-04), learning (COG-05), any LLM, embedding, new dependency, new database, live connector or credential. Not a second store of record.

## 3. Decisions

### D1 — Compute the projection on read; no new table in slice 1

**Context.** BACK-105 forbids a second canonical store. `evidence` is already durable, append-only and indexed by `(workspace_id, source_id, observed_at DESC)`. The pilot is one owner, one workspace and a handful of sources. W2 makes "full recompute" the correctness oracle.

**Decision.** The projection is a pure function over the visible evidence rows of one request. The repository fetches them with the existing visibility predicates and the window below, and the projector resolves them in memory. Nothing new is written.

**The window is per item, not a row count.** Ingest re-stores every item on every poll, so a row limit would keep only the last few polls and drop quiet items. For each item identity (D2) the query keeps the earliest-received row of each distinct content key (`DISTINCT ON`), with `received_at ≤ knownAt`, plus the newest status rows per endpoint. History is capped at the **50 most recent distinct revisions per item**. The cap is part of the fingerprint (D5), and an item that hits it says so (`historyTruncated: true`).

**Alternatives.**
- *Materialized projection table (cache).* Faster at scale, but it is a second copy that must be invalidated on every new row, revocation, re-grant and policy change. One invalidation bug leaks or serves stale facts. Rejected for now: no measured need.
- *SQL view.* No storage, but temporal resolution, conflict detection and canonical hashing in SQL are hard to test and to keep equal to the pure oracle. Rejected.

**Consequences.** No migration, no rollback risk, nothing to invalidate, revocation applies on the next read by construction. The cost is a read per request. Slice 3 measures it, and D6 says what happens if it is too slow.

### D2 — Item identity and revision order per provider

**Context.** W1 §11.4: never guess an order from opaque revisions or arrival order. Only Confluence exposes an ordered version. Ingest stores duplicates.

**Decision.**
- **Identity:** `(workspace_id, source_id, source_ref, payload.kind)`. The kind is needed because GitHub stores the repository record and the repository's failure row under the same root ref. Rows of kind `source_status` and `list_page` are read status (D3), never item facts.
- **Content key:** SHA-256 of the canonical JSON of the **provider-owned fields only**:

| Kind | Fields in the content key | Excluded |
| --- | --- | --- |
| `pull_request` | `number, title, state, draft, updatedAt` | `url` |
| `issue` (GitHub) | `number, title, state, updatedAt` | `url` |
| `jira_issue` | `key, summary, statusCategory, updatedAt` | `url` (built from the configured site) |
| `confluence_page` | `pageId, title, version, lastModified` | `url`, `spaceKey` |
| `repository` | `fullName, defaultBranch, archived, private, pushedAt` | none |

  Config- or mapper-derived fields such as `url` cannot create a revision or a conflict. Rows with the same identity and content key are one input: polling twice changes nothing. A guard test pins these field lists against the observers; changing them is a contract change shared with BACK-48.
- **Revision order:**

| Provider / kind | Order key | Rule |
| --- | --- | --- |
| Confluence page | `version` (integer) | Higher version wins. Same version, different content: **conflict**. |
| GitHub PR / issue, Jira issue | `updatedAt` | A strictly later `updatedAt` wins. **Equal `updatedAt`, different content: conflict**, never a guess. Rare for Jira (millisecond precision), possible for GitHub (seconds). |
| GitHub repository record | **none: a point-in-time status, not a revision history** | The current value is the one from the **latest successful repository read**, labelled `orderedBy: "latest-read"` in the output. This is the one explicit arrival-order exception. The record has no provider revision, and `archived`, `private` and `defaultBranch` change without `pushedAt` changing. Earlier distinct values stay in history. |

- An older revision that arrives later (a lagging read) never replaces a newer one.

**Alternatives.** *Treat every timestamp as opaque* is safe but makes every edited item a permanent conflict: useless. *Order everything by `observed_at` or `received_at`* is arrival order, which W1 forbids; only the repository record uses it, labelled. *Hash the whole payload* turns a site-configuration change into a conflict on every item. *Add a revision column to `evidence`* is a schema change for data already in `payload`.

**Consequences.** Deterministic, explainable order. The timestamp rule is a documented assumption that GitHub and Jira timestamps rise monotonically per item. A provider clock regression shows as a newer revision being ignored, not as wrong data. Tests pin the tie, lag, `url`-change and repository cases.

### D3 — Three clocks and freshness from the source TTL

**Context.** The prototype has `effectiveAt / knownAt / evaluationAt` and `validUntil`. The server has none of these as columns.

**Decision.**
- **Effective time** of a revision is its provider time (`updatedAt` or `lastModified`), falling back to `observed_at` when the provider gives none.
- **Known time** is `received_at`. The app role cannot write it (its INSERT grant excludes the column); only the migrator role could. It is `now()`, the **start** of the ingest transaction, not its commit. So an ingest that starts before T and commits after a read at T adds rows with `received_at ≤ T`, and a replay "as known at T" could differ from the first read. **Rule:** `knownAt` must be at most `now() − 5 minutes` (the settle margin). A later value is clamped, and the clamped value is echoed in the output. The margin must stay above the longest ingest transaction; S2 asserts that bound. A commit-ordered sequence column would remove the margin. That is a schema change, recorded under D6 and not proposed now.
- **Evaluation time** is an explicit input, defaulting to the request's database `now()`. It is echoed in the output.
- **Status is the worst of three signals,** with unknown worse than stale worse than verified:
  1. **The row's own `state`.** Atlassian items are stored `stale` when the provider's `date` header is older than the TTL (`atlassian.read.ts`). `ok` maps to verified, `stale` to stale, and `unknown`, `denied` and `error` to unknown. A fresh poll of a stale row is never verified.
  2. **TTL freshness.** Current while `evaluationAt < observed_at(latest read that saw it) + TTL(source)`, otherwise stale. This is W1's strict boundary. TTLs live in a versioned policy table in code (`policyVersion`), starting from the existing 15-minute default.
  3. **A newer failed read.** A non-`ok` status row newer than the item's latest successful read makes it unknown with that read's reason. Which status rows cover which items:

| Provider | Status row `source_ref` | Items it covers |
| --- | --- | --- |
| GitHub | `github:<ref>` (repository read failed; no list rows are written then) | the repository record and every PR and issue of the source |
| GitHub | `github:<ref>#pulls` / `#issues` | that list's PRs / issues |
| Jira | `jira:<KEY>` | every issue of that project key |
| Confluence | `confluence:<KEY>` (space) and `confluence:<KEY>#pages` | every page of that space |
| any | `github:invalid-ref`, `confluence:invalid-ref`, `jira:invalid-ref` | every item of the source |

  This reuses the rules in `portfolio.model.ts` (`summarizeSource`: a repository failure fails both lists; several heads in one batch is `ambiguous_read`). The table is pinned by a test per provider.
- **Absence is not a fact.** Every list is one first page:
  - GitHub: open items only, recently updated first;
  - Jira: the 20 most recently updated issues, any status;
  - Confluence: the 20 most recently modified current pages.

  An item missing from a later successful read only fell off that page, so it is **stale** with reason `not-in-latest-read`. It is never "closed" and never removed from history.
- **Difference from the app today:** `app/src/contract/rules.ts` maps an unavailable source to `stale` and uses `age > ttl`. D3 maps a failed read to `unknown` (stricter, per the hard rule) and uses the strict boundary. COG-07 aligns the app.

**Consequences.** Unknown is never healthy, matching the hard rule. Historical reads cannot see later knowledge, within the settle margin. TTL changes are versioned, so old outputs stay reproducible.

### D4 — Authorization at the read and at every derived result

**Context.** The server hides a HumanDecision unless all citations are visible. The prototype turns a hidden input into a generic "missing" fact. Both prevent disclosure; they are different rules.

**Decision.**
- **Scope first:** visibility is applied in SQL before any row reaches the projector: forced workspace RLS, the request's `project_id` filter, `PROJECT_VISIBLE` for the project and `GRANTED` for every row. Hidden rows never reach the projector, so they cannot affect its counts, order or conflicts.
- **Derived results follow the server rule:** every projected fact lists the evidence ids it rests on. A fact is returned only if all of them are visible to the reader, which holds by construction because only visible rows were read.
- **Hidden inputs follow the prototype rule:** when a later slice needs an input it cannot see (COG-04 dependencies), the output is a generic `missing` with no id, ref or source. COG-02 itself has no cross-source inputs.
- **Historical reads use today's grants.** A request for a past time never restores a revoked permission (W1 §11.4).

**Consequences.** One visibility definition for evidence and memory. Revocation, cross-workspace and hidden-record noninterference are testable against real PostgreSQL (slice 2).

### D5 — Determinism, replay and the derived-result fingerprint

**Decision.**
- Output is canonical: items sorted by `(source_id, source_ref)`, revisions by order key, ids sorted. The same visible rows, clocks and policy give byte-identical output.
- Every output carries a **fingerprint**: `policyVersion`, the three clocks, the ids of the reader's active grants on the involved sources (sorted), and the evidence high-water mark (`max(received_at)` and row count of the visible window). A revoke or re-grant changes the active grant ids, because re-granting inserts a new row. That gives a grant revision without a new column.
- `validateAtRead(previous)` recomputes and compares, like the prototype. With D1 there is no cache, so this exists for COG-03+ consumers that keep a result.
- The fingerprint holds only the reader's own grant ids and counts over rows the reader can see. **A result is per reader:** it must never be shared with, or cached for, another user.

**Alternatives.** *A grant version counter* needs a schema change and a trigger; the active-id set already changes on every grant event. *No fingerprint* leaves later consumers unable to detect a stale derived result.

### D6 — Retention, correction, rebuild and migration

**Decision.**
- **Retention:** memory keeps nothing of its own, so it inherits evidence retention, still **OPEN** as BACK-47 item 6. When a purge exists, the next read reflects it.
- **Correction:** a provider correction arrives as a new evidence row and wins by D2. Kawalys-side corrections are new rows too (append-only).
- **Rebuild:** recompute. There is nothing to rebuild.
- **Migration and rollback:** slice 1 has none; rollback is reverting the PR.
- **Possible later schema items, not proposed now:** a commit-ordered sequence on `evidence` (removes D3's settle margin) and a cache table (below). Each needs its own owner approval.
- **Cache trigger:** only if slice 3 measures a projection read above **500 ms p95** for the pilot's data volume does a cache table get proposed. That needs a separate migration and owner approval, and it must be workspace-scoped with forced RLS, keyed by the D5 fingerprint, marked non-canonical, and droppable without data loss.

## 4. Contract sketch (TypeScript, `server/src/memory/`)

```ts
type FactStatus = 'verified' | 'stale' | 'unknown' | 'conflict' | 'missing';
interface MemoryRequest { workspaceId: string; userId: string; projectId: string; effectiveAt: Date; knownAt: Date; evaluationAt: Date; }
interface Revision { orderKey: string | number | null; contentKey: string; effectiveAt: string; firstKnownAt: string; evidenceIds: string[]; payload: Record<string, unknown>; }
interface MemoryItem { sourceId: string; sourceRef: string; kind: string; status: FactStatus; reason: string | null; current: Revision | null; history: Revision[]; lastReadAt: string | null; }
interface MemoryProjection { items: MemoryItem[]; fingerprint: { policyVersion: string; clocks: {...}; activeGrantIds: string[]; highWater: { receivedAt: string | null; rows: number } }; }
```

Names are illustrative; the implementation PR fixes them. No `confidence` field, no execution token.

## 5. Implementation slices (TDD, each its own PR)

| Slice | Delivers | Tests first |
| --- | --- | --- |
| **S1 Pure projector** | `memory.types.ts`, `memory.policy.ts` (TTL table, `policyVersion`, content-key field lists, status-coverage table), `memory.projector.ts`: D2, D3, D5 over plain rows. ADAPT the resolution ideas and the canonical JSON from the research port; no import from `test/`. | Unit tests with synthetic rows: duplicate polls collapse; a `url` change is neither a revision nor a conflict; lagging older revision ignored; equal `updatedAt` with different content is conflict; Confluence version order; repository record follows the latest read and is labelled; a stale row is never verified; each status-coverage row makes its items unknown; absence is stale with reason; TTL boundary; `knownAt` clamped to the settle margin; history cap flagged; permutation and replay give identical output; the fingerprint changes on each input change. A guard pins the content-key fields against the observers. |
| **S2 Repository and PostgreSQL proof** | `memory.repository.ts`: one query with the per-item `DISTINCT ON` window, the project filter, `PROJECT_VISIBLE` and `GRANTED`, inside `runWithWorkspaceContext`. | Testcontainers integration: revoke a grant and the source's items vanish from the next projection and the fingerprint changes; re-grant gives a new fingerprint; a second workspace's rows never appear; a project without the reader's grant returns nothing; hidden-source rows change nothing (output equal with and without them); `as known at` excludes later rows; an ingest still open at a read's `knownAt` is excluded by the margin; repeated ingest is idempotent. |
| **S3 Measure** | A script over synthetic data at pilot scale **and at 180 days of 15-minute polls** (the retention recommended in BACK-47); record p50/p95 for S2's read. | Recorded numbers, not a gate on CI. Applies the D6 cache trigger. |

No controller, module registration or route in any slice: COG-07 owns exposure. Commands per slice: `npm run check` in `server/` (needs Docker), plus the research specs staying green.

## 6. Acceptance mapping (BACK-105)

| BACK-105 deliverable | Covered by |
| --- | --- |
| Evidence-linked typed projection with stable identity and revision, effective and recorded time, explicit conflict, unknown and stale, deterministic replay, idempotency | D2, D3, D5; S1 tests |
| Source revision semantics defined, no guessing of opaque revisions | D2 table |
| Real workspace, project and grant visibility at read and derived results; revocation, cross-tenant and hidden-record noninterference in PostgreSQL | D4 (RLS, project filter, `PROJECT_VISIBLE`, `GRANTED`); S2 tests |
| Retention, correction, index rebuild, migration and rollback documented; reuse existing structures | D6; D1 (no new structure) |
| Invalidation on changed evidence and grants; historical versus current reads | D3 known-time cutoff, D5 fingerprint; S1 and S2 tests |
| No LLM, embeddings, arbitrary ingestion or separate database | §2; enforced by a guard test like the research guard |

## 7. Reconciliation

- **BACK-55 (Done)** owns the evidence store, RLS and grants. COG-02 adds no table and changes none of it.
- **BACK-43 (To Do, typed evidence and timeline)** owns the evidence types and the user-facing timeline. The projection is a read model over the same types and can serve that timeline; it adds no evidence type and does not promote a Hypothesis to fact.
- **BACK-48 (To Do, connectors)** owns what observers write. D2 depends on today's payload fields (`updatedAt`, `version`, `pushedAt`) and the `source_ref` format; a change to those is a contract change both tickets must see. The guard in S1 pins the fields it reads.

## 8. Reuse before build

| | |
| --- | --- |
| Inspected | `server/migrations/0001`–`0005`, `server/src/evidence/*`, `server/src/connectors/*`, `server/src/portfolio/portfolio.model.ts`, `app/src/contract/rules.ts`, the COG-01 research port, BACK-14 reuse inventory, BACK-47 decision pack, Confluence KMC 95256578 §11–12 |
| Strategy | **ADAPT** Kawalys's own research port (resolution logic, canonical JSON, validator pattern) into `server/src/memory/`; **REUSE** `GRANTED`/`VISIBLE`, `runWithWorkspaceContext`, `worstState`; **REFERENCE** Retail Tower `services/backend-core/apps/api/src/idempotency/canonical-json.ts` (BACK-14 S4) and its golden tests to cross-check the content key. Nothing copied from Retail Tower; no runtime dependency on it. |
| Not reused | No external memory framework (W2 rejects opaque or model-curated memory as authority). |

## 9. Risks and stop conditions

| Risk | Mitigation |
| --- | --- |
| Provider timestamps are not a true revision (D2) | Ties are conflicts; lag is ignored, not applied; documented assumption; revisit per provider in BACK-48. |
| `received_at` is transaction start (D3) | 5-minute settle margin on `knownAt`, asserted in S2; a commit-ordered sequence is the schema-level fix if the margin proves fragile. |
| An observer changes its payload or refs (BACK-48) | Content-key fields and the status-coverage table are pinned by tests, so a change fails CI instead of silently creating conflicts. |
| Compute-on-read becomes slow | S3 measures; D6 cache path with its own approval. |
| Retention stays undecided | Memory stores nothing, so it cannot keep data longer than evidence does. Owner decision on BACK-47 item 6 still needed. |
| A projected fact read as truth by the UI | Status and reason are mandatory; COG-07 renders unknown and stale as such (hard rule). |

**Stop** and return to the owner if: a slice needs a schema change, a new dependency, a route, or live data; a test shows a hidden row changing output; or BACK-48 changes the payload fields D2 relies on.
