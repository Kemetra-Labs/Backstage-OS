# BACK-83 (S3b / P2): the INV-DEMO-7 overlap reads from `app/src/domain`

Synthetic only. No new UI, entry, route, library, backend, schema or CI change. Persona is a display switch, not authorization.

## What changed

The BACK-71 fixture used to *collect* its records from the V1 and V2 fixtures. The direction is now inverted: `app/src/domain` owns the overlap facts and both fixtures project them.

| Fact | Defined in | Read by |
|---|---|---|
| Five sources, evidence E-1..E-9 | `domain/records.ts` (moved byte for byte) | V1 `fixture/inv-demo-7.ts` (re-export), V2 `fixtures/world.ts` |
| Components `pos`, `stock-sync`, `inventory`: health, connectivity, freshness, basis, evidence ids, failing check | `domain/fixture.ts` | V1 `NODES` and the V1 world's RT components (`toV1`), V2 nodes (`toV2`) |
| Dependencies `pos→stock-sync`, `stock-sync→inventory` (truth and evidence ids) | `domain/fixture.ts` | V2 edges d5 and d3 (`toV2`) |
| Investigation id, fixed "now" | `domain/fixture.ts` | V1 `INV_DEMO_7.id`, V1 world, V2 `NOW` and `investigationId` |

`domain/` now imports only `contract/` and one type-only import of V2's type file. A test enforces this.

## Conflicts recorded, not reconciled

1. **V1 `stock-sync→inventory` is `authored` on E-7, which was never read.** Canonical and V2 say `hypothesis`. The V1 edge is left as it was because changing it changes the V1 map. Still pinned by `parity.test.ts` (positive pin and `it.fails`). **Owner choice needed:** make V1 `hypothesis` (projected from the domain), or record why `authored` stands.
2. V1 has no `pos→stock-sync` edge (it goes `pos→api-gateway→stock-sync`); V2 and canonical have one, `unknown`.
3. `RT`/`KH`/`SB` against `retail-tower`/`khepri`/`seshat-bi`: no id map. Not touched.
4. Seshat-BI: V1 `not_configured`/`unknown`; V2 `degraded` with an empty basis. Not touched (outside the overlap).
5. Mission `events` count semantics (R2 C-15): V2's "one event per withheld reference" assumption stands. Not touched.
6. Freshness fallback when a basis is withheld: V2 falls back to the node's source authority; V1 and the domain give `unknown`. Identical for the three overlap components (none has a provider); a difference for any component that has one.

## Still duplicated

- Persona scoping exists three times: V1 `view/authorize.ts`, V2 `logic/authorize.ts`, `domain/scope.ts`. Screens still run the first two; `scopeFixture` is used only by tests. Parity tests pin all three to each other.
- Everything outside the three components: V1 RT's other components, edges, attention, delivery, decisions, activity; V2's other nodes, edges d1/d2/d4, replay, missions, source events, `SOURCE_LIST` health claims.
- Evidence wording per persona (V1 `strings.ts`/`evidenceText`, V2 `TABLE`); component display names and layout.
- `REFERENCE_NOW` in `view/investigationView.ts` repeats the domain's "now".

## Evidence (this branch, base `b85c502`)

| Check | Result |
|---|---|
| UI facts baseline: V1 and V2 raw and persona-projected worlds, V1 map and home views, V2 node status, all three personas, before vs after (key-sorted JSON) | PASS: byte-identical |
| `npm run check` | PASS: 539 tests (was 526), coverage 99.83% |
| `npm run e2e` (Chromium + WebKit) | PASS: 1,446 passed, 66 skipped, 0 failed (was 1,422 / 66) |
| `npm run e2e:v2` (Chromium) | PASS: 312 passed, 32 skipped, 0 failed (was 302 / 32) |
| New unit tests: single-source guards, mutation test (change the canonical record, both consumers follow), V1/V2/canonical parity per persona, source provenance, withheld-only negatives | PASS |
| Mutation: canonical scope keeps Technical evidence; V2 `authorizedWorld` keeps Technical evidence | Caught (9 and 7 tests failed), reverted |
| New browser specs (V1 and V2): overlap facts per persona × EN/AR against the canonical projection; withheld-only inventory for Owner and Nontechnical; Technical positive control | PASS |
| `git diff --check` | PASS |
| Full-world unification, other domains | NOT RUN, not claimed |
| axe scan, screen reader, real devices (BACK-32), native Arabic review (BACK-31) | NOT RUN |

Rollback: revert the PR. That removes `domain/records.ts` and the new tests, and the V1 and V2 fixtures define their own copies again, as before. `domain/types.ts` is unchanged by this slice.
