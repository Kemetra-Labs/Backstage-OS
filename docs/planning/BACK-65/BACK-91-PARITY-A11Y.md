# BACK-91: parity matrix, automated accessibility evidence and retirement readiness

24 Nov 2026, at `main` `f7c845a` (CI run 45375264308 `success`). Branch `claude/back-91-a11y-parity`, not committed.
Synthetic demo data only. Classification of BACK-91 stays **PARTIAL**: nothing here closes a manual check.

## 1. Main CI evidence

Main runs 45286643976 (`355b9dc`) and 45375264308 (`f7c845a`) are `success` and include every BACK-91 merge (PR #71 `56db8ff`, BACK-90 `16db5f4`).
The single required job ran root Playwright (chromium + webkit), app typecheck and unit, app V1 e2e (chromium + webkit), app V2 e2e (chromium) and the server check.
That proves the automated suites only.

## 2. Automated accessibility (axe-core)

**Tool:** `@axe-core/playwright` 4.14.0 with `axe-core` pinned to 4.14.0 through `overrides`. Both are MPL-2.0. The `~4.14.0` range would have pulled 4.14.1, released 16 Nov, which is under two weeks old. The package is a dev dependency installed with `--ignore-scripts`, and `npm audit` reports no new finding (existing ones are in vite/vitest only).
**Rules:** tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`.
**Spec:** `app/e2e/a11y.spec.ts`. It covers the 15 AppShell routes (the eight V1 screens and the four lens views), in English and Arabic, for Owner, Technical and Nontechnical: 90 scans per browser.
**Run:** local, Chromium, built app on `vite preview`, 24 Nov 2026, 290 s. WebKit was NOT RUN.

**Result: all 90 scans ran; 0 clean, 90 with a violation. Two distinct defects:**

| Rule (impact) | Element | Where | Cause | Smallest fix (not applied) |
|---|---|---|---|---|
| `aria-valid-attr-value` (critical) | `#demo-search`, [`src/shell/DemoSearch.tsx:22`](../../../app/src/shell/DemoSearch.tsx) | All 90 scans: every route, both languages, every persona | `aria-controls="demo-search-results"` is always set, but that element is rendered only while the results are open, so the reference points at nothing | `aria-controls={open ? 'demo-search-results' : undefined}` |
| `scrollable-region-focusable` (serious) | `#bcinsp-panel`, [`src/design-lab/v2/bc/Inspector.tsx:130`](../../../app/src/design-lab/v2/bc/Inspector.tsx) | `/map/retail-tower/inventory`, English, Owner and Nontechnical (2 scans) | The inspector's tab panel overflows and scrolls but cannot take keyboard focus. It does not overflow for Technical or in Arabic at 1280 px. | `tabIndex={0}` on the tab panel (also the WAI-ARIA tabs pattern) |

**Update, same day (owner approved all three fixes, not committed):** both one-line fixes are applied in this branch. A re-scan (Chromium, 90 scans, 274 s) gave **87 clean, 3 failing**. Both earlier rules are gone from every scan.

The 3 failures are a third rule the first run did not report:
- **Rule:** `label-content-name-mismatch` (serious, WCAG 2.5.3 Label in Name).
- **Elements:** the map node buttons `button[data-node="stock-sync"]` and `button[data-node="inventory"]`.
- **Where:** `/map` and `/map/retail-tower/inventory`, English, Owner and Technical.
- **Cause:** `bc/Canvas.tsx:113` names a node "title, kind, status". The selected or hub card also shows a description and, for services, a read age, so the visible words are not one unbroken run inside the name. It is intermittent because during the first-load intro the card text is not yet visible to axe.
- **Test:** `e2e/mission-map.spec.ts` checks that each node's browser-computed name (read from the aria snapshot) contains its visible text as one unbroken run, selected card included. It failed 4 of 4 before the fix, passes 8 of 8 after (Chromium + WebKit), and fails 4 of 4 again when the old `aria-label` is put back (mutation check).
- **Root cause:** a first fix, an `aria-label` built from the visible parts, still failed. A container query (`styles/bc.css:250-257`) hides the description and read age on a narrow canvas, so a name assembled in code cannot know which words are visible.
- **Fix:** `bc/Canvas.tsx` drops the `aria-label`. The name is computed from the card itself: `display:none` parts drop out of the name exactly as they drop off the screen. The kind follows as visually hidden text (`kv2-sr`), as the list view already does (`bc/Tables.tsx:50`).
- **Independent review finding, fixed:** the same container query also hid the status chip of unselected nodes with `display:none` (`bc.css:260`). Once the name came from content, a phone screen-reader user would have heard a node without its status, so a stale node would sound like the healthy one.
  - The chip is now visually hidden instead (the `.kv2-sr` properties), so it looks the same and the status stays in the name.
  - New test `Mission Map en/ar @375px: every node's accessible name still carries its status word` failed before this change and passes after.
  - `e2e-v2/bc.spec.ts` now also checks that the computed name contains the status.
  - The axe spec waits for the map intro to finish (`[data-intro]` gone), so scans of the map do not depend on timing.
- **Tests that read the old attribute:**
  - `e2e-v2/bc.spec.ts` now asserts there is no `aria-label` and that the text ends with the kind.
  - `e2e-v2/nondisclosure.spec.ts:137` now reads the node's `textContent`. That covers all of its text, hidden parts included, so the check is stricter rather than vacuous.

Regression runs with the two fixes (local, Windows):
- **App typecheck and unit:** 712 passed.
- **`scroll-regions`, `mission-map`, `convergence`, `flow` (Chromium + WebKit):** 433 passed, 10 failed, 7 skipped (deliberate).
  - 8 failures were convergence search tests that found the box by `aria-controls`. The locator is now `#demo-search` (same assertions), and all 8 pass.
  - 2 failures are `Mission Map en/ar @768px` on WebKit: a one-pixel overflow (`scrollWidth` 615 vs `innerWidth` 614). They reproduce with main's own versions of both changed files (4 of 4), so the fixes did not cause them. The failure appears only in local Windows WebKit; the same tests pass on main's Linux CI.
- **V2 `bc` + `structure` (Chromium):** 174 of 174 pass when run alone.
- **Label test:** that run collected its tests before the label test was added, so it does not cover it.

In the first scan, apart from those two elements, axe reported nothing on any scan: no other rule failed on any route, language or persona. This covers only the WCAG rules axe can automate. It says nothing about reading order, meaning, keyboard flow, screen-reader output, or text over images and gradients (see M1).

**Final verification with all three fixes (local, Windows, 24 Nov 2026, run sequentially):**

| Suite | Result |
|---|---|
| `npm run check` (typecheck + unit) | **PASS**, 712 tests |
| axe, Chromium, 90 scans | **PASS**, 90 of 90 clean |
| axe, WebKit, 90 scans | **PASS**, 90 of 90 clean |
| Lab `npm run e2e:v2` (Chromium) | **PASS**, 315 passed, 32 skipped (existing deliberate skips) |
| Host `npm run e2e` (Chromium + WebKit, includes the axe spec) | **13 FAILED**, 1,916 passed, 73 skipped, 25.7 min |

**The 13 host failures are UNATTRIBUTED.** The verification script ran the final axe pass with the same Playwright config straight after the host suite. That cleared `test-results/` and `.last-run.json`, so the failing test names were not kept; this was a test-run sequencing error.

What is known:
- The axe spec is not among them: it is 180 of 180 clean on its own.
- An earlier targeted run showed two failures that reproduce with main's own code: `Mission Map en/ar @768px` on local Windows WebKit, a one-pixel overflow.
- The other 11 are unknown. They must not be treated as baseline or environmental until one recorded run names them.

Next action: a single host `e2e` run with the report written to a file, or the PR's own CI run on Linux.

**Before the spec can run in CI:** it lives in `app/e2e`, so `npm run e2e` would pick it up and the V1 job would fail on all 90 scans. Fix the two elements first, or keep the spec out of the suite until they are fixed. Never mark it skipped and still count it as passing.

## 3. Parity matrix

Legend: **U** = unified app (`app/`, `index.html` entry, one AppShell), **L** = standalone V2 lab (`app/v2.html`, `vite.v2.config.ts`, `e2e-v2/`), **R** = root static prototype (`index.html`, `js/`, `css/`, `tests/`).

| Surface | R | L | U | Disposition |
|---|---|---|---|---|
| Home | yes | no | yes (Home) | U is the product surface; R kept as a separate prototype |
| Portfolio | yes | no | yes | same |
| Project intelligence / dependency map | generic project screen | no | yes (Project, React Flow opt-in) | U |
| Customers (network graph) | yes | no | **no** | R only; not a U gap unless the owner wants it (product decision) |
| Investigation room | yes | no | yes (default view) | U |
| Evidence detail | drawer | inspector tabs | yes (Evidence screen) | U |
| Decisions | yes | no | yes | U |
| Agents roster | yes | no | yes (default view) | U |
| Agent Flight Deck | no | yes (lab shell) | yes (`/agents/deck` lens) | U embeds the L screen; L shell RETIRE AFTER PARITY |
| Sources tables | yes | no | yes (default view) | U |
| Source Observatory | no | yes | yes (`/sources/observatory` lens) | U embeds L screen |
| Mission Replay | no | yes | yes (`/investigation/:id/replay` lens) | U embeds L screen |
| Mission Map B+C | no | yes (`?concept=bc`) | yes (`/map`) | U embeds `MissionMapBC` |
| Mission Map concept A | no | yes (default lab map) | **no** | L only, superseded by B+C (hybrid-map pilot); RETIRE AFTER PARITY, no migration |
| Operations | yes | no | no | R only; product decision |
| Design system page | yes | `DESIGN.md` doc | no | R only |
| Global source-state toggle (ok/stale/down) | yes | no | no (states come from fixtures) | R only; U shows stale and unavailable from data |
| Reset demo | yes | no | no | R only |
| Search / command palette | Ctrl+K | shell search | yes (search, scoped by persona) | U |
| Persona and language switch, EN/AR RTL | yes | yes | yes (single authority) | U |
| Route grammar | `S.route` + `?s=` | lab hash routes | hash routes, one authority | U |

Root prototype: KEEP, out of BACK-92 scope until a separate owner decision (it has screens U does not have).

## 4. Legacy tests that must move into `app/e2e` before the lab is retired

Only behaviour that applies to code the unified app still ships is listed. Tests of the lab shell itself, of concept-A map and of screenshot capture retire with the lab.

Method: every `e2e-v2` test title was matched against `app/e2e` by behaviour (keyword and title search, then reading the closest unified test). "Gap" means no unified test asserts the behaviour; "verify" means a unified test is close but may not assert the same thing. Each must be confirmed by reading both tests when it is migrated.

**Must migrate (gap, applies to shipped code):**

| # | Lab test (file) | Behaviour | Unified home |
|---|---|---|---|
| M1 | `fidelity.spec.ts` contrast on rendered pixels | Text over the horizon and glow keeps AA, measured on pixels (axe cannot judge text over images or gradients) | `mission-map.spec.ts`, `source-observatory.spec.ts` |
| M2 | `fidelity.spec.ts` luminosity (two tests) | Unknown and unavailable nodes and agent satellites carry no glow; only observed links and the selection do (truth in visuals) | `mission-map.spec.ts`, `agent-flight-deck.spec.ts` |
| M3 | `fidelity.spec.ts` fonts | Manrope and Cairo are self-hosted per language, no third-party request | `css-isolation.spec.ts` (verify: it mentions the fonts) |
| M4 | `bc.spec.ts` performance budget | About 600 DOM and 200 SVG elements, no `backdrop-filter`, one filter | `mission-map.spec.ts` |
| M5 | `bc.spec.ts` first-load orbit | Plays once, animates only opacity, translate and stroke-dashoffset, at most 10 at once, never replays (U only checks it is off under reduced motion) | `mission-map.spec.ts` |
| M6 | `bc.spec.ts` idle animation | The idle page runs no infinite animation, including the decorative background | `mission-map.spec.ts` (verify) |
| M7 | `bc.spec.ts` phone map legibility (three tests) | Link markers round and on their link, strokes do not scale, orbs do not overlap, markers stay left-to-right in Arabic | `mission-map.spec.ts` |
| M8 | `bc.spec.ts` / `nondisclosure.spec.ts` d4 | Technical sees the stale-backed Inventory-Sentry link (d4) drawn; Owner gets neither the link nor a note; persona switch drops it at once | `mission-map.spec.ts` (U checks withheld evidence ids, not the d4 edge) |
| M9 | `interactions.spec.ts` Replay playback | Deterministic virtual clock (one event per 1.5 s, 4x is four times faster, stops at the end), Restart, and playback makes no request and no storage write | `mission-replay.spec.ts` (U checks only that reduced motion starts no playback) |
| M10 | `interactions.spec.ts` Replay copy | Copying the proposal text is the only action and never claims a decision | `mission-replay.spec.ts` (verify against "nothing here acts") |
| M11 | `interactions.spec.ts` review regression | A `?lang=` seed cannot override a later switch back to English | `convergence.spec.ts` |
| M12 | `structure.spec.ts` / `bc.spec.ts` truth | No percentage, composite score or executable approval on the four lens views | `convergence.spec.ts` |
| M13 | `bc.spec.ts` / `structure.spec.ts` layout | No foreign requests on the lens views (U checks this only on the project flow map) | `convergence.spec.ts` |
| M14 | `structure.spec.ts`, `bc.spec.ts` touch targets | Every visible control at least 44 x 44 at 375 px **on the four lens views**. U checks the V1 screens only (e.g. `agents.spec.ts:140`, `home.spec.ts:127`, `flow.spec.ts:72`); no lens spec has it | the four lens specs |
| M15 | `structure.spec.ts` Arabic | No Latin run outside a left-to-right isolate **on the lens views**, and lens geometry stays left to right. U checks the V1 screens only (e.g. `home.spec.ts:108`, `sources.spec.ts:136`) | the four lens specs |
| M16 | `structure.spec.ts`, `interactions.spec.ts` responsive nav | At 375 px the closed side navigation is not focusable and Escape closes it. No U test covers the host sidebar | `convergence.spec.ts` |
| M17 | `structure.spec.ts` keyboard | Keyboard focus is visible on every interactive element. U checks it narrowly only (`decisions.spec.ts:301`, `investigation.spec.ts:78`) | `convergence.spec.ts` or `a11y.spec.ts` |

M14 to M17 match the "add host check" rows of `BACK-92-RETIREMENT-READINESS.md` §2 on main, re-checked here after #71 and #72 merged: still open. That document is the census of record. This list adds M1 to M13 to it and does not replace it.

**Probably covered (confirm with a file:line mapping in the retiring PR, as BACK-92 §2 asks):**
- map and list carry the same information, and one selection (`mission-map.spec.ts`)
- keyboard arrows and skip link (`mission-map.spec.ts`, `scroll-regions.spec.ts`)
- Observatory inspector, table and timeline filters (`source-observatory.spec.ts`)
- Deck filters, counts, simulated label and capability limits (`agent-flight-deck.spec.ts`, `agents.spec.ts`)
- persona id rules and C-16 mission ids (`agent-flight-deck.spec.ts`)
- shared world INV-DEMO-7 (`convergence.spec.ts`)
- canonical overlap (`canonical-overlap.spec.ts` exists in both)
- V1/V2 CSS isolation (`css-isolation.spec.ts`)
- every BACK-66 non-disclosure row (`nondisclosure.spec.ts`, `mission-replay.spec.ts`, `source-observatory.spec.ts`, `agent-flight-deck.spec.ts`)

The Deck "event count drops the withheld one" row is not migrated: it waits on the owner's decision about what `events` counts (BACK-90).

**Keep, not a test to migrate:** `bc-capture.spec.ts`. It is opt-in evidence capture (`BC_CAPTURE=1`) and writes tracked files under `docs/design-lab/hybrid-map/out/`. BACK-92 §1 marks it KEEP until the owner decides about those captures.

**Retire with the lab, no migration:** concept-A map tests in `interactions.spec.ts` (zoom buttons, Ctrl+wheel, pan, keyboard +/-, scope re-centre, drill-down), "the V2 map is untouched without `?concept=bc`", lab-shell tests (rail collapse, 375 px menu button, lab search, `structure.spec.ts` isolation check of the lab entry).

**Root prototype tests (`tests/smoke.spec.js`, `tests/findings.spec.js`):** none migrate. They test the root prototype, which stays (KEEP) and keeps its own suite.

## 5. Blockers, classified

| Blocker | Class | Owner of the next step |
|---|---|---|
| Migrate M1 to M17 into `app/e2e`, green on chromium + webkit | **Required before legacy retirement** | Engineering (BACK-92 step 1) |
| The BACK-31 and BACK-32 tester kits (`docs/qa/kawalys-frontend/BACK-31-arabic-review.md`, `BACK-32-manual-kit.md`) send testers to `v2.html`; rewrite them for the host app or run them before the lab entry goes | **Required before legacy retirement** | Owner decision, then QA |
| Resolve or explicitly accept every axe violation in section 2 | **Required before legacy retirement** | Engineering, then owner |
| Owner review of this parity matrix and the RETIRE AFTER PARITY list | **Required before legacy retirement** | Owner |
| `e2e-v2` and the lab entry leave CI, and the required check stays honest (ties to BACK-93) | **Required before legacy retirement** | Engineering, owner approval (CI change) |
| Native Arabic review (BACK-31) | **Manual QA pending** | Native reviewer |
| NVDA/VoiceOver, real devices, real-browser 200% and 400% zoom (BACK-32) | **Manual QA pending** | Person with the devices |
| Manual keyboard walk-through of the cross-screen journey | **Manual QA pending** | Person |
| KH and SB identity mapping to the map (BACK-85) | **Product decision pending** | Owner |
| Mission event-count meaning (BACK-90; shown as "not defined") | **Product decision pending** | Owner |
| Whether the root prototype's extra screens (Customers, Operations, Design system, source toggle, Reset demo) are wanted in the product | **Product decision pending** | Owner |
| Real authorization X02/X04 (persona is a display switch, not access control) | **Deferred production readiness** | Later epic |
| Tenant isolation, real connectors, production auth and data | **Deferred production readiness** | Later epic |
| axe covers automated rules only; it is not a WCAG conformance claim | **Deferred production readiness** | Manual audit |

The replay ordering decision (BACK-89, Option A: processing order) is already taken and is not a blocker.

## 6. Recommended execution sequence

Each step is its own small PR, green before the next. Nothing is deleted until step 4, and step 4 needs explicit owner approval.

0. **This branch (BACK-91, draft PR when approved):** add `@axe-core/playwright` 4.14.0 (dev, `axe-core` pinned 4.14.0, MPL-2.0, lifecycle scripts not run) and `app/e2e/a11y.spec.ts`, plus this report. Decide first whether the spec asserts zero violations (needs the fixes in section 2) or runs as a recorded baseline; it must not be added to CI as a silently failing or skipped check.
1. **BACK-92 S0, tests only (no deletion):** move M1 to M17 into `app/e2e` against the host routes. Show each one fails against a deliberately broken build (mutation) before trusting it. The lab suite keeps running, so coverage only grows.
2. **BACK-92 S1 and S2, as in `BACK-92-RETIREMENT-READINESS.md` §3 on main:** make the lab default to the B+C map (owner approval: it changes what the lab shows), then delete concept-A `design-lab/v2/screens/MissionMap.tsx`. No extraction is needed: `V2Context` and `useV2` are already exported separately, and only `V2Provider` goes with the lab entry (BACK-92 §1).
3. **BACK-93 reconciliation (PR #80):** once the lab is unreferenced, the classifier drops the `app-e2e-v2` job (or it is kept until step 4 lands), the app jobs install root dependencies (the `@types/node` finding), and the matrix in `classify-changes.sh` is updated with its tests. The required check name stays `Playwright (chromium + webkit)`.
4. **BACK-92 step 3, retire (owner approval required):** delete the lab entry, lab shell, concept-A map, `e2e-v2/`, `playwright.v2.config.ts` and the `e2e:v2` scripts in one PR, with a rollback map (paths to the last commit that had them). Root prototype is not touched.
5. **Manual gates recorded, not relabelled:** BACK-31 and BACK-32 results go into Jira by the people who ran them.

Ordering note on BACK-93: PR #80 can merge before step 1 (it keeps the V2 job), but it first needs the `@types/node` fix (app jobs install the root dependencies), which is paused in the BACK-93 worktree as an uncommitted change.
