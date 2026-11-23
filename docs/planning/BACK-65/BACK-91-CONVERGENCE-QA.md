# BACK-91 (S10a): cross-screen convergence QA, disposition and retirement readiness

Synthetic only. No deletion, no production-readiness claim, no auto-merge. Persona is a display switch, not authorization: no server-side identity, tenant or X02/X04 enforcement exists or is claimed. Nothing in this app is live telemetry.

Status note, 23 Nov 2026 (corrects the first version of this report, which was written while the six PRs were still open drafts). Base for the figures below: `origin/main` `8b81d20`.

The stack has since merged: #60 (`42d95af`) and #61 (`495f4be`) straight to `main`; #63 to #66 (BACK-88 to BACK-91) were merged into the #62 branch and reached `main` through #62 (`9fc7698`); #67 (`ea2a884`) then fixed a flaky WebKit assertion in the replay spec (test-only); #68 and #69 added unit coverage for the replay time rows and the Observatory's evidence scoping. Required check `Playwright (chromium + webkit)` completed `success` on `main` for `ea2a884` (run 45152191967) and on the merge of #69. #62 was merged while its own required PR check was failing (the WebKit race fixed by #67), and #67 was merged before its PR run finished.

## 1. What exists now (state of the stack)

| Ticket | Result | PR | Merge commit on `main` |
|---|---|---|---|
| BACK-85 typed ID and host context bridge | MERGED | #60 | `42d95af` |
| BACK-86 semantic tokens and CSS isolation | MERGED | #61 | `495f4be` |
| BACK-87 unified B+C Mission Map | MERGED (through #62) | #62 | `9fc7698` |
| BACK-88 Source Observatory | MERGED (through #62); Partial source state not in the contract | #63 | `9fc7698` |
| BACK-89 Mission Replay | MERGED (through #62); processing order kept by owner decision (Option A) | #64 | `9fc7698` |
| BACK-90 Agent Flight Deck | MERGED (through #62); events figure shown as not defined | #65 | `9fc7698` |
| BACK-91 this QA | MERGED (through #62) | #66 | `9fc7698` |
| BACK-92 retirement | NOT EXECUTED (recommendation only, section 6) | | |

Jira states are tracked on the tickets; BACK-83, BACK-84 and BACK-85 are Done, the rest stay open until their remaining criteria are met.

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

**CI on the stack, investigated (corrected):**
- GitHub Actions "Playwright (chromium + webkit)" is the required check. It passed on #60 and on `main` for `ea2a884`; it failed on #62's PR run (WebKit race, fixed by #67).
- `ci/circleci: playwright` is not a required check and fails on every PR. The earlier text here said it fails "with 0 s, the executor never started"; the job logs say otherwise. On PR #66 (run 0e653796) and PR #67 (run 9e850f1f) the job started, ran install, the root suite and the app unit tests, and was cancelled at the external 10-minute limit during "Run app Playwright tests" (`timed_out` at exactly 10:00). The job runs the GitHub workflow through `circleci run actions exec`; there is no `.circleci/` file in the repo, so the limit lives in CircleCI project settings (BACK-68, owner approval needed to change it).
- SonarCloud Code Analysis failed the quality gate on #64 for `new_duplicated_lines_density` 3.8% (limit 3%) because four lens specs repeated the same helpers; the shared `e2e/lens-helpers.ts` fixed that. The Quality Gate on `main` is OK with 0.5% new-code duplication.

**Automated QA added after the first version of this report** (`e2e/reflow-focus.spec.ts`, 7 tests per browser, Chromium and WebKit):
- Zoom reflow on every screen (15), EN and AR: a 1280 px window at 200% lays out at 640 CSS px and at 400% at 320 by 256 CSS px. Checked: no sideways page scroll, `<main>` inside the window, the persona and language controls inside the window, no console errors. This sets the layout width; it is **not** a real zoomed browser and does not replace a person zooming one.
- Focus after navigation: a link to another screen lands focus on `<main>` (all eight sidebar screens, EN and AR); Back and Forward never leave focus on `<body>`. Following the link of the screen that is already open changes nothing, by design.
- Mutation proof, reverted: forcing `main` to 900 px fails all 8 zoom tests; removing the focus move on route change fails all 6 focus tests.
- Shared `SCREENS`, `LENS_READY` and `openScreen` moved into `e2e/lens-helpers.ts` (they were private to `convergence.spec.ts`).
- Run at base `8b81d20`: `convergence`, `mission-map`, `source-observatory`, `mission-replay`, `agent-flight-deck` and `reflow-focus` specs together: 245 passed, 1 skipped (the deliberate WebKit keyboard skip above), 0 failed; `npm run check` 694 tests passed.

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
2. **Replay ordering (BACK-89): decided.** The owner chose Option A on 23 Nov 2026: the replay keeps processing order, source read time is shown beside it and never used to sort, and no occurrence time is inferred. Sorting by read time is rejected; a modelled "occurred" time is deferred to a separate domain-contract decision; a second lane of read times is an optional future enhancement.
3. **Mission `events` (BACK-90).** Shown as "Not defined in the demo data" until the fixture says what it counts. The lab still shows a subtracted figure.
4. **KH and SB identity (BACK-85).** Same name is not proof; KH is unresolved, SB ambiguous. The map cannot link them to Project Intelligence until decided.
5. **The "B + C pilot" chip** is the lab's wording on the Mission Map. Product call.
6. **Hash router limits recorded in the PRs:** the Inspector tab and map/list view are module state, not in the route; a failed lazy chunk is not retried until reload; the Replay's starting event is written into the address on load (history is replaced, not added).
7. **Accessibility is automated-only.** No axe, no screen reader, no native Arabic review, no real device, no 200% zoom measurement (320 px reflow is tested). These need people (BACK-31, BACK-32).
8. **Persona is not authorization.** X02/X04 and any production tenant security remain outside this work.
9. **CircleCI** times out at its external 10-minute limit on every PR (see section 3). It is not a required check and is unrelated to these changes; whether to retire the mirror or raise this one job's limit is an owner decision (BACK-68).

## 6. Remaining duplication (and the cleanup plan for BACK-92, not executed)

- **Two navigation systems exist in the repo:** the host's hash router and the lab's `navigation/route.ts` (still used by the lab entry and by `hostV2` for defaults). Two ways to render each lab screen: standalone (lab) and embedded.
- **Persona wording** lives in V1 `strings.ts` and V2 `TABLE`.
- **Two fixtures describe the same systems:** V1 `fixture/world.ts` and V2 `fixtures/world.ts`, both partly projected from `src/domain/`. Everything outside the INV-DEMO-7 overlap is still authored twice (see BACK-84 note).
- **The Technical-only rule** exists as `isWithheld` (V1), `keepRef` (V2) and `keepRef` in `domain/scope.ts`.
- **Source health appears in three screens** (V1 tables, Observatory, map) with one rule but three renderings.

Recommended BACK-92 order (each its own PR, after the stack merges and an owner confirms parity): (1) delete the lab-only shell and entry (`v2.html`, `vite.v2.config.ts`, `design-lab/v2/{main,App}.tsx`, `navigation/{Shell,hits}.ts`, the `V2Provider`, `reset.css`, `fonts.css`) and move `e2e-v2` checks that still add value into `e2e/`; (2) delete the concept-A `MissionMap.tsx` and its copy; (3) move the V2 screens and styles out of `design-lab/` into `src/lenses/` (rename only); (4) put the Technical-only rule in `domain/` for every record; (5) reconcile the two fixtures and the `stock-sync` edge. Nothing is deleted by this ticket.

## 7. Merge record and rollback

The stack is merged (see section 1); the original merge-order advice is no longer needed. Rollback is a revert of the relevant PR(s), newest first: every step was additive or a mechanical move and every old screen's default view is unchanged, so reverting any suffix leaves the app working. Reverting #61 also needs #62 and later reverted (they import the scoped CSS).

## 8. Exact next step toward a single Kawalys app

Decide the BLOCKED items in section 5 (they are product decisions, not engineering; the replay ordering one is decided: processing order stays, Option A). Then the next engineering PR is BACK-92 step (1): extract `useV2` from `context.tsx`, remove the lab shell and entry, and move the lab-only checks that still add value into `e2e/`. That step changes the CI workflow and `tsconfig`, so it needs owner approval first. Nothing is deleted by this ticket.
