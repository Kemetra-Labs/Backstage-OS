# BACK-154: live memory read at Kawalys volume (2026-11-28)

**Result: the current live read does not fit its 2 s budget at real Kawalys volume, even with 7 days of history.** With the work budget from #179, every live read failed closed (generic error, no partial answer), which is the intended behaviour. So live search on real Kawalys data would be unavailable within days of connecting the sources. Choosing between DEC-2 option A, an asynchronous read, or a shorter memory horizon is now a prerequisite for real live search and for BACK-156 live reasoning.

## Setup

- **Code:** `main` at `7dd3fcb`, plus the uncommitted slice-1 branch `feat/brain-slice-1`. The slice changes nothing in the memory read SQL.
- **Harness:** `server/test/memory/memory.measure.ts` (`npm run measure:memory`), scenarios `kawalys-7d`, `-30d`, `-90d` and `-180d`.
- **Run:** `MEASURE_ITERATIONS=5`, with Node 24.21.0 and PostgreSQL 18.7 in Docker on the owner's Windows 11 workstation. Other test databases from parallel sessions were running on the same Docker host (noise, not controlled).
- **Volume:** the real Kawalys counts on 2026-11-28 were 181 Backstage-OS PRs and 179 BACK Jira issues. The 20 GitHub issues and 60 Confluence pages are estimates. That makes 441 items, each polled every 15 minutes and each edited once a day. A second workspace holds the same volume as noise.
- **Live path:** `MemoryRepository.readVisible` under `COGNITION_READ_BUDGET_MS` (2 s), measured as one cold read and then 5 rounds of 4 concurrent reads (`COGNITION_READS_IN_FLIGHT`), exactly as the route runs it.

## Numbers

| History | Rows for this reader | Table + indexes | Runs returned | Unbudgeted read p50 / p95 | Server execution | Temp blocks written | In-memory projection p95 | Live reads within 2 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 7 days | 297,696 | 340 MB | 3,519 | 3.33 s / 3.57 s | 3.33 s | 72,032 | 76 ms | 0 of 20 (cold: over budget) |
| 30 days | 1,275,840 | 1.46 GB | 13,639 | 18.4 s / 23.6 s | 18.8 s | 307,304 | 384 ms | 0 of 20 |
| 90 days | 3,827,520 | 4.37 GB | 40,039 | 44.4 s / 47.0 s | 46.4 s | 1,218,817 | 581 ms | 0 of 20 |
| 180 days | 7,655,040 | 8.74 GB | 79,639 | 98.0 s / 106.2 s | 93.4 s | 2,729,731 | 1,327 ms | 0 of 20 |

- **Cost grows about linearly** with history, at roughly 11 µs per reader row of server time. At this volume, 500 ms p95 is crossed after **about 1 day** of polling, and 2 s after **about 4 days**.
- **Time goes to the database.** The statement spills to temporary files at every size. The in-memory projection grows too, but stays an order of magnitude smaller.
- **The polling model drives the volume.** Every 15-minute poll stores every item again, at about 42,000 rows per day at Kawalys volume. The cost therefore grows with how long a project has been connected, not with how much work it has.

## What this means for the open questions

- **BACK-154 Q1, the 500 ms interactive target:** the current full read cannot meet it, nor the 2 s budget. Synchronous live search on real data needs a different read.
- **BACK-154 Q3, option A:** the prepared cache (DEC-2: runs and markers per source, bounded by an index) is the evidence-backed candidate. Its prototype measured 69 to 572 ms p95 at pilot volume, and it would need re-measuring at Kawalys volume. It is a schema change, so it needs separate owner approval. The alternatives:
  - an asynchronous read, computed in the background once per poll;
  - a shorter memory horizon, which changes completeness (DEC-4).
- **BACK-156 Q3, sync or async plan reads:** a plan read built on the same memory read would also fail closed. Live reasoning on real data therefore depends on the BACK-154 choice above.
- **Safety:** nothing here is a leak or a wrong answer. The budget, the read slots and the identical 404 behave as designed. The cost is availability.

## NOT RUN

- Real connector polling: the rows are synthetic, seeded to the observer's payload shapes.
- A quiet, dedicated machine.
- Option A at Kawalys volume.
- More than 5 iterations.
