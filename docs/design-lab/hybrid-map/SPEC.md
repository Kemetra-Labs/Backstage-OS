# Bounded design specification: Hybrid Mission Map, concept B with C's list view (owner-selected 2026-11-21)

Suitable as the brief for a later React/TypeScript implementation. The owner selected this direction on 2026-11-21; that selection is a design decision, **not approval to implement**. It specifies the visual and interaction layer only. It is not approval to build.

Reference render: `out/concept-b-en-1448.jpg`; behaviour: `concept-b.html`, `b.js`, `b.css`, `shared/ui.js`.

## 1. Scope

In: the Mission Map screen of the V2 lab (`app/src/design-lab/v2/screens/MissionMap.tsx`) and the shared atoms it needs. Out: Source Observatory, Mission Replay, Agent Flight Deck, V1, the design-system merge, any backend, adapter, AI call, auth or real source, any new control that acts on the world.

Inherited unchanged: product principles in `app/src/design-lab/v2/PRODUCT.md`; truth rules in `DESIGN.md`; `contract/rules.ts` (`resolveHealth`, `resolveLabel`, `freshnessOf`, `effectiveFreshness`); the control vocabulary rule (`isForbiddenControlLabel`); tokens in `styles/tokens.css`; EN first with real RTL; demo banner.

## 2. Data contract: no new fields

Everything is derived from the existing `World` (`nodes`, `edges`, `sources`, `sourceEvents`, `evidenceById`, `now`). Two derived, pure helpers are added:

- `orbitOf(node): 'inner' | 'middle' | 'outer'` from `node.kind` (`product`, `project`, `service`).
- `orbitPosition(orbit, angleDeg): {x, y}` on a fixed ellipse (centre 500,500 on a 1000 x 860 canvas; radii 200x95, 300x285, 420x400 in the pilot). Angles are presentational constants per node id, kept beside the fixture, not in `World` semantics.

Layout positions (`x`, `y`) in `world.ts` stop being used by this concept (the other screens keep them).

### Figure to derivation (audit trail for "no invented numbers")

| Figure shown | Value | Derivation (all in `shared/data.js`, mirroring `logic/status.ts`) |
| --- | --- | --- |
| Products / projects / services | 2 / 3 / 5 | count of `nodes` by `kind` |
| Active risks | 3 | nodes with `check === 'failing'` (stock-sync) or whose provider source has an issue (Sentry stale, Port unavailable) |
| Service issues | 2 | sources with `connectivity === 'unavailable'` or `freshness === 'stale'`; not-set-up is a state, not an issue |
| Connectivity "3 of 6 reachable" | 3 | sources with `connectivity === 'reachable'` (GitHub, Jira, Sentry) |
| Freshness "2 of 6 within target" | 2 | `freshnessOf`: GitHub 6 of 30 min, Jira 12 of 120 min are current; Sentry 540 of 15 min is stale; Port is unavailable so stale; Datadog and Confluence were never read so unknown |
| Health "1 of 6 confirmed healthy" | 1 | `resolveHealth`: a claim of healthy counts only with at least one observed, current basis; GitHub has E-8; Jira has none; Sentry's E-5 is stale |
| Ring arc and age bar | age / target | `ageMinutes / (ttlSeconds / 60)`: GitHub 6/30, Jira 12/120, Sentry 540/15, Port 1500/1440 |
| "36x target" | 36 | `round(540 / 15)`; shown only when the ratio is at least 1.5 |
| Link classes | 2 / 1 / 1 / 4 (+3 structure) | count of `edges` with `cls === 'dep'` by `truth`; `cls === 'group'` is structure |
| Stale marker on a link | d4 only | edge is classified, has evidence, and every evidence item has `effectiveFreshness !== 'current'` |
| Node chip | per node | `nodeChip()` (check failing > unavailable > not set up > healthy / degraded / down > stale > unknown) |
| Evidence age text | "7 min ago" | `minutesSince(observedAt, world.now)` |
| Observed reads in 24 h | 5 (not displayed in the pilot) | distinct observation ids with label observed and age at most 1440 min |

A unit test must assert this table against `WORLD`, so the derivation cannot drift.

## 3. Layout (breakpoints)

| Width | Layout |
| --- | --- |
| 1181 and up | Top bar 57 px; rail navigation 76 px (same four destinations, icon plus label, `aria-current` on Mission Map); stage fills the rest, height `100vh - 57px`, minimum 760 px; map region leaves 372 px on the inline-end side for the floating inspector (348 px wide, 12 px inset) |
| 901 to 1180 | Map region full width; inspector becomes a bottom sheet (46 % height, max 420 px wide) |
| 641 to 900 | Stacked: title, risk pills, readings, filters, map, legend, timeline, inspector; the shell navigation becomes a horizontal strip |
| 640 and under | As above but **list is the default view** (section 4a); persona selector moves into the menu; every control at least 44 x 44 px |

The map canvas (`.kh-canvas`) is always `direction: ltr`; panels follow the language. In Arabic the inspector moves to the inline-end (left) side and the timeline reads right to left.

## 4. Visual rules

- **Tokens only** (`--kv2-*`); no literal colours; no new hue. Cyan = structure, selection, observed. Amber = attention (failing, stale, hypothesis, overflow). Green only as a Healthy or Observed label. Red only for unavailable.
- **Orbit = kind**, drawn as three dashed ellipses at 55 / 40 / 28 % cyan. An orbit key states "not importance". Node orb size is by kind (hub 124, product and project 58, service 52 px), never by data.
- **Node card:** hub and selected node show title, description, chip (and read line for services); services show title, chip and "age of target min"; others show title and chip. Orb is a native `button` with an `aria-label` of "title, kind, status".
- **Chips:** sentence case, 11 px, glyph plus word (check, triangle, cross, question). Truth chips use check / link / bulb / question.
- **Links:** observed = solid cyan, 2.2 px, soft under-glow, filled dot; correlated = solid blue, ring dot; hypothesis = amber dashed 7/5, diamond; unknown = grey dotted, no marker; structure = faint 1 px, no marker; stale = same pattern at 55 % with an amber ring marker. The legend shows all six.
- **Source ring** (service nodes): arc = `min(ratio, 1)` of the circle; ratio over 1 turns the arc amber and adds an outer dashed ring; a source never read gets a dashed neutral ring. Decorative (`aria-hidden`); the same numbers are printed.
- **Age bar:** track spans 0 to 3x the target with the target tick at one third on every row; fill to the tick when over; past the tick a hatched amber segment to `min(ratio, 3)`; a cut mark at 96 % when the ratio exceeds 3. `role="img"` with text such as "540 of 15 min, 36x target".
- **Readings:** three counters ("3 of 6 reachable", "2 of 6 within target", "1 of 6 confirmed healthy") each with six pips lettered G J S D C P. Pip states: filled cyan, hatched amber, filled red, dashed neutral; the container carries the full text alternative. No combined figure, ever.
- **Horizon timeline:** the six source events in order, labelled "Ordered, not to time scale"; marker colour and fill by tone (ok, warn, bad).
- **Typography:** Manrope and Cairo self-hosted as in V2. Floor all text at 11 px (the pilot has a few 10.5 px labels to fix).

## 4a. List view (selected borrowing from concept C)

The Map / List toggle keeps V2's semantics. In B, **List** replaces the map with three panels in the same shell (top bar, rail, floating inspector with readings footer), then the signal timeline:

1. **Systems ledger.** One row per system, grouped products, projects, services: kind icon (tone from the status chip), title, status chip, evidence count. Row = native button, `aria-pressed`, selected row has a 3 px cyan inline-start bar. Kind is available to assistive technology (visually hidden), not repeated visually.
2. **Source readings matrix.** One row per source (6, including Datadog and Confluence which have no node). Columns: Source, Connectivity (chip), Evidence freshness (age bar with row-level minutes), Target health (chip, "Unknown" unless confirmed). The three column headings carry the three counters ("3 of 6 reachable", "2 of 6 within target", "1 of 6 confirmed healthy"). Under 641 px each row becomes a card (source name, then labelled readings), because the four columns do not fit; the counters then live in the readings block above the list.
3. **Links between systems.** From, To, How we know (truth chip or "is part of"), Basis, with a Stale chip on stale links. 11 rows.
4. **Signal timeline** as a static panel (same six events, "Ordered, not to time scale").

Filters apply to the ledger and links (dim in the map, hide in the list, as V2). Selecting a row updates the inspector exactly as selecting a node does. The map and the list share one selection state.

## 5. Interaction and motion

- Select: click or Enter on a node or table row; the inspector tab (Overview / Evidence / Sources, arrow keys, mirrored in RTL) stays.
- Arrow keys move focus to the nearest node within 60 degrees (`nextByDirection`, unchanged).
- Filters (All, Products, Projects, Services, Risks) dim, never remove. Scope select and Map / List toggle as in V2.
- **Selection trace:** on selecting a node, links that are not its own drop to 18 % opacity and one 3 px trace sweeps along each of its own links once, 720 ms, `cubic-bezier(0.22, 1, 0.36, 1)`, `stroke-dashoffset` and `opacity` only. No loop, no ambient motion.
- **First-load orbit (owner decision D-24.1, BACK-24, 2026-11-21):** the only motion allowed without a user action. On first load the orbits draw once and the nodes settle inward (about 900 ms, `transform`, `opacity` and `stroke-dashoffset` only), then everything rests in the same static state the reduced-motion render shows. It plays once per page session; the "already played" flag is an in-memory variable (D-24.8), so a reload plays it again and nothing is stored. It carries no information. The no-library baseline builds it with CSS or the Web Animations API (D-24.10). It must not read as a live feed: no loop, pulse or idle drift follows it. Details and limits: `docs/planning/BACK-24/README.md` section 3.
- **Reduced motion** (`prefers-reduced-motion` or the in-app setting): neither the trace nor the first-load orbit is rendered; the static dim and highlight remain, so no information depends on motion. Test: zero running animations.
- No pan or zoom in this concept (the pilot dropped V2's); decide separately whether to keep them. If kept, keep the buttons and keyboard keys from V2.

## 6. Accessibility and i18n

- Every graphic has a text or table alternative: the List view (systems and links tables, same 10 rows and 11 links), the readings text, the age bar `role="img"` text.
- Focus: visible ring on every node, tab, filter and table button; skip link first; inspector reachable after the map in DOM order.
- Arabic: reuse V2 strings; new strings marked `// n.` in `shared/data.js` need native review before release. Latin runs (product names, ids, providers) inside Arabic are isolated with `bdi dir="ltr"` (V2's `Lt` helper). Latin digits.
- Targets: at least 44 x 44 px on touch widths.

## 7. Performance budget (from the pilot, Chromium)

At most about 600 DOM elements and 200 SVG elements on the map screen; no `backdrop-filter`; no more than one filter; one-shot animations only (the first-load orbit included). Re-measure after the port.

## 8. Acceptance (port)

1. The derivation table above passes as a unit test against `WORLD`.
2. Adapt `tools/checks.py` into the V2 Playwright suite: no `%`; exactly one node and one source reads Healthy; the seven named chip states; 10 nodes all focusable buttons; arrow keys; List shows the ledger (10 systems), the matrix (6 sources) and the links table (11 links); AR keeps `.kh-canvas` LTR, flips panels, isolates every Latin run; no forbidden control vocabulary; zero animations under reduced motion; no overflow at 320 / 375 / 768 / 1440; touch targets at 375; every request same-origin.
3. Add a regression in `findings.spec.js`-style for any bug found, confirmed to fail against the old behaviour.
4. WebKit run in addition to Chromium (not done in this pilot).

## 9. Open decisions for the owner

1. ~~Pick A, B or C~~ Decided: B with C's ledger and matrix as list and mobile view.
2. ~~Rail or sidebar~~ Decided 2026-11-21: **76 px icon rail**, same four destinations.
3. ~~Pan and zoom~~ Decided 2026-11-21: **dropped**; orbits by kind plus selection replace them.
4. Sentence-case chips (removes V2's recorded Hallmark chip FAIL) with the caps eyebrow kept: **not yet confirmed**; the pilot assumes yes, and it is a reversible CSS change.
5. Arabic review owner for the new strings: **open** (a name, not a choice).
6. Dependencies (motion library, D3 maths): **deferred by the owner pending an investigation of benefit against risk**. Until decided, the port uses no new libraries (CSS and the Web Animations API). WebGL stays deferred whatever is decided. See [ENHANCEMENT-NOTE.md](ENHANCEMENT-NOTE.md).

## 10. Deviation record: phone map legibility (BACK-34, 2026-11-21)

**Decision (owner, 2026-11-21): minimal fix.** The B+C layout and the stretched orbit geometry stay. The canvas aspect ratio changes per breakpoint while the SVG draws the 1000 x 860 viewBox with `preserveAspectRatio="none"`. That stretch is kept on purpose: uniform scaling would need a second phone layout, which is a different design and is not built here. Node coordinates are unchanged.

What changed:

- **Link markers moved from SVG to HTML.** Each observed, correlated or hypothesis link (never `group`, never `unknown`) gets a `span.kv2-bc-mk` inside `.kv2-bc-canvas`, positioned at the link's midpoint with the same canvas fraction and `--pad` inset as the node buttons. `data-shape` is `circle` (diamond for hypothesis), `data-dim` and `data-stale` mirror the edge. Size is 10 px (diamond 9 px side) and 12 px (diamond 11 px) at 640 px and below, so a circle stays a circle on a stretched canvas. Colour tokens are unchanged. Markers have no transition, so reduced motion needs no override. The canvas stays `direction: ltr` in Arabic, so they do not mirror.
- **Strokes use `vector-effect: non-scaling-stroke`** on edge paths and orbit ellipses, so line weights do not stretch with the canvas.
- **Orb sizes on narrow canvases.** The stylesheet's narrow-canvas orb sizes never took effect because the node's inline `--orb` overrode them. The inline value is now `--orb-d` (desktop size) and the stylesheet derives `--orb` from it. At a canvas width of 700 px and below the orbs are 44 px (hub 64 px) and `--pad` is 32 px. Without this the hub orb covered the Khepri orb at 320 and 375 px.

Regression criteria (`app/e2e-v2/bc.spec.ts`, `phone map legibility`, at 320, 375 and 768 px): every marker is at least 10 x 10 px and square within 1 px; its centre is within 3 px of its link's midpoint; the marker count equals the drawn markable links, derived from the DOM (Owner draws one link fewer than Technical); edge and orbit strokes are non-scaling; no two orbs overlap by more than 4 px on both axes; 44 px targets and no horizontal overflow at 640 px and below; under reduced motion markers are present and nothing animates.

Rollback: revert the BACK-34 commit.

Open: BACK-32 should judge the result on real devices. On a phone the selected node's card can still sit over a neighbour's title; that is a label-density question, not covered here.
