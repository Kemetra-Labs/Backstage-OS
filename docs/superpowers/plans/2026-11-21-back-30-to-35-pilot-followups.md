# BACK-30 to BACK-35: B+C Pilot Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six BACK-27 follow-ups as far as an agent can. Code fixes for BACK-35, BACK-30 and BACK-34, plus evidence packs and exact hand-off steps for the human-only parts of BACK-31, BACK-32 and BACK-33.

**Architecture:** Three code tasks run in a fixed order: spec hardening, then the data projection, then the CSS/markup marker fix. Each later task builds on the earlier one's tests. Three evidence tasks follow. They change no product code and produce docs that a human signs off. All work lives in `app/` (Vite + React 19 + TS design lab, V2 at `v2.html`, pilot at `v2.html?concept=bc`).

**Tech Stack:** React 19.3.1, TypeScript 5.6, Vitest 2.1, Playwright (`app/playwright.v2.config.ts`, chromium, `workers: 1`).

**Spec:** the Jira tickets BACK-30 to BACK-35 (description plus "Review refinement" section). The pilot spec is `docs/design-lab/hybrid-map/SPEC.md`. Owner decisions recorded 2026-11-21 in this session:
- **BACK-30:** authorization matrix = **Technical only**. Owner and Nontechnical are unauthorized for `visibility: 'technical'` evidence. Code approved for V2 Mission Map and B+C.
- **BACK-34:** direction = **minimal fix**. Keep the B+C layout. Make link markers and strokes keep their shape on stretched canvases. No second map implementation.
- **BACK-35:** test-only edits to `app/e2e-v2/bc.spec.ts` (and helpers) approved.
- **Git:** commit per task on `claude/charming-franklin-isieiu`, push, open one PR against `main` after Opus validation.

**Execution model (user-specified):** implementer subagents run on **Sonnet, effort high**. Each task is validated by an **Opus** reviewer before the next starts, then one Opus whole-branch review runs before the PR.

## Global Constraints

- Synthetic demo data only; never present anything as live telemetry. No backend, auth, secrets, real provider access.
- English-first with working Arabic/RTL; every new user-visible string needs EN and AR (`i18n/*.ts`), Latin digits, Latin runs in `{braces}`; `copy.test.ts` must stay green.
- Unknown is never Healthy. A state whose only basis was removed becomes `unknown`, never `healthy`.
- A display persona is not authorization; docs must say no backend/X02/X04 enforcement is claimed.
- Playwright `workers: 1`. Do not edit `.github/workflows/*` (BACK-35/BACK-32: report the `e2e:v2` CI gap, don't fix it).
- Never remove the "NOT had a native-speaker review" header in `i18n/bc.ts`; never edit Arabic copy without human sign-off (BACK-31).
- Never mark SonarCloud issues, suppress rules or add `// NOSONAR` (BACK-33).
- Preserve B+C concept, map/list truth parity, selected-node state, 44px targets at ≤640px, reduced motion, no horizontal overflow at 320.
- Commit format `<type>: <description>`; the trailer lines from the session's attribution reminder; never include a model name in commits or PR text.
- `npm run check` (in `app/`) and `npm run e2e:v2` must pass at the end of every code task.

## Review Focus

1. **Deep link into a hidden record**: `#/mission-map?persona=owner&node=inventory` with the Evidence or Sources tab open. The tab must show no E-5, no "restricted" placeholder and an evidence count of 0, and the Sentry provider count must not include E-5. Test in Task 2.
2. **Persona switch in place** (Technical → Owner with `inventory` selected): the d4 link, E-5 and the Stale chip disappear, and nothing stale lingers from memoization. Test in Task 2.
3. **Arabic accessible names**: the hidden ID must not survive in `aria-label`/`title` attributes in AR. Test in Task 2, which scans attributes as well as text.
4. **Reduced motion + new marker overlay**: markers render, sit on their links, and add zero animations. Test in Task 3.
5. **Slow runner**: hardened waits must still fail on a looping animation, not just time out silently. Test in Task 1: the "infinite animation" negative check.

---

### Task 0: Baseline

**Files:** none changed.

- [ ] **Step 1:** `cd app && bash ../.github/scripts/npm-ci.sh && npx playwright install chromium webkit` (use the pre-installed browser if the install is refused; see the session environment note).
- [ ] **Step 2:** Run `npm run check` and `npm run e2e:v2`. Expected: both PASS. Record the pass counts and the printed `bc budget:` line in the Task 1 report. If anything fails before changes, stop and report.

---

### Task 1: BACK-35, harden timing in the pilot spec

**Files:**
- Modify: `app/e2e-v2/bc-helpers.ts` (add helpers)
- Modify: `app/e2e-v2/bc.spec.ts:63-92` (budget), `:338-399` (motion)
- Modify: `app/e2e-v2/bc-capture.spec.ts:11-14` (replace the 1700 ms wait with the new helper)
- Create: `docs/qa/kawalys-frontend/BACK-35-stability.md`

**Interfaces:**
- Produces in `bc-helpers.ts`:
  - `waitForIntroDone(page: Page): Promise<void>` waits until `.kv2-bc-canvas[data-intro]` has count 0 (timeout 10 s) and then until `document.getAnimations()` has no animation with `playState === 'running'` (`page.waitForFunction`, timeout 10 s).
  - `waitForAnimationsSettled(page: Page, timeout = 5000): Promise<void>` performs only the second half.
  - `infiniteAnimations(page: Page): Promise<string[]>` returns a description (target class + animationName) of every animation whose `effect.getTiming().iterations === Infinity`.
- Tasks 2 and 3 use these helpers instead of `waitForTimeout`.

- [ ] **Step 1: Add the negative test first.** It goes in `test.describe('motion')`: `'idle page runs no infinite animation, including the decorative background'`: `loadBc(page)`, `waitForIntroDone(page)`, `expect(await infiniteAnimations(page)).toEqual([])`. Run: `npx playwright test -c playwright.v2.config.ts e2e-v2/bc.spec.ts -g "infinite"`. Expected: FAIL (helpers not defined).
- [ ] **Step 2:** Implement the three helpers. Re-run the test. Expected: PASS. Then prove it can fail: in a scratch copy of the test (do not commit), inject `@keyframes kv2-x{to{opacity:.9}} .kv2-bc{animation:kv2-x 1s infinite}` with `page.addStyleTag`, and confirm it FAILS. Note the result in the report.
- [ ] **Step 3: Replace every `waitForTimeout` in `bc.spec.ts`:**
  - Budget test: `waitForTimeout(1500)` → `waitForIntroDone(page)`. Keep `dom ≤ 600` and `svg ≤ 210` as hard limits (SPEC §7 product limits, stage-scoped, so shell drift cannot move them). Also attach measured values with `test.info().annotations.push({ type: 'bc-budget', description: <same string as console.log> })`.
  - Reduced-motion test: replace each `waitForTimeout(300)` with waiting for the selection's DOM result (`expect(page.locator('.kv2-bc-node[data-node="github"][data-selected]')).toHaveCount(1)` and, after the view toggle, `expect(page.locator('.kv2-bc-canvas')).toBeVisible()`). Then assert `getAnimations().length === 0`.
  - Trace test: `waitForTimeout(1600)` → `waitForIntroDone`; `waitForTimeout(1200)` → `waitForAnimationsSettled(page)`. A looping trace never settles and so fails the test.
  - First-load test: change the init-script sampler to stop when `__seen && !document.querySelector('.kv2-bc-canvas[data-intro]') && no active animations`, or after 10 000 ms, and to set `w.__done = true`. Replace `waitForTimeout(2000)` with `page.waitForFunction(() => (window as any).__done, null, { timeout: 12_000 })`. Add `expect(r.__timedOut).toBe(false)`. Keep `__max ≤ 10` and the property allow-list unchanged.
- [ ] **Step 4:** `grep -n waitForTimeout e2e-v2/bc.spec.ts` gives no output. In `bc-capture.spec.ts`, `shot()` calls `waitForIntroDone`.
- [ ] **Step 5: Stability proof.** `npx playwright test -c playwright.v2.config.ts e2e-v2/bc.spec.ts --repeat-each=10`, then the same with a parallel CPU load (`(npm run build:v2 >/dev/null &) ; sleep 1; npx playwright test … --repeat-each=5`). Expected: 0 failures. Record the exact commands, Playwright and Chromium versions (`npx playwright --version`), pass/fail counts and the residual flake rate in `BACK-35-stability.md`. Also record: "GitHub Actions does not run `npm run e2e:v2`; V2 WebKit is not covered in CI (not changed here)."
- [ ] **Step 6:** `npm run check && npm run e2e:v2` PASS. Commit `test: replace fixed waits in the B+C pilot spec with state-based waits (BACK-35)`.

---

### Task 2: BACK-30, permission-scoped world for V2 Mission Map and B+C

**Files:**
- Create: `app/src/design-lab/v2/logic/authorize.ts`, `app/src/design-lab/v2/logic/authorize.test.ts`
- Modify: `app/src/design-lab/v2/screens/MissionMap.tsx` (the `const w = WORLD` lines at about :59, :388, :415), `app/src/design-lab/v2/screens/MissionMapBC.tsx:27`
- Modify (expectations only): `fixtures/world.test.ts:111-118`, `logic/bc.test.ts:110-121`, plus any `restricted` assertions in `e2e-v2/{bc,structure,interactions}.spec.ts` (`grep -n restricted e2e-v2/*.ts`) and the BC edge-count assertion `bc.spec.ts` "`[data-dim]` toHaveCount(10)", which becomes 9 for Owner.
- Create: `app/e2e-v2/nondisclosure.spec.ts`
- Create: `docs/qa/kawalys-frontend/BACK-30-nondisclosure.md` (+ screenshots under `docs/qa/kawalys-frontend/screens/BACK-30/`)

**Interfaces:**
- Consumes: `World`, `WorldNode`, `WorldEdge` (`v2/types.ts`); `Persona` (`src/contract/types.ts`); `nodeStatus` (`logic/status.ts`).
- Produces: `authorizedWorld(w: World, persona: Persona): World` in `logic/authorize.ts`.
  - `persona === 'technical'` → returns `w` itself (same reference).
  - Otherwise returns a new World where every evidence record with `visibility === 'technical'` is gone from **all** places a record or its ID appears: `evidenceById`, `nodes[].evidence`, each node state's `basis` arrays, `edges[].evidence`, `missions[].evidence`, and any other `World` field holding evidence IDs or refs. The implementer must read `types.ts` and cover every such field. The JSON test below is the backstop.
  - An edge whose `evidence` was non-empty and is empty after filtering is **removed** (d4). Its nodes stay if anything else supports them.
  - A node state axis (`health`, `freshness`) whose whole basis was removed becomes `'unknown'`. Connectivity comes from source reachability (`w.sources`), which is authorized for all, so it is kept.
  - Memoized per persona (module-level `Map<Persona, World>` keyed on the input `w`), so screens can call it on every render.
- Task 3 consumes the scoped `w` unchanged; the marker count follows `w.edges`.

- [ ] **Step 1: Write the failing unit tests** in `authorize.test.ts`:
  - `it('returns the same world for Technical')`: `expect(authorizedWorld(WORLD,'technical')).toBe(WORLD)`.
  - For `p` of `['owner','nontechnical']`:
    - `JSON.stringify(authorizedWorld(WORLD,p))` does not contain `'E-5'`. Also, for every `technical`-visibility record in `WORLD.evidenceById`, it does not contain that record's `id`, `observation.target.label` or `observation.target.externalId`.
    - `edges.find(e=>e.id==='d4')` is `undefined`; `edges.length === WORLD.edges.length - 1`.
    - `nodeStatus` of `inventory` is not `'healthy'` and equals `'unknown'`; its freshness is not `'stale'`.
    - `sentry` node still present with `evidence` `[]`; `w.sources` deep-equals `WORLD.sources`.
    - Mixed record kept: `MSN-DEMO-2.evidence` equals `['E-9']`; `evidenceById['E-9']` present (public stale record survives).
    - `authorizedWorld(WORLD,p) === authorizedWorld(WORLD,p)` (memoized).

  Run `npx vitest run src/design-lab/v2/logic/authorize.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 2:** Implement `authorize.ts`. Re-run. Expected: PASS.
- [ ] **Step 3: Write the failing e2e** `e2e-v2/nondisclosure.spec.ts`. Use a helper `leaks(page)` that collects `document.body.innerText` plus every `aria-label`, `title`, `alt` and `data-*` attribute value, and returns those matching `/E-5/`.
  - For `persona ∈ {owner, nontechnical}` × `lang ∈ {en, ar}`:
    - V2 map (`/v2.html#/mission-map?persona=…&lang=…&node=inventory`), overview tab: `leaks` is `[]`. Then switch to the Evidence tab and then the Sources tab: still `[]`. The node table row for Inventory shows evidence count `0`. The links table has no Inventory↔Sentry row. No element with text matching the `edge.restricted` copy in that language.
    - B+C (`loadBc(page,{persona,lang,node:'inventory',view})`) for `view ∈ {map,list}`: `leaks` is `[]`. `.kv2-bc-edge[data-id="d4"]` count 0. The Inventory node's accessible name does not contain the Stale word for that language (`t('chip.stale')` equivalent; read the key from `i18n`). Map/list parity: the links-table row count equals the `.kv2-bc-edge` count.
  - Permitted case: `persona=technical&lang=en`. `E-5` is visible in the Inventory evidence tab (V2 and B+C), and `.kv2-bc-edge[data-id="d4"]` count 1.
  - Persona switch: load Technical with `node=inventory`, change the hash to `persona=owner` via `page.evaluate(() => location.hash = location.hash.replace('technical','owner'))`, then assert `leaks` is `[]` and d4 is absent.
  - Use `waitForIntroDone` (Task 1) before any map assertion.

  Run: `npx playwright test -c playwright.v2.config.ts e2e-v2/nondisclosure.spec.ts`. Expected: FAIL on the Owner/Nontechnical cases.
- [ ] **Step 4:** Wire the scoped world. In each listed `const w = WORLD`, use `const w = authorizedWorld(WORLD, route.persona)` (route from `useV2()`). Leave `edgeRestricted`/`evidenceView` restricted branches in place as defence in depth; they are now unreachable from these screens. Do not touch `SourceObservatory`, `MissionReplay`, `AgentFlightDeck` or `Shell` (out of scope; see follow-ups).
- [ ] **Step 5:** Update the old "reveals only that it exists" expectations listed under Files to the new rule. Change the assertions; do not delete the tests. For example, `world.test.ts` keeps `evidenceView` unit behaviour and adds a line saying screens never pass restricted records any more. Then run the full suites: `npm run check && npm run e2e:v2`. Expected: PASS.
- [ ] **Step 6: Evidence.** Capture screenshots (Playwright script run from the scratchpad, not committed) of V2 and B+C with `node=inventory`: Owner EN, Owner AR, Nontechnical EN, Technical EN. Write `BACK-30-nondisclosure.md` covering:
  - the matrix (Technical: all; Owner/Nontechnical: no `technical` records or derivatives);
  - M05-D05-B cited (Confluence page 85164033);
  - the list of surfaces traced, each with before → after;
  - the line "display persona is not authorization; no server-side identity/tenant/X02/X04 enforcement exists or is claimed";
  - out-of-scope surfaces still on raw `WORLD`: Source Observatory, Mission Replay, Flight Deck, Shell search;
  - rollback = revert this commit.
- [ ] **Step 7:** Commit `fix: hide Technical-only evidence and its derivatives from unauthorized personas in V2 map and B+C (BACK-30)`.

---

### Task 3: BACK-34, legible link markers and strokes on phone canvases (minimal fix)

**Files:**
- Modify: `app/src/design-lab/v2/bc/Canvas.tsx:38-51` (Edge), `:126-160` (Canvas)
- Modify: `app/src/design-lab/v2/styles/bc.css` (marker layer, `vector-effect`, ≤640px sizes)
- Modify: `app/e2e-v2/bc.spec.ts` (new `describe('phone map legibility')`), `app/e2e-v2/bc-capture.spec.ts` (BACK-34 cases)
- Modify: `docs/design-lab/hybrid-map/SPEC.md` (deviation record)

**Interfaces:**
- Consumes: scoped `w` (Task 2); `curve()`, `BC_CANVAS`; `waitForIntroDone` (Task 1).
- Produces: markers rendered as HTML, not SVG. They are siblings of the node buttons inside `.kv2-bc-canvas`: `<span className="kv2-bc-mk" data-edge={e.id} data-shape="circle"|"diamond" aria-hidden="true" style={{'--fx','--fy'}} />`, with the same rule for which edges get a marker as today (none for `group` or `truth === 'unknown'`; `hypothesis` → diamond, otherwise circle). The `<circle>`/`<rect>` `.kv2-bc-mk` inside the SVG are removed. Edge `data-*` attributes are unchanged.

- [ ] **Step 1: Write failing tests** in `bc.spec.ts`, under `describe('phone map legibility')`. For `width ∈ {320, 375, 768}` (heights 700/812/1024), `view: 'map'`, after `waitForIntroDone`:
  - Every `.kv2-bc-mk` has a bounding box with `width ≥ 10`, `height ≥ 10` and `|width − height| ≤ 1` (not stretched).
  - Each marker's centre is within 3 px of its edge path's midpoint. Compute that with `path.getPointAtLength(path.getTotalLength()/2)` mapped by `path.getScreenCTM()`, matching the marker to `.kv2-bc-edge[data-id=<data-edge>] path:not(.kv2-bc-glow)`.
  - The `.kv2-bc-mk` count equals the number of `.kv2-bc-edge` with `data-truth` in `{observed, hypothesis}` and `data-cls != group`.
  - Computed `vector-effect` of `.kv2-bc-edge path` and `.kv2-bc-orbit` is `non-scaling-stroke`.
  - No two `.kv2-bc-orb` bounding boxes overlap by more than 4 px on both axes. If this fails on the current geometry, fix it in Step 3 with ≤640px CSS only (orb size or `--pad`); do not move node coordinates.
  - Existing checks still hold at these widths: `smallTargets(page)` is `[]` at ≤640, and no horizontal overflow.
  - Reduced motion at 375: markers present, `getAnimations().length === 0`.

  Run with `-g "phone map legibility"`. Expected: FAIL (no HTML markers yet).
- [ ] **Step 2:** In `Canvas.tsx`, compute the marker midpoints with `curve()` and render the HTML marker layer. Positions use the same `--fx = mx / BC_CANVAS.w` and `--fy = my / BC_CANVAS.h` fractions and the same `--pad` inset formula as `.kv2-bc-node` (`bc.css:64-65`). Remove the SVG markers.
- [ ] **Step 3:** In `bc.css`:
  - `.kv2-bc-mk`: absolute, `translate(-50%,-50%)`, 10 px desktop / 12 px at `max-width: 640px`. Circle = `border-radius: 50%`; diamond = `rotate(45deg)` square with 9/11 px sides. Colours reuse the existing marker tokens. `pointer-events: none`.
  - Dim/highlight states mirror the edge: a `[data-dim]` attribute on the span is set from the same `dim` value.
  - Add `vector-effect: non-scaling-stroke` to edge paths and orbits.

  Re-run Step 1's tests and the whole `bc.spec.ts`. Expected: PASS, and the budget test still passes (SVG count drops, DOM count unchanged).
- [ ] **Step 4: Screenshots.** In `bc-capture.spec.ts`, add `back34-{en,ar}-{320,375,640,768}-map` (and `-list` at 375) writing to `docs/design-lab/hybrid-map/out/BACK-34/`. Run `BC_CAPTURE=1 npx playwright test -c playwright.v2.config.ts e2e-v2/bc-capture.spec.ts -g back34`. Check that `out/` is git-ignored; if it is, copy the 10 PNGs to `docs/qa/kawalys-frontend/screens/BACK-34/` for the PR.
- [ ] **Step 5:** Add a `SPEC.md` deviation entry recording:
  - the owner decision (minimal fix, 2026-11-21) and that the stretched geometry is kept on purpose (uniform scaling would need a second phone layout);
  - markers moved to HTML, with `non-scaling-stroke`;
  - the regression criteria (the Step 1 tests);
  - rollback = revert this commit;
  - that BACK-32 should judge the result on devices.
- [ ] **Step 6:** `npm run check && npm run e2e:v2` PASS. Commit `fix: keep B+C link markers and strokes legible on phone canvases (BACK-34)`.

---

### Task 4: BACK-33, S6845 keyboard evidence and SonarCloud hand-off (no code)

**Files:** Create `docs/qa/kawalys-frontend/BACK-33-s6845.md`; add a test to `app/e2e-v2/bc.spec.ts` only if it passes (it is the evidence).

- [ ] **Step 1:** Try to list the live issues through the `sonarqube:sonar-list-issues` skill (rule `typescript:S6845`, file `Tables.tsx`). If it is not authenticated, record "BLOCKED: no SonarCloud login in this session". Do not attempt to log in.
- [ ] **Step 2: Keyboard test** `'list tables: each scroll region is reachable by Tab, named, and scrolls with the arrow keys'`. For each of the three regions (`bc.ledger`, `bc.matrix`, `map.cap.links`) at 375 px in EN and AR:
  - Tab reaches it, and it has `role=region` and a non-empty accessible name.
  - If `scrollWidth > clientWidth`, `ArrowRight` (EN) or `ArrowLeft` (AR) changes `scrollLeft`.
  - If it does not overflow at that width, record "no overflow at 375; focus stop is still announced as a named region".

  Run it and record the per-region results.
- [ ] **Step 3:** Write the doc. Include a per-warning table (Tables.tsx line 31 / 79 / 111 → observed keyboard behaviour → recommended disposition), and the exact SonarCloud steps for the owner: SonarCloud → project → Issues → filter Rule `typescript:S6845`, File `Tables.tsx` → open each issue → **Change status → Accept**. The comment must cite the tested behaviour for that region. A region that showed a real problem gets "keep open, fix under a separate slice" instead.
- [ ] **Step 4:** Commit `docs: S6845 keyboard evidence and SonarCloud steps for the pilot tables (BACK-33)`.

---

### Task 5: BACK-31, Arabic review packet (no copy edits)

**Files:** Create `docs/qa/kawalys-frontend/BACK-31-arabic-review.md`, screenshots under `docs/qa/kawalys-frontend/screens/BACK-31/`.

- [ ] **Step 1:** Generate a table of every key in `i18n/bc.ts`: key | EN | AR (current) | where it shows (screen/control) | reviewer verdict (blank) | proposed edit (blank). Include the `formatAt` sample ("15 نوفمبر 13:09") and the counters with N = 0, 1, 2, 3, 11 to expose plural forms. Generate it with a small Node/tsx script run from the scratchpad and paste the output.
- [ ] **Step 2:** Capture AR screenshots on the post-Task-2/3 build: desktop map, desktop list, inspector Evidence and Sources tabs, mobile list at 375, phone map at 375.
- [ ] **Step 3:** Add a clearly labelled "Machine pre-read (not a sign-off)" column with possible issues (pluralisation, bidi around IDs, terminology consistency with `common.ts`). Note that `edge.restricted` is no longer shown to any persona after BACK-30, so the reviewer can skip it.
- [ ] **Step 4:** The doc ends with the sign-off block: reviewer name, date, decision. Ticket stays open until that block is filled. Commit `docs: Arabic review packet for the B+C pilot strings (BACK-31)`.

---

### Task 6: BACK-32, manual a11y and device test kit, plus V2 WebKit run

**Files:** Create `docs/qa/kawalys-frontend/BACK-32-manual-kit.md`.

- [ ] **Step 1: V2 WebKit evidence (engine, not device).** Create a scratchpad config that re-exports `app/playwright.v2.config.ts` with `projects: [{ name: 'webkit', use: devices['Desktop Safari'] }]`, then run `npx playwright test -c <scratch config>` from `app/`. Record the WebKit version and pass/fail per spec. A failure is a finding to report; do not fix it in this task.
- [ ] **Step 2:** Write the kit as one row per check from the ticket (landmarks, skip link, rail `aria-current`, 10 node names "title, kind, status", arrows + Enter, `aria-live` inspector heading, ledger/matrix/links table reading, age bars and pips, RTL tab mirroring, 44px, reduced motion with the OS setting). Each row has columns: case | steps | expected | NVDA EN | NVDA AR | VoiceOver EN | VoiceOver AR | iPhone Safari | Android Chrome. Every result cell starts as `NOT RUN`, with a header for OS / browser / version / AT / device / tester / URL / viewport / date. Include the BrowserStack SDK command from `CLAUDE.md` (credentials via env only).
- [ ] **Step 3:** Commit `docs: manual a11y and device kit for the B+C pilot, with a V2 WebKit run (BACK-32)`.

---

### Task 7: Opus whole-branch validation, PR and Jira notes

- [ ] **Step 1:** Opus reviewer on `git diff main...HEAD`, checking the Global Constraints, the Review Focus items and each ticket's "Done when". Fix the findings (Sonnet implementer), then re-review.
- [ ] **Step 2:** Run `cd app && npm run check && npm run e2e:v2`, then the root suite `cd .. && npx playwright test` (the root prototype is untouched, so this only confirms nothing broke). Expected: PASS.
- [ ] **Step 3:** Push `claude/charming-franklin-isieiu`. Open a PR against `main` using the repo PR template if one exists, with a section per ticket. Label each ticket honestly as **fixed** (30, 34, 35) or **evidence prepared, human action required** (31, 32, 33).
- [ ] **Step 4:** Post one comment per Jira ticket with the PR link and the remaining human step. Do not transition any ticket to Done. BACK-31 and BACK-32 need human results, BACK-33 needs a SonarCloud login, and BACK-30 still has open X02/X04 items.

## Follow-ups (not in this plan)
- Source Observatory, Mission Replay, Flight Deck and Shell search still read raw `WORLD`. Apply `authorizedWorld` there under a new ticket.
- Add `npm run e2e:v2` (chromium + webkit) to CI. This is a workflow change and needs its own approval.
