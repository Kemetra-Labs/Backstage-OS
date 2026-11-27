# BACK-105 (COG-02): decisions of 2026-11-27

Status: **decided under the owner's delegation of 2026-11-27** ("I delegate you to decide the best recommended decisions"). It answers the questions in [cog-02-cache-proposal.md](cog-02-cache-proposal.md) §7 and the open items of [cog-02-design.md](cog-02-design.md) D1 and D6. The owner can override any of them; each says what would make it change.

**Nothing is built by this document:** no migration, no purge job, no route, no deletion. Every later schema change still goes through its own PR with the tests in the proposal's §5.

Evidence: [cog-02-s3-measurements.md](cog-02-s3-measurements.md) (S2 read 1.4 s at 7 days, 37 to 40 s at 180 days; option A prototype 69 ms, 321 ms and 572 ms p95).

## DEC-1. The 500 ms bar applies only to an interactive path

- **500 ms p95** is the bar for a read a person waits on (a route, a screen).
- **Background and shadow reads (COG-07 shadow mode)** have a different budget: under **60 s p95** at the retention volume, at most **once per project per 15-minute poll**, never on a request path. The measured S2 read (37 to 42 s at 180 days) fits it.
- **Why:** shadow mode compares answers offline; nobody waits on it. Holding it to an interactive bar would force a schema change before any consumer needs one.
- **Changes if:** a screen or route needs memory, or the volume per project grows past what fits 60 s (the measured cost is linear, about 17 µs per row).

## DEC-2. Option D now; corrected option A is the prepared answer

- **No cache table and no migration now.** The S2 read stays the only read, off request paths.
- **Option A, as corrected by the measurement, is the prepared answer:**
  - runs **and** markers per source;
  - full-set aggregates per identity (`runsTotal`, current revision as of an effective time);
  - a read bounded by the index (newest 50 runs per item);
  - the S2 statement kept as the oracle in a differential test.
- **Trigger to build it:** an approved consumer with an interactive latency target (DEC-1). **Before its migration:**
  1. measure the index-bounded read in the hot case (it is 572 ms today);
  2. write the tests in the proposal's §5.
- **Why:** the prototype shows A works (equal answers, up to 115 times faster), but no consumer needs it yet. A mutable table the app role can write is a cost to carry only when it pays.

## DEC-3. If A is built, it is maintained inside `ingest()`

- The cache is updated in the **same transaction** as the evidence rows. It holds a per-source lock to the end of the transaction, and out-of-order rows mark the identity for recompute.
- **Not option B:** B needs a commit-ordered sequence on `evidence`, a schema change to the hot append-only table. B is chosen only if a consumer needs **exact historical replay** (D3), which no consumer does.
- **Why:** one transaction means the cache can never be ahead of or behind the evidence it summarizes, and `evidence` itself does not change. The cost is a change to the BACK-55 write path, which must keep every existing evidence test green.
- **Changes if:** ingest latency under the cache update becomes a problem, or exact replay is required.

## DEC-4. Retention: the recommended defaults are accepted

These are the defaults from [BACK-47 PERSONAL-ALPHA-DECISION-PACK.md](../BACK-47/PERSONAL-ALPHA-DECISION-PACK.md) §7 and checklist item 6, and from design D6:

- **Observations and Correlations: 180 days rolling.**
- **Human decisions and audit: kept until the workspace is deleted.**
- **Evidence a retained decision cites is kept as long as that decision** (`retainedForCitation`; never merged with newer runs).
- **A purge must record its horizon per source** (an `audit_events` row `evidence.purged` with source and horizon). A purge without that record is not acceptable. Under a horizon, `historyInfo.complete` is false.

**Still open (implementation designs, not values):**
- the purge mechanism (the append-only triggers refuse DELETE, so it needs a migration-defined or break-glass path);
- payload erasure as distinct from row purge;
- erasure inside `audit_events`;
- whether cited evidence older than the horizon stays fully visible.

**No purge job exists and nothing is deleted.** The prototype holds synthetic data only.

**Why:** 180 days was already the recommendation in both documents. Memory needs a horizon to reason about completeness. The value can be shortened later (the cost scales with it) without changing the design.

## DEC-5. COG-02 is accepted, as a background read

- **D1's re-scope is accepted:** "PostgreSQL persistence" means the existing `evidence` table; memory stores nothing of its own.
- **COG-02 is accepted on S1, S2 and S3.** The read is correct, with differential tests in PostgreSQL, revocation, isolation and noninterference. Its cost is measured and has a prepared fix.
- **Condition:** until DEC-2's trigger fires and A is built, **no consumer may put the memory read on a request path.** COG-07 shadow mode runs it in the background within DEC-1's budget.
- **COG-03 to COG-07 are unblocked** under that condition.
- **Why:** the acceptance criteria in design §6 are met. The only gap is latency, which matters only for a path nothing uses yet. Holding COG-02 open would block the rest of the cognitive core for no correctness reason.
- **Changes if:** a later test shows a hidden row changing an output, or the SQL and the projector disagree. Those are the design's own stop conditions (§9), and they reopen COG-02.

## Summary

| # | Decision |
| --- | --- |
| DEC-1 | 500 ms p95 for interactive paths only; background/shadow: 60 s p95, once per project per poll |
| DEC-2 | Option D now; corrected A prepared, built only for an interactive consumer |
| DEC-3 | A maintained inside `ingest()`; B only for exact historical replay |
| DEC-4 | Retention 180 days for observations; decisions, audit and cited evidence kept; recorded purge horizon; purge mechanism still open |
| DEC-5 | COG-02 accepted as a background read; COG-03 to COG-07 unblocked; no request path until A |
