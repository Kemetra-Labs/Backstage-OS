# Kawalys — synthetic frontend (BACK-6, BACK-10..13)

React + TypeScript frontend of Kawalys (Kemetra Mission Control), built against the accepted UX Blueprint v4 (BACK-5).
It started as the S1 Investigation Room (`INV-DEMO-7`, the simulated Retail Tower CI failure). It now has a shared
shell and every screen, all reading **one** synthetic world:

| Route | Screen |
| --- | --- |
| `#/` | Command Home |
| `#/portfolio` | Portfolio / Mission Overview (BACK-11) |
| `#/project/RT[/stock-sync]` | Project Intelligence with dependency map and table (BACK-12) |
| `#/investigation/INV-DEMO-7` | Investigation Room (BACK-6), plus the `INV-DEMO-9` summary case |
| `#/evidence/E-1?from=INV-DEMO-7` | Evidence Explorer |
| `#/decisions[/DEC-DEMO-3]` | Decision Inbox and detail, display only (BACK-13) |
| `#/agents`, `#/sources` | Agent activity and Source health, demo only |

Review seed: `?persona=owner|technical|nontechnical&lang=en|ar`, kept in the URL across navigation.
Portfolio forced connector error (BACK-62): `?github=error|denied|timeout|malformed|empty` shows the GitHub reads panel for that
failure form, built in memory from the synthetic fixture (nothing is requested).
The Investigation Room's "Server-shaped demo records" panel (BACK-57) reads the committed synthetic `GET /investigations/:id`
and `GET /decisions` fixtures through `src/api`, with no request; Owner and Technical only.

**Demo data by default.** The default build has no backend, auth, real API, credentials, AI calls or agents, and makes no
request. Every link is inert.

## Live mode (BACK-51 P1)

The app calls the server only in live mode, same origin, through `src/live/http.ts` (owner decisions D1 (a) and D2 (a),
2026-11-26). `src/live/live.guard.test.ts` refuses a request API in any other file, and an import of `src/live/http` anywhere
but `src/live/reads.ts`.

- **Switch.** Build or serve with `VITE_KAWALYS_LIVE=1` (exactly `1`). Without it, the build is the fixture demo above.
- **Transport.** Relative `/api/...` paths only, `credentials: 'same-origin'`, JSON. `vite.config.ts` proxies `/api` to the
  BFF at `http://127.0.0.1:8787` with the prefix stripped (`server.proxy` and `preview.proxy`). No CORS: the session cookie
  is `__Host-`, `SameSite=Strict`.
- **Results.** 401 or 404 → not found (identical on purpose). 400 → invalid. 429 → rate limited. A network failure, or a
  502/503/504 from the proxy → unavailable. Any other failure, or a 2xx body that is not JSON → error. Every one is said in
  words through `StateBlock`, never as an empty list and never as healthy.
- **Reads.** Portfolio reads `GET /portfolio`. The Investigation Room reads `GET /investigations/:id` and
  `GET /decisions?investigationId=:id` for the case named by `?investigation=<uuid>` (`npm run local:up` in `server/`
  prints one). With no id it reads `GET /investigations` and opens the newest case this session can see, and says so in a
  note; an id in the address always wins. Both go through the same `src/api` adapters as the fixtures. Live panels show "Live: read from the Kawalys
  server" in place of the demo marker, and the `?github=` review seeds are ignored.
- **Not yet.** No sign-in in the app (P2), so the server answers not found until a session exists. No decision form (P3).

```bash
cd server && npm run local:up          # loopback Postgres + synthetic seed; prints the investigation id
cd server && npm run start             # BFF on 127.0.0.1:8787
cd app && VITE_KAWALYS_LIVE=1 npx vite  # or: VITE_KAWALYS_LIVE=1 npx vite build && npx vite preview
```

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

### Live end-to-end suite (BACK-51 P4)

```bash
(cd server && npm ci) && cd app && npm ci   # both package trees: the BFF test entry compiles from server/
npx playwright install chromium             # once per machine
npm run e2e:live                            # needs Docker running; Chromium only
```

`playwright.live.config.ts` starts two servers. First, the test-only BFF (`npm run e2e:serve` in `server/`): the real
`createApp` on a disposable Testcontainers PostgreSQL, a synthetic seed and a fake identity verifier (no Descope, no
secrets). Second, a live-mode build (`VITE_KAWALYS_LIVE=1`, into `dist-live/`) behind `vite preview` on 127.0.0.1:4178,
which proxies `/api` to the BFF on 127.0.0.1:8787. The tests in `e2e-live/` run the whole gate path (sign in, Portfolio,
Investigation, record a decision, see it with its creator, sign out) plus the negative, Arabic and privacy cases. The
first run pulls the Postgres image, so allow a few minutes. In CI this is the `live-e2e` job; it uploads
`live-e2e-test-results` on failure. The default `npm run e2e` never picks up `e2e-live/`.

## Structure

```
src/contract/   display contract types and pure rules (blueprint §8); world.ts types the shared synthetic world
src/fixture/    the one synthetic world (world.ts) and the INV-DEMO-7 case, with an integrity test
src/view/       pure persona views; evidence.ts is the single redaction allowlist for evidence on every screen
src/nav/        hash routes (no router library), route hook, demo search index
src/app/        AppContext: persona, language, copy, route
src/shell/      top bar, sidebar, demo search, AppShell (the one <main>)
src/i18n/       EN/AR copy; shell.ts, strings.ts (S1) and screens/*; {braces} mark left-to-right tokens
src/components/ shared building blocks: truth/source chips, HealthTriad, StateBlock, Panel, DepGraph/DepTable,
                Timeline, Breadcrumbs, ScreenHeader, drawer, stage map
src/screens/    one module per screen, sub-parts in screens/<screen>/
src/styles/     tokens, app, shell, components; screens/*.css per screen
e2e/            Playwright: per-screen specs, flow.spec.ts (every route × persona × language), capture.spec.ts
```

Screenshots for owner review: `CAPTURE=1 ../node_modules/.bin/playwright test -c playwright.config.ts
e2e/capture.spec.ts --project=chromium` (after `npm run build`) writes to `docs/qa/kawalys-frontend/screens/`.

## Not in this build

Any real data source, backend/BFF, identity or approvals (G2, BACK-7 gate). Server-side redaction: persona views are
presentation only. Comparison against the owner's five reference images (not in the repo). The static prototype is
unchanged.
