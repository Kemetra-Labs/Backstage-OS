# Kawalys S1 — Investigation Room mock slice (BACK-6)

First React + TypeScript slice of Kawalys. One synthetic case (`INV-DEMO-7`, the simulated Retail Tower CI
failure) rendered in the Investigation Room, built against the accepted UX Blueprint v4 (BACK-5).

**Demo data only.** No backend, auth, real API, credentials, AI calls or agents. Every link is inert.

## Decision note: tooling (BACK-6 scope item 1)

The Product Definition leaves the bundler and UI library open. For this slice: **Vite 5 + React 18 + TypeScript
(strict)**, unit tests with **Vitest**, browser checks with **Playwright**. Vite gives a static build with no server
runtime, which fits a mock-only slice and keeps hosting open. React 18.3 is the current stable line most libraries
support. Vitest shares Vite's config and runs the contract rules in plain Node, so the rules stay pure functions with
no DOM test library. Playwright is already on GitHub main for the prototype (BACK-4); this app reuses that install
(same version 1.65.1, resolved from the repo root) instead of adding a second copy. **No UI component library and no
router**: the slice is one screen, and the design tokens come from the prototype's `css/app.css`. Any of these choices
can be revisited before S2.

| Package | Version | Why |
| --- | --- | --- |
| react, react-dom | 18.3.1 | UI runtime |
| vite | 5.4.21 | Dev server and static build |
| @vitejs/plugin-react | 4.3.4 | JSX transform for Vite |
| typescript | 5.6.3 | Strict type checking (`tsc --noEmit`) |
| @types/react, @types/react-dom | 18.3.12, 18.3.1 | React typings |
| vitest, @vitest/coverage-v8 | 2.1.9 | Unit tests and coverage |
| @playwright/test | 1.65.1 (repo root, not added here) | Browser smoke tests |

This app's own packages are pinned exactly, and all were published more than two weeks before 16 Nov 2026. Playwright
is not pinned here: it comes from the repo root, which declares `^1.65.1` and has 1.65.1 installed. Fonts are not
fetched from any CDN; the slice uses the local font stack, so it makes no third-party requests.

## Run

`npm run e2e` resolves `@playwright/test` from the repo root, so run `npm install` at the root once first (it is
already part of the prototype's QA setup).

```bash
cd app
npm install
npm run check     # tsc --noEmit + unit tests with coverage
npm run build     # static build to app/dist
npm run e2e       # Playwright smoke (builds, then serves on 127.0.0.1:4178)
```

## Structure

```
src/contract/   display contract types and pure rules (blueprint §8), with unit tests
src/fixture/    synthetic INV-DEMO-7 case
src/view/       persona selector: returns only the fields a persona may see (blueprint §5)
src/i18n/       EN/AR copy; {braces} mark left-to-right tokens rendered in <bdi dir="ltr">
src/components/ truth and source chips, bands, hypothesis, drawer, stage map
src/screens/    Investigation Room
e2e/            Playwright smoke
```

## Not in this slice

Portfolio, Project Intelligence and Decision Inbox (S2–S4), hash routes for the evidence drawer, any real data source
(S5 / G2), and fixes to the static prototype.
