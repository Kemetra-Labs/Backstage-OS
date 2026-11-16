# ADR-01 — Backend / BFF language and shape

Status: **Proposed — owner decision required.** Architecture v1 §14 ADR-01. Nothing is installed or scaffolded.

## 1. Context

- Approved: React + TypeScript frontend. Open: backend language/framework, database, identity, hosting, protocols.
- G2 needs a small server-side boundary that: authenticates the user, checks project scope, holds the source
  credential, calls one GitHub read path, normalises the result into the display contract and returns it.
- The display contract and its rules already exist in TypeScript: `app/src/contract/types.ts` and pure functions in
  `app/src/contract/rules.ts` (`freshnessOf`, `effectiveFreshness`, `resolveLabel`, `resolveHealth`, `countDisplay`,
  `isInertLink`), with 80 unit tests.
- Small team; the same people maintain frontend and backend.

## 2. Options

**A. Lean modular TypeScript / Node BFF.** One Node process, modules by domain (`auth`, `scope`, `evidence`,
`connectors/github`). A minimal HTTP framework (candidates to compare in the implementation ticket: Fastify, Hono;
no choice made here). Runtime schema validation at boundaries.

**B. Python / FastAPI BFF.** Same module layout. Pydantic models at boundaries.

**C. Reuse.** CNCF Backstage backend is *not baseline* (Architecture v1 §2). Port is optional context only (ADR-05). Neither is
a supported reuse path for the BFF today, so C is not scored. (The isolated Backstage spike reportedly started with
permissive defaults; Architecture v1 §15 notes those spike results are not independently verified.)

## 3. Comparison

| Criterion | A. TypeScript / Node | B. Python / FastAPI |
| --- | --- | --- |
| Contract sharing | Can import the same `types.ts` and the same rule functions server side. One source of truth; the server re-applies `resolveHealth` etc. as defence in depth | Must re-declare every type and re-implement rules in Python. Needs cross-language contract tests (e.g. shared JSON fixtures run by both suites) to stop drift |
| Security | Mature libraries for OIDC sessions, headers, rate limiting. npm supply-chain risk; mitigate with lockfile, `--ignore-scripts`, exact pins, a 2-week age rule (already practised in `app/`) | Mature libraries as well. PyPI supply-chain risk, mitigated with hashed lock files |
| Developer maintenance | One language, one toolchain, one test runner family (Vitest) across UI and BFF | Two toolchains. Team has Python experience on other projects, so not a blocker |
| Ecosystem for this job | Official GitHub client (Octokit) and the MCP TypeScript SDK both exist | Official MCP Python SDK exists; GitHub clients are community-maintained (PyGithub, etc.) |
| Hosting cost | Small; any container or serverless host. Not selected (ADR-08) | Same |
| Simplicity | Fewer moving parts for a single-slice BFF | Adds a second language for one slice |

Nothing in this table was benchmarked. Cost and performance are not expected to differ at G2 volume (one repo, a
few reads per minute).

## 4. Shape (either option)

- **Modular monolith**, one deployable. No queue, no database chosen. G2 can run with an in-memory cache keyed by
  `(project, source, ref)` and a TTL; persistence of observations is deferred to ADR-02.
- BFF exposes **read-only** endpoints only (03 §3). No write routes exist, so none can be mis-authorised.
- Connectors sit behind an adapter interface (ADR-04), so the BFF does not care whether REST or MCP is used.

## 5. Recommendation

**Option A (TypeScript / Node), for approval.** The deciding, repo-backed reason is that the rules that keep
"unknown" from becoming "healthy" already exist and are tested in TypeScript; reusing them server-side removes a
whole class of drift bugs. Python remains a sound choice; if the owner prefers it, budget the cross-language
contract-test harness as part of the first ticket.

## 6. Not decided here

HTTP framework, schema-validation library, database, cache store, queue, host, identity provider (ADR-03), log
pipeline. Each is chosen in the implementation ticket with its own justification, or deferred.
