# V1 vs V2 vs reference: owner review

Prepared 2026-11-17 on branch `claude/kawalys-v2-visual-lab-73290d` (base `af2bc27`). Nothing committed. **This document does not recommend replacing V1.** It separates what was measured from what is judgement, and lists where V2 falls short of the reference.

Triptychs (V1 left, V2 middle, owner reference right): `screenshots/triptych/`. V2 renders at 1448 x 1086: `screenshots/v2/`. V1: `screenshots/v1/`. Reference-left / V2-right: `screenshots/side-by-side/`.

Which V1 is shown: the repo has two. The **static prototype** (`index.html`, port 8765) has Network, Sources and Agents screens, so it is the comparable V1 for Map, Observatory and Deck. The **React S1 slice** (port 4178) has only the Investigation Room, so it is the comparable V1 for Replay. The static prototype's Investigation screen is also captured (`*-v1-static-*`).

## A. Measured (repeatable, scripts in `tools/`)

### A1. Composition against the reference (`compare.py`, `measurements.json`)

| Screen | Luminance-grid correlation | Edge-structure correlation | Cyan accent share, ref / V2 | Amber share, ref / V2 | Mean colour distance |
| --- | --- | --- | --- | --- | --- |
| Mission Map | 0.47 | 0.29 | 1.66 % / 0.42 % | 0.19 % / 0.02 % | 1.1 |
| Source Observatory | 0.27 | 0.13 | 0.93 % / 0.59 % | 0.04 % / 0.06 % | 3.7 |
| Mission Replay | 0.52 | 0.55 | 1.09 % / 0.20 % | 0.10 % / 0.01 % | 3.4 |
| Agent Flight Deck | 0.30 | 0.19 | 1.11 % / 0.12 % | 0.06 % / 0.01 % | 4.2 |

How to read it: ground tone matches closely (colour distance 1 to 4 on a 0-441 scale). The light and dark masses and the structural density only partly line up (0.13 to 0.55), which is expected because the content differs on purpose and V2 is taller than the 1086 px reference frame. **The accent shares show a real gap:** V2 puts 2 to 9 times less saturated cyan on screen than the references, and far less amber. The references are more luminous; V2 is calmer. A glow pass raised Map cyan from 0.09 % to 0.42 % and Observatory from 0.17 % to 0.59 %; I stopped there rather than tune towards the metric. **None of this is a pixel-parity claim.**

### A2. Automated checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` strict | clean |
| Unit tests (`vitest`) | 164 passed: 115 existing V1 plus 49 new V2 (logic, shared world, copy, static scoping). V1 coverage thresholds unchanged and met |
| V1 Playwright (chromium) | 39 passed, same as before any V2 work |
| V2 Playwright (chromium) | 116 passed |
| Overflow | none at 320, 375, 768, 1440 px, 4 screens, EN and AR (32 combinations) |
| Network | every request in every V2 test is same-origin; localStorage and sessionStorage stay empty, including during replay playback |
| Truth | no `%` on any screen; no composite or "trust" figure; exactly one node and one source reads Healthy (GitHub, backed by a current observed read); Khepri, Jira, Seshat BI read "Health unknown"; Sentry and Inventory read "Stale"; Port reads "Unavailable" |
| Control vocabulary | no approve / reject / defer / go / release / retry / run style label in any button, link or accessible name (EN and AR x 3 personas x 4 screens), plus a unit test over every control string; no `form` or submit control |
| Personas | Nontechnical never sees run, PR, work-item or mission ids; Owner never sees run or PR ids; restricted evidence stays restricted |
| RTL | no Latin run outside an LTR isolate on any screen and persona; Latin digits only; the constellation keeps left-to-right geometry |
| Keyboard | skip link first; tabs use arrow keys and mirror in Arabic; arrow keys move between map nodes; focus ring present on every tab stop |
| Touch (375 px, touch emulation) | every visible control is at least 44 x 44 px |
| Reduced motion | no running animation on any screen |
| Isolation | V2 CSS has no V1 selector, V1 CSS has no `.kv2-` selector; no V1 source file modified (`git diff` shows only `app/package.json` scripts, `app/tsconfig.json` include, `app/.gitignore` `dist-v2/`) |
| Text contrast (computed from tokens) | lowest 4.9:1 (red chip on its tint); body text 6.5 to 16:1 |
| impeccable `detect` | no findings |
| Hallmark `sloplint --scope app` | 2 FAIL, 131 REFLEX, 2 WARN. The 2 FAIL are gate 67 (uppercase label), the eyebrow and the chips, **kept on purpose** because all four owner references use them (waiver recorded in the CSS stamp; this contradicts a non-waivable Hallmark floor rule and is your call). Of the REFLEX, 129 are gate 24b (off the 4 px scale) from matching the reference's dense 9, 10, 14 px spacing (waived); 2 are false positives (an icon inside a heading). WARN: 1 repeated container recipe |

### A3. What was **not** measured or run

WebKit and Firefox (only chromium is installed here; V1's own suite also ran chromium only). Real devices. A screen reader. Colour contrast of non-text boundaries beyond focus and state (panel borders are about 1.4:1 and are decorative; control names carry meaning in text). Pixel-level V1 regression: no V1 baseline screenshot was taken before the work, so "V1 unchanged" rests on the untouched-file diff and the unchanged V1 suite, not on image diffing. Arabic copy was written by the assistant and has not had a native-speaker review.

## B. Deliberate departures from the reference images

| Reference shows | V2 shows | Why |
| --- | --- | --- |
| Overall Trust Posture 72 % with a bar; Mission Health 78 % | Three separate readings ("3 of 6 reachable", "2 of 6 within target", "1 of 6 confirmed healthy") and no composite | The contract keeps connectivity, freshness and health independent; a blended score has no data contract |
| Per-source trust rings (92 %, 88 %) | A ring showing measured age against that source's freshness target ("6 min" of 30) | Same: no trust figure exists. The ring is a measurement |
| HEALTHY chips on Khepri, Retail Tower, Seshat | "Health unknown", "CI check failing", "Stale" | Unknown is never Healthy. This costs visual vibrance: most nodes are not green |
| Relationship strengths 0.92 / 0.88 | Counts of links by classification (observed, correlated, hypothesis, unknown) | No weighting data exists |
| Confidence 0.91, capability 99 % | Words only ("medium", "Available", "Limited") | Numeric confidence needs a calibrated basis (D-6); V2 fixtures have none |
| "+27 %", "+33 %", "-6 pp (24h)" trends | Omitted | No baseline data |
| Release "BLOCKED", Risk "MEDIUM" | "One check failing", customer impact "Unknown, not evidenced" | Impact is unknown in the shared world |
| "Active Runs", "Release Hold" | "Active missions", "hold the candidate build" | Forbidden control vocabulary |
| Bell, avatar, Overview, Decisions, Portfolios items | Omitted or made real (search, scope list, persona/language, V1 links) | No dead controls |
| Tracked-caps tagline | Sentence case | Kept the eyebrow, dropped this one |
| Geometric display font | Local stack (Inter, Segoe UI, Cairo) | No third-party fonts or files; typography is a visible gap |
| Single 1086 px frame | Fluid pages that run taller (at 1440 wide: Map 1210, Observatory 1157, Replay 1478, Deck 1709 px, against 1086) | More honest content (evidence gaps, restricted rows, classification) than the frame has room for |

## C. Fidelity findings per screen (honest)

- **Mission Map: closest.** Hub over horizon, orbit rings, glowing observed edges, amber callout and the three-column bottom row are in place. Gaps: references spread nodes wider with longer curved edges and a larger hub; mine are tighter. Hub spokes are neutral lines because grouping is structure, not a claim, so the hub looks less connected than the reference. The sidebar in the reference stops where the bottom row starts; mine runs full height.
- **Source Observatory: close.** Pins over a horizon, six cards, timeline. Gap: pin stems and horizon are smaller and the posture panel is shorter than the reference's.
- **Mission Replay: close in structure.** Five stages on orbits, gap marker, scrubber, story, facts, milestones, inspector, impact strip. Gaps: the reference's activity waveform under the scrubber is not reproduced (it would imply data); the reference page is denser and fits one frame; mine does not.
- **Agent Flight Deck: structure matches, atmosphere lags.** Fleet orbit, activity table, queues, oversight, capabilities, audit. Lowest accent share and the weakest composition match (0.30). The reference's compact five-row table is taller here because rows carry a focus sentence.
- **Mobile (320 and 375):** works without horizontal overflow; the constellation switches to the list/table by default under 640 px; the Replay stage row scrolls horizontally inside its panel. Not designed in the reference, so there is nothing to compare against.

## D. V1 vs V2 assessment

Legend: **M** = measured above, **J** = judgement (mine, to be overruled by yours).

| Dimension | V1 (gold on navy) | V2 (cyan on teal-navy) | Basis |
| --- | --- | --- | --- |
| Visual fidelity to the owner references | Not designed to match them | Close on structure for all four, calmer on light and colour | M for composition and accent; J for the rest |
| Product identity | Restrained, document-like; strong truth chips | Cinematic mission-control; the signature objects (hub, pins, stage arc, fleet orbit) are memorable | J |
| Information clarity | Very clear for one investigation; the static prototype is denser | Higher density; truth labels and gaps are explicit, but more glow and more panels per screen compete for attention | J |
| Interaction quality | Static prototype is interactive; React S1 is one screen | Pan, zoom, filter, scope, keyboard graph navigation, scrubber with deterministic play, filters and tables; 116 browser checks | M for coverage; J for feel |
| Accessibility | BACK-8 evidence: strong, mostly EN-verified | Same targets, text and list alternatives for every graphic; computed contrast, 44 px targets, focus, reduced motion, RTL isolation tested | M; neither version had a screen-reader or device pass |
| Mobile | Good | Works; denser content means long pages (about 4000 to 4600 px at 375) | M for overflow and targets; J for quality |
| Maintainability | Small, 2.3 k lines in the React app | About 4.2 k source lines plus 41 files, one design system, typed fixtures, 49 unit tests; more CSS (about 0.9 k lines) and more custom visuals to keep in step | M for size; J for the rest |
| Cost of future integration | React S1 has an adapter-shaped contract | All four screens read one typed `World`; real data needs an adapter that produces it and the persona rules already come from the V1 contract. The graph, replay clock and deck counts are pure functions, tested. Atmospheric visuals add no data dependency | J |

## E. Decision notes for the owner

1. If the reference look is the goal, V2 is the stronger base for structure and interaction; its main shortfalls are luminance, typography and density per frame, all CSS-level.
2. If vibrance matters more than the truth rules, the references' green HEALTHY chips and percentages cannot come back without a data contract for them; that is a product decision, not a styling one.
3. The two Hallmark FAILs (caps eyebrow and chips) are yours to accept or remove; removing them is a small CSS change (`.kv2-eyebrow`, `.kv2-chip`).
4. Not decided or done here: any migration, merging of design systems, V1 deletion, commit, push, PR, deployment or Jira change.
