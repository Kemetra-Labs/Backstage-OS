# BACK-70 decision memo: controlled "V3" assembly (B) vs V1-host convergence (A)

Status: **read-only evaluation, owner decision pending.** No code, CI, dependency, Jira status or Confluence page was changed. Nothing was built, rendered or tested: every runtime claim below is NOT RUN.
Baseline: GitHub `main` at `0b6cb4b02d28beed7f7cfdb475d7a459a026f36e` (re-verified 2026-11-22: local `HEAD` = `origin/main`). The BACK-65 inventory (PR #36, `a1e01a3`) was read at `e72d34d`; since then only PR #37 (BACK-66) changed app code: `V2/logic/authorize.ts`, `V2/types.ts`, three V2 screens, `V2/navigation/{Shell,hits}`, and V2 tests.
Context: [BACK-70](https://rahmaqanater.atlassian.net/browse/BACK-70) · parent [BACK-65](https://rahmaqanater.atlassian.net/browse/BACK-65) · [BACK-65 plan](../BACK-65/README.md) and [inventory](../BACK-65/INVENTORY.md) · [Convergence review + D-6.2/B](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/89391147) · [R2 decision pack](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/89456817)

**Authority used here:** on 22 Nov 2026 the owner ratified **D-6.2/B** (an independent canonical Domain & Evidence Model) and the corrected delivery order S1→S2→S3→S3b→S4→S5→S6–S9→S10 (page 89391147 §3). The BACK-65 README and INVENTORY are annotated with these updates in the same PR.
Prefixes: `S/`=`app/src/screens/`, `V/`=`app/src/view/`, `V2/`=`app/src/design-lab/v2/`.

## 0. Recommendation

**NO-GO on B as a separate assembly track. GO on A (BACK-65 sequence), with one useful idea from B kept: build the canonical-model seam first, as an S3b proof with no UI.**

Why, in one paragraph: B's main promise, a new entry built in isolation with V1 and V2 untouched, is already in A (BACK-65 S5 builds the unified shell in a separate entry, BACK-27 pattern). The only thing B adds is a newly written shell, and the shell is not where the debt is: V1's shell is 4 files, 190 lines; V2's is 188. The debt is two synthetic worlds, two contexts, two copy systems, two route grammars, conflicting global CSS and two non-disclosure probes (§3). Neither A nor B removes any of these by itself. The ratified D-6.2/B domain model plus typed adapters removes them, and that work is the same under both options. B would also add a governance amendment and runs against three owner texts that say "no V3", plus R2 APP-01, which advises adapting V1's foundations (§1). So B costs more and buys nothing that A lacks.

This is a recommendation with a clear default, not the ticket's "evidence favors neither" STOP: the two options converge, and where they differ the evidence favours A.

## 1. Upstream constraints that bear on B

| Source | Text (quoted) | Binding? | Effect on B |
|---|---|---|---|
| Convergence review, page 89391147 §1 | "Do not create V3 or rebuild from scratch." | Reviewed planning baseline (owner-published) | B as defined by BACK-70 ("no third production frontend, no big-bang rewrite") can be read as compatible. A newly authored shell and screens would not be. |
| D-6.2/B (same page, owner-ratified) | "NOT an extra app, V3, duplicated backend, or blank-slate rewrite." | **Ratified** | Applies to the domain model. B must not become a second app; an isolated entry that is folded into `index.html` later is allowed (it is A's S5). |
| R2 APP-01 | "one React 19 app and one approved shell/router by adapting existing V1 application foundations and porting V2/B+C visual lenses through typed view adapters" | ADR worklist item (R2 §4D: "recommendations only") | Advises against a new shell. Not binding, but B needs it amended. |
| R2 APP-05 / product target | "no V3 rewrite" | Owner-approved planning pack | Same as above. |
| Convergence review §3 order | S5 (unified shell) only after S1, S2, S3, S3b and S4 | Reviewed baseline | B cannot start earlier than A's S5; it skips no gate. |

Conclusion: B is not forbidden if read narrowly, but every part of it that differs from A (a new shell, a new app identity) is the part these texts warn against.

## 2. What actually differs between A and B

| Dimension | A: BACK-65 (V1 host, lenses ported) | B: controlled assembly ("V3") | Delta |
|---|---|---|---|
| Isolated entry while migrating | Yes: S5 new `app/unified.html` + Vite config; V1/V2 unchanged until parity | Yes: same | **none** |
| Shell | V1 `shell/{AppShell 35, TopBar 59, Sidebar 48, DemoSearch 48}` adapted; V2 Shell patterns (menu focus return, Esc, RTL off-canvas) reused | New shell composed from both | About 190 lines either way. B rewrites what A adapts. |
| Router | Extend V1 grammar (D-2 option A, recommended in review) | Undefined; needs its own D-2 | B reopens D-2. |
| Domain model | D-6.2/B model + typed projections (S3b) | Same | none |
| Gate order | S1→S2→S3→S3b→S4→S5→S6–S9→S10 (corrected order, page 89391147 §3; see the note above the README §6 table) | Same gates, cannot skip any | none |
| V1 screens | KEEP V1 (Home, Portfolio, Investigation, Evidence, Decisions) | Reused, so the same | none |
| V1 "untouched" claim | Broken deliberately by S2 (V1 leak fix) | Also broken: 20 V1 files import `WORLD` directly (§3), so reusing V1 screens on a canonical world means editing them, unless they are rewritten | none (B's claim does not hold) |
| Governance | Within BACK-65 as reviewed | Needs BACK-65 decision/plan amendment (BACK-70 acceptance) plus an APP-01 change | B adds work |
| Rollback | Delete the unified entry; revert per slice | Same | none |
| Test migration | V1 `e2e` and V2 `e2e-v2` stay; unified suite added per slice | Same | none |

Measured: shell line counts (`wc -l`). Everything else is from code and doc reading. Bundle size, build time and runtime behaviour: **NOT RUN**.

## 3. Where the debt is (unchanged by A or B)

Counts are from `grep`/`wc` at `0b6cb4b`; see the method column.

| Debt | Evidence | Method | Removed by |
|---|---|---|---|
| Two synthetic worlds | V1 `fixture/world.ts` (371 lines) vs `V2/fixtures/world.ts` (143); shared core only via `fixture/inv-demo-7.ts` | INVENTORY §8, unchanged since | D-6.2/B model + adapters (S3b) |
| V1 reads the world directly, not through an injected source | **20** non-test V1 files import `WORLD`: 10 top-level screens, 7 screen sub-components, and `shell/{DemoSearch,Sidebar,TopBar}` | `grep -rlE "from '(\.\./)+fixture/world'"`, design-lab and tests excluded | A world provider at the app root, then one-line edits per file (S3b/S5) |
| V1 seam that already exists | `V/*` functions take the world as a parameter, e.g. `homeView(w, persona)` `V/homeView.ts:74`, `portfolioView(w, persona, lang, …)` `V/portfolioView.ts:111` | read | Makes an adapter feasible without touching view logic |
| V2 seam that already exists | All 6 V2 world readers go through `authorizedWorld(WORLD, persona)` (`V2/logic/authorize.ts:77`) | subagent import walk, spot-checked | Same |
| Two contexts | `useApp` consumed by **40** V1 files; `useV2` by 16 V2 files | grep | One context in the unified entry (S5) |
| Two copy systems | V1 `i18n/**` vs `V2/i18n/*` (6 catalogues + `t.ts`); V2 already imports V1 `COPY` and `segments` | import graph | Merge in S5–S9 |
| Two route grammars | V1 path style, id `^[A-Za-z0-9._-]{1,64}$`, persona/lang in search; V2 flat, id `^[A-Za-z0-9:_-]{1,40}$`, persona/lang in hash | `nav/routes.ts:16`, INVENTORY §3 | D-2 / S5 |
| B+C deep links | `?concept=bc` is read in `V2/App.tsx` but not carried by `V2/navigation/route.ts` (`parseRoute`/`buildHash`) | grep found no `concept` in `route.ts` | Unified router (either option) |
| Global CSS collisions | `V2/styles/base.css:3-18` styles bare `*`, `html`, `body`, `h1–h4`, `ul/ol`, `button/input/select`, `a`, `:focus-visible`; V1 `styles/app.css` and `shell.css` style the same elements differently (gold vs cyan focus, link colour, base font) | read | Alias layer + one base stylesheet (S4); importing both base sheets in one document is unsafe |
| No class or token collisions | V2 classes all `.kv2-`; V2 vars all `--kv2-` (except element-scoped `--orb` etc.); none redefine V1 vars | subagent grep, spot-checked | Nothing needed |
| Two breakpoint systems | V1 min-width, nav at 1024; V2 max-width, nav at 860, B+C stack at 1180 | grep of `@media` | S4/S5 |
| Two non-disclosure probes | V1 e2e: `BANNED` string list per spec; V2: structural `leaks()` (text + `aria-label`/`title`/`alt`/`data-*`), local to `e2e-v2/nondisclosure.spec.ts:45` | read | One shared probe (S1/S2 follow-up) |
| V2 browser tests not in CI | `ci.yml` runs root suite, `app` `check`, `app` `e2e`; no `e2e:v2` / `build:v2`. V2 unit and `scope.test.ts` do run (V1 vitest glob `src/**/*.test.ts`) | read | BACK-67 (S3) |
| V1 still shows restricted existence | `V/evidence.ts:17` returns `{id, …, restricted: true}`; `V/homeView.ts:111` `restrictedCount` | read | S2 (BACK-30 / D-1, ratified as M05-D05-B) |
| Unscoped case metadata in Replay | `V2/screens/MissionReplay.tsx:131,132,329,332` read raw `INV_DEMO_7` id, product, environment. This is the case itself, not restricted evidence: no E-5 leak, but it bypasses the projection | grep | Canonical projection (S3b) |
| Undefined count semantics | Mission `events` reduced by one per withheld reference (`V2/logic/authorize.ts`, PR #37) though the fixture does not define what `events` counts (R2 C-15) | read | Owner/contract decision before any parity claim |

## 4. Reuse matrix

Classes: **DIRECT REUSE** (import as-is) · **ADAPT** (keep, change inputs or styling) · **REWRITE** · **KEEP LAB** (stays in V1/V2 entry for comparison) · **RETIRE LATER** (only after parity and separate owner sign-off). The class is the same under A and B unless the B column says otherwise. All paths at `0b6cb4b`.

### 4a. Shared contracts and logic

| Item | Class | Adapter needed | Risk | Tests owning it |
|---|---|---|---|---|
| `contract/types.ts` (116), `contract/rules.ts` (126) | DIRECT REUSE as **input** to the D-6.2/B model (ratified text names them) | none | Becoming canonical by default; D-6.2/B says they are inputs, not the authority | `contract/rules.test.ts` (35) |
| `contract/world.ts` (161) | ADAPT | becomes one projection target | Shapes are V1 display shapes | `fixture/world.test.ts` |
| `fixture/inv-demo-7.ts` (98) | DIRECT REUSE (shared evidence core) | none | Its ids are referenced by both worlds | `i18n/strings.test.ts`, `view/viewFor.test.ts`, e2e flow and nondisclosure |
| `fixture/world.ts` (371), `V2/fixtures/world.ts` (143) | KEEP LAB until the canonical fixture has parity, then RETIRE LATER | projection from canonical fixture | Entity ids differ (`RT` vs `retail-tower`); one-to-one mapping NOT VERIFIED | `fixture/world.test.ts`, `V2/fixtures/world.test.ts` |
| `V/*` (11 files) | ADAPT (input only) | receives projected world | low: already pure functions of `w` | `V/*.test.ts` (127), 80% coverage gate |
| `V2/logic/authorize.ts` (84) | ADAPT: becomes the single scoped projection over the canonical model | yes | Must project before counts, search and ARIA (M05-D05-B) | `authorize.test.ts` (~21), `e2e-v2/nondisclosure.spec.ts` |
| `V2/logic/{graph,orbit,bc,status,evidence,replay,deck}.ts` | ADAPT, ported with their lens | read projected world | Not coverage-gated today | `logic.test.ts`, `bc.test.ts` |
| `V2/types.ts` (112) | ADAPT → projection target | yes | `Mission.label` now `TruthLabel \| 'unknown'` | type-checked only |
| `kawalys.graph.v1` (`docs/planning/G1/contract-v1/`) | not the domain model (D-6.2/B) | graph interchange only | Treating it as the full schema | G1 scorer self-check |

### 4b. V1 routes and screens (`nav/routes.ts`)

| Route / file | Class | Notes |
|---|---|---|
| Home `S/Home.tsx` + `S/home/*` | DIRECT REUSE after S2 | `restrictedCount` fix (S2); reads `WORLD` directly |
| Portfolio `S/Portfolio.tsx` + `S/portfolio/*` | DIRECT REUSE | BACK-49 target |
| Project `S/Project.tsx` + `S/project/*` | ADAPT | `MapPanel` + `components/DepGraph` replaced by B+C map only if D-3 confirms (then RETIRE LATER); `ComponentPanel` restricted row is S2 |
| Investigation `S/InvestigationRoute.tsx`, `InvestigationRoom.tsx`, `S/investigation/*` | DIRECT REUSE after S2 | 5 sub-components import `WORLD` |
| Evidence `S/Evidence.tsx` + `S/evidence/*` | DIRECT REUSE after S2 | deep link and `Related` sibling index show restricted ids (D-1) |
| Decisions, DecisionDetail + `S/decisions/*` | DIRECT REUSE after S2 | `summariseEvidence` restricted count |
| Agents `S/Agents.tsx` | ADAPT (Flight Deck visuals over `V/agentView.ts`) | Two agent models (INVENTORY §8) |
| Sources `S/Sources.tsx` | ADAPT (Observatory visuals; V1 tables stay as fallback) | |
| NotFound | DIRECT REUSE | V2 has none: unknown screens fall back to the map |
| `components/*` (16) | DIRECT REUSE; `EvidenceList`/`DepGraph` per S2/D-3 | `EvidenceDrawer` is the only modal with focus trap |
| `shell/*` (4 files, 190 lines) | **A: ADAPT. B: REWRITE.** | 3 of 4 import `WORLD`; `Sidebar` hard-codes `RT`, `INV-DEMO-7` |
| `app/AppContext.tsx` | ADAPT (add project/mission context and the world provider) | 40 consumers |
| `i18n/**` | DIRECT REUSE; V2 strings merged in | |
| `styles/*` | ADAPT through alias layer (S4) | element-level rules conflict with V2 `base.css` |

### 4c. V2 lab and B+C

| Surface | Class | Notes |
|---|---|---|
| `V2/screens/MissionMapBC.tsx` (117) + `V2/bc/*` (7 files, 732 lines) | ADAPT → Mission Map lens (S6) | Owner-selected; not in V2 nav; `?concept` not routed |
| `V2/screens/MissionMap.tsx` (510, classic) | KEEP LAB → RETIRE LATER (D-4) | pan/zoom dropped by B+C SPEC |
| `V2/screens/SourceObservatory.tsx` (302) | ADAPT → Sources lens (S7) | scoped since PR #37 |
| `V2/screens/MissionReplay.tsx` (375) | ADAPT → Investigation lens (S8) | needs time contract (CS-F03); raw case metadata (§3) |
| `V2/screens/AgentFlightDeck.tsx` (256) | ADAPT → Agents lens (S9) | `events` semantics (R2 C-15) |
| `V2/navigation/Shell.tsx` (188), `route.ts`, `hits.ts` | KEEP LAB; patterns reused | search scoping now via `authorizedWorld` (PR #37); ID-class mismatch R2 C-16 open |
| `V2/context.tsx`, `V2/i18n/*` | KEEP LAB → RETIRE LATER | strings merged into `app/src/i18n` |
| `V2/components/{ui,evidence,Icon,SourceRows}` | ADAPT (one chip family, D-3) | |
| `V2/styles/*` (8 files) | ADAPT; `base.css` element rules **not** imported into a shared document | `scope.test.ts` enforces the V2 wall |
| `V2/assets/fonts/*` (Manrope, Cairo woff2) | KEEP LAB until D-3 | SIL OFL 1.1, `OFL-*.txt` + `SOURCE.md` present. V1 bundles no fonts |
| `V2/assets/horizon.webp` | KEEP LAB | first-party (generated, per `V2/DESIGN.md:28`); generator not checked |

### 4d. Root QA and CI

| Item | Class | Notes |
|---|---|---|
| Root static prototype (`index.html`, `js/`, `css/`) + `tests/` | KEEP (required CI check) | Nothing in `app/` imports it |
| `app/e2e` (11 specs, 179 test calls) | KEEP; gains a structural leak probe | BANNED list only |
| `app/e2e-v2` (6 specs, 113 test calls) | KEEP; into CI via BACK-67 | only `leaks()` probe lives here |
| `.github/workflows/ci.yml` | unchanged by this memo | one required job; never `paths-ignore` |

Test counts are `grep -cE '^\s*(test|it)(\.(skip|only))?\('` over the concatenated specs (unit rows without `.skip`/`.only`): loops and `.each` count once, so runtime totals are higher. Line counts are `wc -l`.

## 5. Proposed contract seam (proposal level only, under D-6.2/B)

```
canonical synthetic fixture  (new, D-6.2/B entity names; synthetic only)
        │
        ├─ scope(persona)            ← single projection BEFORE any count, status, search, ARIA (M05-D05-B)
        │        │
        │        ├─ toV1World()  → contract/world.ts shape  → V/*  → V1 screens
        │        └─ toV2World()  → V2/types.ts shape        → V2/logic/* → lenses
        │
        └─ id map  RT↔retail-tower, component↔node  (one-to-one NOT VERIFIED)
```

- Not a backend, not real authorization (X02/X04 stay OPEN); `kawalys.graph.v1` stays a graph interchange contract.
- Scoping happens once, on the canonical model, before projection. Rollups are computed from the projected (already scoped) world, never from the raw one.
- Neither demo world becomes the authority. Both become projections that tests compare.

## 6. Smallest first slice (proposal; do not execute without separate owner approval)

**P1: canonical fixture + two projections + parity tests. No UI, no CI, no dependency.** This is S3b work in BACK-65's order. A Portfolio-to-Mission-Map UI path would be S5/S6 and must wait for S2 and S3.

| Item | Value |
|---|---|
| Depends on | D-6.2/B (ratified direction); an owner-approved minimal entity list for the fixture; ticket: S3b new candidate under BACK-65 (relates BACK-43). **Deliberate departure from the README S3b row:** README S3b adapts `V2/fixtures/` under D-6 option (iii), "keep both until mapped". D-6.2/B has since chosen an independent model, so P1 starts a small canonical fixture in a new folder instead. The owner should confirm this reading before the ticket is opened |
| Changed-file boundary (all new) | `app/src/domain/fixture.ts` (canonical synthetic fixture, `inv-demo-7` scope only), `app/src/domain/scope.ts`, `app/src/domain/toV1.ts`, `app/src/domain/toV2.ts`, `app/src/domain/parity.test.ts`. **No existing file edited.** Outside `design-lab/v2/`, so `scope.test.ts` is unaffected |
| Parity (same permitted fixture, EN and AR) | For each persona: equal evidence ids, truth labels, freshness and source readings between `homeView(toV1(...))` / `investigationView` and `authorizedWorld(toV2(...))` / `logic/status`; component health and edge certainty for the mapped ids |
| Negative non-disclosure | Owner and Nontechnical: E-5 absent from ids, counts, timeline rows, search hits and derived labels on the V2 side. **The V1-side negatives are expected to FAIL until S2** (`V/evidence.ts:17` keeps the id), so record them as known failures, not as skipped |
| Excluded | Mission `events` counts (R2 C-15), layout coordinates, copy wording |
| Commands | `cd app && npm run check` (tsc + vitest). `src/domain/parity.test.ts` is picked up by the existing `src/**/*.test.ts` glob, but `src/domain/**` is outside the 80% coverage include; adding it means editing `vite.config.ts`, which would be the one exception to the boundary above (owner call; default is not to) |
| Rollback | Delete `app/src/domain/` |
| Stop | if the id map is not one-to-one for a shared concept, or a parity assertion would need a V1 or V2 file edit to pass |

## 7. What static inspection cannot verify (NOT RUN / BLOCKED)

- Runtime CSS collision when both base sheets load: NOT RUN (inferred from source only).
- Bundle size, build time, memory: NOT RUN.
- Accessibility (screen reader, keyboard, 200% zoom, reduced motion), EN/AR rendering, 320/375 px: NOT RUN; manual parts remain BACK-31/32.
- WebKit for V2: NOT RUN in CI; previously BLOCKED locally (proxy 403).
- PR #37 acceptance on exact SHA in CI: NOT RUN (BACK-66 still To Do; BACK-67 open).
- One-to-one entity mapping V1↔V2: NOT VERIFIED.
- Branch protection settings: not readable from the repo.

## 8. Ticket reconciliation (no new tickets, no status changes)

| Ticket | Status (read 2026-11-22) | Relation to this memo |
|---|---|---|
| BACK-65 | To Do | Owns the decision; memo to be linked there |
| BACK-43 typed evidence model | To Do | P1 is a synthetic seam that feeds it; does not duplicate it |
| BACK-30 V1 nondisclosure | To Do | S2; P1's V1 negatives fail until it lands |
| BACK-66 V2 nondisclosure | To Do (code merged in PR #37) | Acceptance still open (R2 C-01) |
| BACK-67 e2e:v2 in CI | To Do | S3; needed before any lens port |
| BACK-8 / 31 / 32 visual, Arabic, a11y/devices | To Do | Gates S10 retirement |
| BACK-57 API handoff | To Do | Targets the unified destination; unaffected |
| BACK-47 / 69 backend | To Do | Independent; unaffected |

No permanent V3 backlog or epic is proposed. If the owner chooses B anyway, BACK-65's plan and R2 APP-01 need a separately approved amendment first.

## 9. Owner decision requested

Record on BACK-65: **A** (recommended) or **B**. If A: approve or decline opening the S3b ticket for P1. Nothing moves to In Progress before that.
