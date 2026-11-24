# BACK-35: timing stability of the B+C pilot spec

> **Retired (BACK-92 R4, 24 Nov 2026):** the V2 lab (`v2.html`, `app/e2e-v2/`, `npm run e2e:v2`) no longer exists. Commands below are historical; the lens checks now run in the host suite (`app/e2e`).

Date: 2026-11-21. Scope: `app/e2e-v2/bc.spec.ts` (and the capture helper in `bc-capture.spec.ts`). Test-only change.
This is preventive hardening, not a fix for an observed failure: PR #32 CI was green. No product code, backend or live
data is involved; the pilot still shows synthetic demo data only.

## What changed

- Every `waitForTimeout` in `bc.spec.ts` is replaced by a wait on observable state. New helpers in `bc-helpers.ts`:
  - `waitForIntroDone(page)`: `.kv2-bc-canvas[data-intro]` has count 0 (10 s), then `document.getAnimations()` has no
    `running` animation (10 s).
  - `waitForAnimationsSettled(page, timeout = 5000)`: the second half only. A looping animation never settles, so it fails.
  - `infiniteAnimations(page)`: every animation with `iterations === Infinity`, described as target class + animationName.
- New test `idle page runs no infinite animation, including the decorative background`.
- Budget test: waits for the intro, keeps the hard limits `dom <= 600` and `svg <= 210` (SPEC section 7, measured on the
  pilot stage only, so shell drift cannot move them) and attaches the measured values as a `bc-budget` annotation.
- First-load test: the sampler stops when the intro is gone and no animation is running (or after 10 s, then
  `__timedOut` is true and the test fails). `__max <= 10` and the property allow-list are unchanged.
- `bc-capture.spec.ts` `shot()` calls `waitForIntroDone` instead of a fixed 1700 ms wait.

## Negative proof (not committed)

A scratch copy of the new test with `@keyframes kv2-x{to{opacity:.9}} .kv2-bc{animation:kv2-x 1s infinite}` injected fails:
the helper chain times out in `waitForAnimationsSettled`, and `infiniteAnimations` alone returns `"kv2-bc kv2-x"`.

## Stability runs

Environment: Playwright 1.65.1, Chromium "Google Chrome for Testing" 153.0.8010.12 (sandbox browser, via the git-excluded
`playwright.local.config.ts`, which is the V2 config plus the browser path), `workers: 1`, 4 cores. `bc.spec.ts` has 74 tests.

| Run | Command | Result |
| --- | --- | --- |
| Single | `npx playwright test -c playwright.local.config.ts e2e-v2/bc.spec.ts` | 74 passed (1.2 m) |
| Repeat x10 | `... e2e-v2/bc.spec.ts --repeat-each=10 --reporter=line` | 740 passed, 0 failed (11.6 m) |
| CPU contention | two `yes > /dev/null` loops running, `... e2e-v2/bc.spec.ts --repeat-each=5 --reporter=line` | 370 passed, 0 failed (6.8 m) |

Residual flake rate: 0 of 1110 repeated executions (0 %; this bounds the rate, it does not prove it is zero). The load
processes were killed afterwards.

Measured budget (`bc-budget` annotation, unchanged from baseline): map stage dom=575 svg=204 | whole page dom=710
svg=251 | list stage dom=950 svg=269 | V2 map whole page dom=770 svg=258. Limits: dom <= 600, svg <= 210.

## CI gap (not changed here)

GitHub Actions does not run `npm run e2e:v2`: `.github/workflows/ci.yml` runs `npm run check` and `npm run e2e` in
`app/`, never `e2e:v2`. V2 WebKit is not covered in CI. `.github/workflows/*` was not edited (BACK-35 / BACK-32).
