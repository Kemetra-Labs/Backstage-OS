# Kawalys Mission Map: Hybrid visual pilot (A / B / C)

Design exploration for the owner-approved Hybrid direction (V2's cinematic Mission Control identity, V1's clarity, real visualizations only). **Not implementation approval.** Nothing in `app/`, `index.html`, `css/` or `js/` was changed; V1 and V2 are untouched. Nothing is committed, pushed, deployed or filed in Jira. No dependency was installed (captures use the Python Playwright already on this machine with the cached Chromium headless shell).

Prepared 2026-11-21 on `claude/kawalys-mission-map-visual-a9038d`. Everything in this folder is new and untracked.

## Owner selection (2026-11-21)

**Selected: B, with C's systems ledger and source-readings matrix as its list view and phone layout.** This is a design decision only; it is not approval to implement. B's List view in this pilot is now exactly that composition (ledger, readings matrix, links table, signal timeline), shared with C through `shared/ui.js` (`ledger`, `matrix`, `linksTable`) and `shared/tables.css`. Spec: [SPEC.md](SPEC.md), sections 3 and 4a.

Follow-up: [ENHANCEMENT-NOTE.md](ENHANCEMENT-NOTE.md) covers optional motion-library, D3 and WebGL layers (design note only, nothing adopted).

## Open the concepts

Serve the repo root, then open the pages (they load the V2 self-hosted Manrope and Cairo fonts and `horizon.webp` by relative path; nothing is fetched from any other host):

```powershell
python -m http.server 8777 --bind 127.0.0.1
```

| Concept | Page | Extra states (query string) |
| --- | --- | --- |
| A, Balanced | `concept-a.html` | `?lang=ar` `?view=list` `?node=stock-sync&tab=evidence` `?motion=reduce` |
| B, Immersive | `concept-b.html` | same |
| C, Analytical | `concept-c.html` | same |

All three read one data module (`shared/data.js`), one token file (`shared/tokens.css`, V2 values copied verbatim) and one component layer (`shared/ui.js`, `shared/base.css`). They differ in layout and visuals, not in data.

## Images (`out/`)

| File | What |
| --- | --- |
| `compare-v1-v2-a-b-c.jpg` | Side by side: V1 static, V2, A, B, C at 1448 x 1086 |
| `concept-{a,b,c}-en-1448.jpg` | Desktop presentation, English |
| `concept-{a,b,c}-ar-1448.jpg` | Desktop, Arabic RTL |
| `concept-b-en-375.jpg`, `-320.jpg`, `-768.jpg`, `concept-b-ar-375.jpg` | Mobile and tablet assessment of the recommended concept |
| `concept-b-en-1448-reduced-motion.jpg` | B with `prefers-reduced-motion` |
| `concept-b-en-1448-sentry-sources.jpg` | B with another selection (Sentry, Sources tab) |
| `concept-b-en-1448-list.jpg` | B's list view: C's ledger and readings matrix inside B's shell (the selected composition) |
| `motion-b-filmstrip.jpg` | B's one animation (selection trace), four frames |
| `checks.txt` | Output of `tools/checks.py` (84 pass, 0 fail) |

Tools: `tools/shot.py`, `tools/capture_all.py`, `tools/checks.py`, `tools/measure.py`, `tools/overflow.py`.

## The three concepts

**A, Balanced.** V2's composition kept (hub on a horizon, one inspector, bottom row) and made clearer: link truth is drawn with a line pattern plus a marker shape (not colour alone), every service node carries a ring showing the age of its last read against its freshness target, chips are sentence case with a glyph, and V2's four mixed metrics become one "Three readings" strip (connectivity, freshness, health, six source pips each, never combined). Bottom row: evidence feed, source status (age against target), signal timeline.

**B, Immersive.** The map is the page. Orbit = kind of system (products inner, projects middle, services outer), so the layout itself carries structure. Selecting a node dims every link that is not its own and sends one trace along its links. Navigation collapses to a rail, the inspector floats and carries the three readings as a footer, and the horizon doubles as the signal timeline. Only the hub, the selected node and services show full cards; the rest show name and chip.

**C, Analytical.** Operational clarity first. A layered topology (bands = kind) with compact nodes, a systems ledger (status, evidence count), and a source-readings matrix whose three column headings are the three counters ("3 of 6 reachable", "2 of 6 within target", "1 of 6 confirmed healthy") with per-row minutes. Glow is spent only on the selected system and observed links.

## Truth rules, all three (verified by `tools/checks.py`)

- Connectivity, freshness and target health are separate readings; no composite score, trust figure, confidence or trend. No `%` anywhere (EN and AR).
- Unknown is never Healthy: exactly one node (GitHub, backed by current observed evidence E-8) and one source read Healthy. Khepri, Jira, Seshat BI read "Health unknown"; Inventory and Sentry "Stale"; Port "Unavailable"; stock-sync "CI check failing".
- 8 dependency links classified (2 observed, 1 correlated, 1 hypothesis, 4 unknown) plus 3 structure links; the one observed link with a stale read is drawn as stale.
- Age against target is shown with its overflow: Sentry is 540 min against a 15 min target (36x); the bar is cut and hatched past the tick instead of being capped at 100 %.
- Every figure is derived in `shared/data.js` with the same rules as `contract/rules.ts`; the derivation table is in [SPEC.md](SPEC.md).
- Control vocabulary: no approve / reject / defer / go / release / retry / run label, no form. Demo banner "Demo data, not live" stays in the top bar.

## Evaluation

**Measured** (tools in `tools/`, Chromium only):

| | V2 (from `comparison.md`) | A | B | C |
| --- | --- | --- | --- | --- |
| Page height at 1448 wide | 1210 px | 1086 px (one frame) | 1086 px (one frame) | 1086 px (one frame) |
| DOM elements / SVG elements | not recorded | 663 / 189 | 540 / 180 | 870 / 282 |
| Elements with a `box-shadow` / with a filter | not recorded | 22 / 1 | 23 / 1 | 17 / 1 |
| Animations | 0 | 0 | 5 one-shot trace animations of 720 ms per selection (finished animations are still counted at 1.3 s); none loop | 0 |
| Animated properties | none | none | `stroke-dashoffset`, `opacity` (compositor-friendly, one-shot) | none |
| Overflow at 320 / 375 | none | none | none | none |
| Touch targets at 375 | at least 44 px | at least 44 px | at least 44 px | at least 44 px |
| Reduced motion | no running animation | none | 0 animations, selection still shown | none |
| Prototype source (js + css lines, excl. shared) | n/a | 137 | 136 | 139 |

The single filter is the brand mark's drop shadow, shared by all three. No backdrop-filter anywhere. Line counts are only a proxy for effort.

**Judgement** (mine, to be overruled by the owner):

| | A | B | C |
| --- | --- | --- | --- |
| Aesthetics / identity | Familiar, polished, close to V2, the centre is busy | Most memorable, closes V2's "calm" gap, the layout is the visual | Clean, least cinematic, closest to V1 |
| Comprehension | Good; the three-readings strip is the clearest new idea | Good once a node is selected; per-source detail moves into the inspector footer and the horizon | Best for scanning every system and every source at once |
| Accessibility | Same list/table alternative, text for every graphic | Same; more layers to order (floating inspector, overlays) | Strongest: real tables carry most of the screen |
| Performance | Light | Lightest DOM; motion is one-shot | Heaviest DOM (tables), still light |
| Implementation complexity | Low: V2 components plus 5 small new ones | Highest: polar layout, overlays, responsive collapse, trace | Medium: standard tables plus a banded layout |

**New components needed (beyond V2's `Cosmos`, `Kpi`, `Panel`, `TabBar`, `ToneChip`, `TruthChip`, `SourceRows`, `logic/graph.ts`, `logic/status.ts`):**
shared: `AgeBar` (overflow-aware), `ReadingCounter` with `SourcePips`, `SourceRing`, `EdgeMarker` and a pattern `LinkLegend`. A: `ReadingsStrip`, `SignalTimeline`. B: `orbitPosition(kind, angle)` (pure, testable), `SelectionTrace`, `FloatingInspector`, `RailNav`, `HorizonTimeline`. C: `LayerTopology`, `SystemsLedger`, `SourceMatrix`.

## Recommendation: B, with two bounded borrowings from C

1. **It is the only concept where the picture carries information that the other two put in text.** Orbit = kind makes the hierarchy readable at a glance, and it removes V2's worst clutter (cards sitting on top of links) because only the hub and the selected node show full cards.
2. **It closes V2's luminosity gap for a reason, not as decoration.** Glow marks the hub, the selection and observed links; the horizon carries the signal timeline. (V2's own comparison measured 2 to 9 times less accent than the references; I did not re-measure B, so this is a judgement from the renders.)
3. **Motion is explainable and lossless.** One trace per selection, never a loop, so nothing reads as live telemetry; with reduced motion the same selection is shown as a static highlight (0 animations, verified).
4. **Truth separation is the most visible of the three.** The readings sit in a persistent footer with one pip per source, the rings put "age against target" on each service, and the overflow of Sentry (36x) is impossible to miss.
5. **Borrow from C (selected, now built into B's list view):** the ledger and readings matrix as the list view and the mobile presentation (they are the table alternative), and C's row-level minutes.

**Fallback:** A, if the owner wants the smallest change from V2. It fits one frame and reuses the most existing code, but it is the least distinct from V2.
**Not recommended as the primary:** C. It is the clearest to audit but gives up the identity the owner asked to keep.

**Costs and risks of B:** the shell changes (rail instead of the 215 px navigation, same four destinations); the most bespoke responsive work; under 900 px the map is replaced by the list (see below); floating panels need a deliberate focus order.

## Mobile assessment of B (375 and 320, English; 375 Arabic)

- No horizontal overflow at 320, 375 or 768; every visible control is at least 44 x 44 px (`checks.txt`).
- Order on a phone: title and scope, risk pills, **three readings**, filters and view toggle, legend, systems ledger, source readings (one card per source under 641 px, columns above), links table, signal timeline, inspector. The map is not offered under 640 px: the list is the default, as in V2. Between 641 and 900 px the map is available but small.
- Page length at 375 is about 4700 px with the selected list view (V2 was about 4000 to 4600 per its comparison; B was about 3800 px before the readings cards were added, so the selection costs about 900 px). The legend (7 entries) and the four-column links table also wrap heavily; both should be tightened (compact cards, collapsible legend and links) in the real build.
- The persona selector is hidden under 640 px in this pilot; the real build must move it into the menu, not drop it.
- Not designed here: a touch-first map (pinch, pan, bigger orbs). B's map is a desktop and tablet device.

## Deliberate differences from V2 and from the owner references

| Reference or V2 | Hybrid | Why |
| --- | --- | --- |
| Caps tracking on every chip | Sentence-case chips with a glyph; the eyebrow stays caps | State is never colour alone; removes V2's recorded Hallmark chip FAIL (owner's call, small CSS change) |
| 0.92 / 0.88 link strengths, HEALTHY chips, percentages | Link classes by count, "Health unknown", counts such as "3 of 6" | No data contract for the first three |
| V2's Neighbourhood panel | Folded into the inspector's classification and the selection highlight | Space; the same dependency counts are still shown |
| V2 hub-spoke "grouping" lines | Same, drawn as faint structure lines with their own legend entry | Grouping is structure, not a claim |

## Not verified

WebKit and Firefox (Chromium only, same as V2). Real devices. A screen reader. Contrast of the new elements on rendered pixels (tokens are V2's and carry its computed ratios; a few labels use 10.5 px text and should be floored at 11 px in the real build). Arabic: reused V2 strings plus new ones flagged `// n.` in `shared/data.js`, **none reviewed by a native speaker**. The Hallmark and impeccable linters were not run on these pages. Nothing was user-tested; the aesthetic and comprehension ratings are my judgement. The orbit and band placements are presentational; they are not derived from data.

## Stop point

Presented for owner selection. Nothing below this line has been started: React/TypeScript port, fixture changes, V1 or V2 edits, tests in the app, Jira or Confluence updates, commit, PR.
