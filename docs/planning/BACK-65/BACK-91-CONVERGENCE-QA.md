# BACK-91 (S10a): cross-screen convergence QA, disposition and retirement readiness

Synthetic only. No deletion, no production-readiness claim, no auto-merge. Persona is a display switch, not authorization: no server-side identity, tenant or X02/X04 enforcement exists or is claimed. Nothing in this app is live telemetry.

Base: `origin/main` `c7f982596f1d` (BACK-84, PR #59). CI for that SHA: `completed success` (verified live). The six PRs below are **stacked drafts, none merged**.

## 1. What exists now (state of the stack)

| Ticket | Result | Branch | Commit | PR (draft, base) |
|---|---|---|---|---|
| BACK-85 typed ID and host context bridge | DRAFT PR | `feat/back-85-typed-id-host-bridge` | `f338631` | [#60](https://github.com/Kemetra-Labs/Backstage-OS/pull/60) (main) |
| BACK-86 semantic tokens and CSS isolation | DRAFT PR | `feat/back-86-css-isolation` | `275772a` | [#61](https://github.com/Kemetra-Labs/Backstage-OS/pull/61) (#60) |
| BACK-87 unified B+C Mission Map | DRAFT PR | `feat/back-87-mission-map-lens` | `f42ad75` | [#62](https://github.com/Kemetra-Labs/Backstage-OS/pull/62) (#61) |
| BACK-88 Source Observatory | DRAFT PR | `feat/back-88-source-observatory` | `97aa288` | [#63](https://github.com/Kemetra-Labs/Backstage-OS/pull/63) (#62) |
| BACK-89 Mission Replay | DRAFT PR, time-ordering segment BLOCKED | `feat/back-89-mission-replay` | `a882af5` | [#64](https://github.com/Kemetra-Labs/Backstage-OS/pull/64) (#63) |
| BACK-90 Agent Flight Deck | DRAFT PR, events figure classified unknown | `feat/back-90-agent-flight-deck` | `7958448` | [#65](https://github.com/Kemetra-Labs/Backstage-OS/pull/65) (#64) |
| BACK-91 this QA | this PR | `feat/back-91-convergence-qa` | see PR | [#66](https://github.com/Kemetra-Labs/Backstage-OS/pull/66) (#65) |
| BACK-92 retirement | NOT EXECUTED (recommendation only, section 6) | | | |

Jira tickets are left open until their merge status is reconciled.

## 2. One application: what the convergence spec proves (`e2e/convergence.spec.ts`, Chromium and WebKit)

- **One AppShell and one route authority, on 15 screens** (the eight V1 screens plus Project/KH, Map with a selection, Observatory, Replay, Flight Deck), EN and AR, at 375 and 1440 px: exactly one `<main>`, one `#sidenav`, one skip link, one h1, no lab shell element (`.kv2-app`, `.kv2-top`, `.kv2-side`, `.kv2-skip`), the document title is the host's ("Kawalys ·", never "Kawalys V2"), correct `dir`/`lang`, no horizontal overflow, no console errors.
- **One persona and language authority:** switching persona and language on the Map holds across Sources, Agents, Investigation and back; the query keeps `persona` and `lang`; the hash never carries them (the lab's hash grammar is not in use).
- **Journey and history:** Map, Replay, Room, Sources, Observatory (a selected source), Agents, Flight Deck; Back retraces every step in reverse and Forward replays them, with the exact hashes.
- **Restricted evidence (M05-D05-B), Owner and Nontechnical, EN and AR, every screen:** no restricted evidence id or observation id in text, hidden text, aria-label, title, alt, href, any data attribute or the address; the demo search never returns a restricted id (search matches substrings, so an unrelated id such as DEMO-5 may appear for "O-5": the test checks that no result is the restricted id). Technical does see the record (so the matrix is not vacuous).
- **Unknown is never Healthy, and the screens agree:** the only Healthy node on the map and the only Healthy source in the Observatory is GitHub, for all three personas; the V1 tables never say "healthy".
- **Keyboard (Chromium) and reduced motion (both):** the skip link is the first stop and moves focus to `<main>` on every lens screen; no animation runs on any of the 15 screens under reduced motion. The WebKit keyboard check is **skipped on purpose** (Safari tabs to links only with its Tab-to-links option); it is recorded as skipped, not passed.

Per-lens specs (map 29, Observatory 25, Replay 24, Flight Deck 23 tests, each in two browsers) hold the detailed matrices: widths 320/375/768/1440, EN/AR, Back/Forward, deep links, persona switch, non-disclosure over every tab, read-only controls.

## 3. Evidence

| Check | Result |
|---|---|
| Main CI for `c7f9825` | `completed success` |
| `npm run check` (tsc, vitest, coverage) | PASS: 680 tests in 40 files, coverage 99.84% |
| `npm run build`, `npm run build:v2` | PASS, PASS |
| `npm run e2e` (Chromium + WebKit) | **PASS on the full final tree: 1,721 passed, 67 skipped, 0 failed** (66 skips pre-existing; the 67th is the deliberate WebKit keyboard skip above) |
| `npm run e2e:v2` (Chromium lab) | PASS: 313 passed, 32 skipped, 0 failed |
| Root prototype suite (`npx playwright test` at the repo root), `server/` check | NOT RUN: nothing under `index.html`, `js/`, `css/`, `tests/` or `server/` was touched |
| `git diff --check` | PASS (CRLF conversion warnings only) |
| Axe | NOT RUN (not present in the repo; not installed, as instructed) |
| Native Arabic review (BACK-31), manual NVDA/VoiceOver and real-device checks (BACK-32), 200% zoom measurement | NOT RUN, not relabelled |
| Production or tenant security (X02/X04) | NOT RUN, not claimed |

**Exact V1 change footprint** (`git diff origin/main...HEAD`, pre-existing production files only): `App.tsx` +2, `nav/routes.ts` +40/-12, `shell/Sidebar.tsx` +1, `i18n/shell.ts` +3/-1, `styles/components.css` +5, `screens/Sources.tsx` +40/-13, `screens/Agents.tsx` +32/-5, `screens/InvestigationRoute.tsx` +34/-4. In the lab: `context.tsx` +3, `deck.ts` +1, four screens gained an optional `embedded` prop (4 to 9 lines each), `base.css` lost the 14 global rules that moved to `reset.css`. Every other V1 screen file is untouched. The default view of Sources, Agents and the Investigation Room is the old one; the new views are reached by a link switch, and the tables/roster/room tests of the old suite pass unchanged (the full V1 suite is green apart from findings recorded in each PR).

**CI on the stack, investigated:**
- GitHub Actions "Playwright (chromium + webkit)" (the required check) passed on #60; the later PRs were still running or queued when this was written.
- `ci/circleci: playwright` **fails with 0 s on every PR, including the already-merged #59**: the job "failed before its first step ran" (executor never started). It is not a required check, pre-dates this work, and is infrastructure, not a test result. Not claimed green.
- SonarCloud Code Analysis **failed the quality gate on #64** for `new_duplicated_lines_density` 3.8% (limit 3%); all other conditions OK. Cause: four lens specs repeated the same helpers. Fixed in this slice by one shared `e2e/lens-helpers.ts`; #64's own gate stays red until the stack is merged or its spec is rebased, and should be re-read once the final PR is analysed.

## 4. Route and feature disposition

| Item | Disposition | Why |
|---|---|---|
| V1 Home, Portfolio, Project Intelligence, Evidence, Decisions, Decision detail | KEEP | Operational, tested, unchanged |
| V1 Investigation Room (default view) | KEEP | Unchanged; gained a view switch |
| V1 Sources tables, Agents roster (default views) | KEEP | Unchanged; gained a view switch |
| `#/map` Mission Map (B+C) | REUSE (new) | The B+C visual functionality, in the one shell |
| Sources Observatory view, Replay view, Flight Deck view | REUSE (new) | V2 screens embedded, one authority |
| React Flow dependency map (`?renderer=flow`) | KEEP | Opt-in, not made default |
| `bridge/` (identity, map context, host adapter, replay time) | KEEP | The single host-owned boundary |
| `design-lab/v2` screens, logic, i18n, fixtures, B+C components | KEEP | Now the production implementation of the four lenses |
| `design-lab/v2/styles/reset.css`, `fonts.css`, `navigation/Shell.tsx`, `navigation/hits.ts`, `App.tsx`, `main.tsx`, `V2Provider` in `context.tsx`, `v2.html`, `vite.v2.config.ts` | RETIRE AFTER PARITY | Lab shell only; the lab entry is how `e2e-v2` runs, so retire with it |
| `design-lab/v2/screens/MissionMap.tsx` (concept A map, 510 lines) | RETIRE AFTER PARITY | Used only by the lab; the B+C map replaced it (hybrid-map pilot picked B+C) |
| `e2e-v2/` and `playwright.v2.config.ts` | RETIRE AFTER PARITY | Cover the lab entry; the lens behaviour is now covered in `e2e/` |
| Root static prototype (`index.html`, `js/`, `css/`, `tests/`) and `server/` | KEEP | Out of scope here; separate owner decision |
| `docs/design-lab/hybrid-map`, `docs/planning/BACK-65` notes | KEEP | Decision record |
| KH and SB identity mapping to the map | BLOCKED | Needs an owner semantic decision (BACK-85) |
| Replay ordering by evidence time, "when it happened" | BLOCKED | Needs an owner decision (BACK-89) |
| Mission event-count meaning | BLOCKED | Shown as not defined until the fixture defines it (BACK-90) |

## 5. Unresolved risks and decisions that genuinely need the owner

1. **The `stock-sync` to `inventory` edge.** The map says hypothesis (canonical); V1 Project Intelligence still says authored (E-7, never read). One app now shows two classifications for one edge. Pinned by tests, not reconciled. Decision: which is true, then change the V1 fixture or the canonical one.
2. **Replay ordering (BACK-89).** The replay order is the processing order; evidence read times disagree with it (the PR record is read 35 minutes before the failure it is processed after); four of seven events have no time; occurrence time is not recorded. Decision: which time orders the replay, and what "occurred" means per source.
3. **Mission `events` (BACK-90).** Shown as "Not defined in the demo data" until the fixture says what it counts. The lab still shows a subtracted figure.
4. **KH and SB identity (BACK-85).** Same name is not proof; KH is unresolved, SB ambiguous. The map cannot link them to Project Intelligence until decided.
5. **The "B + C pilot" chip** is the lab's wording on the Mission Map. Product call.
6. **Hash router limits recorded in the PRs:** the Inspector tab and map/list view are module state, not in the route; a failed lazy chunk is not retried until reload; the Replay's starting event is written into the address on load (history is replaced, not added).
7. **Accessibility is automated-only.** No axe, no screen reader, no native Arabic review, no real device, no 200% zoom measurement (320 px reflow is tested). These need people (BACK-31, BACK-32).
8. **Persona is not authorization.** X02/X04 and any production tenant security remain outside this work.
9. **CircleCI** has been failing at start-up on every PR, merged ones included. Someone should look at the executor or the config; it is unrelated to these changes.

## 6. Remaining duplication (and the cleanup plan for BACK-92, not executed)

- **Two navigation systems exist in the repo:** the host's hash router and the lab's `navigation/route.ts` (still used by the lab entry and by `hostV2` for defaults). Two ways to render each lab screen: standalone (lab) and embedded.
- **Persona wording** lives in V1 `strings.ts` and V2 `TABLE`.
- **Two fixtures describe the same systems:** V1 `fixture/world.ts` and V2 `fixtures/world.ts`, both partly projected from `src/domain/`. Everything outside the INV-DEMO-7 overlap is still authored twice (see BACK-84 note).
- **The Technical-only rule** exists as `isWithheld` (V1), `keepRef` (V2) and `keepRef` in `domain/scope.ts`.
- **Source health appears in three screens** (V1 tables, Observatory, map) with one rule but three renderings.

Recommended BACK-92 order (each its own PR, after the stack merges and an owner confirms parity): (1) delete the lab-only shell and entry (`v2.html`, `vite.v2.config.ts`, `design-lab/v2/{main,App}.tsx`, `navigation/{Shell,hits}.ts`, the `V2Provider`, `reset.css`, `fonts.css`) and move `e2e-v2` checks that still add value into `e2e/`; (2) delete the concept-A `MissionMap.tsx` and its copy; (3) move the V2 screens and styles out of `design-lab/` into `src/lenses/` (rename only); (4) put the Technical-only rule in `domain/` for every record; (5) reconcile the two fixtures and the `stock-sync` edge. Nothing is deleted by this ticket.

## 7. Recommended merge order and rollback

Merge in stack order: #60, #61, #62, #63, #64, #65, #66. Each PR is small enough to review alone; GitHub retargets the next PR to `main` as its base merges (do not enable auto-merge; the required Playwright check must pass on each). Re-read the SonarCloud result on the first PR that touches the specs once it targets `main`.

Rollback: revert the PRs in reverse order. Every step is additive or a mechanical move and every old screen's default view is unchanged, so reverting any suffix of the stack leaves the app working; reverting #61 also needs #62 and later reverted (they import the scoped CSS).

## 8. Exact next step toward a single Kawalys app

Merge the stack in order with an owner review, then decide the four BLOCKED items in section 5 (they are product decisions, not engineering). With those answered, the next engineering PR is BACK-92 step (1): remove the lab shell and entry, which turns the lab into library code and leaves one application.
