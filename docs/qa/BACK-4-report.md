# BACK-4 Prototype QA report

Date: 2026-11-15. Commit under test: `16462de` (branch `claude/uyghur-session-4-86ec54`, no source changes). Served over HTTP at `127.0.0.1:8765`, demo data only.

**Recommendation: NEEDS REVIEW.** Local Playwright results are clean, but the BrowserStack real-browser pass did not run (blocked, see below) and Firefox could not be exercised locally.

## Environment
Windows 11, Node 24.21, Playwright 1.65 (`@playwright/test`), Chromium 1255, WebKit 2388. Run: `npx playwright test` (workers: 1).

## Results
| Project | Passed | Failed |
|---|---|---|
| chromium | 58 | 0 |
| webkit (Safari engine) | 58 | 0 |
| firefox | not run | spawn UNKNOWN on launch (local environment, not an app result) |

## F1–F6 (each reproduced independently by `tests/findings.spec.js`)
| # | Finding | Verdict | Evidence |
|---|---|---|---|
| F1 | Investigation status bar vs graph overlap | FIXED | All investigations × 7 widths (1440→320) × ok/stale/down: bounding boxes of `.statbar` and `.map` never intersect |
| F2 | Mobile Home risks/milestones cards | FIXED | 320/375/390/430px: both panels span the content width and stay inside the viewport |
| F3 | "Soonest due" chronological | FIXED | Inbox order D2, D1, D4, D3, D5 in EN and AR (Dec 1 after Nov 30) |
| F4 | Hidden nav focus + Escape | FIXED | Closed nav `visibility:hidden`, 45 Tab presses never enter it (390 and 1024px); open focuses first item; Escape closes and refocuses menu button; RTL opens from the right |
| F5 | Source provenance / Unknown ≠ Healthy | FIXED (as tested) | Down: crit notice, no "On track" or `b-ok` on project cards, graph nodes unknown; Stale: 9 h warnings on evidence and Customers |
| F6 | Reset demo | FIXED | Runs, timers, source, sort, filter, tab restored; persona/lang/route kept; after 8 s no leaked timer fired (no run, no history row, no toast) |

Mutation check: reverting the F3, F4 and F6 fixes made 6 of the targeted tests fail, so these tests detect regressions. Source was restored afterwards (`git status` clean for `css/` and `js/`).

## Other checks
- No uncaught JS errors and no failed or 4xx requests on all nine screens (Google Fonts excluded; aborted by design).
- No horizontal overflow on any screen at 1440, 1280, 1024, 768, 430, 390, 375, 320.
- Three personas × EN/AR: `dir`/`lang` attributes, navigation, no errors. Ctrl+K search opens and closes with Escape.

## Not covered / unverified
- **BrowserStack: NOT YET RUN (blocked on running the SDK with credentials).** Access verified read-only (Device Control plan "Automate Mobile", 5 parallel allowed, 0 running). The BrowserStack MCP `create_session` has no option for BrowserStack Local (`local` / `localIdentifier` are rejected), so an agent-driven session cannot reach `127.0.0.1` even with a tunnel up; reported to BrowserStack. The supported route is the Node SDK with `browserstackLocal: true`: `browserstack.yml` (macOS Sequoia WebKit, Samsung Galaxy S23 Chrome), `playwright.bstack.config.js` and `tests-bstack/smoke.spec.js` are in place and pass locally on Chrome (4 passed, 1 skipped). **Attempt 2026-11-16 00:20 (owner ran `npm run test:browserstack`): FAILED before any cloud session.** SDK log shows `401 Unauthorized` from the BrowserStack API (credentials rejected), no build link was created, and Playwright fell back to a local browser launch and failed all 5 tests (missing local headless-shell binary), so those failures say nothing about the app. A Local-binary log-path quoting error (`Could not clear log file ... ENOENT`) also appeared and is unresolved. No BrowserStack session was started and nothing is claimed as passed. Real Safari is not available through the Playwright SDK (WebKit engine only).
- Firefox, real iOS/Android devices and Safari on macOS: unverified.
- Not tested: reduced-motion behaviour, screenshot/visual fidelity, `viewport-fit`/safe-area (commit notes it was dropped and untested), keyboard focus traps in the drawer/palette, F5 on screens other than those listed.
- F5 "Unknown ≠ Healthy" is asserted on Home, evidence, graph model and Customers only.

## Reproduce
```bash
npm install && npx playwright install chromium webkit
npx playwright test
```
