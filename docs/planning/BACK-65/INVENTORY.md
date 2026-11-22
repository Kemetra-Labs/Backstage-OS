# BACK-65 inventory: facts behind the convergence plan

Companion to [README.md](README.md). Read from GitHub `main` at `e72d34d` by static inspection. **Nothing was run or rendered.** "NOT VERIFIED" marks what code reading could not settle. Prefixes: `S/`=`app/src/screens/`, `V/`=`app/src/view/`, `I/`=`app/src/i18n/screens/`, `C/`=`app/src/styles/screens/`, `E/`=`app/e2e/`, `V2/`=`app/src/design-lab/v2/`.

## 1. Three frontends, not two

| Surface | Entry | Role | CI |
|---|---|---|---|
| Root static prototype | `index.html`, `js/*.js` (about 1990 lines), `css/app.css` (761) | Vanilla review prototype (BACK-4). Script order is load-bearing. | Required check: root `playwright test`, chromium + webkit |
| V1 React app | `app/index.html` → `app/src/main.tsx` | Nine hash routes, one shell, React 19.3.1 pinned (README says 18, stale) | `npm run check` + `npm run e2e` |
| V2 lab and B+C pilot | `app/v2.html` → `V2/main.tsx` | Isolated visual lab; B+C via `?concept=bc` | **Not in CI** |

## 2. V1 routes and their parts

| Route | Screen | Sub-components | View | Copy | CSS | e2e |
|---|---|---|---|---|---|---|
| home `#/` | `S/Home.tsx` | `S/home/*` (Activity, AttentionList, EvidenceChips, SideLists, SourceHealth) | `V/homeView.ts` | `I/home.ts` | `C/home.css` | `E/home.spec.ts` |
| portfolio | `S/Portfolio.tsx` | `S/portfolio/*` | `V/portfolioView.ts` | `I/portfolio.ts` | `C/portfolio.css` | `E/portfolio.spec.ts` |
| project `#/project/:id[/:c]` | `S/Project.tsx` | `S/project/*` (ComponentPanel, DeliveryPanel, MapPanel, RisksPanel, StatusPanel, useNarrow) | `V/projectView.ts`, `V/world.ts` | `I/project.ts` | `C/project.css` | `E/project.spec.ts` |
| investigation | `S/InvestigationRoute.tsx` → `InvestigationRoom.tsx` / `SummaryRoom` | `S/investigation/*` | `V/investigationView.ts`, `V/viewFor.ts` | `I/investigation.ts`, `app/src/i18n/strings.ts` | `C/investigation.css` | `E/investigation*.spec.ts` |
| evidence `#/evidence/:id?from=` | `S/Evidence.tsx` | `S/evidence/*` | `V/explorerView.ts`, `V/evidence.ts` | `I/evidence.ts` | `C/evidence.css` | `E/evidence.spec.ts` |
| decisions, decision | `S/Decisions.tsx`, `DecisionDetail.tsx` | `S/decisions/*` | `V/decisionView.ts` | `I/decisions.ts` | `C/decisions.css` | `E/decisions.spec.ts` |
| agents | `S/Agents.tsx` | `S/agents/*` | `V/agentView.ts` | `I/agents.ts` | `C/agents.css` | `E/agents.spec.ts` |
| sources | `S/Sources.tsx` | `S/sources/*` | `V/sourceView.ts` | `I/sources.ts` | `C/sources.css` | `E/sources.spec.ts` |
| notFound | `S/NotFound.tsx` | none | none | `app/src/i18n/shell.ts` | none | only in `E/flow.spec.ts` route list |

Shared V1 components (`app/src/components/`): `Breadcrumbs`, `DepGraph` (+ `DepTable`, whose only named consumer was not found: NOT VERIFIED), `EvidenceDrawer` (modal), `EvidenceList`, `HealthTriad`, `L`/`LP`, `Ledger`, `Panel`, `ScreenHeader`, `Segmented`, `SourceChip`, `StageMap`, `StateBlock`, `Text`, `Timeline`, `TruthChip`. Shell: `AppShell`, `TopBar`, `Sidebar` (hard-codes `RT` and `INV-DEMO-7` as nav targets), `DemoSearch`.

State: `App.tsx` holds persona and language, seeds them from `?persona=&lang=`, mirrors them to the search part with `replaceState`, and sets `document.documentElement.lang/dir`. Not persisted. Persona is "a presentation switch only, never authorization" (`app/src/app/AppContext.tsx`).

## 3. V2 lab and B+C

| Surface | File (lines) | Shows | Logic | e2e-v2 |
|---|---|---|---|---|
| Mission Map (classic) | `V2/screens/MissionMap.tsx` (510) | pan/zoom constellation, list view, scope select, inspector | authorize, evidence, graph, status | interactions, structure, fidelity, nondisclosure |
| Mission Map B+C | `V2/screens/MissionMapBC.tsx` (117) + `V2/bc/*` (Canvas, Inspector, Panels, Tables, atoms, shared, state) | orbit map or list (ledger, readings matrix, links table), signal timeline, inspector | authorize, bc, graph, orbit | bc, nondisclosure, bc-capture (only `BC_CAPTURE=1`) |
| Source Observatory | `V2/screens/SourceObservatory.tsx` (301) | six sources, connectivity/freshness/health pins, events timeline | evidence, status | interactions, structure, fidelity |
| Mission Replay | `V2/screens/MissionReplay.tsx` (366) | scripted INV-DEMO-7 replay, scrubber, gap marker R-5, "Copy proposal text" | replay, status | interactions, structure, fidelity |
| Agent Flight Deck | `V2/screens/AgentFlightDeck.tsx` (255) | five simulated agents, missions, queues, oversight, audit | deck, evidence, status | interactions, structure, fidelity |

Shell nav (`V2/navigation/Shell.tsx`): four screens, skip link, search (Ctrl+K), demo banner, persona and language `Seg`, three hard-coded scope buttons, "Compare with V1" links to `127.0.0.1:4178` and `:8765`. **B+C is not in the nav**: `V2/App.tsx` swaps it in only for `?concept=bc`; `parseRoute`/`buildHash` do not carry `concept`. Whether `?view=`, `?node=`, `?tab=` are all honoured by the B+C seed parser is NOT VERIFIED beyond `e2e-v2/bc-helpers.ts`.

Route grammar: `#/<screen>?persona=&lang=&scope=&node=&src=&evt=&msn=`; id allowlist `^[A-Za-z0-9:_-]{1,40}$` (V1: `^[A-Za-z0-9._-]{1,64}$`).

Imports from V1 (TypeScript only): `contract/types`, `contract/rules`, `fixture/inv-demo-7`, `i18n/strings`, `i18n/segments`. V1 imports nothing from `design-lab`.

## 4. Tokens

| Role | V1 `app/src/styles/tokens.css` | V2 `V2/styles/tokens.css` (`--kv2-` prefix) |
|---|---|---|
| Page / panel | `--bg #060B13` / `--surface #0C1622` | `#050c14` / `#0a1824` |
| Text primary / secondary / muted | `#EAF0F8` / `#B9C5D5` / `#8E9CB0` | `#e8f3f9` / `#adc2cf` / `#86a0b0` |
| Border | white 10% | cyan 22% mix |
| Accent, focus, selected | gold `#DDAA57` | cyan `#2de2ec` (amber is "attention") |
| OK / warn / bad / unknown | `#24C98B` / `#F4B64B` / `#EF6572` / `#9AA7B8` | `#3ddc97` / `#f5a524` / `#f0626e` / `#9fb0bf` |
| Truth observed / correlated / hypothesis / proposed | green / `#5B9BF0` / amber / `#B7AAE8` | green / `#6aa7f5` / amber / `#b9aaf0` |
| Approved | `--apr` (double border) | no style, though `DisplayLabel` includes `approved` |
| Radius | 6/10/14 | 6/10/14 (identical) |
| UI font | Inter, Cairo (local stack, no font files) | Manrope + Cairo (bundled woff2, SIL OFL, `V2/assets/fonts/`) |
| Base size | 15px / 1.6 | 13.5px / 1.5 |
| Type scale / shadow / duration | none | `--kv2-t-*` 11–36px, shadow, bloom, 120/220ms (but 134 literal `font-size` vs 32 token uses) |
| Breakpoints (literal, no tokens) | mobile-first: min 760/900/960/1024/1100; nav at 1024 | desktop-first: max 460–1380; nav drawer at 860; B+C stack at 1180 |
| Colour scheme | dark only | dark only |

No `prefers-color-scheme`, `prefers-contrast` or `forced-colors` anywhere in `app/src` or `css/app.css`. The root prototype `css/app.css` is the origin of V1's tokens (header: "subset copied from css/app.css").

## 5. Shared patterns, side by side

| Pattern | V1 | V2 / B+C |
|---|---|---|
| Truth/status chip | `components/TruthChip.tsx`, `SourceChip.tsx`, `HealthTriad.tsx` | `V2/components/ui.tsx` (`TruthChip`, `ToneChip`), `V2/bc/atoms.tsx` (`StatusChip`, `Ring`, `Pips`, `AgeBar`) |
| List/table fallback | `DepGraph.tsx` + `DepTable`; `MapPanel.tsx` forces table when narrow (CS-F02) | `MissionMap.tsx` list view; `bc/Tables.tsx`; defaults to list at ≤640px (`bc/state.ts:22`) |
| Evidence detail | modal `EvidenceDrawer.tsx` (focus trap, `inert`, Esc) | docked `kv2-inspector`; no `role="dialog"` |
| Empty/loading/error/unknown | `StateBlock.tsx` (all kinds, in words) | `.kv2-empty` only; no loading/error block |
| Mobile nav | `Sidebar.tsx` + `TopBar.tsx` menu, drawer below 1024 | `.kv2-menu-btn`, Esc closes and refocuses, off-canvas at ≤860 |
| Bottom Sheet (baseline MM-AC-04) | none found | none found; `V2/styles/bc.css:259` records it was dropped for a stacked layout at ≤1180 |
| Reduced motion | CSS blanket rule | CSS blanket rule plus JS `prefersReducedMotion()` |

## 6. Tooling, CI and tests

| Item | Fact |
|---|---|
| Scripts | `app`: `check` (tsc + vitest coverage), `e2e` (V1), `dev:v2`, `build:v2`, `e2e:v2`. Root: `serve`, `test`, `test:browserstack` |
| Playwright | V1 chromium + webkit, port 4178; V2 chromium only, port 4279; root chromium + webkit |
| CI (`.github/workflows/ci.yml`, one job) | root suite, `app` `npm run check`, `app` `npm run e2e`. Docs-only PRs skip browser steps (`docs-only.sh`). **No `e2e:v2`, no `build:v2`.** Branch protection cannot be verified from the repo |
| Static test counts (approximate: grep of `test(`/`it(` lines; two counting methods differed by up to about 10%, and loop-generated tests count once, so runtime counts are higher) | root `tests/` about 27; `app/e2e` about 179; `app/e2e-v2` about 119; unit: V1 and shared about 242, `design-lab` about 94 |
| Recorded runs (PR #35, local sandbox Chromium, not CI) | `npm run check` 430/430; V2 e2e 268 passed, 32 skipped; V1 e2e 598 passed; V2 WebKit BLOCKED (proxy 403) |
| Coverage gate | 80% on `contract`, `view`, `i18n`, `nav/routes.ts`, `nav/search.ts` only |
| Not present | lint, axe, Lighthouse, visual regression, Sonar coverage upload (SonarCloud runs as an app; `.sonarcloud.properties` sets CPD exclusions only) |

## 7. Root-only features with no React equivalent

`network` (Customers & Branches, `js/network.js`), `design-system` (`js/design.js`), Ctrl+K palette, project filter, source-state simulator (`S.src` ok/stale/down), drawers and toast, `?s={json}` state seed, local approvals and simulated agent runs (`js/decisions.js`, `js/v4.js`). `operations` and `sources` are generic placeholders. React-only: Project Intelligence with `DepGraph`, Evidence Explorer, Decision detail, `notFound`, allowlist redaction.

## 8. V1 and V2 world models, field by field

Answers the 22 Nov amendment to BACK-65 item 4 (inventory of entity, graph, evidence, time, source and permission fields, with ownership and semantic differences). Read from `app/src/contract/types.ts`, `app/src/contract/world.ts`, `app/src/fixture/world.ts`, `app/src/fixture/inv-demo-7.ts`, `V2/types.ts`, `V2/fixtures/world.ts` at `e72d34d`. By code reading only: nothing was run and no mapping was tested. **This table chooses no canonical world** (owner decision D-6).

| Concern | V1 (`contract/world.ts`, `fixture/world.ts`) | V2 (`V2/types.ts`, `V2/fixtures/world.ts`) | Shared | Semantic difference / risk |
|---|---|---|---|---|
| Entity: container | `WorldProject` id `RT`/`KH`/`SB` (`ProjectId` union), name, summary, sources, health, environments | `WorldNode` kind `product`, id `retail-tower`, `khepri`, `seshat-bi` | none | Different id vocabularies for the same products; one-to-one mapping **not verified**. |
| Entity: component | `WorldComponent` id, `layer` (client/edge/service/data/integration), `environment`, grid `pos {col,row}`, `checkFailing` | `WorldNode` kind `project` (`stock-sync`, `pos`, `inventory`) or `service` (`github`, `jira`, `sentry`, `port`), `x`/`y`, `provider`, `check` | `DisplayState` from `contract/types` | V2 mixes projects and provider services as nodes; V1 keeps providers in `sources`. |
| Entity: spatial | grid `pos`, columns left to right in both languages | free `x`/`y`; B+C derives orbit layout (`fixtures/orbit-layout.ts`) | none | Layout is presentation, but each model owns its own coordinates. |
| Graph edge | `WorldEdge {from,to,kind: authored|provisional|hypothesis, basis: EvidenceReference[]}` | `WorldEdge {id,a,b,cls: group|dep, truth: TruthLabel|unknown, basisKey (i18n key), evidence: string[]}` | none | Two certainty vocabularies (`kind` vs `truth`) and V2 adds a `group` class that V1 does not have; V2 `basisKey` points at copy, V1 carries the evidence objects. |
| Evidence item | `EvidenceReference` (id, classification, freshness, visibility, observation, notReadReason, rule), ids `E-11`…`E-41` plus INV-DEMO-7's `E-1`…`E-7`; titles in `World.evidenceText` and `i18n/strings.ts` | the same type; adds `E-8`, `E-9`; stored in `evidenceById`; reads `EVIDENCE` from `fixture/inv-demo-7.ts` | `EvidenceReference`, `EVIDENCE`, `SOURCES`, `INV_DEMO_7` | The one real shared core. V2 references evidence by id string; V1 by object. |
| Truth classification | `TruthLabel` plus `unknown`; decisions use `proposed`/`approved` | `TruthLabel` plus `unknown`; replay `stage` observed/ingested/correlated/hypothesis/proposed | `TruthLabel` | V2 has no `approved` style (tokens); replay stages are a second axis next to the label. |
| Time | `minutesAgo`/`ageMinutes`/`startedMinutesAgo` (relative only); `Timeline` sorts by `minutesAgo` (CS-F03) | `now` fixed at `2026-11-16T14:09:00Z`; `SourceEvent.at` ISO; `ReplayEvent.clock` `HH:MM`; `Mission.startedMinutesAgo` | `Observation.observedAt`/`ingestedAt` types exist in the shared contract | Three time forms in the two models. Occurred / observed / analysed / human-review times are not distinguished in either screen layer: baseline CS-F03, CS-AC-04. |
| Source | `SourceAuthority` per project (`WorldProject.sources`) | `SourceMeta {provider, kind: integration|data, target, source: SourceAuthority, health}` for six providers | `SourceAuthority`, `Provider` | Same authority type, different aggregation (per project vs global per provider). |
| Source events / incidents | none | `SourceEvent {id, at, provider, axis, tone, key}` (S-1…S-5) | none | V2-only; no V1 equivalent. |
| Investigation | `InvestigationSummary` (INV-DEMO-7, INV-DEMO-9) and the S1 room fixture | `World.investigationId`, `replay: ReplayEvent[]` scripted over INV-DEMO-7 | `INV_DEMO_7` | V2 replay is a script; V1 room reads evidence and timeline objects. |
| Decisions, delivery, attention | `Decision`, `DeliveryItem`, `Attention` | none | none | V1-only; no V2 surface. |
| Agents | `AgentDemo` (state, capabilities, `lastActivityMinutesAgo`), `ActivityEvent` | `Agent {id,key,role}`, `Mission {status, human, events, label, evidence}` | none | Different agent models; V2 missions reference evidence ids including a Technical-only one (MSN-DEMO-2 → `E-5`). |
| Permission | persona views; `evidenceViewFor` (`view/evidence.ts`) turns Technical-only evidence into `{id, label:'unknown', restricted:true}` | `authorizedWorld(world, persona)` removes restricted records, edges and derived text for the Map and B+C only | `Persona`, `EvidenceReference.visibility` | Two filtering strategies: V1 keeps a placeholder with the id; V2 (Map, B+C) removes the record entirely. This is D-1. |
| Copy | `app/src/i18n/**` (`COPY`, `shell.ts`, screens/*) | `V2/i18n/*` (7 files) plus V1 `COPY` for shared strings | `i18n/strings`, `i18n/segments` | Two copy systems. |
| Context / state | `AppContext` (persona, lang, copy, shell, route) | `V2/context.tsx` (persona, lang from the hash route) | none | Two contexts and two URL conventions ([README §2](README.md#2-single-app-composition-proposal)). |
| Provenance basis for health | `DisplayState` claim + basis, rendered through `resolveHealth` | same, via `resolveHealth` (`contract/rules`) | `resolveHealth`, `effectiveFreshness` | Shared rules; fixtures supply different bases for the same product (V1 `RT` health vs V2 `retail-tower` node state). Parity of the *rendered* health for the same product is **NOT VERIFIED**. |

Observations for the owner (no choice made here): the shared core is real (evidence, sources, truth labels, health rules) but entity, edge, time and agent models are separate; some V2 concepts (source events, replay script, missions, `group` edges) have no V1 home, and some V1 concepts (decisions, delivery, attention) have no V2 home; the `kawalys.graph.v1` envelope (`docs/planning/G1/contract-v1/CONTRACT-V1.md`) is a third vocabulary for entities and edges that G1 already scored. The parity tests in [README §4](README.md#4-data-and-trust-contracts) are how a future slice would prove two views show the same permitted facts.
