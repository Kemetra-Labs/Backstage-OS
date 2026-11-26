# BACK-105 (COG-02) S3: measurements of the S2 memory read

Status: **recorded numbers, not a CI gate** (design §5, S3). Synthetic data in a disposable local PostgreSQL. This document records what was measured and applies the D6 cache trigger. It decides nothing: a cache table is a schema change and stays an owner decision (D6).

## Result

| scenario | reader rows | table rows | table + index MB | runs returned by SQL | result JSON | total p50 | total p95 | projector p95 | server exec (EXPLAIN) | temp blocks written |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `pilot-7d` | 82,656 | 82,656 | 46 | 961 | 0.7 MB | 1.28 s | 1.41 s | 51 ms | 1.44 s | 12,775 |
| `retention-180d` | 2,125,440 | 4,250,880 | 2,333 | 21,721 | 15 MB | 38.0 s | 39.4 s | 311 ms | 40.0 s | 559,772 |
| `retention-180d-hot` | 2,125,440 | 4,250,880 | 2,331 | 129,715 | 91 MB | 41.5 s | 42.3 s | 1.86 s | 41.5 s | 559,765 |

- **The D6 trigger (p95 above 500 ms) is met in all three scenarios**, including the 7-day pilot.
- All 121 items are `verified` in every scenario, so the numbers measure the full path, not an early exit.
- 5 iterations for these runs (2 warm-up reads not counted): with 5 samples p95 equals the maximum. Min to max spread of the total: about 20% on the pilot, under 5% at 180 days.

### What the numbers say

1. **Cost is linear in the rows the reader owns.** 25.7 times more rows (82,656 to 2,125,440) took 29.6 times longer (1.28 s to 38.0 s), about 16 to 18 microseconds per row. The statement reads and collapses the full retained history of every visible identity, as D1 designed ("the cost is a heavier read").
2. **The time is server-side.** `EXPLAIN (ANALYZE)` execution time matches the measured SQL time in every scenario. The projector is 0.8 to 4.4% of the total.
3. **`work_mem` is not the fix.** The diagnostic run with `SET LOCAL work_mem = '256MB'` removed the disk spill on the pilot (12,775 to 0 temp blocks written) and the execution time did not change (1,439 ms to 1,389 ms). At 180 days it still spilled (559,772 to 325,385 blocks) and took 40.6 s against 40.0 s. The time is per-row work, not spill I/O. Raising `work_mem` (a setting change, not a schema change) is therefore not a mitigation.
4. **The history cap is applied after the transfer.** The statement returns every run: 21,721 at daily edits and 129,715 (91 MB of JSON) when every item is edited every 4 hours. The projector then keeps the 50 newest per item (6,001 history entries for 121 items in both 180-day runs). The cap bounds the response, not the read: the projector time grew from 0.3 s to 1.9 s and the node process holds the whole result meanwhile.
5. **Block reads.** Both 180-day scenarios ran with a second workspace of equal volume (4.25 M rows in the table, half of them the reader's). The statement read about 181,000 shared blocks (about 1.4 GB). The effect of the noise workspace was **not isolated**: there is no 180-day run without it, so the numbers do not show how much of the cost it adds, if any.

### Not measured

- Plan nodes were not broken down, so which part of the statement (the content signature, the window passes or the aggregates) costs most is **not known**. Result 3 says only that it is CPU per row rather than spill.
- Concurrent readers, the ingest rate while reading, a cold cache (the first read after a restart) and a production-sized instance.
- Absolute milliseconds on other hardware. The shape (linear in rows) transfers, the constants do not.

## Method

| | |
| --- | --- |
| Command | `cd server && npm run measure:memory` (all scenarios), or `MEASURE_SCENARIOS=pilot-7d MEASURE_ITERATIONS=10 npm run measure:memory`. `MEASURE_OUT=<file>` writes the JSON. |
| Script | `server/test/memory/memory.measure.ts`. Named `*.measure.ts`, so the default `testMatch` never runs it. |
| Database | `postgres:17-alpine` with default settings (`work_mem` 4 MB), one disposable container per scenario, migrated by the real migrations, roles from the real provisioning. |
| Seed | Superuser `INSERT ... SELECT generate_series` (the app role cannot set `received_at`), one anchor for every series (the newest poll, 2 minutes before the seed), `ANALYZE` before measuring. `received_at` is `observed_at` plus 1 s. |
| Workload per 15-minute poll | 1 repository record, 30 pull requests, 50 issues, 2 `list_page` markers, 20 Jira issues, 20 Confluence pages: 123 rows. 7 days is 672 polls, 180 days is 17,280. |
| Edits | Each item gets a new revision (`updatedAt` or `version`) every 96 polls (daily) or every 16 polls (every 4 hours, `hot`), phase-shifted per item. The repository record never changes (one run). |
| Path | `MemoryRepository.readCollapsed()` and `projectCollapsed()` as the reader (`kawalys_app`, forced RLS, project and grant checks in the statement). `EXPLAIN (ANALYZE, BUFFERS)` runs the same statement and parameters once. |
| Host | Claude Code cloud container, 4 vCPU, 15 GB RAM, Docker, Node v22.23.5 (the repository requires Node 24; the database work does not depend on it). |
| Seeding time | 4 s (pilot) and 273 to 292 s (180 days, both workspaces). |

A defect found while building the script, kept here because it can hide a real result: computing `now()` per `INSERT` shifted the series against each other and produced false `not-in-latest-read` statuses. The script uses one anchor.

## Applying the D6 trigger

D6: a cache table "only if S3 measures a projection read above **500 ms p95**. It would be workspace-scoped with forced RLS, keyed by the D5 fingerprint, marked non-canonical, and droppable without data loss."

The trigger is met, so the choice goes to the owner. What the numbers add:

- **A cache table (D6)** removes the read cost, and needs a migration, an invalidation rule (every ingest, revoke, re-grant and policy change, which D1 listed as the reason not to start with one) and an owner decision. The fingerprint key was designed for it.
- **Reducing the statement's work without a schema change** is not shown to be possible by these numbers. Result 3 rules out `work_mem`. Bounding the rows read per identity, or returning only the newest runs, may help the transfer (result 4) but the plan was not profiled, so no gain is claimed for the read itself. A new index would be a migration too.
- **Retention (BACK-47 item 6, open)** changes the problem size: the 180-day recommendation is the 38 s case, a 7-day window is the 1.3 s case. Neither is below 500 ms.
- **Not an option from these numbers:** serving this read on a request path (COG-07) as it is. At the pilot scale alone it is 2.8 times over the trigger.

Nothing here changes the S1/S2 behavior: the read is correct and bounded in its response, and the differential tests are unchanged. This is a cost finding, and the stop condition for a slice is a returned owner decision, not a silent change.
