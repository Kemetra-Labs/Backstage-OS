# BACK-105 (COG-02): proposal for the D6 memory cache, for owner review

Status: **proposal only. Nothing is built, no migration is written, and no decision is taken here.** The owner delegated the choice of the next step to the implementation session on 2026-11-26. That delegation does **not** cover a schema change, the retention policy (BACK-47 item 6) or accepting COG-02. Each stays an owner decision, as D6 and BACK-105 require.

Inputs: [cog-02-design.md](cog-02-design.md) (D1, D3, D3a, D5, D6) and [cog-02-s3-measurements.md](cog-02-s3-measurements.md). Facts about the schema are from `server/migrations/0003`/`0005` and `server/src/evidence/evidence.repository.ts` on `main` at 1d0d677.

## 1. The question

S3 measured the S2 read at 1.3 s for 7 days of data and 38 s for 180 days (2.1 million rows), against the D6 trigger of 500 ms p95. `work_mem` and a single-pass rewrite did not help. D6 says a cache table needs owner approval. This document says what such a cache would have to be to be correct, what it would cost, and what to do instead if no consumer needs interactive latency yet.

## 2. Two corrections to the D6 sketch

D6 sketched "workspace-scoped with forced RLS, keyed by the D5 fingerprint, marked non-canonical, and droppable". Two parts of that do not work as written.

1. **The D5 fingerprint cannot be the cache key.** It is a digest over the items, runs and evidence ids of a finished read, so computing it means doing the read. A key must be knowable cheaply, before the read. The fingerprint stays what D5 made it: a detector (`validateAtRead`), not a lookup key.
2. **Most of the projection cannot be cached as a final result.**
   - It depends on the **reader** (grants decide which sources are visible).
   - It depends on **time** (`evaluationAt` and the TTL turn `verified` into `stale` as minutes pass).
   - It depends on `knownAt`/`effectiveAt` in a historical read.

   What is expensive, time-independent and reader-independent is the **collapse of evidence rows into runs** (the window pipeline S3 measured: `items`, `marked`, `numbered`). The projector over runs costs 20 to 300 ms at daily edits (1.9 s in the hot case, because today it receives every run: see the cap below) and should stay per request.

   So the cacheable unit is the **run, per source**, not the projection.

## 3. What is cached, and why that keeps D4

A table of runs per source (name illustrative: `memory_runs`), one row per run, holding what `RunRecord` in `server/src/memory/memory.collapse.ts` holds: identity (`source_id`, `source_ref`, `kind`), run number, first and last evidence id, first and last observed and received times, count, states seen, the last row's state and payload (`RunRecord.lastPayload` holds the whole payload; a cache could keep only the fields the projector reads, which is a design choice to make then), and `policy_version`. Plus the full-set aggregates D3a requires (current revision as of an effective time, `runsTotal`), so the read can return the 50 newest runs per item instead of every run.

**Visibility is applied at read time, as today.** The read joins the reader's active grants to the cached runs by `source_id`. Hidden sources never reach the projector (D4). Consequences:

- **A revocation or re-grant needs no cache invalidation**: D1's biggest objection to a stored projection (a stale or leaking cache after a revoke) disappears, because grants are not stored in the cache.
- A source's runs are the same for every reader who may see the source, so the cache holds no per-reader data and no count side channel (R2).
- Forced RLS on `workspace_id`, like every workspace table.

## 4. Options

| | What | Needs | Main risk |
| --- | --- | --- | --- |
| **A. Runs table, maintained in the ingest transaction** | `ingest()` updates the affected runs in the same transaction as the evidence rows. | One migration (table, forced RLS, grants). A change to the evidence write path (BACK-55 territory). A backfill and a rebuild command. | A wrong cache shows wrong memory. Concurrency on the same source. |
| **B. Runs table, refreshed from a delta** | A reader or a job reads only evidence newer than a stored watermark and folds it in. | A **commit-ordered sequence on `evidence`** (the D3/D6 item): `received_at` is the ingest transaction's start time, so "newer than the watermark" misses late commits. Then A's migration as well. | A schema change to the hot append-only table; a sequence needs a serialization point (a per-workspace counter row updated in the ingest transaction) because a plain sequence is assigned at insert, not at commit. |
| **C. Bound the read, no cache** | Read only the newest N days or rows per identity. | A new index (`(source_id, source_ref, observed_at)`; none exists today, only `(workspace_id, source_id, observed_at)`), so a migration too. | It changes answers: `current as of E` and `runsTotal` need the full history (D3a). A 7-day window is still 1.3 s, over the trigger. |
| **D. Build nothing yet** | Keep the S2 read off request paths. Run it as a background computation if COG-07 shadow mode needs results. | A decision on what latency COG-07 shadow mode actually needs. | Nothing is wrong with it; it just is not interactive. |

### Option A in more detail

- **Normal case is cheap.** A poll writes every item again (123 rows per 15-minute poll in the S3 workload). For an identity, a new row whose time is after the last run's last row either extends that run (same content key: bump the last-seen time, the count and the states) or starts a new run. That is a constant amount of work per row.
- **Out-of-order rows are the hard case.** A row that sorts before the identity's last row (a late or lagging read) can split or merge runs. The simple safe rule: mark the identity dirty and recompute that identity from its evidence rows. With no index on `(source_id, source_ref)` this scans the source's rows, so the recompute is a per-source cost, not a per-identity one, unless C's index is also added.
- **Concurrency.** Two ingests for one source must not interleave their cache updates. `ingest()` already share-locks the grant row; the cache update needs its own lock on the source's cache rows (for example `SELECT ... FOR UPDATE` on them, or an advisory lock per source), held to the end of the transaction.
- **Historical reads (`knownAt` in the past) cannot use it.** The cache holds runs as of the latest ingest. They keep using the S2 statement (slow path), and `replay` stays `best-effort` as D3 says.
- **Purge (D6, retention open).** A purge must also fix the runs it cuts. D6 already requires a recorded purge horizon per source; the cache would read the same record. This is one reason to decide retention first.
- **The app role gains UPDATE on a table.** Today `kawalys_app` can only INSERT into `evidence` (column-restricted). A cache the ingest path updates is a mutable table the app role can write, with no append-only trigger. It is non-canonical and droppable, but a bug in it is a wrong answer, not a loss. The S2 statement stays as the **oracle**: a differential test compares the cache read to the S2 read on the same data, as S2 already does against S1.
- **Bounded response.** The S3 numbers show a cache that returns every run would still not meet 500 ms in the hot case: 129,715 runs and 91 MB of JSON cost the projector 1.9 s on their own. The cache read must return at most 50 runs per item plus the full-set aggregates, as D3a defines.

### What each option would measure as

Not measured. For A and B the read would scale with runs (21,721 at daily edits, 129,715 hot) rather than with rows (2.1 million), and with the 50-run cap per item with the number of items (121 in the S3 workload). That is a reason to expect a large gain, not a measurement of one. A prototype measurement is cheap to add to the S3 script (materialize the runs into a table through the superuser pool and time the read) and does not need a migration.

## 5. Tests any cache option must have before it merges

- Differential: cache read equals the S2 statement on the S1 fixtures and on the S3 seed, in both directions (the S2 test and the S3 variant check are the pattern).
- Revocation, re-grant, cross-tenant and hidden-source noninterference, including counts and completeness flags, in PostgreSQL.
- Out-of-order and duplicate ingest; A to B to A; a lagging read; equal-timestamp conflict (D2).
- Concurrent ingests on one source; an ingest rolled back after a partial cache update leaves no trace.
- A rebuild from evidence reproduces the cache exactly; dropping the cache loses nothing and the read falls back to the S2 statement.
- Backfill on a populated database, and the migration's rollback (`DROP TABLE`, switch the read back).

## 6. Recommendation

1. **Choose D for now.** No consumer needs interactive latency today: COG-03 to COG-07 are gated on "COG-02 accepted", COG-07 is a read-only shadow integration, and the whole cognitive core is off the MVP critical path. A schema change should wait for a consumer and a latency target. The S2 read is correct and bounded in its response; it is only slow, and it can run as a background computation.
2. **Decide retention (BACK-47 item 6) first.** It fixes the purge horizon the cache must honor and changes the data volume: the 180-day recommendation is the 38 s case, a 7-day window is the 1.3 s case.
3. **If an interactive consumer appears, choose A** (runs per source, maintained in the ingest transaction, the S2 statement kept as the oracle), with the sequence column (B) only if exact historical replay is also needed. Add the cheap prototype measurement from section 4 first, so the migration is justified by a number.
4. **State the bar.** 500 ms was D6's guard value. Whether it is the right bar for a shadow, non-request path is an owner question.

## 7. Questions for the owner

1. Is the 500 ms bar meant for COG-07 shadow mode, or only for an interactive path?
2. Retention values (BACK-47 item 6), and the purge mechanism the append-only triggers force (a break-glass or migration-defined path).
3. Do you accept option D now, with option A as the prepared answer if a consumer needs it?
4. Is a change to the evidence write path (option A) acceptable under BACK-55, or must the cache be refreshed outside `ingest()` (which needs option B's sequence column)?

## 8. Reuse before build

| | |
| --- | --- |
| Inspected | `server/migrations/0003` and `0005`, `server/src/evidence/evidence.repository.ts` (`ingest`, grants, locking), `server/src/memory/memory.collapse.ts` and `memory.sql.ts` (read only), the design document and the S3 results. |
| Strategy | REFERENCE only. This is a document: no code, no schema, no dependency, no change to Retail Tower. |
