# Kawalys ticket execution roadmap (22 Nov 2026)

Owner instruction (22 Nov): plan and execute the open BACK tickets, starting from the Retail Tower ticket; create tickets where needed; Sonnet for routine steps; keep going until stopped. Owner also approved: BACK-69 T0, backend in `server/`, Apache-2.0 for the repo, commit + push + PR (never merge), and any Node/language updates the project needs. Decisions inside that remit are delegated; each one is recorded as a ruling on the ticket or in the PR.

Hard limits that still apply (CLAUDE.md, ADR-002 v2, R2): no merge; no real data, credentials, provider access, DB, auth tenant, deploy or cloud spend; display persona is never authorization; unknown is never healthy; restricted evidence must not be detectable (M05-D05-B).

## Order

| # | Ticket | What | Who / where | Depends on |
|---|---|---|---|---|
| 1 | BACK-69 T0 | Synthetic NestJS BFF in `server/` + Retail Tower error envelope | Claude, cloud. PR open | none |
| 2 | BACK-72 | Make `app/` e2e runnable on a clean install (`@playwright/test` in `app/package.json`) | Claude, cloud | 1 merged or rebased |
| 3 | BACK-67 + new server CI ticket | Add `e2e:v2` and a `server/` check (Node 24) to the required CI job, keeping the docs-only skip and never `paths-ignore` | Claude, cloud; owner merges | 2 |
| 4 | BACK-66 verification | Run V2 e2e on exact SHA, grep V1 `ComponentPanel`/`SideLists`, report PASS/FAIL on the ticket | Claude, cloud | 2 |
| 5 | BACK-71 P1 | Canonical synthetic fixture + `scope` + `toV1`/`toV2` + parity tests (no UI) | Claude, cloud | ruling on entity list (see below) |
| 6 | BACK-73 S2 | V1 non-disclosure using the P1 scoping | Claude, cloud | 5 |
| 7 | New: Nest 12 / TS 6 proof | Separate tested upgrade of `server/` (ADR-002 v2 PS-02) | Claude, cloud | 1 |
| 8 | BACK-26, BACK-29 | DepGraph unresolved-edge hardening; G1 hold-out fixture | Claude, cloud | none |
| 9 | BACK-31, 32, 8, 33 | Native Arabic review, real devices / BrowserStack, visual parity, SonarCloud accept-or-fix | **Owner / humans, local computer** | packets already in repo |
| 10 | BACK-47 → 55/56/58/48 | Real DB, Descope, secrets, connectors | **Owner gates** (accounts, regions, grant matrix, spend) | BACK-47 exit criteria |

## Rulings for later steps (made under delegation, revisit any)

- BACK-72: option 2 (declare `@playwright/test` as an exact devDependency in `app/package.json`) — self-contained, no CI install-order coupling. Cost if wrong: one lockfile change to revert.
- BACK-71 departure from README S3b: accepted (D-6.2/B chose an independent model). Entity list for the fixture: `Organization`, `Project` (Retail Tower), `Component`, `Dependency` (edge), `Source`, `Evidence` (with `visibility`), `Mission` — the minimum both V1 and V2 views read for `inv-demo-7`. Cost if wrong: renaming in one new folder.
- BACK-73: waits for BACK-71 scoping (no third scoping implementation).
- CI stays on Node 22 for root and `app/`; only the `server/` step uses Node 24.

## Needs the local computer (tell the owner when reached)

Real-device and BrowserStack runs (SDK Local tunnel to 127.0.0.1), WebKit runs (not installed in the cloud sandbox), native Arabic reading, SonarCloud UI decisions.
