# BACK-84 (S3b / P3): `scopeFixture` is the runtime authority for the INV-DEMO-7 overlap

Synthetic only. No new UI, entry, route, library, backend, schema or CI change. Persona is a display switch, not authorization: no server-side identity, tenant or X02/X04 enforcement exists or is claimed.

Base: `e5df094` (BACK-83, PR #58). Not staged, committed, pushed or opened as a PR.

## What changed

| File | Change |
|---|---|
| `src/domain/runtime.ts` (new) | The adapter both consumers ask. `canonicalFor(persona)` is the only runtime call to `scopeFixture`. `evidenceVerdict` returns `visible`, `withheld` or `foreign` (an id the canonical fixture does not own). Also `canonicalComponent` and `dependencyVerdict`. |
| `src/view/authorize.ts` (V1) | The keep rule asks `evidenceVerdict` first. Only a `foreign` id falls back to `isWithheld`. RT's `pos` / `stock-sync` / `inventory` and the investigation nodes take their `state` from `toV1ComponentFacts(canonicalFor(persona), id)`. |
| `src/design-lab/v2/logic/authorize.ts` (V2) | Same keep rule (`keepRef` only for `foreign` ids). The three overlap nodes take state and evidence ids from `toV2NodeFacts(canonicalFor(persona), id)`. Overlap `dep` edges are kept or removed, with truth and evidence ids, by `dependencyVerdict`. |
| `src/domain/runtime.test.ts` (new) | 17 tests: verdicts, scoped-world equality, same-page switch sequence, two mutation proofs, a guard that only `domain/` calls `scopeFixture`. |
| `e2e/canonical-overlap.spec.ts`, `e2e-v2/canonical-overlap.spec.ts` | One same-page Technical, Owner, Technical, Owner switch each, on the withheld-only inventory deep link. |

`domain/types.ts`, `scope.ts`, `resolve.ts`, `toV1.ts`, `toV2.ts`, both fixtures, `App.tsx`, `context.tsx` and every screen are unchanged.

## Input and output boundaries

- Input: persona and the unscoped worlds (`WORLD`, `INV_DEMO_7`). Canonical side: `DOMAIN` through `scopeFixture`, memoised per persona.
- Output: the same `World` and `InvestigationData` shapes the screens already receive. Technical still gets the input object itself.
- One decision per record. An overlap record (E-1..E-9, `pos`, `stock-sync`, `inventory`, the two canonical dependencies) is decided by `scopeFixture` only. Every other record (E-11, E-12, E-21..E-24, E-31, E-41 and the rest of each world) is decided by the consumer's own rule, as before. No record is filtered twice.
- A structure outside the overlap that cites an overlap record is pruned through the same decision: V1 RT health basis, attention, delivery, edges, activity; V2 `sentry` node, edge d4, missions, replay rows, a source's health basis.

## When each consumer filters and derives (before and after)

| Step | V1 | V2 |
|---|---|---|
| Where | `App.tsx` `useMemo` per persona: `authorizedWorld`, `authorizedInvestigation` | each screen render: `authorizedWorld(WORLD, route.persona)` |
| Filter first | evidence dictionary, `keep` for every ref | `evidenceById`, `keep` for every basis ref |
| Then | component state (`scopeState`), edges, attention, delivery, decisions, activity | node state and evidence, edges, sources, replay, missions |
| Derive last | `triadOf`, `resolveHealth` on the scoped state, in the screens | `nodeStatus`, `nodeChip` on the scoped node, in the screens |
| Cache | `WeakMap<World, Map<Persona, World>>` | same |
| Changed by BACK-84 | the keep predicate and overlap component state | the keep predicate, overlap node facts and overlap edges |

Order is unchanged: scope, then derive. Nothing derives from an unscoped overlap record.

## Same-data snapshot

Both worlds and every derived fact, three personas, before (`e5df094`) against after, key-sorted JSON (323 KB): V1 `authorizedWorld`, V1 `authorizedInvestigation`, V1 `triadOf` per component, V2 `authorizedWorld`, V2 `nodeStatus` and `nodeChip` per node (this includes `descKey`). Result: byte-identical. The wiring changes where the decision is made, not what any persona sees.

## Privacy matrix (E-5 and its observation O-5, withheld from Owner and Nontechnical)

| Surface | Owner | Nontechnical | Technical | Evidence |
|---|---|---|---|---|
| V1 world, investigation, V2 world JSON | no `E-5`, no `O-5` | same | present | `runtime.test.ts`, `parity.test.ts` |
| Ids, counts, edges, basis, status, freshness | derived from the scoped fixture | same | full | `runtime.test.ts` equality tests |
| V1 DOM, text, `aria-*`, `title`, `data-*`, hidden nodes | none | none | shown | e2e `canonical-overlap`, `nondisclosure` (EN and AR) |
| V2 DOM, same attributes, inspector, node description | none, generic description | none | shown | e2e-v2 `canonical-overlap`, `nondisclosure` |
| Search, timeline, replay, hrefs | unchanged specs, still pass | same | same | existing e2e specs |
| Same-page switch and deep link, no stale data | Technical, Owner, Technical, Owner | n/a | n/a | new switch spec in each consumer |
| Memo and cache | same object per persona; Technical gets the input; owner, technical, owner leaves no E-5 | | | `runtime.test.ts` |

## Authority proofs (the tests are not vacuous)

- A record the canonical fixture withholds (E-3 marked Technical-only in the canonical fixture only) disappears from both consumers although their own objects say visible. The V1 investigation fails closed if the withheld record is the one its raw output cites (E-1).
- With `scopeFixture` replaced by identity, E-5 reaches lay personas in both consumers, while E-12 and E-23 (not overlap) are still withheld by each consumer's own rule. That is the single-authority canary.
- Mutation, run by hand and reverted: runtime scope disabled, 53 tests failed in 8 files; both consumer rules disabled (`isWithheld` false, `keepRef` true), 17 tests failed in 3 files.

## Unchanged by decision (conflicts recorded, not reconciled)

1. V1 `stock-sync` to `inventory` stays `authored` on E-7, the V2 and canonical edge stays `hypothesis`. V1 edges do not take canonical truth. Still pinned by `parity.test.ts`.
2. No domain-wide id map (`RT`/`KH`/`SB` against the V2 slugs). The V1 adapter names project `RT` once (`OVERLAP_PROJECT`).
3. Seshat-BI assertions and the mission `events` count semantics are untouched.
4. V2's source-authority freshness fallback applies only to nodes the canonical fixture does not own. For the three overlap nodes the canonical rule gives `unknown`, which is what the nodes (no provider) already showed.

## Remaining duplicated logic

- The "Technical-only is withheld" rule still exists as `isWithheld` (V1) and `keepRef` (V2) for every non-overlap record, and as `keepRef` inside `domain/scope.ts`.
- All records outside the overlap: V1 RT's other components, edges, attention, delivery, decisions, activity, KH and SB; V2's other nodes, edges d1/d2/d4/d6/d7/d8, replay, missions, source events, `SOURCE_LIST` health.
- Persona wording of evidence (V1 `strings.ts`, V2 `TABLE`), component names and layout.
- `REFERENCE_NOW` in `view/investigationView.ts` and the hard-coded V1 evidence id list in `toV1.ts`.
- Two consumer-side constants name overlap ids by position: V1 `OVERLAP_PROJECT = 'RT'`, V2 node and edge matching by canonical id.

## Evidence

| Check | Result |
|---|---|
| Preflight: PR #58 merged, no open PR, worktrees, `origin/main` `e5df094` | PASS. Main CI for `e5df094` was in progress when work began and finished `success` (checked live before the report). |
| `npx tsc --noEmit` | PASS |
| `npm run check` | PASS: 556 tests (was 539), coverage 99.83% |
| Value-import cycles | 153 modules, 0 cycles; nothing in `domain/` imports consumer values |
| `git diff --check` | PASS |
| `npm run e2e` (Chromium + WebKit) | PASS: 1,448 passed, 66 skipped, 0 failed (was 1,446 / 66) |
| `npm run e2e:v2` (Chromium) | PASS: 313 passed, 32 skipped, 0 failed (was 312 / 32) |
| Before and after UI-fact snapshot | PASS, byte-identical |
| Authority and mutation proofs | PASS (above) |
| General or production security, tenant auth, real data | NOT RUN, not claimed (X02/X04 open) |
| axe, screen reader, real devices (BACK-32), native Arabic review (BACK-31) | NOT RUN |

SHA for all results: `e5df094` plus the uncommitted working tree listed above.

Rollback: revert the change. That deletes `domain/runtime.ts` and its test and restores the two `authorize.ts` files, so each consumer filters the overlap by its own rule again, as at `e5df094`.

## Next in-place slice

Put the one "Technical-only" rule in `domain/` for every record, not only the overlap, and have `isWithheld`, `keepRef` and `scope.ts` call it. Then add the typed `RT`/`KH`/`SB` to V2 slug map and widen `canonicalFor` coverage component by component. After that, the shared AppShell and context, then the B+C lenses, all inside `app/index.html`.
