# BACK-7 — Kawalys G2 preflight (planning only)

Jira: [BACK-7](https://rahmaqanater.atlassian.net/browse/BACK-7) (parent BACK-1). Written 2026-11-16 on branch
`claude/back-7-g2-preflight` from `origin/main` at `c853feb`.

**This is a plan, not an implementation.** It changes no code, adds no packages, credentials, API access, CI changes or
agent actions. Nothing here is committed, pushed or merged without the owner's explicit go-ahead. A separate,
owner-approved ticket is required before any real-data work (see [07](07-next-implementation-proposal.md)).

## Starting point, re-verified 2026-11-16

The ticket's "verified starting point" is partly out of date. Checked against `origin/main`:

| Ticket says | Actual | Evidence |
| --- | --- | --- |
| PR #3 (prototype CI) open, first run in progress | **Merged** as `0232021` | `git log origin/main` |
| (not mentioned) | PR #4 docs-only CI skip **merged** as `c853feb` | `git log origin/main` |
| CI does not cover `app/` | **Still true**: `.github/workflows/ci.yml` installs and runs only the root Playwright suite | `ci.yml` at `c853feb` |
| BACK-6 Done, `app/` synthetic only | True: no backend, auth, network calls or credentials in `app/src` | `app/README.md`, `app/src/contract/types.ts` |
| Only React + TypeScript approved | True | [Architecture v1](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/79036418) §2 |

## Deliverables

| # | Deliverable | File | Status |
| --- | --- | --- | --- |
| 1 | S1 evidence / QA readiness review + gated CI plan for `app/` | [01-s1-qa-readiness.md](01-s1-qa-readiness.md) | Drafted |
| 2 | ADR-01 backend / BFF options | [adr-01-backend-bff.md](adr-01-backend-bff.md) | Drafted; **needs owner decision** |
| 3 | API and evidence (wire) contracts | [03-api-evidence-contracts.md](03-api-evidence-contracts.md) | Drafted |
| 4 | ADR-04 connector decision (GitHub REST vs MCP) | [adr-04-connectors.md](adr-04-connectors.md) | Drafted; **needs owner decision**; some facts unverified (marked) |
| 5 | ADR-03 permissions and security | [adr-03-permissions-security.md](adr-03-permissions-security.md) | Drafted; identity provider **open** |
| 6 | One G2 vertical-slice test plan | [06-g2-vertical-slice-test-plan.md](06-g2-vertical-slice-test-plan.md) | Drafted; **owner picks the repo** |
| 7 | Next implementation proposal + approval gate | [07-next-implementation-proposal.md](07-next-implementation-proposal.md) | Drafted |

## Acceptance criteria map

| Criterion | Where | Status |
| --- | --- | --- |
| S1 visual QA and CI gaps classified independently, nothing marked passed without proof | 01 §2–§4 | Drafted. Only items with recorded evidence are marked Verified |
| ADR recommendations and undecided items recorded | ADR-01 §5–6, ADR-03 §7, ADR-04 §6–7, this file §Open ADRs | Drafted |
| Read-only API/BFF + typed MCP/REST-capable adapter contract | 03 §3–§5, ADR-04 §3 | Drafted |
| Project-scoped GitHub source authority, evidence/freshness semantics, negative test matrix | 03 §6, ADR-03 §2, 06 §4 | Drafted |
| Human approval gate for the real-data implementation | 07 §8 | Drafted |

## Open ADRs not touched here

Architecture v1 §14 numbering is kept. BACK-7 covers ADR-01, ADR-03 and ADR-04 only. Still open and **not decided by
this work**: ADR-02 (database / graph), ADR-05 (Port overlap), ADR-06 (AI model abstraction), ADR-07 (agent
orchestration), ADR-08 (hosting, operations, cost). No document here assumes a database, queue or host.
