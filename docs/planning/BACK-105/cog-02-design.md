# BACK-105 (COG-02) design: evidence-backed memory projection

Status: **D1–D6 drafted under the owner's delegation of 2026-11-26 and revised for the owner's design corrections A–D, fingerprint and retention (revision 2).** The delegation covers the design choices. It does not approve a schema change: **S1 to S3 need none**, and any later migration (D6) is its own owner decision, at its PR. Nothing is built. Each implementation PR stops for owner review before merge, as BACK-105 requires.

Revision 2 also addresses an independent adversarial review: 0 critical, 5 major and 6 minor findings, all resolved in this text.

**Owner decisions still open (none recorded as accepted here):**
1. **D1 re-scopes the ticket title.** "PostgreSQL persistence" is met by the existing `evidence` table, with no memory table.
2. **Retention** is BACK-47 decision pack item 6 (OPEN). See D6 for what memory needs from it.
3. **Connector contract follow-up (B):** Jira and Confluence record no successful-read marker. Adding one is a BACK-48/BACK-53 change, separately gated.
4. **Exact historical replay** needs a commit-ordered sequence column on `evidence` (D3, D6). That is a schema change, not proposed here. Until then, replay is best-effort.

Epic [BACK-103](https://rahmaqanater.atlassian.net/browse/BACK-103). Predecessor [BACK-104](https://rahmaqanater.atlassian.net/browse/BACK-104) (COG-01) is Done: PR #116 put the synthetic COG-P0 prototype under `server/test/research/cognitive-core/`. Design inputs:
- Confluence KMC 95256578 (draft) §11 (W1 contract) and §12.1 (W2 memory);
- R2 decision pack KMC 89456817. Evidence and projection are internal, not external engine ports. A result supported only by unauthorized evidence is removed or shown as neutral Unknown, with no placeholder and no count side channel.

Facts below are from `origin/main` f256ba6.

## 1. Where we are

| Piece | Today | Where |
| --- | --- | --- |
| Evidence store | `evidence` rows: `type`, `state` (`ok/stale/unknown/denied/error`, no default), `source_ref`, `observed_at`, `received_at DEFAULT now()`, `payload` (jsonb ≤ 64 KiB). **Append-only** by trigger; corrections are new rows. Forced workspace RLS. | `server/migrations/0003_evidence.sql` |
| `received_at` | PostgreSQL `now()` is the **start time of the inserting transaction**, not its commit time. The app role's INSERT grant excludes the column, so `kawalys_app` cannot set it; the migrator role could. | `0003_evidence.sql` (column grant) |
| Visibility | Source evidence needs an active `source_grants` row for the reader. A HumanDecision is hidden unless every cited row is visible. | `GRANTED`, `VISIBLE` in `server/src/evidence/evidence.repository.ts`; `PROJECT_VISIBLE` in `evidence/visibility.ts` |
| Grants | One active grant per (source, user) (partial unique index). Revocation is one-way (`source_grants_revoke_once`); granting again inserts a **new row with a new id**. No grant version. | `0003_evidence.sql` |
| Transactions | `runWithWorkspaceContext` issues a plain `BEGIN`, so the PostgreSQL default **READ COMMITTED** applies: each statement sees its own snapshot. No `statement_timeout`, `lock_timeout` or `idle_in_transaction_session_timeout` is set anywhere in `server/`, so **an ingest transaction's duration is unbounded**. | `server/src/db/workspace-context.ts` |
| Ingest | `ingest()` writes every observation of one observer run in one transaction, under a share lock on the grant. **No de-duplication**: an unchanged item is stored again on every poll. A runtime observer run is one batch with one `received_at` and one `observed_at`. That does **not** hold for the local seed (`server/src/ops/local-stack.ts`), which ingests several `observed_at` values in one transaction. The seed also writes a Correlation on a PR's ref, plus kinds the observers never emit (`workflow_run`, `pull_requests`, `deployments`). Notes from `recordNote` carry no `kind`. All evidence writes go through the app role (`kawalys_app`). | `evidence.repository.ts`, `ops/local-stack.ts` |
| Item rows | `github:<owner/repo>` (repository record, kind `repository`), `…#pull/<n>`, `…#issue/<n>`; `jira:<KEY>#issue/<KEY-n>`; `confluence:<SPACE>#page/<id>`. | `server/src/connectors/*/…observer.ts` |
| Read markers | **GitHub** records every successful read: the repository record (`ok`), and per list a `list_page` row with `returned` and `pageSize`. **Jira and Confluence record only items**: a successful read with items writes item rows, and **a successful empty read writes nothing**. Neither writes `returned` or `pageSize`. Failures are `source_status` rows on the project, space, list or `*:invalid-ref` ref. | observers |
| Lists | GitHub: open PRs and issues, first page, recently updated first. Jira: the 20 most recently updated issues of the project, any status (`ORDER BY updated DESC`, `maxResults=20`). Confluence: the 20 most recently modified current pages. | observers, `atlassian.read.ts` (`PAGE_SIZE = 20`) |
| Provider time and order | GitHub: `updatedAt` (seconds). Jira: `updatedAt` (milliseconds). Confluence: `version` (integer) and `lastModified`. `observed_at` is the poll time. Atlassian items are stored `stale` when the response `date` header is older than the TTL. | observers, `atlassian.read.ts` |
| Freshness today | Per-source TTL (Atlassian default 15 minutes). The app maps an unavailable source to `stale` and uses `age > ttl` (`app/src/contract/rules.ts`). The portfolio server returns `lastReadAt` and refuses two reads in one batch (`ambiguous_read`, `portfolio.model.ts`). | as listed |
| Retention | **OPEN** (BACK-47 item 6). Nothing purges today. `evidence` refuses DELETE by trigger, and `evidence_citations` references `evidence` with no cascade. | BACK-47 pack, `0003_evidence.sql` |
| Prototype | COG-P0 projector, reasoner and validator over synthetic tasks, with a hand-written oracle. Not imported by `src/`. | `server/test/research/cognitive-core/` |

## 2. Scope

**In:** a typed, read-only **memory projection** over existing evidence. For every visible item:
- the current fact and its history;
- explicit status: `verified / stale / unknown / conflict / insufficient-history`;
- provider, known and observation times;
- citations to evidence ids;
- completeness flags;
- deterministic replay and idempotency.

It is enforced against real grants in PostgreSQL integration tests.

**Out:**
- HTTP routes and UI (COG-07);
- retrieval and relationships (COG-03);
- task readiness and decisions (COG-04);
- learning (COG-05);
- any LLM, embedding, new dependency, new database, live connector or credential;
- connector changes.

It is not a second store of record.

## 3. Decisions

### D1 — Compute the projection on read; no new table

**Context.** BACK-105 forbids a second canonical store. `evidence` is durable, append-only and indexed by `(workspace_id, source_id, observed_at DESC)`. W2 makes full recompute the correctness oracle.

**Decision.** The projection is a pure function over visible evidence read in **one SQL statement** per request (D3), then resolved in memory. Nothing new is written. No cache until S3 measures one is needed.

**Alternatives.** A materialized projection table needs invalidation on every row, revoke, re-grant and policy change; one bug leaks or serves stale facts. A SQL view puts temporal resolution where it is hard to test against the pure oracle. Both rejected for now.

**Consequences.** No migration and nothing to invalidate; revocation applies on the next read by construction. The cost is a heavier read. S3 measures it at retention volume.

### D2 — Identity, observations, runs and revisions

**Context.** The same provider revision is observed on every poll. De-duplication must not lose the latest confirmation (freshness), the first sighting (known time), the states seen, or the evidence trail. Content can also return to an earlier value (A → B → A).

**Identity.** `(workspace_id, source_id, source_ref, payload.kind)`. The kind matters because the GitHub repository record and that repository's failure row share the root ref. `source_status` and `list_page` rows are read markers (D3), never item facts.

**Input filter.** Only `type = 'Observation'` rows whose `payload.kind` is in an allow-list are read:
- item kinds: the five in the table below;
- markers: `source_status` and `list_page`.

Correlations, Hypotheses, HumanDecisions, notes without a kind and any other kind (such as the seed's `workflow_run`, `pull_requests` and `deployments`) are excluded. They cannot become memory facts or collide with an item's identity. The allow-list is pinned by a test against the observers.

**Content key.** SHA-256 of the canonical JSON of the provider-owned fields only. `url` is built from configuration, so it can never create a revision or a conflict.

| Kind | Content-key fields |
| --- | --- |
| `pull_request` | `number, title, state, draft, updatedAt` |
| `issue` (GitHub) | `number, title, state, updatedAt` |
| `jira_issue` | `key, summary, statusCategory, updatedAt` |
| `confluence_page` | `pageId, title, version, lastModified` |
| `repository` | `fullName, defaultBranch, archived, private, pushedAt` |

A guard test pins these lists against the observers. Changing them is a contract change shared with BACK-48.

**Three levels, nothing discarded:**
- **Observation:** one evidence row.
- **Run:** a maximal sequence of consecutive observations of one identity, ordered by `(observed_at, received_at, id)`, with the same content key. A run never spans a retention gap (D6). A run keeps:
  - `firstKnownAt` and `lastKnownAt` (`received_at`);
  - `firstObservedAt` and `lastObservedAt` (`observed_at`);
  - `effectiveAt` (the provider time in the content);
  - `observationCount`;
  - the set of row `state`s seen;
  - the first and last evidence ids. Every id in between is recoverable by query on identity and time range.
- **Revision:** the content a run carries.

**Repeated observation and A → B → A.**
- Ordered kinds (all but `repository`) carry their order key (`updatedAt`, `version`) inside the content. A real return to the same values therefore arrives with a new `updatedAt`/`version`: a new revision A′, not A. A row whose content key equals an earlier revision but arrives after a different run is a **lagging read**: it is kept as a run, but it never becomes current, because current is decided by order key (below).
- `repository` has no order key, so A → B → A is three runs, and current is the run holding the latest successful read.

In both cases, freshness uses the **current revision's latest confirmation** (`lastObservedAt` of its newest run), not its first sighting.

**Current revision.**

| Kind | Rule |
| --- | --- |
| Confluence page | Highest `version`. |
| GitHub PR / issue, Jira issue | Strictly latest `updatedAt`. |
| GitHub repository record | **No provider order.** The run holding the **latest provider read**, ordered by `observed_at` (when the provider was read), then `received_at`, then `id`. It is labelled `orderedBy: "latest-read"`. Two reads with the same `observed_at` and different content give **unknown** (`ambiguous_read`). This is the one explicit exception to provider order: the record is a point-in-time status, and `archived`, `private` and `defaultBranch` change without `pushedAt` changing. `received_at` is never used to order reads, because it is when ingest began, not when the provider was read. |

**Conflict is only at the current order key.**
- When the highest order key carries more than one content key (an equal `version`, or an equal `updatedAt`, which is rare for Jira at milliseconds and possible for GitHub at seconds), the item is **conflict** and `current` is `null`, with no guess (COG-P0 rule).
- A tie on an older order key is kept in history but does not affect the status once a strictly newer revision exists.

**Why not:**
- treating timestamps as opaque, which makes every edit a permanent conflict;
- ordering everything by arrival, which W1 forbids;
- global `DISTINCT ON` per content key, which loses A → B → A and the latest confirmation (the defect of revision 1);
- a revision column, which is a schema change for data already in `payload`.

**Assumption.** GitHub and Jira `updatedAt` rise monotonically for one item. A provider clock regression shows as an ignored newer revision, not as wrong data. Tests pin tie, lag and A → B → A.

### D3 — Time, read markers, absence and snapshot consistency

**Clocks.**
- Effective time is the provider time in the content, or `observed_at` when there is none.
- Known time is `received_at`.
- Evaluation time is an explicit input, defaulting to the database `now()` of the read.

**Status is the worst of four signals.** The order is unknown, then insufficient-history, then stale, then verified. Conflict is reported on its own.
1. **Row state of the latest observation** of the current revision: the last row of its newest run, not the worst state the run ever had. `ok` gives verified, `stale` gives stale, and `unknown`, `denied` or `error` give unknown. A stale Atlassian row is never verified. A later `ok` observation of the same content recovers the item.
2. **TTL.** Current while `evaluationAt < lastObservedAt + TTL(source)`, otherwise stale (W1's strict boundary). TTLs live in a versioned policy table in code (`policyVersion`).
3. **A newer failed read** covering the item makes it unknown, with that read's reason:

| Provider | Failure row ref | Items covered |
| --- | --- | --- |
| GitHub | `github:<ref>` (repository read failed; no list rows follow) | the repository record and every PR and issue of the source |
| GitHub | `github:<ref>#pulls` / `#issues` | that list's PRs / issues |
| Jira | `jira:<KEY>` | every issue of that project key |
| Confluence | `confluence:<KEY>`, `confluence:<KEY>#pages` | every page of that space |
| any | `*:invalid-ref` | every item of the source |

  This follows `summarizeSource`: a repository failure fails both lists, and two reads in one batch are `ambiguous_read`, which gives unknown. The table is pinned by a test per provider.
4. **History completeness** (D3a).

**Read outcomes are not equal (correction B).** For each read scope (GitHub list, Jira project key, Confluence space), the projector classifies every batch as one of:

| Outcome | How it is established from stored rows | Meaning for an item not in that batch |
| --- | --- | --- |
| **Successful read, page recorded** | GitHub only: `list_page` row in the batch | Absent from a recorded page. **Stale**, reason `not-in-latest-read`. Never "closed" or "deleted": the page is the first page only, and absence may mean the item fell off it, was closed, moved or deleted. |
| **Successful read with items, page not recorded** | Jira / Confluence: at least one `ok` or `stale` item row of that project or space key in the batch | The same: stale, `not-in-latest-read`. The page's fullness is unknown (no `returned`/`pageSize`). Twenty rows means "possibly full", not "complete". |
| **Failed read** | A `source_status` row for the scope in the batch | Unknown, with the read's reason (signal 3). |
| **Unrecorded read** | No row for the scope in the batch | **No inference at all.** It cannot be told apart from an empty successful Jira/Confluence read, a read that never ran, or a rolled-back ingest. The item keeps its last state and ages by TTL. Once stale, the reason is `no-later-read-recorded`. |
| **Incomplete coverage** | Every page-based read (all providers) | Never treated as a complete inventory of the scope. Absence is never a fact about the provider. |

**Connector follow-up, gated separately (not in this PR):** Jira and Confluence should write a `list_page` row per project/space read, with `returned` and `pageSize`, as GitHub does. Then an empty successful read and page fullness become recorded facts. This is a BACK-48/BACK-53 contract change that needs its own approval. Until then the table above applies.

**Snapshot consistency (correction C).**
- **Evidence and grants in one snapshot.** The S2 read is **one SQL statement** joining evidence, `source_grants`, `sources` and the project check. Under READ COMMITTED one statement sees one snapshot, so evidence and the active grants are mutually consistent. If S2 ever needs several statements, it must run them under `REPEATABLE READ` instead. Both are asserted in S2.
- **Historical replay is best-effort today. There is no enforceable invariant, and none is claimed.**
  - A replay at `knownAt = K` reproduces the first read exactly when all of these hold:
    1. **grants are unchanged**;
    2. **no ingest transaction that started at or before K commits after the first read**;
    3. no purge removed rows in the range (D6);
    4. reads go to the single primary and its clock never steps backwards.
  - Condition 2 cannot be enforced, or reliably detected, with the current schema. `received_at` is the ingest transaction's start time, and nothing bounds that transaction's length (no timeout is configured). A late commit therefore adds rows with `received_at ≤ K` after K has been read.
- **Every response says so: `replay: "best-effort"`.**
  - It also returns `withinSettleMargin: true` when `K > now() − 5 minutes`. That warning marks the window where late commits are most likely.
  - The margin is a mitigation, not a guarantee. Results are never clamped silently.
  - No horizon value is returned.
- **Rejected detection: a horizon computed from `pg_stat_activity`** (revision 2 draft). It looked like an invariant but is not one:
  - PostgreSQL fixes a transaction's start time before it publishes `xact_start`, so an ingest can be invisible to the check yet still commit rows dated before it;
  - a session the reader cannot see shows a NULL `xact_start`, which `min()` silently ignores;
  - the minimum spans every workspace, so it leaks when other workspaces' ingests run, and one idle-in-transaction session anywhere would mark every workspace unsettled.
- **Also rejected:** row-level `xmin` filtering, because 32-bit xids wrap and are frozen by VACUUM.
- **The only real invariant is a schema change: a commit-ordered sequence on `evidence`** (D6, owner decision, not proposed now). With it, replay becomes "all rows with sequence ≤ S", and the response can return `replay: "exact"`.
- **Grants are current, never historical.** A past `knownAt` never restores a revoked grant (W1 §11.4). Evidence is historical; visibility is now.

**Absence is not a fact; unknown is never healthy.** Every rule above degrades to stale or unknown, never to verified.

#### D3a — Bounded history (correction D)

- **Filter first, then bound.** The statement applies the input filter (D2), the project and grant checks and `received_at ≤ knownAt` first. It then collapses observations into runs, and only then bounds the list.
- **Every answer comes from full-set aggregates, never from the bounded list.** These are computed in SQL over all filtered rows of the identity, so the cap cannot change them:
  - **Current revision as of effective time E**, for ordered kinds: the highest order key among revisions whose `effectiveAt ≤ E`, plus the number of distinct content keys at that order key (more than one is conflict, D2). For `repository`: the latest provider read with `observed_at ≤ E`.
  - The latest observation of that revision (`lastObservedAt`, row state, evidence id).
  - `runsTotal`.

  So an effective-time question is never answered from a truncated list. The revision 2 draft compared known time with effective time to decide whether history was sufficient, and that rule is dropped.
- **What is bounded: only the returned `history` list,** the **50 newest runs by `(firstObservedAt, firstKnownAt, first evidence id)`**.
  - Each item carries `historyInfo: { complete, runsReturned, runsTotal }`.
  - `complete` is true only when `runsTotal = runsReturned` **and** no retention purge horizon applies to the item's source (D6).
  - A truncated list is labelled, never presented as the whole history.
  - Counts are over visible rows only. All of an identity's rows share one source grant, so the counts carry no side channel (R2).
- **`insufficient-history`** is used only when the question reaches before a purge horizon (D6), where rows may be gone. The reason is `before-retention-horizon`, and no value is guessed. The cap alone never causes it, because answers come from the aggregates.
- **Order and ties.**
  - Items: `(source_id, source_ref, kind)`.
  - Runs: `(firstObservedAt, firstKnownAt, first evidence id)`.
  - Revisions among equals: order key, then content key (lexical).
  - Evidence ids: ascending.

  No ordering depends on input order or row arrival within a timestamp.
- **SQL and projector must agree.** Runs and aggregates are computed in SQL for volume (S2), and the pure projector (S1) defines their meaning. S2 includes a differential test: on synthetic data, the SQL result must equal the S1 projector run over the full, unbounded rows. This covers canonical-JSON differences between SQL and TypeScript.

### D4 — Authorization at the read and at every derived result

- **Scope first, in the same statement:** forced workspace RLS, the request's `project_id`, `PROJECT_VISIBLE` for the project and `GRANTED` for every row. Hidden rows never reach the projector, so they cannot affect its runs, counts, conflicts or completeness flags.
- **Derived results follow the server rule.** Every fact cites only evidence ids the reader can see. This holds by construction.
- **Hidden inputs follow the prototype rule.** When a later slice needs an input the reader cannot see (COG-04 dependencies), it is a generic `missing` with no id, ref or source (R2: neutral Unknown, no placeholder). COG-02 has no cross-source inputs.
- **Grants are evaluated now** (D3).

### D5 — Determinism and the fingerprint

- Output is canonical (D3a orderings). The same visible rows, clocks, cap and policy give byte-identical output.
- **Fingerprint (revised; correction §5).** SHA-256 of the canonical JSON of:
  - `policyVersion`, the history cap and the three clocks;
  - the reader's active grant ids on the involved sources, sorted;
  - for every returned item:
    - its identity, status, reason, `orderedBy` and `historyInfo` (`complete`, `runsReturned`, `runsTotal`);
    - for every run, its `contentKey`, first and last evidence id and `observationCount`;
  - every **read marker used**: the evidence id of each `list_page`, `source_status` or Jira/Confluence batch-defining row that decided an item's status or absence reason under D3.
- Revision 1 used a row count and `max(received_at)`. Two different snapshots could match that. For example, after revoking source X and granting source Y, the same number of rows with the same newest timestamp would leave the fingerprint unchanged except for the grant ids. Two ingests that swap which item is current would leave it fully unchanged. The digest over identities and evidence ids removes both cases.
- It covers visible rows only, so equal fingerprints for two readers reveal nothing about hidden rows. **A result is per reader** and is never shared or cached across users.
- `replay` and `withinSettleMargin` (D3) are part of the result, not the fingerprint. A late commit changes the fingerprint on replay.
- `validateAtRead(previous)` is **built in S1** (the COG-P0 prototype has it; the server does not). It recomputes and compares fingerprints, and it is the detector for every change listed here, including late commits.

### D6 — Retention, citations, erasure, correction, rebuild, migration

**Retention (correction §6, reconciled with BACK-47 item 6).** Accepted on 2026-11-27 under the owner's delegation ([cog-02-decisions.md](cog-02-decisions.md) DEC-4); not implemented, and the purge mechanism stays open:
- Observations and Correlations: 180 days;
- Human decisions and audit: until workspace deletion;
- evidence a retained decision cites is preserved as long as that decision.

**What memory needs from that policy:**
- **Citation preservation.** `evidence_citations` references `evidence` with no cascade, and `evidence` refuses DELETE. A future purge must skip every row a retained HumanDecision cites; otherwise the decision becomes invisible under the all-citations rule. Memory adds no citations of its own (D1).
- **A recorded purge horizon per source.** A purge must record, per source, the horizon it applied, for example as an `audit_events` row of action `evidence.purged` with the source and horizon. Memory reads that record. Without it, memory cannot tell a purged history from a complete one, so a purge without the record is not acceptable.
- **Completeness after a purge.**
  - When a horizon applies to the source, every item's `historyInfo.complete` is **false**, even if `runsTotal = runsReturned`. Counting what remains cannot show what was removed.
  - Questions reaching before the horizon are `insufficient-history`, with `before-retention-horizon` (D3a).
- **No runs across a gap.**
  - Rows kept for citation, older than the horizon, form their own runs. They are marked `retainedForCitation` and are never merged with newer runs of the same content: a purged episode in between (A … B purged … A) must not disappear into one run.
  - Run boundaries also break at the horizon itself.

**Unresolved, for the owner and BACK-47:**
- the retention values themselves;
- the purge mechanism, which needs a break-glass or migration-defined path because the append-only triggers refuse DELETE;
- erasure of payload content, as distinct from row purge;
- erasure inside the append-only `audit_events`;
- whether cited evidence older than the horizon stays fully visible or becomes "retained for citation only".

Nothing is implemented or changed here. The values above were accepted on 2026-11-27 (DEC-4); the other unresolved items remain open.

**Correction:** a provider correction is a new evidence row and wins by D2. **Rebuild:** recompute. **Migration and rollback:** S1 to S3 have none; rollback is reverting the PR.

**Possible later schema items, not proposed now; each needs owner approval:**
- a commit-ordered sequence on `evidence` (D3);
- a cache table, only if S3 measures a projection read above **500 ms p95**. It would be workspace-scoped with forced RLS, keyed by the D5 fingerprint, marked non-canonical, and droppable without data loss.

## 4. Contract sketch (TypeScript, `server/src/memory/`)

```ts
type FactStatus = 'verified' | 'stale' | 'unknown' | 'conflict' | 'insufficient-history';
interface MemoryRequest { workspaceId: string; userId: string; projectId: string; effectiveAt: Date; knownAt: Date; evaluationAt: Date; }
interface Run { contentKey: string; orderKey: string | number | null; effectiveAt: string;
  firstKnownAt: string; lastKnownAt: string; firstObservedAt: string; lastObservedAt: string;
  observationCount: number; states: EvidenceState[]; firstEvidenceId: string; lastEvidenceId: string; payload: Record<string, unknown>; }
interface MemoryItem { sourceId: string; sourceRef: string; kind: string; status: FactStatus; reason: string | null;
  orderedBy: 'provider' | 'latest-read'; current: Run | null; history: Run[];
  historyInfo: { complete: boolean; runsReturned: number; runsTotal: number }; }
interface MemoryProjection { items: MemoryItem[]; replay: 'best-effort'; withinSettleMargin: boolean; fingerprint: string; policyVersion: string; clocks: {...}; }
```

Names are illustrative; the implementation PR fixes them. There is no `confidence` field and no execution token.

## 5. Implementation slices (TDD, each its own PR)

| Slice | Delivers | Tests written first |
| --- | --- | --- |
| **S1 Pure projector** | `memory.types.ts`; `memory.policy.ts` (TTLs, `policyVersion`, content-key fields, kind allow-list, failure-coverage table, history cap); `memory.projector.ts` (input filter, runs, revisions, D3 status, D3a aggregates and bound, D5 fingerprint, `validateAtRead`) over plain rows. ADAPT the resolution ideas and canonical JSON from the research port; no import from `test/`. | Synthetic rows. **Input:** Correlations, notes and the seed's non-observer kinds never become items, even on a PR's ref. **Runs:** repeated identical polls give one run with first and last times, count and states; A → B → A on `repository` gives three runs, current = latest `observed_at`; a repository read observed earlier but ingested later never becomes current; equal `observed_at` with different content gives unknown; A → B then a lagging A never becomes current; freshness uses `lastObservedAt`; `ok` → `stale` → `ok` of one content recovers to verified. **Keys:** a `url` change is neither a revision nor a conflict; an equal `updatedAt` with different content at the current key is conflict with `current = null`; an old tie with a newer revision is not a conflict; Confluence version order. **Status:** each failure-coverage row; ambiguous batch. **Read outcomes:** absence from a GitHub `list_page` read, and from a Jira/Confluence batch with other items, gives `not-in-latest-read`; an unrecorded read infers nothing and ages to `no-later-read-recorded`. **TTL:** the strict boundary. **Truncation:** current-as-of-E, conflict and `runsTotal` are equal with cap 50 and with no cap (including the counterexample where a truncated run holds the answer for E and a lagging read is the oldest returned run); `complete` is false when truncated. **Retention:** with a recorded horizon, `complete` is false even with nothing truncated; questions before it are `insufficient-history`; citation-kept rows across a purged gap form separate runs. **Determinism:** permutation and replay give identical output and fingerprint; each listed input change (revoke X / grant Y, current swapped by ingest, a purge) changes the fingerprint. A guard pins the content-key fields and the allow-list against the observers. |
| **S2 Repository and PostgreSQL proof** | `memory.repository.ts` inside `runWithWorkspaceContext`: **one evidence statement** (input filter, project and grant checks, `received_at ≤ knownAt`, run collapse, full-set aggregates, history bound). | Testcontainers. **Grants:** revoke a grant and the source's items vanish and the fingerprint changes; re-grant gives a new fingerprint; a second workspace never appears; a project without the reader's grant returns nothing. **Noninterference:** hidden rows change nothing, including counts and completeness. **Differential:** the SQL result equals the S1 projector over the full, unbounded rows, on the S1 fixtures loaded into PostgreSQL. **History:** `knownAt` excludes later rows. **Known limit, documented by test:** an ingest that started before `knownAt` and commits after the first read changes the replay. The test asserts that `replay` is `best-effort`, that `withinSettleMargin` is set inside the margin, and that `validateAtRead` detects the change. **Snapshot:** a revoke committed during the read cannot split evidence from grants (single statement). **Ingest:** repeated ingest is idempotent at the projection. |
| **S3 Measure** | A script over synthetic data at pilot scale **and at 180 days of 15-minute polls**. Records p50/p95 for the S2 statement. | Recorded numbers, not a CI gate. Applies the D6 cache trigger. |

No controller, module registration or route in any slice: COG-07 owns exposure. Each slice's check is `npm run check` in `server/` (needs Docker), with the research specs staying green.

## 6. Acceptance mapping (BACK-105)

| BACK-105 deliverable | Covered by |
| --- | --- |
| Evidence-linked typed projection with stable identity and revision, effective and recorded time, explicit conflict/unknown/stale, deterministic replay, idempotency | D2 (runs, revisions), D3, D3a, D5; S1 |
| Source revision semantics defined, no guessing of opaque revisions | D2 current-revision table and the one labelled exception |
| Workspace, project and grant visibility at read and derived results; revocation, cross-tenant and hidden-record noninterference in PostgreSQL | D4; S2 |
| Retention, correction, rebuild, migration and rollback documented; existing structures reused | D6; D1 |
| Invalidation on changed evidence and grants; historical versus current reads | D3 (`knownAt` filter, best-effort replay stated with its conditions), D5 fingerprint and `validateAtRead`; S1, S2 |
| No LLM, embeddings, arbitrary ingestion or separate database | §2; a guard test like the research guard |

## 7. Reconciliation

- **BACK-55 (Done)** owns the evidence store, RLS and grants. COG-02 adds no table and changes none of them.
- **BACK-43 (To Do)** owns evidence types and the timeline. Memory is a read model over those types. It adds no type and never promotes a Hypothesis to fact.
- **BACK-48 (To Do)** owns what observers write. D2's content-key fields, the D3 failure-coverage table and the read-outcome table depend on today's observers and are pinned by tests. The recommended Jira/Confluence read marker is a BACK-48/BACK-53 change, gated separately.
- **COG-P0:** runs generalize the prototype's identical-replay rule (it kept only the earliest evidence). The strict TTL boundary, conflict-not-guess and scope-first projection are unchanged.
- **R2:** projection stays internal (not an engine port). Withheld support becomes neutral Unknown with no count side channel.

## 8. Reuse before build

| | |
| --- | --- |
| Inspected | `server/migrations/0001`–`0005`, `server/src/{evidence,connectors,portfolio,db}`, `app/src/contract/rules.ts`, the COG-01 research port, BACK-14 inventory, BACK-47 pack, Confluence KMC 95256578 §11–12 and 89456817 (R2) |
| Strategy | **ADAPT** Kawalys's research port (resolution, canonical JSON, validator pattern). **REUSE** `GRANTED`, `VISIBLE`, `PROJECT_VISIBLE`, `runWithWorkspaceContext`, `worstState` and the `summarizeSource` rules. **REFERENCE** Retail Tower `services/backend-core/apps/api/src/idempotency/canonical-json.ts` (BACK-14 S4) and its golden tests for the content key. Nothing copied; no runtime dependency. |

## 9. Risks and stop conditions

| Risk | Mitigation |
| --- | --- |
| Provider timestamps are not true revisions (D2) | Ties are conflicts; a lagging read never becomes current; the assumption is documented; revisit per provider in BACK-48. |
| Historical replay can change after a late ingest commit (D3) | Not hidden: `replay: "best-effort"`, a settle-margin warning, and `validateAtRead` detects it. The fix is the commit-ordered sequence (D6, owner decision). |
| Jira/Confluence empty reads are invisible (D3) | No inference from missing rows. The gated connector follow-up records them. |
| The history cap hides an answer (D3a) | Answers come from full-set aggregates; the list is labelled incomplete; an S2 differential test checks SQL against the unbounded projector. |
| A purge makes history look complete (D6) | A recorded purge horizon is required; `complete` is false under it; runs never merge across it. |
| Read cost at retention volume (D1) | S3 measures; D6 cache path with its own approval. |
| Retention and purge undecided (D6) | Memory stores nothing. The horizon rule and citation preservation are stated as requirements for BACK-47. |
| An observer changes payload or refs (BACK-48) | The pinned field, coverage and outcome tables fail CI instead of silently creating conflicts. |

**Stop and return to the owner if:**
- a slice needs a schema change, dependency, route, connector change or live data;
- a test shows a hidden row changing any output, including counts;
- S2 cannot prove the single-statement snapshot, or the SQL and projector disagree;
- a consumer needs exact historical replay (that requires the D6 sequence column first);
- BACK-48 changes the fields or refs D2 and D3 rely on.

## Revision after the COG-08 independent review (2026-11-27)

The Codex review of commit 96878ac showed that the D5 fingerprint hashed only the current run's content key and last evidence id. A late commit could therefore extend the current run backwards, outside the returned history, and change its first evidence id (which COG-04 cites) without changing the fingerprint. The fingerprint now covers every cited field of the current run, and the policy version is `memory-v2`. Regression test: `test/memory/memory.findings.spec.ts`.

Still open from the review: the S2 statement processes all eligible history before the history cap applies (a work budget independent of the returned cap is a performance decision under DEC-1). There is also no DB case yet that holds the reader fixed while adding evidence to a second project on which the reader also has a grant.

## Revision after the COG-08 fourth review (2026-11-27)

**Repository record read inside a run (D2).** The repository record has no provider order, so its effective time is its observation time. When the effective time E falls strictly inside the chosen run, the run record (which keeps only first and last observations) cannot say which observations came before E.

The current value is therefore the run *as known by E*:
- its first observation, cited as both first and last evidence;
- freshness counted from that observation;
- the worst state seen anywhere in the run.

It is `verified` only when every observation in the run was `ok`, and it never reports a state or evidence id observed after E. Ordered kinds are unaffected: their effective time is provider time. Regression test: `test/memory/memory.findings2.spec.ts`.

## Revision after the COG-08 fifth review (2026-11-27)

- The as-of-E view also decides which reads are newer. Failure and ambiguity markers are compared with the as-of observation, so a failed read before E is no longer hidden by an observation after E.
- A marker after E still counts (unknown, never verified): conservative, because markers are reduced to the newest per ref before the projector sees them.
- The view uses the first row's own receipt time.
- The worst state follows the shared `worstState` precedence.
- **Known limit:** the run record does not keep the first row's own state, so a read exactly at a run's first observation reports the worst state seen in the run. That can be stale where the first row was ok, never the reverse.
- Regression test: `test/memory/memory.findings3.spec.ts`.

## Revision after the COG-08 sixth review (2026-11-27)

- For the repository record, failure and ambiguity markers are compared with the observation the answer rests on.
  - If E falls inside a run, that is the as-of view.
  - If E falls after the chosen run, before a later run of different content, that is the chosen run's last observation.
  - It is never a later run observed after E.
- Ordered kinds keep the latest confirmation of any run (D3).
- The as-of view takes both known times (first and last) from the first row's own receipt.
- Regression test: `test/memory/memory.findings4.spec.ts`.

## Revision after the COG-08 seventh review (`memory-v3`, 2026-11-27)

- The fingerprint covers the current run's known times (first and last), so `validateAtRead` notices a change in the receipt the as-of view cites.
- **Recorded, not changed: which clock bounds repository markers.** A failure observed after E but before evaluation time makes a historical read `unknown`. That is conservative (unknown is never healthy), and it follows the D3 rule that a newer failed read covering the item wins. Bounding markers by E instead would need the S2 statement to select markers as of E before reducing them to the newest per ref. That is a design decision for the owner, not a defect: no read can turn `verified` because of it.
- Regression test: `test/memory/memory.findings5.spec.ts`.

## Revision after the COG-08 eighth review (`memory-v4`, 2026-11-27)

- The fingerprint also covers the returned history runs' known times. Retrieval picks the fallback text by them when an item has no current run.
- Regression test: `test/memory/memory.findings6.spec.ts`.

## Revision after the COG-08 ninth review (`memory-v5`, 2026-11-27)

- The fingerprint also covers the returned history runs' observation times, which search reports.
- Regression test: `test/memory/memory.findings7.spec.ts`.

## Revision after the COG-08 tenth review (`memory-v6`, 2026-11-27)

- The fingerprint covers the current run's whole payload, not only its content key. Consumers read fields outside the content key: `textClipped` decides whether a mention at a clip cut counts.
- Regression test: `test/memory/memory.findings8.spec.ts`.

## Revision: work budget and second-project case (2026-11-28)

Both items left open above are now closed:

- **Work budget:** the live search's memory read now has a work budget. `MemoryRepository` takes `budgetMs`, which sets `statement_timeout` for the read's own transaction only. Past the budget, the read is cancelled and rolled back, and it raises `MemoryReadBudgetExceeded`, never a partial projection. The live route answers with the generic error body, the same for a visible and a hidden project. The budget is `COGNITION_READ_BUDGET_MS` = 2 s, a conservative and reversible default; DEC-1's 500 ms interactive bar still needs DEC-2 option A. Background reads keep no budget. The S2 SQL is unchanged.
- **Second project:** a DB case now holds the reader fixed, adds evidence to a second project the reader can also read, and shows this project's items and fingerprint unchanged. A control read shows the new evidence landed in the other project.
- Tests: `test/memory/memory-db.spec.ts` (`work budget`, `a second project the reader also sees`) and `test/cognition/cognition-db.spec.ts` (`work budget`). Both use a table lock, so the over-budget case is deterministic.
- **After the independent review (GO):** a reader with no active grant never scans evidence. The S2 read now has a one-time `EXISTS (SELECT 1 FROM granted)` guard, so a hidden project costs what a missing one does and the budget is not an existence oracle. An `EXPLAIN ANALYZE` test pins this; without the guard, the plan still started one evidence scan. Only a budgeted read reports a cancel as `MemoryReadBudgetExceeded`. The budget covers the S2 statement only: getting a pooled connection and the in-process projection and search are outside it, bounded by the 2 s cap per held connection and the 30-per-minute limit per user. A connection timeout in `open-database.ts` is a possible later addition.
