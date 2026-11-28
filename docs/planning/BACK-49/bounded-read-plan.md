# BACK-49 / BACK-50: what is left, and the one slice buildable now

**Status: SLICE IMPLEMENTED on branch `claude/back49-portfolio-cap` (owner approved X, Y, Z on 28 Nov 2026). Measurement recorded in section 7; the index it suggests is a separate owner decision.** Read-only preflight on `origin/main` `df529ce` (28 Nov 2026).

## 1. Where the two tickets stand

| Ticket | Delivered | Remaining | Blocked on |
| --- | --- | --- | --- |
| BACK-49 Portfolio on real evidence | Live portfolio routes and read model; typed per-source states; the live app reads them (P1-P4) | (a) one real approved GitHub source shown end to end; (b) **a capped list must expose its limit and say the count is a lower bound**; (c) **measure the latest-read path at the cap** | (a) BACK-52 activation (owner). (b) and (c) are buildable now |
| BACK-50 Investigation Room on real evidence | Typed reads, notes, decisions, badges, no promotion, audit, live UI; BACK-148 L/L2 (observations in the room, `type` filter) and M (owner-only case creation) merged by the BACK-148 session | Associate, read, cite and reload one **permitted real** observation; reconcile with BACK-51 R1 | BACK-52 activation and your ruling R1. **No code is needed now** |

So the only code slice available before activation is **BACK-49 (b) + (c)**. BACK-50 gets an acceptance checklist (section 5) to run
the day a real source is active.

## 2. Gap found (BACK-49 b)

`GET /api/portfolio` lists at most `PROJECT_LIMIT = 100` projects (`server/src/portfolio/portfolio.repository.ts:13,77`) and
returns `{ projects }` with no limit and no "more exist" signal, so a capped list reads as complete. The per-source states BACK-49
asks for already exist and stay as they are: read-and-empty (`count: 0, complete: true`), never read (`never_read`), failed (error
state with a reason), partial (`complete: false`), stale (the client compares `lastReadAt`; `state` wins). Missing or revoked
grants keep today's nondisclosure: unauthorized projects and sources are simply absent and never counted.

## 3. Design

1. **Cap is visible (b).** The repository reads `PROJECT_LIMIT + 1` visible projects and returns at most `PROJECT_LIMIT`; the
   response becomes `{ projects, limit: 100, capped: boolean }`. `capped: true` means "more visible projects exist than shown";
   it is computed only over projects the reader can see, so it reveals nothing about others. The app shows, in EN and AR, "Showing
   the first 100 projects; more exist" when capped, and never a total. Per-project detail is unchanged.
2. **Measurement (c).** A test-only benchmark on disposable PostgreSQL 18.7 (not in CI by default): 100 visible projects, one
   GitHub source each, each with 50 historical reads of 1 repository + 20 PRs + 20 issues (about 205k evidence rows), plus 20
   projects without a grant (must not appear or be counted). Record row count, the number of queries per request, p50/p95
   latency over 30 runs for `GET /portfolio` and one `GET /portfolio/:id`, and `EXPLAIN (ANALYZE, BUFFERS)` of the latest-read
   query. Write the numbers into this doc. **Any index or pagination change that the numbers call for is a separate schema
   decision for you**; this slice changes no schema.
3. Tests (red first): capped false at 100, true at 101 (only 100 returned, ordered by key); hidden projects never change `capped`
   or the count (a reader with 100 visible projects and 50 invisible ones sees `capped: false`); the app copy for capped and not
   capped; parity fixtures updated for the new fields; the existing nondisclosure and revocation tests stay green.

## 4. Affected files

`server/src/portfolio/portfolio.repository.ts`, `portfolio.controller.ts` (response shape), `server/test/portfolio/*` (cap tests),
new `server/test/portfolio/portfolio-read.measure.ts` (benchmark, run on demand like `memory.measure.ts`), `app/src/api` and
`app/src/view` portfolio adapters and copy (EN/AR), committed parity fixtures. No migration, dependency or route.

## 5. BACK-50 acceptance checklist (to run after BACK-52 activation; no code now)

With one real approved source active: open the project in the room; see a real Observation with its badge and source time; write a
Correlation or Hypothesis note citing it; record a Proposed decision citing it; reload and see both with their creator; revoke the
grant and confirm the observation, the note's citation and the cited decision disappear for the owner (nondisclosure); reconnect
with reauthorization and confirm they return. Record the evidence in BACK-50. R1 (investigations and uncited decisions are
project-scoped records) is your ruling in BACK-51 and decides the uncited-decision case.

## 6. Decisions for the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| X | How the cap is exposed | **`{ projects, limit, capped }` plus app copy "first 100 shown; more exist"** (no total, no hidden count) |
| Y | Measurement | **On-demand benchmark at about 205k rows as above; numbers recorded here; any index is a separate schema decision** |
| Z | BACK-50 | **No code now; run the section 5 checklist after activation and your R1 ruling** |

## 7. Measurement result (decision Y, built 28 Nov 2026)

Run with `npm run measure:portfolio` in `server/` (`server/test/portfolio/portfolio-read.measure.ts`; on demand, never in CI).
**Machine: developer laptop, Windows, Docker Desktop**; disposable PostgreSQL 18.7 in Docker; Node 24; run on 2026-11-28. A one-off
laptop number, not a capacity claim.

**Seed.** 100 visible projects with one GitHub source each, every source with 50 historical reads of 1 repository + 20 pull requests
+ 20 issues observations (41 rows per read), plus 20 projects whose source the reader holds no active grant on (the owner's grant
revoked). **246,000 evidence rows in total** (205,000 on the granted sources, 41,000 on the ungranted ones, which the reads must
and do ignore); table 89 MB, indexes 53 MB; seeded in about 10 s with multi-row `INSERT ... SELECT`. The reads under test go
through the real `PortfolioRepository` as `kawalys_app` (forced RLS); the pool is wrapped only to count statements. 2 warm-up runs,
then 30 timed runs of each read.

| Read | p50 ms | p95 ms | min ms | max ms | SQL statements / request | of which data queries | projects returned | capped |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /portfolio` (list) | 187.3 | 268.0 | 93.6 | 323.8 | 6 | 2 | 100 | false |
| `GET /portfolio/:id` (detail) | 6.2 | 9.6 | 5.1 | 12.8 | 6 | 2 | 1 | n/a |

The 6 statements are `BEGIN`, the workspace `set_config`, the 2 data queries (visible projects with their granted sources, then the
latest read), `COMMIT` and `RESET`. The list returned exactly 100 projects, `capped: false`, and none of the 20 ungranted projects.

**`EXPLAIN (ANALYZE, BUFFERS)` of the latest-read statement (100 sources): 113.1 ms execution, 0.5 ms planning, 26,589 shared
buffers hit (all from cache, no reads from disk).** Key lines:

```
Nested Loop  (actual time=60.860..109.227 rows=4100.00 loops=1)            Buffers: shared hit=26589
  -> Finalize GroupAggregate  Group Key: e_1.source_id                     (the `latest` CTE: max(received_at) per source)
       -> Gather Merge  Workers Planned: 2  Workers Launched: 2
            -> Parallel Seq Scan on evidence e_1  (actual time=0.025..56.116 rows=1666.67 loops=3)
                 Rows Removed by Filter: 80333                             Buffers: shared hit=11429
  -> Index Scan using evidence_by_source on evidence e  (actual time=0.007..0.466 rows=41.00 loops=100)
       Filter: (type = 'Observation' AND (max(e_1.received_at)) = received_at)
       Rows Removed by Filter: 2009                                        Buffers: shared hit=14857
Execution Time: 113.091 ms
```

**Recommendation for the owner (no index was added; schema is your decision).** The list is fast enough at the cap on this
machine (p50 about 190 ms, p95 about 270 ms), and the single-project detail is 6 ms, but the list path is a sequential scan of the
whole evidence table: the `latest` CTE finds each source's newest repository-level batch with a `Parallel Seq Scan` (about 11.4k
buffers, 56 ms of the 113 ms), because no index covers the `payload->>'kind'` predicate or `received_at`; and the join back reads 41
wanted rows per source through `evidence_by_source` (ordered by `observed_at`) while discarding about 2,000 others per source (14.9k
buffers). Cost therefore grows with the total retained evidence (here 246k rows), not with the 100-project cap. Nothing needs to
change before the first real source; if the retained history grows by an order of magnitude, the candidates are a partial index
for the repository-level records `(workspace_id, source_id, received_at DESC) WHERE type = 'Observation' AND payload->>'kind' IN
('repository', 'source_status')` (turns the scan into 100 index probes) or keeping the latest-batch pointer on the source row. Either
is a migration and needs your approval; this slice makes none.
