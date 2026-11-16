# 01 — S1 evidence and QA readiness review

Scope: the Kawalys S1 Investigation Room in `app/` (BACK-6) against UX Blueprint v4 (BACK-5). This review classifies
what is proven and what is not. It changes no tests, no workflow and no app code. PR #3 is already merged; it is not
modified here.

## 1. Classification rules

- **Verified**: there is recorded evidence (a test that ran at a named commit, or a report with a date and a result).
- **Partly verified**: some of the claim has evidence, but there is a named gap.
- **Not verified**: nothing has been run that proves it. That does not mean it fails.
- **Blocked**: the check was attempted and could not run. The cause is named.

Nothing is marked Verified because it "looks fine" or because a test exists. The test must have run.

## 2. What ran during this review

| Check | Commit | Result |
| --- | --- | --- |
| `cd app && npm run check` (tsc + Vitest + coverage) | `c853feb` | 4 files, **115 tests passed**. Coverage 100% statements/lines/functions, 98.77% branches (`segments.ts` 18–20 uncovered). Windows 11, local |
| `cd app && npm run e2e` (Playwright, chromium + webkit) | `c853feb` | See §2.1 |

### 2.1 E2E result

2026-11-16, Windows 11, local: **77 passed, 1 skipped** (78 total across chromium and webkit) in 26.9 s. These are
browser *engines* on Windows with emulated viewports, not real Safari, not Linux and not devices. The skipped case is
"copy status resets when persona changes" on WebKit (`test.skip` at `investigation.spec.ts:110`: clipboard permission
is Chromium-only in Playwright). Same counts as the BACK-6 closure comment (17295).

## 3. S1 QA matrix

| Area | Status | Evidence / gap |
| --- | --- | --- |
| Contract rules (unknown ≠ healthy, unread ≠ 0, correlated needs a rule, inert links) | **Verified** (unit) | `app/src/contract/rules.test.ts`, 80 tests, §2 |
| Persona field selection | **Verified** (unit, client side only) | `app/src/view/viewFor.test.ts`. Note: redaction happens in the browser today. That is fine for synthetic data and **not acceptable for real data** (ADR-03 §3) |
| EN/AR layout, no overflow, `dir`, RTL isolates, digits | **Verified locally** at the widths in `app/e2e/investigation.spec.ts` (chromium + webkit engines, Windows) | Not run on Linux. The root prototype suite has already passed on Windows and failed on Linux CI by a few pixels, because Linux fallback fonts are wider. Same risk applies here until `app/` runs in CI |
| Keyboard: drawer focus trap, Esc returns focus, visible focus ring | **Verified locally** (e2e) | Engine-level only; no real assistive technology |
| Touch targets ≥ 44 px at 375 px | **Verified locally** (e2e) | Emulated viewport, not a device |
| Reduced motion | **Verified locally** (e2e, drawer only) | Other animations not checked |
| Visual parity (C2) against the owner's reference images | **Not verified** | No image file is tracked anywhere in the repo (`git ls-files`, 2026-11-16) and no screenshot comparison exists. BACK-6 comment 17295 lists it as carried forward. Needs: images checked into `docs/qa/reference/` by the owner, a fixed viewport list, and a human side-by-side review recorded with date and verdict. Pixel-diff tooling is optional and needs its own approval (new package) |
| Live screen (the slice running on a hosted URL) | **Not verified** | Nothing is deployed; hosting is open (ADR-08) |
| Screen readers (NVDA / VoiceOver / TalkBack) | **Not verified** | No manual pass recorded. Needs a scripted manual pass: landmarks, heading order, drawer announcement, truth-chip text, Arabic reading order |
| 200% zoom / text resize | **Not verified** | Not covered by e2e. Can be automated later (CSS zoom or device scale factor at 1280 → reflow at 640 CSS px) plus one manual browser check |
| Actual devices | **Not verified** | No device run recorded |
| BrowserStack real-browser / real-device | **Blocked** | Prototype (BACK-4 comments 17221, 17287): SDK returned 401, no session; closed with this as an accepted gap. S1 app (BACK-6 comments 17293, 17295): credentials work, but the SDK ran the Playwright tests locally instead of on the phones, so **0 device results**. Paused by the owner; account plan is "Automate Mobile". The BrowserStack files for `app/` are local only and not on `main` |
| Firefox | **Not verified** | Local launch failed (`spawn UNKNOWN`, BACK-4); not in `app/` config |
| CI coverage of `app/` | **Not covered** | `ci.yml` runs only the root prototype suite (§4) |

## 4. Gated plan: extend CI to `app/` (plan only, no workflow edits)

Facts the plan must respect:

- `app/` has its own `package-lock.json`, so it needs its own `npm ci` in `app/`.
- `app/playwright.config.ts` imports `@playwright/test` from the **repo root**. Root `npm ci` must run first.
- The CI check is **required on `main`**. Never add `paths-ignore`; the job must always report.
- `.github/scripts/docs-only.sh` treats `*.md` and `docs/**` as docs. `app/**` source files are already non-docs, but
  `app/README.md` alone counts as docs. That is acceptable (a README-only change does not need browsers).
- Keep the existing hardening: `npm ci --ignore-scripts`, call binaries from `./node_modules/.bin/`, no `npx`.

Proposed change, for a separate approved ticket:

1. Add steps to the **same** required job (so nothing new needs adding to branch protection), each guarded by
   `steps.changes.outputs.docs_only != 'true'`:
   - `npm ci --ignore-scripts` in `app/` (`working-directory: app`).
   - `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/vitest run --coverage` in `app/`.
   - Build and e2e: `./node_modules/.bin/vite build`, then `../node_modules/.bin/playwright test -c playwright.config.ts`
     in `app/` (the config's `webServer` uses `npx vite preview`; replace with `./node_modules/.bin/vite preview` in
     the same change to keep the no-`npx` rule).
   - Add `app/test-results/` to the failure artifact upload.
2. Optionally add a coverage threshold to `app/vite.config.ts` so CI fails on a drop. Owner decides the number.
3. Expect a Linux-only layout failure on first run (fallback fonts). Fix the layout, not the test.
4. Acceptance: one PR run green on chromium + webkit, one run where a deliberately broken rule test makes CI red
   (then reverted), docs-only PR still reports green without running browsers.

STOP if: the change needs `paths-ignore`, a second required check, secrets, or new packages.
