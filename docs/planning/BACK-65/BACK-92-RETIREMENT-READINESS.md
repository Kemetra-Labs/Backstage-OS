# BACK-92 (S10b): retirement readiness, updated census

READ-ONLY. Nothing is deleted, moved or retired by this note, and no file outside this note is changed. Synthetic only; persona is a display switch, not authorization. Retirement stays approval-gated.

Base: `origin/main` `8b81d20` (includes #67 to #69). Open QA drafts at the time of writing, none merged: #70 (BACK-90 Flight Deck unit tests), #71 (BACK-91 zoom/focus spec, shared `SCREENS`/`openScreen` in `e2e/lens-helpers.ts`, corrected QA report), #72 (BACK-33 scroll-region keyboard spec). None of them touches a file listed under RETIRE below; #71 and #72 add specs that target the lens components, which are kept.

This supersedes the table posted on BACK-92 on 23 Nov 2026 where it differs.

## 1. Classification (unchanged unless marked)

| Path | Class | Consumers (import search) | Note |
|---|---|---|---|
| `app/src/domain/`, `app/src/bridge/`, host routes and `screens/*Lens.tsx` | KEEP | the one AppShell | canonical authority and host adapter |
| `design-lab/v2/{bc,components,logic,i18n,fixtures,types.ts}`, `screens/{MissionMapBC,SourceObservatory,MissionReplay,AgentFlightDeck}.tsx`, the nine embeddable stylesheets | REUSE | `bridge/hostV2.ts`, `domain/*`, the four lenses | now the production implementation; a later rename to `src/lenses/` is move-only |
| `design-lab/v2/navigation/route.ts` | REUSE | `bridge/hostV2.ts` and its test | |
| `design-lab/v2/context.tsx` | split | `bridge/hostV2.ts` imports `V2Context`/`useV2`; only `V2Provider` is lab-only | `V2Context` and `useV2` are already exported separately from `V2Provider`, so no extraction is needed: only the `V2Provider` function is removed with the lab entry |
| `design-lab/v2/{App,main}.tsx`, `navigation/Shell.tsx`, `styles/{reset,fonts}.css`, `app/v2.html`, `app/vite.v2.config.ts` | RETIRE AFTER PARITY | lab entry only; `scope.test.ts` asserts on `reset.css` and `fonts.css` | |
| `design-lab/v2/navigation/hits.ts` | RETIRE AFTER PARITY | `logic/authorize.test.ts` | move that test to the lens search path first |
| `design-lab/v2/screens/MissionMap.tsx` (concept A, 510 lines) | RETIRE AFTER PARITY | **only** the lab `App.tsx`, which renders it as the lab's default map (`bcPilot() ? <MissionMapBC /> : <MissionMap />`) | the host `src/screens/MissionMap.tsx` is a different file and is kept. Retiring it clears 3 of the 9 open SonarCloud S6845/S6848 issues |
| `app/e2e-v2/` (7 specs, 2,136 lines) and `playwright.v2.config.ts` | RETIRE AFTER PARITY | run on the lab entry | see section 2 |
| `app/e2e-v2/bc-capture.spec.ts` | KEEP (new) | evidence capture, opt-in `BC_CAPTURE=1`, writes tracked files under `docs/design-lab/hybrid-map/out/BACK-34/` | do not retire without an owner decision about those captures |
| V1 and V2 world fixtures; the Technical-only rule (`isWithheld`, `keepRef` x2) | BLOCKED | | owner decisions: `stock-sync`→`inventory` edge, `KH`/`SB` identity |
| Root prototype `index.html`, `js/`, `css/`, `tests/`, `tests-bstack/`, `browserstack.yml` | KEEP | separate owner call; `CLAUDE.md` script-order rules; own CI suite; holds 20 SonarCloud S2703 BLOCKER issues | |
| `server/` | KEEP | synthetic BFF, own check | |

## 2. Missing parity evidence (what the lab specs check that no host spec checks yet)

The lab default entry (`v2.html#/mission-map`) renders concept A, so `interactions`, `fidelity` and `structure` run on it and on the other three lab screens. The host lens specs (`mission-map`, `source-observatory`, `mission-replay`, `agent-flight-deck`, `convergence`, and #71/#72) cover layout, routes, history, persona switching, restricted-evidence matrices, read-only controls and reduced motion. Not yet covered at host level, found by reading the lab spec titles:

| Lab spec (title) | Host equivalent | Action before retiring |
|---|---|---|
| `structure`: touch targets at least 44 x 44 on a touch phone | none | add to a host spec, or accept the loss |
| `structure`: side navigation closed and not focusable at 375 px, Escape closes it | none for the host sidebar | add host check |
| `structure`: keyboard focus always visible on interactive elements | none | add host check |
| `structure`: Arabic, no Latin run outside a left-to-right isolate; Arabic map geometry stays left to right | none | add host check |
| `interactions`: replay play, 4x clock, restart, stop at the end; playback makes no request and writes nothing | `mission-replay.spec` covers the keyboard scrubber only | add host check |
| `interactions`: map zoom, pan, Ctrl+wheel, arrow-key node focus | `mission-map.spec` (B+C) | confirm B+C equivalents; concept A checks retire with concept A |
| `nondisclosure`: Deck event count "drops the withheld one" | the host shows the event count as not defined | retire with an owner decision on what `events` counts; do not migrate |
| `fidelity`: self-hosted fonts, horizon, rendered-pixel contrast | none | decide whether to keep (`fonts.css` and the horizon asset are lab files) |
| `canonical-overlap`, `nondisclosure` (B+C rows), `structure` (truth, shared world, personas) | `e2e/canonical-overlap.spec.ts`, `e2e/convergence.spec.ts`, per-lens matrices | name the one-to-one mapping in the retiring PR |

Manual evidence still pending and tied to the lab: `docs/qa/kawalys-frontend/BACK-31-arabic-review.md` and `BACK-32-manual-kit.md` tell testers to open `v2.html`. Retiring the entry before those manual runs, or without rewriting the kits for the host app, would remove what the testers use.

## 3. Smallest safe future slices (in order; each its own PR; none started)

- **S0, tests only:** add the host-level checks marked "add" above (touch targets, sidebar Escape, focus visibility, Arabic isolates, replay clock), each failing against a reverted-behavior mutation. Rollback: revert the PR.
- **S1, lab-only behavior change, no deletion:** make the lab's default map the B+C map and retarget the concept-A checks in `interactions`, `nondisclosure` and `structure` to it (or to the host spec). After this, `design-lab/v2/screens/MissionMap.tsx` has no importer. Needs owner approval (it changes what the lab shows).
- **S2, first deletion:** delete concept A `MissionMap.tsx`. Required tests: `npm run check`, `npm run build`, `build:v2`, `e2e`, `e2e:v2`. Rollback: revert the PR.
- **S3, lab entry:** delete the files in the RETIRE rows together with `e2e-v2/` (except `bc-capture.spec.ts`), and change `package.json` scripts, the `tsconfig` include, the `e2e:v2` step in `.github/workflows/ci.yml` and the docs that name `v2.html`. This changes the required check's job, so it needs explicit owner approval, the BACK-31/BACK-32 kit decision, and the section 2 parity closed. Rollback: revert the PR (CI step included).

## 4. Rollback

Every slice is a single PR; rollback is `git revert` of its merge commit. S1 to S3 do not change the data model, the host routes or the lenses; a failed S3 revert restores the lab entry, its specs and the CI step together.

## 5. Constraints that hold throughout

Canonical domain authority, evidence provenance, persona-scoped non-disclosure (E-5 in DOM, ARIA, URLs, counts and timing), the V1 tables and details, the B+C visualizations, EN/AR/RTL, keyboard and mobile behavior. No big-bang cleanup, no new V3 app, no CircleCI change.
