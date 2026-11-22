# BACK-73 S2: V1 restricted-evidence non-disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For Owner and Nontechnical, V1 never reveals that a Technical-only evidence record exists: no id, row, placeholder, count, link, search hit, route, accessible text or state that rests only on it. Technical keeps everything.

**Architecture:** One pure projection, `authorizedWorld(w, persona)` for the V1 `World` and `authorizedInvestigation(inv, persona)` for `InvestigationData`, applied once in `App.tsx` and handed to screens through `AppContext` (`useApp().world`, `useApp().investigation`). Screens and shell stop importing the raw `WORLD` / `INV_DEMO_7`. Views then never see a restricted record, so the existing placeholder branches become unreachable for these personas.

**Tech Stack:** React 19, TypeScript strict, Vitest (`app/src/**/*.test.ts`), Playwright (`app/e2e`, chromium + webkit in CI).

**Spec:** Jira BACK-73; BACK-30 (M05-D05-B policy text); BACK-66 (the V2 precedent `app/src/design-lab/v2/logic/authorize.ts`); leak inventory recorded in the BACK-73 PR. Owner delegation 22 Nov 2026.

## Global Constraints

- M05-D05-B: for a persona other than `technical`, no evidence with `visibility === 'technical'` (fixtures: E-5, E-12, E-23) may be detectable in ids, rows, placeholders, counts, provider hints tied to that record, ages, links, routes, search, `aria-*`/`title`/`data-*` attributes, or derived health/freshness/attention.
- A display persona is a presentation switch, not authorization. No server-side enforcement is claimed (X02/X04 stay open).
- Unknown is never Healthy: a claim whose whole basis is withheld becomes `unknown` (health and freshness), with age `null`.
- Preserve independently authorized facts. **Source-level facts stay** (the Sentry `SourceAuthority` age/staleness is a source fact, not an evidence record; BACK-30: "do not globally suppress a provider merely because a restricted record used that provider").
- `technical` receives the input world itself (same object).
- English and Arabic both pass; no new user-visible copy is needed (removal only). Do not delete i18n keys in this slice.
- Do not touch `app/src/design-lab/**`, `app/src/domain/**`, root prototype (`index.html`, `js/`, `css/`, `tests/`), `.github/`.

## Rulings (delegated, recorded in the PR)

- M05-D05-B supersedes V1's D-5 "restricted items are counted" behaviour.
- An attention item whose evidence is entirely withheld is removed (ATT-RT-2).
- A direct route to a withheld evidence id (`#/evidence/E-12`) shows the existing not-found state, identical to an unknown id.
- V1 gets its own projection over the V1 `World` shape (the BACK-71 `scopeFixture` covers only the inv-demo-7 overlap); both use the same predicate `visibility === 'technical'`.
- Dead placeholder branches and unused copy are left for a follow-up cleanup ticket, to keep this diff reviewable.

## Review Focus

1. A component or product whose basis is only withheld evidence (RT `inventory`, RT `payments`, RT product health) shows `unknown`, never its old claim (`healthy`, `degraded`) and no age.
2. Attention titles that embed facts from withheld evidence (ATT-RT-2 "last seen 9 h ago") disappear with the item.
3. Unknown evidence id vs withheld evidence id on `#/evidence/:id`: identical DOM state.
4. Persona switch on the same page (Technical → Owner) re-projects immediately; no cached restricted row survives.
5. Search index built from the projected world: `E-12` returns the same "No match" as a nonsense query, for every query that would have matched it.

---

### Task 1: Pure projection `view/authorize.ts`

**Files:** Create `app/src/view/authorize.ts`, `app/src/view/authorize.test.ts`.

**Interfaces:**
- `export const isWithheld = (e: EvidenceReference, persona: Persona): boolean` — `persona !== 'technical' && e.visibility === 'technical'`.
- `export function authorizedWorld(w: World, persona: Persona): World` — `technical` returns `w`; otherwise memoized per (world, persona) in a `WeakMap`, and returns a world where:
  - `evidence` and `evidenceText` drop withheld ids;
  - every `basis` / `evidence` / `observed` / `record` / option `evidence` array drops withheld refs (projects `health`, components `state`, edges, attention, delivery, investigations, decisions);
  - a `DisplayState` whose non-empty basis became empty gets `health: 'unknown'`, `freshness: 'unknown'` (connectivity unchanged);
  - attention items whose non-empty evidence became empty are removed; delivery items whose `evidence` is withheld are removed;
  - an edge whose non-empty basis became empty is dropped, mirroring V2 `authorize.ts` (`e.evidence.length === 0 || e.evidence.some(visible)`); edges that never had a basis stay;
  - activity events whose `evidenceId` is withheld are removed;
  - investigations keep their other evidence.
- `export function authorizedInvestigation(inv: InvestigationData, persona: Persona): InvestigationData` — same rule on `evidence`, `nodes[].state` (basis → unknown), `facts[].evidence` (withheld → `null`), `hypothesis.supporting/contradicting`, `sources` unchanged; `rawOutput` kept only if its `evidenceId` is not withheld.

- [ ] **Step 1: Failing tests** (`authorize.test.ts`), for `owner` and `nontechnical`:
  - `no technical evidence id survives anywhere`: derive `ids = Object.values(WORLD.evidence).filter(e => e.visibility === 'technical').map(e => e.id)`; expect `ids.length > 0`; `JSON.stringify(authorizedWorld(WORLD, p))` contains none of them as a quoted id (`"E-5"` etc.); same for `authorizedInvestigation(INV_DEMO_7, p)`.
  - `inventory and payments become unknown with no age basis`: RT components `inventory` and `payments` have `state.health === 'unknown'`, `state.freshness === 'unknown'`, `state.basis.length === 0`.
  - `ATT-RT-2 is removed; ATT-RT-1 stays`.
  - `INV-DEMO-9 keeps E-21, E-22, E-24 only`.
  - `technical gets the same world object` (`toBe(WORLD)`), and same for `INV_DEMO_7`.
  - `memoized`: two calls return the same object.
  - `does not mutate WORLD`: `structuredClone` before/after `toEqual`.
- [ ] **Step 2:** `npx vitest run src/view/authorize.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Focused run → PASS.
- [ ] **Step 5:** Commit `feat: V1 persona projection that withholds Technical-only evidence (BACK-73)`.

### Task 2: Apply the projection once; screens read the projected world

**Files:** Modify `app/src/app/AppContext.tsx` (add `readonly world: World; readonly investigation: InvestigationData;`), `app/src/App.tsx` (compute both with `useMemo` on `persona`), every screen/shell file that imports `WORLD` or `INV_DEMO_7` from `fixture/` (21 files: `screens/{Home,Portfolio,Project,Evidence,Decisions,DecisionDetail,Agents,Sources,InvestigationRoute,InvestigationRoom}.tsx`, `screens/investigation/{SummaryRoom,RoomExtras,EvidenceLinks,TimelinePanel,ConflictPanel}.tsx`, `screens/project/ComponentPanel.tsx`, `screens/evidence/Related.tsx`, `shell/{DemoSearch,TopBar,Sidebar}.tsx`, and any other `.tsx` found by `grep -rln "fixture/world\|fixture/inv-demo-7" app/src --include=*.tsx`), `app/src/view/explorerView.ts` (stop defaulting `raw` to the unprojected `INV_DEMO_7`; take it as a parameter), `app/src/nav/search.ts` only if `buildIndex` needs the world passed in.

- [ ] **Step 1:** Replace each direct fixture import in `.tsx` with `const { world, investigation } = useApp()`. No view-function signature changes beyond `explorerFor`'s `raw` parameter.
- [ ] **Step 2:** `cd app && npx tsc --noEmit` clean; `grep -rn "fixture/world\|fixture/inv-demo-7" app/src --include=*.tsx` returns nothing outside tests.
- [ ] **Step 3:** Commit `refactor: screens read the persona-projected world from AppContext (BACK-73)`.

### Task 3: Update tests to the policy and add the non-disclosure e2e

**Files:** Modify the unit tests and e2e specs that assert today's placeholder (list in the BACK-73 inventory: `view/{evidence,viewFor,homeView,investigationView,projectView,portfolioView,decisionView,explorerView}.test.ts`, `fixture/world.test.ts`, `i18n/screens/decisions.test.ts` only if its assertion now fails, `e2e/{evidence,portfolio,home,decisions,investigation-integration,project,flow}.spec.ts`). Create `app/e2e/nondisclosure.spec.ts`.

Rule for editing an existing test: tests that call a view with the **raw** world as Technical stay unchanged; tests that asserted a placeholder for Owner/Nontechnical are changed to call the view with `authorizedWorld(WORLD, p)` and assert **absence** (not merely inverted strings). Never delete a test without replacing what it proved; never use `.skip` or swallow an assertion.

- [ ] **Step 1: New `e2e/nondisclosure.spec.ts`** — for persona `owner` and `nontechnical`, for `en` and `ar`, visit `#/`, `#/portfolio`, `#/project/RT`, `#/project/RT/inventory`, `#/project/RT/payments`, `#/investigation/INV-DEMO-7`, `#/investigation/INV-DEMO-9`, `#/decisions`, `#/evidence/E-1` (use the app's real route syntax; read `nav/routes.ts`): assert page text and every `aria-label`, `title`, `alt` and `data-*` attribute value contain none of `E-5`, `E-12`, `E-23`, `Restricted to Technical`, and the Arabic `copy.restricted` string. Then `#/evidence/E-12` and `#/evidence/E-999`: same DOM state (both not-found). Then Technical on `#/investigation/INV-DEMO-7` shows `E-5`; switch persona to Owner on the same page; `E-5` is gone.
- [ ] **Step 2:** Update the listed unit tests and e2e specs per the rule above.
- [ ] **Step 3:** `cd app && npm run check` → PASS. `npm run e2e` on chromium (use the sandbox workaround: a scratch Playwright config with `executablePath` for the preinstalled chromium if the revision mismatches; never commit it). Record PASS/FAIL/NOT RUN; WebKit runs in CI.
- [ ] **Step 4:** Commit `test: V1 non-disclosure for Owner and Nontechnical across screens (BACK-73)`.
