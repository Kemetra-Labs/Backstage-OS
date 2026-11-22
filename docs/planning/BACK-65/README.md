# BACK-65: V1/V2 UI convergence plan (single React app, migration gate)

Status: **planning only, owner review pending.** Nothing has been installed, edited, committed, merged, deployed or published. No Jira status was changed. This document grants no implementation approval: the owner approves each slice below separately (BACK-65 "Work Mode & Approval").
Baseline: GitHub `main` at `e72d34d` (PR #35 merge, 2026-11-22), read on branch `docs/back-65-ui-convergence-plan`. Facts below come from reading code and docs at that SHA. **Nothing was executed**, so no screen was rendered and no test was run: every runtime claim is "from code reading, not rendered" unless it cites a recorded run.
Ticket text read live on 2026-11-22 **including the 22 Nov item-4 amendment** (fixture/data-contract gap, added 11:13 after this work began); it is addressed in [§4](#4-data-and-trust-contracts) and decision D-6.
> **Update 2026-11-22, after this plan merged (PR #36).** The owner ratified **D-6.2/B**: a new, independent canonical Kawalys Domain & Evidence Model is the future single data authority. Neither V1 `contract/world.ts` nor the V2 world becomes canonical, and `kawalys.graph.v1` stays a graph interchange contract. The reviewed convergence record also corrected the slice order and dispositions D-1 to D-6. Sources: [Convergence review + D-6.2/B](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/89391147) and [R2 decision pack](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/89456817). The sections below keep their original text and mark what changed. D-6.2/B is a direction only: the schema, ID mapping, ADR and implementation stay approval-gated. Related evaluation: [BACK-70 memo](../BACK-70/DECISION-MEMO.md).

Context: [BACK-65](https://rahmaqanater.atlassian.net/browse/BACK-65) · parent [BACK-40](https://rahmaqanater.atlassian.net/browse/BACK-40) · [Unified Execution Plan](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/89456641) · [Cross-screen UX baseline](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/88539196) · [Experience vNext](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/85688334) · [BACK-36](../BACK-36/README.md) · [BACK-30 note](../../qa/kawalys-frontend/BACK-30-nondisclosure.md) · inventory and evidence tables: [INVENTORY.md](INVENTORY.md)

## 0. Recommendation (TL;DR)

1. **One app, V1's shell as the host.** Keep `app/index.html` and `app/src/shell/AppShell.tsx` as the canonical entry. V1 owns Home, Portfolio, Investigation, Evidence and Decisions. The hybrid V2 surfaces (B+C Mission Map, Source Observatory, Mission Replay, Agent Flight Deck) arrive as lenses inside that shell, one slice at a time, built in a separate transitional entry so V1 files are not touched by the lens ports until parity is shown (the privacy and CI slices S2 and S3 are separate, separately approved changes).
2. **Privacy first, then pixels.** No V2 surface is ported until it reads permission-scoped data. Today four V2 surfaces read the raw `WORLD` ([§5](#5-privacy-and-quality-gates)). That work already has a ticket, [BACK-66](https://rahmaqanater.atlassian.net/browse/BACK-66), and so does the CI gate, [BACK-67](https://rahmaqanater.atlassian.net/browse/BACK-67). This plan reuses both.
3. **Three owner decisions are open at the top level: D-2 and D-6 gate the unified shell and adapter slices, D-1 gates S2 and the final V1 panels, and D-3 to D-5 gate specific slices** ([§8](#8-owner-decisions-needed)): (a) V1 itself shows restricted placeholders, ids and counts, which conflicts with the ratified M05-D05-B rule; (b) the URL/router grammar, which the baseline says is not selected; (c) which contract is the single authority for the synthetic world. The ticket says to pick no canonical world prematurely, so this plan maps the two models and leaves the choice to the owner. *Update 2026-11-22:* (c) is now decided as D-6.2/B, an independent canonical model, and (a) is settled as already-ratified policy M05-D05-B (see §8).
4. **No visual choice is made here.** Gold vs cyan, Inter vs Manrope, and font bundling are owner design calls. The plan proposes an additive semantic alias layer that maps to both token sets.

## 1. Screen-by-screen disposition matrix

Labels: **KEEP V1** · **ADOPT HYBRID** (V2/B+C visual and interaction, V1 data and rules) · **REUSE COMPONENT** · **DEFER** · **RETIRE AFTER PARITY** (no deletion without a separate owner approval and parity evidence). Path prefixes: `S/`=`app/src/screens/`, `V2/`=`app/src/design-lab/v2/`.

### 1a. V1 React routes (`app/src/nav/routes.ts`)

| V1 route | Final destination | Disposition | Why / dependency |
|---|---|---|---|
| `#/` Home (`S/Home.tsx`) | Home | **KEEP V1** | No V2 counterpart. Restricted-count rule is open ([D-1](#8-owner-decisions-needed)). |
| `#/portfolio` (`S/Portfolio.tsx`) | Portfolio | **KEEP V1** | BACK-49 wires this screen to real data. A Mission Map lens links out of it; the map does not replace it ("don't duplicate a screen because V2 has one"). |
| `#/project/:id[/:component]` (`S/Project.tsx`) | Project Intelligence | **ADOPT HYBRID** | Keep Status, Delivery, Risks and Component panels. *Proposed:* replace `S/project/MapPanel.tsx` + `components/DepGraph.tsx` with the B+C map composition (owner call, D-3). Would close CS-F02 (narrow view forces the table and hides the Map switch, `MapPanel.tsx:39,84`). `ComponentPanel` restricted row is CS-F01 ([D-1](#8-owner-decisions-needed)). |
| `#/investigation/:id` (`S/InvestigationRoute.tsx`, `InvestigationRoom.tsx`, `SummaryRoom`) | Investigation Room | **KEEP V1** | Blueprint v4 / C2 baseline; BACK-50 target. Mission Replay is reached from it as a lens. |
| `#/evidence/:id?from=` (`S/Evidence.tsx`) | Evidence Explorer | **KEEP V1** | No V2 counterpart. |
| `components/EvidenceDrawer.tsx` | Shared modal evidence detail | **REUSE COMPONENT** | Only modal pattern in either system (portalled, `#root` inert, focus trap, Esc). V2 inspectors are docked, with no dialog role or focus trap. |
| `#/decisions`, `#/decisions/:id` | Decisions | **KEEP V1** | No V2 counterpart. Display-only; V2 `PRODUCT.md` also allows no action control. |
| `#/agents` (`S/Agents.tsx`) | Agents | **ADOPT HYBRID** | Flight Deck visuals on top of V1 `view/agentView.ts`. Review stays display-only (CS-AC-12). |
| `#/sources` (`S/Sources.tsx`) | Sources | **ADOPT HYBRID** | Observatory's three independent source readings; V1 `DimensionsPanel`/`ProductTable` stay as the table fallback. |
| `notFound` (`S/NotFound.tsx`) | Not found | **KEEP V1** | V2 silently falls back to Mission Map for unknown screens; the unified router must keep V1's `notFound`. |
| `components/{Panel,ScreenHeader,Breadcrumbs,Segmented,Text,L}` | Shared base | **REUSE COMPONENT** | Presentational; used across about 40 files. |
| `components/{TruthChip,HealthTriad,SourceChip,StateBlock}` | Trust and state vocabulary | **REUSE COMPONENT** | Carry the semantic rules (unknown never renders healthy). V2 has no loading/error block, only `.kv2-empty` ([BACK-62](https://rahmaqanater.atlassian.net/browse/BACK-62)). Chip-family choice is proposed (D-3). |
| `components/{Ledger,StageMap,EvidenceList}` | Investigation Room parts | **REUSE COMPONENT** | Stay with the KEEP V1 Investigation Room. `EvidenceList` shows restricted ids (§5a, D-1). |
| `components/Timeline.tsx` | Chronology | **REUSE COMPONENT**, successor in S8 | Single relative clock (CS-F03). |
| `components/DepGraph.tsx` (+ `DepTable`) | Project dependency map | **RETIRE AFTER PARITY** | Only if D-3 confirms the B+C map replaces it. |
| `shell/{AppShell,TopBar,Sidebar,DemoSearch}` | Host shell | **KEEP V1** / **REUSE COMPONENT** | `Sidebar` hard-codes `RT` and `INV-DEMO-7` as nav targets: replaced by the project-context model ([§2](#2-single-app-composition-proposal)). `DemoSearch` becomes the one scoped search (S1/S5). |

### 1b. V2 lab and B+C (`app/v2.html`, `V2/`)

| V2 surface | Final destination | Disposition | Why / dependency |
|---|---|---|---|
| `V2/screens/MissionMapBC.tsx` + `V2/bc/*` (reachable only via `?concept=bc`) | Mission Map lens | **ADOPT HYBRID** | Owner selected B+C (K-UX-HYBRID-MAP, `docs/design-lab/hybrid-map/SPEC.md`). It is not in the V2 nav today. |
| `V2/screens/MissionMap.tsx` (classic) | none | **RETIRE AFTER PARITY** | Superseded by B+C. It still has pan/zoom, which the B+C SPEC dropped on purpose: the owner confirms before retirement. |
| `V2/screens/SourceObservatory.tsx` | Sources lens | **ADOPT HYBRID** | Reads raw `WORLD` today ([§5](#5-privacy-and-quality-gates)): scope first (S1). |
| `V2/screens/MissionReplay.tsx` | Replay lens of Investigation | **ADOPT HYBRID** | Blocked on the time contract (CS-F03: V1 `components/Timeline.tsx:20` sorts one relative `minutesAgo`). Raw `WORLD` today. Scripted over INV-DEMO-7. |
| `V2/screens/AgentFlightDeck.tsx` | Agents lens | **ADOPT HYBRID** | Raw `WORLD` today; mission MSN-DEMO-2 references E-5. |
| `V2/navigation/Shell.tsx` | none (V1 `AppShell` hosts) | **REUSE COMPONENT** (patterns only) | Reuse menu-button focus return, Esc close, RTL off-canvas translate. Hard-coded scope buttons (`retail-tower`, `khepri`, `seshat-bi`) are replaced by the project-context model ([§2](#2-single-app-composition-proposal)). |
| `V2/components/{ui,evidence,Icon,SourceRows}.tsx` | Shared components | **REUSE COMPONENT** | Reconcile with V1 `TruthChip`/`StateBlock` through the alias layer ([§3](#3-shared-design-system)); do not keep two chip families. |
| `V2/logic/authorize.ts` | Scoping function | **REUSE COMPONENT** | Becomes the single demo projection `authorizedWorld(world, persona)` used by every surface (S1). |
| `V2/bc/*` (Canvas, Inspector, Panels, Tables, atoms, shared, state) | Mission Map lens internals | **ADOPT HYBRID** | Ported with the map (S6). |
| `V2/logic/{graph,orbit,bc,status,evidence}.ts`, `replay.ts`, `deck.ts` | Lens logic | **ADOPT HYBRID** | Ported with their lens; they read the contract through the adapter (S3b). |
| `V2/i18n/*` (7 files) and `V2/context.tsx` | A second copy system and a second context | **RETIRE AFTER PARITY** | The unified app has one `AppContext` and one copy system: V2 strings are merged into `app/src/i18n` (V2 `copy.test.ts` rules kept: EN/AR parity, brace balance, no composite score). BACK-31 Arabic review still applies to `bc.ts`. |
| `V2/styles/*.css` and `V2/assets/fonts` | Lens styling and bundled Manrope/Cairo | **ADOPT HYBRID** / **DEFER** (fonts) | Styles are re-pointed through the alias layer (S4); font bundling is an owner call (D-3). |
| `V2/fixtures/world.ts` | V2's own synthetic graph | **REUSE COMPONENT** via adapter | Authority question is D-6 ([§4](#4-data-and-trust-contracts)). |
| `docs/design-lab/hybrid-map/*` (plain HTML A/B/C) | Reference | **DEFER** | Design record, not shipped UI. |

### 1c. Root static prototype (`index.html`, `js/`, `css/`) and its unique features

The root prototype is the Playwright-QA'd review prototype and a **required CI check** ([CLAUDE.md](../../../CLAUDE.md)). **This plan proposes no change to it.**

| Root-only item | Disposition | Reason |
|---|---|---|
| `network` ("Customers & Branches", `js/network.js`) | **DEFER** | No React equivalent; imagined tenant layer. CLAUDE.md: customers never sign in to Mission Control. Needs its own owner decision. |
| `design-system` screen (`js/design.js`) | **DEFER** | Reference only; the unified design system is [§3](#3-shared-design-system). |
| Ctrl+K command palette, project filter | **DEFER** | V1 `shell/DemoSearch.tsx` and V2 shell search exist; one search arrives with the shell slice, scoped per [§5](#5-privacy-and-quality-gates). |
| Source-state simulator (`S.src` ok/stale/down) | **DEFER** | Valuable for QA of "unknown is never healthy" (CS-AC-08); candidate to become a test-only fixture switch. |
| Root `decisions`/`agents` with local approvals and simulated runs | **DEFER** | Contradict the display-only rule (no approve/stop/run). Not migrated. |
| Root `operations`, `sources` (generic placeholder) | **DEFER** | Stubs. |

## 2. Single-app composition (proposal)

**Not selected by the owner**: the baseline §3.5 holds URL/query/hash encoding, route additions, storage and router library as undecided. Everything here is a proposal for the owner gate [D-2](#8-owner-decisions-needed).

**Today (read from code):**

| | V1 (`app/src/nav/routes.ts`, `App.tsx`) | V2 (`V2/navigation/route.ts`) |
|---|---|---|
| Route shape | Path style: `#/project/RT/stock-sync`, `#/evidence/E-1?from=INV-DEMO-7` | Flat: `#/mission-replay?persona=&lang=&scope=&node=&src=&evt=&msn=` |
| persona/lang | Held in React state, mirrored to the **search** part with `replaceState`; hash is route only | In the **hash**; the search part only seeds the first load |
| Unknown route | `notFound` | silently defaults to Mission Map |
| Selection restore | screen-local; none across screens (CS-F04) | per-screen params; none across V1/V2 |
| Project context | project id (`RT`, `KH`, `SB`) | `scope` (`retail-tower`, `khepri`, `seshat-bi`) |

**Options:**
- **A (recommended): extend V1's path grammar**, keep persona/lang in the search part, and carry V2's selection as hash query params: `#/map?node=stock-sync`, `#/sources?src=sentry`, `#/investigation/INV-DEMO-7/replay?evt=R-4`, `#/agents?msn=MSN-DEMO-5`. Parser keeps the V1 id allowlist and `notFound`. Existing V1 links keep working; V2 lab hashes (`#/mission-replay?…`) stay valid inside the lab only.
- **B: adopt V2's flat grammar.** Rewrites all nine V1 route targets and the V1 e2e targets that use them; breaks shared review links. Not recommended.
- **C: bridge both grammars.** Two parsers for the whole migration; defers the choice and doubles the test matrix. Acceptable only as a transitional adapter inside S5.

**Canonical entry and context model (proposal):**
- Canonical entry `app/index.html` + `app/src/main.tsx` + `AppShell`. During migration the unified shell is built in a **separate entry** (as BACK-27 did with `v2.html` and its own Vite config), so V1 is not edited until parity; at the end that entry is folded into `index.html` in one reviewable slice. Flag alternative: a query flag inside `index.html` would touch V1 files in every slice, so it is not recommended.
- One `AppContext` owns persona, language and a **project/mission context** (`projectId`, selected component/source/event/run). Selection is restored on Back to Context, and cleared when the persona changes to one that cannot see it (baseline §3.3–3.4). Mapping `scope` ↔ `projectId` needs an id adapter ([§4](#4-data-and-trust-contracts)).
- Where things live: **Mission Map** `#/map` (and as the Project panel); **Source Observatory** `#/sources`; **Investigation/Replay** `#/investigation/:id` with a Replay lens; **Agent Flight Deck** `#/agents`; **Portfolio** `#/portfolio`. Each lens carries context and never grants access.
- The isolated V2 lab (`v2.html`) remains for comparison until the owner approves retirement; so do V1 routes and the root prototype.

## 3. Shared design system

Facts (details and values in [INVENTORY.md](INVENTORY.md#4-tokens)). **No visual decision is made here.**

| Topic | Fact (from code at `e72d34d`) |
|---|---|
| Identical in V1 and V2 | Radii 6/10/14, easing `cubic-bezier(.22,1,.36,1)`, mono stack, the four truth roles map to the same hues (observed→green, correlated→blue, hypothesis→amber, proposed→violet). |
| Owner design calls | Accent **gold (V1) vs cyan (V2)**; UI font **Inter local stack (V1, no font files) vs Manrope + Cairo bundled woff2 (V2)**; base size 15px (V1) vs 13.5px (V2). |
| Only one side has it | V1 `--apr` (approved) and `--gold*`; V2 type scale, shadow, duration and bloom tokens. V2 `DisplayLabel` includes `approved` but V2 CSS has no approved style. |
| Neither has | Semantic ok/stale/down tokens (both use raw colours plus classes or `data-tone`), spacing scale, z-index scale, breakpoint tokens, light/high-contrast/forced-colors modes. |
| Breakpoints | V1 mobile-first, nav switches at 1024; V2 desktop-first, nav drawer at 860; root 1100. They disagree. |
| Reduced motion | Blanket CSS rule in both (`app/src/styles/app.css:180`, `V2/styles/base.css:258`); V2 also checks in JS (`bc/state.ts:17`). |
| RTL | Both use logical properties; V1 also swaps the drawer animation, V2 flips selected transforms. Technical IDs isolated by `bdi.ltr` (V1) and `.kv2-ltr` (V2). |
| Evidence pane | V1: modal drawer, focus trap, `inert` root. V2/B+C: docked inspector, no `role="dialog"`/`aria-modal`. **Neither implements the baseline's mobile Bottom Sheet**, which baseline §5 and CS-AC-09 require for all four lenses, not only the Map (MM-AC-04): a grep for "sheet" finds only a comment in `V2/styles/bc.css:259` saying the SPEC's sheet was replaced by a stacked layout at 1180px. Not rendered, so unconfirmed. |
| Isolation | V2 CSS is `.kv2-` scoped and `scope.test.ts` enforces tokens-only colours, no network, no V1 stylesheet import. The unified app removes this isolation on purpose, so the test must be replaced by a unified equivalent in S4, not deleted. |

**Proposal:** a thin **semantic alias layer** (one new CSS file, no existing CSS edited) that defines roles such as `--kx-surface`, `--kx-ink`, `--kx-accent`, `--kx-status-ok/warn/bad/unknown`, `--kx-truth-obs/cor/hyp/pro/apr`, `--kx-focus`, `--kx-radius-*`, `--kx-motion-*` and points them at the V1 or V2 variable. The owner's accent/font decision then changes one mapping, not two systems. No package is added. Shared components keep their current class names until each is ported.

**Component reuse decisions (all proposed; owner call under D-3):** one chip family (V1 `TruthChip`/`HealthTriad` semantics, restyled through the alias layer; V2 `ToneChip`/`StatusChip` not duplicated), one state block (V1 `StateBlock`, extended; V2 gets loading/error from it), one modal drawer (V1 `EvidenceDrawer`) plus the baseline's always-present compact desktop Inspector (V2's docked pattern) and a Bottom Sheet on mobile, one `Segmented`. Per-label shape language (V1 solid/dashed/dotted/double vs V2 hypothesis dashed, proposed dotted) must be tabulated before merging: NOT VERIFIED here.

**Quality bar:** no decoration-only charts and no unsupported health scores (V2 `copy.test.ts` already bans composite scores); every map/timeline has an accessible list/ledger carrying the same facts (CS-AC-11).

## 4. Data and trust contracts

- **Two synthetic worlds exist today.** V1 screens read `app/src/fixture/world.ts` (`WORLD`: projects `RT`/`KH`/`SB`, evidence `E-11`…`E-41`). V2 builds its own graph in `V2/fixtures/world.ts` (nodes `retail-tower`, `stock-sync`, `inventory`, edges `d1`…`d8`, source events, replay, missions) on top of V1's `app/src/fixture/inv-demo-7.ts` (evidence `E-1`…`E-7`, sources, INV-DEMO-7; V2 adds `E-8` and `E-9` in its own fixture). They share evidence ids and sources only through `inv-demo-7.ts`; entity ids differ (`retail-tower` vs `RT`). Whether each V2 node maps one-to-one to a V1 component is **NOT VERIFIED**.
- **What V2 already reuses from V1** (five modules, TypeScript only): `contract/types`, `contract/rules`, `fixture/inv-demo-7`, `i18n/strings` (`COPY`), `i18n/segments`. V1 imports nothing from `design-lab`.
- **Field-level comparison** (entity, graph, evidence, time, source, permission; V1 `contract/world.ts` vs V2 `V2/types.ts`) is in [INVENTORY.md §8](INVENTORY.md#8-v1-and-v2-world-models-field-by-field). Headline differences: different entity ids and shapes (V1 `WorldProject`/`WorldComponent` with grid `pos`; V2 `WorldNode` with x/y, kind product/project/service); two edge vocabularies (V1 `kind` authored/provisional/hypothesis with `EvidenceReference[]` basis; V2 `cls` group/dep plus `truth` and i18n `basisKey` with evidence ids); two clocks (V1 relative `minutesAgo`; V2 ISO `at`, `HH:MM` `clock` and a fixed `now`); V2-only source events, replay script and missions; V1-only decisions, delivery items and attention lists.
- **Authority is an owner decision (D-6), not a plan decision.** The ticket says to define ONE domain/evidence-contract authority with explicit adapters and to pick no canonical world prematurely. Options for the owner: **(i)** `app/src/contract/` stays authority and V2 is adapted to it; **(ii)** adopt or extend the already owner-approved `kawalys.graph.v1` contract ([CONTRACT-V1.md](../G1/contract-v1/CONTRACT-V1.md), PR #29) as the authority both worlds project from (this extends an owned contract; it does not create a second model); **(iii)** keep both until S3b's mapping shows which differences are real. As advice for D-6 only: start with **(iii)** and move to **(ii)** if the mapping supports it, because the typed evidence model [BACK-43](https://rahmaqanater.atlassian.net/browse/BACK-43) is still To Do (checked 2026-11-22).
- **Decided 2026-11-22 (D-6.2/B), superseding options i–iii above:** a **new, independent** canonical Domain & Evidence Model. It is neither (i) nor (ii): V1 `contract/` and the V2 world are *inputs* to it, not the authority, and `kawalys.graph.v1` stays graph-specialized. It is one domain model, not a second app or a rewrite. Invariants: one logical authority; permission scoping before any count, status, timeline, search or accessible text (M05-D05-B); Unknown is not Healthy; observed / inferred / hypothesis / human decision kept distinct. Still open: entities and ID mapping ADR, time semantics, type-level contracts, and everything server-side (X02/X04).
- **Adapter slice S3b** (after D-6; under D-6.2/B the authority is the new independent model): projections from the chosen authority to V1-compatible readable screens and to V2/B+C visualizations, with one id map (`RT`↔`retail-tower`, components↔nodes: **not yet verified one-to-one**). Requirements carried from the ticket: consistent ids, scoped visibility, Unknown/Fresh/Stale semantics, source provenance, clock distinctions and typed inference classes across the same scenario; no second independent state or graph truth; existing fixture labs and consumers stay until individually approved slices and verified parity; no backend or real-source API work.
- **Parity tests (S3b acceptance):** render the **same permitted fixture** through the V1-derived and the V2-derived surface for each shared concept (a component's health and freshness, an edge's certainty, an evidence row, a source's three readings) and assert equal ids, labels and counts in EN and AR; plus negative restricted-evidence and derived-status leak tests, coordinated with BACK-66; plus navigation continuity (Map → Sources → Replay → back). All NOT RUN.
- **Trust rules carried unchanged:** Unknown is never Healthy; source connectivity, freshness, analysis and health stay separate; Observed/Correlated/Inferred/Proposed/Approved/Unknown are never collapsed; "Reported Completed" never becomes "Success" without independent evidence (baseline §4). Demo data is labelled Synthetic Demo on every surface.
- **Out of scope here:** real data, AI, APIs, credentials. Real wiring is BACK-49/50/57 ([§7](#7-integration-handoff)).

## 5. Privacy and quality gates

**Demo filtering is not authorization.** Every row below is client-side presentation over synthetic data. X02/X04 (server-side tenant/source permission, retention, revocation, logging) are **OPEN and not implemented**; nothing here proves enforcement.

The ratified rule (M05-D05-B, quoted in [BACK-30 note](../../qa/kawalys-frontend/BACK-30-nondisclosure.md)): a viewer without Technical-only access must not learn a restricted record exists through rows, IDs, timestamps, provider hints, counts, links, rollups, status/freshness labels, accessible names, tooltips or alternate views.

### 5a. Non-disclosure matrix (E-5 is the only Technical-only record in the V2 fixture)

| Surface | Reads | Exposure vector (from code reading, not rendered unless noted) | Filtered before counts? | Slice |
|---|---|---|---|---|
| V2 Mission Map, B+C | `authorizedWorld(WORLD, persona)` (`MissionMap.tsx:60,389,416`, `MissionMapBC.tsx:28`) | Closed by BACK-30: row, id, count, edge d4 and Inventory wording removed. Recorded e2e and unit tests ([BACK-30 note](../../qa/kawalys-frontend/BACK-30-nondisclosure.md)). | **Yes** | done (BACK-30) |
| V2 Source Observatory | raw `WORLD` (`SourceObservatory.tsx:93,237`) | Evidence tab lists every evidence ref for the provider (`:259`). For Sentry that includes E-5 as a "Restricted to Technical" placeholder; Owner also sees the id (`V2/components/evidence.tsx` `showId`). Provider/age on the restricted row look suppressed in code (`provider: null`): **not rendered**. | No | S1 / BACK-66 |
| V2 Mission Replay | raw `WORLD` + `INV_DEMO_7.evidence` (`MissionReplay.tsx:27`) | Evidence list includes E-5 placeholder; the heading/KPI count uses `INV_DEMO_7.evidence.length` (includes E-5). **`e2e-v2/structure.spec.ts:118-120` (test title at 118, assertion at 120) asserts Owner sees "Restricted to Technical" here, the opposite of M05-D05-B: S1 must invert it.** The same test swallows its negative assertion (`not.toContainText('Sentry', …).catch(() => undefined)`, line 121), so it is not valid non-disclosure evidence (BACK-66 owner finding, confirmed in the file). BACK-66 also asks whether the replay row that `authorizedWorld` keeps with its evidence nulled still discloses the hidden record by its metadata (time position, gap); **not yet audited**. | No | S1 / BACK-66 |
| V2 Agent Flight Deck | raw `WORLD` (`AgentFlightDeck.tsx:36`) | MSN-DEMO-2 lists `E-5` + `E-9`; its evidence rows show the E-5 placeholder; mission `events` count and `label` unscoped (named in the BACK-30 note). | No | S1 / BACK-66 |
| V2 shell search | raw `WORLD` (`Shell.tsx:36-39`) | Builds hits from node titles, providers, `R-n` and `MSN-n` labels. No E-5 text today only because fixture wording happens not to carry it. Nontechnical can search and see `MSN-` and `R-` ids that the Deck hides from them (persona id inconsistency). | No | S1 / BACK-66 |
| V2 source-level captions | source authority | Sentry stale state and `sev.sentry*` captions come from source authority and are shown to all by design (BACK-30 note). | n/a | none |
| V1 evidence views (`app/src/view/evidence.ts:17`) | `evidenceViewFor` | Technical-only evidence returns `{id, label:'unknown', restricted:true}`: **the id and the restricted flag are shown**; `ComponentPanel.tsx:25` renders a restricted note (CS-F01). | per item | S2 (owner [D-1](#8-owner-decisions-needed)) |
| V1 Home (`view/homeView.ts:111`) | `restrictedCount` | Counts restricted items and shows the count. | counted, not hidden | S2 |
| V1 Decisions (`view/decisionView.ts:54-61`) | `summariseEvidence` | `restricted` count returned beside `total`; the Decisions list note prints it (`screens/decisions/DecisionRowItem.tsx:24`). | counted | S2 |
| V1 evidence rows (`components/EvidenceList.tsx:36-45`, `screens/investigation/EvidenceLinks.tsx:26`, `screens/decisions/ObservedPanel.tsx:25`) | `EvidenceView` | A restricted item still renders as a list row with its **id in `data-evidence` / `data-evidence-row` and in the "open evidence" button label** (`copy.openEvidence(e.id)`), plus a Not-read style. | per item | S2 |
| V1 deep link and sibling index (`#/evidence/E-12`, `screens/evidence/Related.tsx`) | route param | The id is in the URL and in the Explorer's sibling index, "restricted and unread included" (`app/e2e/evidence.spec.ts:105,202` assert this on purpose). | n/a | S2 (D-1) |
| V1 search (`nav/search.ts`) | persona filter | `technicalOnly` filter is applied **before** matching and the live-region count. Evidence is findable by id for allowed personas only. | **Yes** | none |

**Conflict, recorded not resolved ([D-1](#8-owner-decisions-needed)):** V1 deliberately shows a restricted placeholder, id and count (its views and e2e specs encode this; the ticket says preserve Blueprint v4/C2), while M05-D05-B forbids any existence cue. I did not re-read Blueprint v4/C2 text, so which decision wins for V1 is the owner's call. **Blocks:** S2 and the final unified Evidence, Home, Decisions and Project panels. It does not block S1 or the plan.

### 5b. Test gates for the unified app (all NOT RUN)
- Negative non-disclosure matrix: Owner/Nontechnical × EN/AR × map/list/search/inspector/deep link/persona switch, probing visible text and every `aria-label`, `title`, `alt`, `data-*` (reuse the `leaks()` probe in `e2e-v2/nondisclosure.spec.ts`).
- V1 needs the same probe: the `leaks()` helper exists only in `e2e-v2`; no V1 spec scans `aria-label`, `title`, `alt` and `data-*` for restricted ids. A shared probe is part of S1/S2.
- Fixture traceability (baseline DG-1, CS-AC-13): each run records the synthetic fixture version/hash, app SHA, steps, expected/actual and PASS/FAIL/BLOCKED/NOT RUN. A frozen permitted/restricted/partial/stale/unknown fixture is **NOT VERIFIED** today.
- Renderer and motion choices stay with [BACK-22](https://rahmaqanater.atlassian.net/browse/BACK-22) and [BACK-24](https://rahmaqanater.atlassian.net/browse/BACK-24) (baseline DG-3: evaluations, not runtime approvals); S6 adds no dependency.
- Cross-screen journey CS-AC-01 (Map → Sources → Replay → Agents → Investigation → back) with restricted, stale, disconnected and empty-scope fixtures.
- PR #35 known gaps carried as gates: no X02/X04 enforcement; no manual native-Arabic ([BACK-31](https://rahmaqanater.atlassian.net/browse/BACK-31)), screen-reader or device pass ([BACK-32](https://rahmaqanater.atlassian.net/browse/BACK-32): its V2 WebKit run was BLOCKED); no CI V2 e2e ([BACK-67](https://rahmaqanater.atlassian.net/browse/BACK-67)); SonarCloud S6845 ([BACK-33](https://rahmaqanater.atlassian.net/browse/BACK-33)) awaiting a login.
- **Jira/code mismatch to reconcile (not changed here):** BACK-30–35 are still "To Do" in Jira although their code and evidence merged in PR #35 (several items correctly remain open: 31, 32, 33 need a person).

### 5c. Responsive, a11y and motion test plan (per surface, all NOT RUN)
Run each lens at 320/375/768/1440 px, EN/LTR and AR/RTL, keyboard-only, visible focus, 44px targets, 200% zoom/reflow, `prefers-reduced-motion`, screen reader (NVDA/VoiceOver, manual: BACK-32 kit), and a no-JS-chart fallback where the table/list is semantically complete. Acceptance maps to MM-AC-01–09, CS-AC-01–14 and the Observatory/Replay/Agent ACs in the baseline §8–9. The V2 mobile list-first default (`bc/state.ts:22`, ≤640px) and the missing Bottom Sheet (MM-AC-04) are explicit open items. Browser scope today: V1 chromium + webkit in CI; V2 chromium only, not in CI.

## 6. Incremental migration slices

Dependency order. **Every slice ends at a STOP before commit/PR; the owner approves it separately.**

> **Corrected order (2026-11-22, [convergence review §3](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/89391147)):** S0 → S1 (BACK-66) → S2 → S3 (BACK-67) → S3b → S4 → S5 → S6–S9 → S10. S5 starts **only after S1, S2, S3, S3b and S4**. That adds S2 to the S5 dependencies listed in the table. S3b builds projections from the D-6.2/B independent model, not from a choice among options i–iii. Where the table and this note differ, this note wins. PR #37 merged the S1 code; BACK-66 acceptance is still open. "Owner" = approving authority; implementer is assigned by the owner. Jira refs are existing tickets (no new tickets proposed beyond marked **new candidate**).

| # | Slice | Ticket | Depends on | Changed-file boundary | Isolation / flag | Acceptance tests | Rollback |
|---|---|---|---|---|---|---|---|
| S0 | Owner decisions D-1…D-6 recorded | BACK-65 | none | docs only | none | n/a | n/a |
| S1 | Apply `authorizedWorld` to Observatory, Replay, Flight Deck and shell search; invert `structure.spec.ts:118`; recompute Replay/Deck counts from the scoped world | **BACK-66** (existing) | none | `V2/logic/authorize.ts`, `V2/screens/{SourceObservatory,MissionReplay,AgentFlightDeck}.tsx`, `V2/navigation/Shell.tsx`, `V2/fixtures`, `e2e-v2/{nondisclosure,structure}.spec.ts`, unit tests | V2 lab only; V1 and root untouched | Extended `nondisclosure.spec.ts` + `authorize.test.ts`; the inverted test must assert absence (not just flip `toContainText`) and drop the `.catch(() => undefined)`; replay-row metadata audited; Technical unchanged; BACK-30 and V1 regressions rerun | revert the commit |
| S2 | Reconcile V1 restricted ids/counts/placeholders per D-1 | new candidate (under BACK-40, relates BACK-30) | S0 (D-1) | `app/src/view/{evidence,homeView,decisionView}.ts`, `components/EvidenceList`, `screens/project/ComponentPanel.tsx`, V1 tests | V1 behaviour change, own PR | rewritten V1 expectations; existing V1 e2e updated deliberately | revert |
| S3 | `e2e:v2` PR gate (chromium); no WebKit claim | **BACK-67** (child of BACK-63); BACK-68 relates (CircleCI timeout) | S1 (so the new gate does not freeze a test that asserts the opposite of M05-D05-B); before S5 | `.github/workflows/ci.yml` only (non-docs: runs full suite) | additive job/step | deliberate V2 regression turns required check red | revert workflow change |
| S3b | Field mapping, id map and projections from the chosen contract authority to V1-readable and V2/B+C views (D-6; may align with `kawalys.graph.v1`) | **new candidate** (relates BACK-43) | S0 (D-6), S1 | `V2/fixtures/`, new adapter module, tests; existing fixtures untouched | no UI change | same-permitted-fixture parity tests in EN and AR, restricted-leak tests with BACK-66; no second state or graph truth | revert |
| S4 | Semantic alias layer + unified isolation test | **new candidate** (relates BACK-10, BACK-18, both Done) | owner design decisions D-3 | one new CSS file; replaces `scope.test.ts` clauses that block shared tokens | additive, unused until S5 | token-resolution unit test; no literal colours outside token files | delete the file |
| S5 | Unified shell + router (option per D-2) in a separate entry | **new candidate** | S0 (D-2), S1, S3, S3b, S4 | new `app/unified.html`, entry, router and context modules; V1/V2 files unchanged | separate entry + Vite config (BACK-27 pattern) | route-grammar tests, selection restore, `notFound`, persona clear on switch, a11y smoke | delete the entry |
| S6 | Port B+C Mission Map as `#/map` and as the Project map panel; add Bottom Sheet; fix CS-F02 | **new candidate** | S3b, S5 | unified entry modules, `V2/bc/*` reuse | behind unified entry | MM-AC-01–09, CS-AC-09, existing `bc.spec.ts`, 320/375/768; no new dependency (BACK-22/24 stay evaluations) | revert |
| S7 | Port Source Observatory into Sources | **new candidate** | S1, S3b, S5 | unified entry modules | same | Observatory AC-01–10, CS-AC-03, Bottom Sheet and CS-AC-09 | revert |
| S8 | Time contract, then port Mission Replay as the Investigation lens | **new candidate** (CS-F03) | S3b, S5, owner fixture approval | `components/Timeline.tsx` successor, replay module | same | MR-AC-01–12, CS-AC-04 (occurred/observed/analysed times, Order Uncertain), Bottom Sheet and CS-AC-09 | revert |
| S9 | Port Agent Flight Deck into Agents (read-only) | **new candidate** | S3b, S5 | unified entry modules | same | AF-AC-01–14, CS-AC-06, CS-AC-12, Bottom Sheet and CS-AC-09 | revert |
| S10 | Parity audit and retirement proposal; fold unified entry into `index.html` | separate owner approval | S6–S9, BACK-8 evidence | a retirement ticket | V1/V2 labs stay until approved | parity matrix with actual PASS/FAIL/NOT RUN | n/a |

Independent QA/CI plan: per-slice PASS/FAIL/BLOCKED/NOT RUN only (CS-AC-13); the CI runs V1 chromium+webkit today and V2 chromium after S3; WebKit for V2 stays NOT RUN until executed. Rollout/rollback criterion: a slice merges only if V1 and root suites stay green, the non-disclosure matrix passes for that surface, and its isolation lets the change be reverted by deleting or reverting one commit.

**No-duplicate check (acceptance criterion 6), performed 2026-11-22 against Jira BACK:** (1) key lookup of BACK-8, 30–35, 37, 46, 47, 49, 50, 57, 62; (2) JQL `project = BACK AND (summary ~ "convergence" OR summary ~ "V2" OR summary ~ "unified" OR summary ~ "design system" OR summary ~ "tokens" OR summary ~ "shell" OR summary ~ "migration" OR summary ~ "retire" OR text ~ "convergence" OR text ~ "unified shell")` returned BACK-10 (Done: shared React shell and design system foundations), BACK-18 (Done: V2 fidelity), BACK-32, BACK-57, BACK-65, **BACK-66**, **BACK-67**; (3) `key > BACK-62` showed BACK-63–68 only. (4) Second search for the S3b/contract slice: JQL `project = BACK AND (summary ~ "fixture" OR summary ~ "world" OR summary ~ "contract" OR summary ~ "seed" OR summary ~ "adapter" OR summary ~ "parity" OR summary ~ "evidence" OR key in (BACK-43, BACK-61, BACK-65, BACK-66, BACK-67))` returned BACK-8, 13, 20, 21, 29, 30, 43, 44, 49, 50, 54, 55, 60, 61, 65, 66, 67. None is a V1/V2 world-model adapter: BACK-20/21/29 are G1 evaluation fixtures, BACK-43/55 are the real typed-evidence model and persistence, BACK-61 is a backend-based local run and seed (depends on BACK-55 and BACK-58), BACK-60 is test strategy. S3b relates to BACK-43 and BACK-61 but duplicates neither: it adapts synthetic UI fixtures only.
**Result:** S1 = BACK-66 and S3 = BACK-67 already exist and are reused. No ticket covers the alias layer, unified shell, V1/V2 world adapter or lens ports, so S2, S3b and S4–S9 are marked "new candidate" for the owner to create (this plan creates none).
**Anchors re-checked at wrap-up (2026-11-22):** `origin/main` still `e72d34d`; BACK-65 last updated 11:13:01 (item-4 amendment included); BACK-66 last updated 11:13:03 (its inverse-test finding is reflected in §5a and S1); BACK-67 unchanged since 11:07.

## 7. Integration handoff

- **BACK-49 / BACK-50 / BACK-57** wire real Portfolio, Investigation and API calls to the **unified destination**, not to V1 and V2 separately: all data goes through the contract and adapter of [§4](#4-data-and-trust-contracts); no screen gets a private fetch path. Until S5 lands, BACK-49/50 target V1 Portfolio and Investigation (KEEP V1), which stay valid destinations in the converged app. BACK-57 is blocked by this plan (Jira "blocks" link already on BACK-65).
- **BACK-62** (Unknown/error states) lands on the shared `StateBlock` (extended in S4/S5), so V2 lenses inherit loading/error/unknown.
- **Security gates:** [BACK-37](https://rahmaqanater.atlassian.net/browse/BACK-37) architecture authority and [BACK-47](https://rahmaqanater.atlassian.net/browse/BACK-47) pilot decision must be accepted before real wiring; X02 (permission matrix) and X04 (evidence/retention/redaction) must precede any real source access; BACK-30 and BACK-66 stay open until their evidence passes. A persona switch never grants access.
- This plan does **not** block independent backend architecture planning.

## 8. Owner decisions needed

| ID | Decision | Blocks |
|---|---|---|
| D-1 | For V1, does M05-D05-B (no existence cues, no placeholder, no count) override the current restricted placeholder/id/count behaviour (Blueprint v4/C2)? | S2; final Evidence, Home, Decisions, Project panels |
| D-2 | Router grammar: option A (recommended), B or C ([§2](#2-single-app-composition-proposal)); unified entry as a separate file during migration | S5 and everything after |
| D-3 | Accent (gold vs cyan), UI font and font bundling, base size; approve the alias-layer approach; confirm the proposed component choices (one chip family, modal drawer plus compact Inspector plus mobile Bottom Sheet, B+C map replacing `MapPanel`/`DepGraph`) | S4, S6 (and S5, S7–S9 through S4) |
| D-4 | Retire the classic V2 Mission Map once B+C has parity (pan/zoom was already decided "dropped" for B+C on 2026-11-21, `docs/design-lab/hybrid-map/SPEC.md`) | S10 |
| D-5 | Approve creating new tickets for S2, S3b, S4–S9 under BACK-40 | S2–S9 |
| D-6 | Which contract is the single authority for the synthetic world (options i/ii/iii in [§4](#4-data-and-trust-contracts)), after reviewing the field mapping in INVENTORY §8. **Decided 2026-11-22 as D-6.2/B:** a new independent canonical Domain & Evidence Model; schema, ID mapping and ADR still open | S3b and everything that reads the world |

**Dispositions recorded 2026-11-22 ([convergence review §2](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/89391147)):**
- **D-1:** already-ratified policy M05-D05-B applies to V1. No placeholder, id or count for restricted records (S2).
- **D-2:** direction A recommended. Implementation is left to an approved S5.
- **D-3:** V2/B+C visuals with V1 readable evidence. Alias layer is a candidate; final visual details still need review.
- **D-4:** retirement is conditional and needs separate approval.
- **D-5:** no bulk ticket creation. Narrow tickets only on demand.
- **D-6:** see the row above.

## 9. Findings recorded while reading (no change made)

- `app/README.md` says React 18.3.1 and "Vite 5 + React 18", but `app/package.json` and the lockfile pin React 19.3.1 (the local `node_modules` still had 18.3.1). Fix in an approved docs slice, not here.
- `docs/design-lab/v2/README.md` lists four screens and does not mention the B+C pilot or `?concept=bc`; the B+C map is not in the V2 nav.
- Coverage gates in `app/vite.config.ts` cover `contract`, `view`, `i18n`, `nav/routes.ts`, `nav/search.ts` only. Components, screens, shell and `design-lab/**` are not coverage-gated; there is no lint, axe or visual-regression tooling in the repo.
- CI runs the root suite, `app` typecheck + unit tests and V1 e2e, plus a G1 scorer self-check (`.github/scripts/g1-scorer-changed.sh`) when G1 fixture files or `ci.yml` change. It does not run `e2e:v2` or `build:v2`.

## 10. Acceptance criteria map (all NOT RUN: this is a plan)

| BACK-65 acceptance criterion | Where | Status |
|---|---|---|
| Route/screen/component inventory with dispositions, anchored in main | §1, [INVENTORY.md](INVENTORY.md) | Drafted at `e72d34d`; not rendered |
| One navigation sitemap and source-of-truth contract, mapped to V1 and V2/B+C | §2, §4 | Proposal; owner gate D-2 |
| Shared design tokens and reuse decisions, no new packages | §3 | Drafted; owner gate D-3 |
| EN/AR/RTL, a11y, 320/375/768/1440, 200% zoom, reduced-motion, fallback test plan | §5c | Drafted; NOT RUN |
| Cross-screen negative non-disclosure matrix and PR #35 gaps | §5a, §5b | Drafted; X02/X04 open |
| Item 4 amendment (22 Nov): field inventory, one contract authority with adapters, parity and leak tests, labs kept | §4, [INVENTORY.md §8](INVENTORY.md#8-v1-and-v2-world-models-field-by-field), S3b, D-6 | Field map drafted at `e72d34d`; authority **decided 2026-11-22: D-6.2/B independent model** (schema/ADR open) |
| Prioritized reversible slice backlog with no-duplicate check | §6 | Drafted; check performed |
| Independent QA/CI plan, actual PASS/FAIL/BLOCKED/NOT RUN, rollout/rollback | §5b, §6 | Drafted |
| Owner reviews and approves before any migration ticket goes In Progress | §8 | **Pending owner** |

## 11. What this branch does not do

No `npm install`, source edit, CI change, commit, push, PR, Jira update or Confluence publish. Only `docs/planning/BACK-65/*.md` is written, so the docs-only CI path would apply if the owner later approves a PR.
