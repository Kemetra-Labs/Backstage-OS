# BACK-155 AC2: SQL timing experiment (2026-11-28)

**Proposed verdict, for the owner and security reviewer to decide (BACK-155 Q1):**
- accept a **narrow residual** for single-owner use;
- re-run over the network before team use.

This is an empirical result, not a claim of equal timing.

## Threat model (assumed; to confirm under Q1)

A signed-in reader probes project ids and times the answers, to learn whether a project they cannot see:
- exists;
- holds data;
- once granted them access.

All four cases below already answer the identical 404 body. Only their timing can differ. Today there is one user per workspace, the owner. The model matters most for later team use.

## Method

- **Harness:** `server/test/cognition/cognition-timing.measure.ts` (`npm run measure:timing`). It is not a CI gate.
- **What is timed:** `MemoryRepository.readVisible`. For these cases it is the route's only step that depends on data; the guards, the UUID check and the limiter do the same work in every case. Timing below the HTTP layer gives an attacker more precision than they really have, so it is the conservative choice.
- **Cases:** each hidden project holds 200,000 evidence rows.
  - `missing`: a project id that does not exist.
  - `other-ws`: a project in another workspace.
  - `revoked`: a project in the reader's workspace whose only grant was revoked.
  - `no-grant`: a project in the reader's workspace, read by a user who holds no grant.
- **Sampling:** 50 warm-up reads, then 400 reads per case, interleaved in a seeded random order (mulberry32, seed 20261128).
- **Environment:** Node 24.21.0, PostgreSQL 18.7 in Docker on the owner's Windows 11 workstation, with other test databases on the same host (uncontrolled noise).
- **Code:** `main` at `7dd3fcb` plus the uncommitted slice-1 branch. The memory read includes the `EXISTS (SELECT 1 FROM granted)` guard (#179), so no case scans evidence.

## Results

| Case | p50 ms | p95 ms | p99 ms | min ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| missing | 4.098 | 7.008 | 9.041 | 3.716 | 13.945 |
| other-ws | 4.095 | 7.062 | 9.497 | 3.745 | 13.715 |
| revoked | 4.133 | 7.371 | 9.843 | 3.741 | 14.084 |
| no-grant | 4.147 | 7.101 | 9.212 | 3.776 | 12.380 |

The table below gives the probability that a sample from the first case is slower than one from the second. 0.5 means the two cannot be told apart by rank; one standard error at 400 per case is about 0.02.

| Pair | P(first > second) |
| --- | ---: |
| missing vs other-ws | 0.486 |
| missing vs revoked | 0.462 |
| missing vs no-grant | 0.444 |
| other-ws vs revoked | 0.478 |
| other-ws vs no-grant | 0.455 |
| revoked vs no-grant | 0.477 |

## Reading

- **The three existing hidden projects track each other closely.** `other-ws`, `revoked` and `no-grant` each hold 200,000 rows. This design cannot separate data volume from existence: the only case with no rows, `missing`, is also the only one where the project does not exist. The small skew it shows is therefore between missing and existing projects. Without a grant, evidence is never scanned (the #179 guard, pinned by an EXPLAIN test).
- **The medians differ by at most 0.05 ms out of about 4.1 ms.** At 400 samples, `missing` vs `no-grant` (0.444) and `missing` vs `revoked` (0.462) are about 2 to 3 standard errors from 0.5. In this quiet, local, below-HTTP setting a small skew is measurable. It plausibly comes from the extra rows that the grants and sources joins touch when a project exists.
- **Attacker budget:**
  - The route allows 30 reads per minute per user, so at most 1,800 samples an hour.
  - A real probe also crosses the network, TLS and the proxy. Their jitter is typically milliseconds, two orders of magnitude above a 0.05 ms skew.
  - Even here, separating one pair needed hundreds of samples per hypothesis.

## Proposed residual (owner decision, Q1)

- **Single-owner use (today):** accept a narrow residual. The owner is the only user of the workspace, so there is no other reader to probe for. No code change is proposed.
- **Before team use:** re-run this experiment end to end over the network, at the route, with the real limiter, and with team-shaped data. If a pair separates there with a practical number of samples, the remediation candidates are:
  - padding not-found answers to a fixed floor;
  - resolving visibility with constant work before the memory read.

  Either would get its own review.

## NOT RUN

- The HTTP route over the network.
- A dedicated quiet host.
- Several users in one workspace, since memberships are owner-only today.
- Repeated runs to check that the effect sizes are stable.
