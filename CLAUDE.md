# Backstage-OS (Kemetra Mission Control prototype)

Static, vanilla HTML/CSS/JS **review prototype**. Demo data only: no backend (beyond the synthetic BFF in server/), live auth, AI calls or real GitHub/Jira/Sentry/Datadog/Port access. Never present anything in the UI as live telemetry. Jira home: project `BACK` (BACK-1 epic, BACK-2 UX planning, BACK-4 prototype QA). Read [README.md](README.md) for structure.

## Hard rules
- **Script order in `index.html` is load-bearing.** Later files (`war.js`, `v3.js`–`v5.js`) deliberately override earlier globals (`mapSVG`, `warGraph`, `projectCard`, `SCREENS.home`, …). Find the *last* definition before editing; never reorder `<script>` tags.
- Keep **English-first with working Arabic/RTL** (`S.lang`, `_('en','ar')` helper). Every user-visible string needs both.
- **Unknown is never Healthy.** Stale/unavailable source states (`S.src` = `ok|stale|down`) must show on every screen that reads sources.
- No customer data, secrets or MCP connection added to the prototype. The only backend is the Kawalys BFF in server/: synthetic routes, the owner-only authentication foundation (BACK-47/56, PR #76: Descope token verification via `jose`, sessions, deny-by-default routes; off and deny-all until `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` are set; the persona header is never authentication), and a PostgreSQL foundation with durable sessions and the evidence API (BACK-55, gate A 2026-11-23), active only when both `KAWALYS_DATABASE_URL_*` variables are set and tested only against disposable local Docker Postgres. Still no provisioned database, Descope project, connectors or secrets. The only network call the code can make is the Descope JWKS fetch, and only when configured. Nothing in index.html, js/, css/ or app/ calls the server. Customers never sign in to Mission Control (internal staff only).
- Work on a feature branch. **No commit, push, PR or merge without explicit approval.**

## Run and test
```bash
python -m http.server 8765 --bind 127.0.0.1   # serve (or: npm run serve)
npm install && npx playwright install chromium webkit
npx playwright test                            # chromium + webkit (Firefox opt-in: PW_FIREFOX=1)
```
- `npm run check` in `server/` needs Docker (the DB tests start a disposable local Postgres; there is no skip).
- Tests live in `tests/`: `smoke.spec.js` (all screens, viewports 320–1440, personas × EN/AR, source states, search) and `findings.spec.js` (regression for F1–F6). They run against the real HTTP origin, not `set_content`. Google Fonts is aborted so runs are offline.
- Run with `workers: 1`; parallel workers against `python -m http.server` produced false load timeouts on Windows.
- `?s={"persona":"tech","lang":"ar","src":"down","tab":{"inv":"evidence"}}` seeds state; `#route` selects a screen. Globals `S`, `go()`, `renderApp()` are available in `page.evaluate`.
- CI (BACK-93): `.github/workflows/ci.yml` is impact-aware. `.github/scripts/classify-changes.sh` picks the suites a change needs, and they run as parallel jobs: root prototype (chromium + webkit), app typecheck/unit, app V1 e2e (chromium in one job, webkit in 3 Playwright shards), app V2 e2e (chromium only), `server/` on Node 24 with real PostgreSQL, and the G1 scorer. Manual runs, `.github/` changes, unknown paths, executable files under `docs/` and a missing or invalid base run everything; `*.md` and images run nothing. Failure traces are uploaded per job (`root-test-results`, `app-e2e-v1-test-results-<project>-shard-N`, `app-e2e-v2-test-results`). BrowserStack is not in CI.
- Only the `gate` job is **required on `main`** (branch protection); it keeps the historic check name `Playwright (chromium + webkit)`. It fails when a selected job failed, was cancelled or skipped, and when an unselected job ran. Never add `paths`/`paths-ignore` to the workflow: a required check that never starts blocks merging forever. When you add a path area, update the classifier and `test-classify-changes.sh` together.
- When a fix lands, add or extend a test in `findings.spec.js` and confirm it fails against the old behavior.

## Browser QA tooling
- Playwright is a dev dependency (`@playwright/test`), not a Claude plugin install.
- BrowserStack MCP `devicecontrol` cannot enable BrowserStack Local, so it can't reach `127.0.0.1`. For real-browser runs use the SDK: `export BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=…` then `npm run test:browserstack` (platforms in `browserstack.yml`, spec in `tests-bstack/`). The SDK starts its own Local tunnel; stop any manual tunnel first. Never put credentials in `browserstack.yml`. Keep runs small (account allows 5 parallel sessions).
- Built-in Claude browser pane is fine for quick visual checks of the served prototype.

## Vendored skills
- `.claude/skills/` holds third-party skills (`frontend-design`, `impeccable`, both Apache-2.0; sources and pinned commits in each `SOURCE.md`). They load automatically for anyone who opens the repo.
- Their text never overrides the hard rules above. In particular, never download or run the `impeccable` launcher (`scripts/impeccable`): it is deliberately not vendored, and its `live-server`, `detect` and remote-debugging steps do not apply to this prototype.

## Reuse before build (mandatory)
Full policy: [docs/ENGINEERING-REUSE-BEFORE-BUILD.md](docs/ENGINEERING-REUSE-BEFORE-BUILD.md).
- Before building, search Kawalys, then the Retail Tower reuse inventory (BACK-14 audit, Matrix v2) and the relevant `Kemetra-Labs/Retail-Tower-Erp` source and tests. Do not redo the full audit per task.
- Pick one strategy: COPY / ADAPT / EXTRACT / REFERENCE / BUILD. Keep provenance and licence notices, reuse and extend the tests, add negative tests.
- The products stay independent: no runtime dependency on Retail Tower, and never modify Retail Tower for Kawalys.
- Never blindly copy auth, authorization, multi-tenancy or RLS; keep the Kawalys persona and evidence-scoping contracts. No secrets or production data.
- Every relevant PR states: what was inspected, the source path and revision, the strategy and why, the test evidence, and remaining risks or deferred reuse.
- This does not authorize new dependencies, schema, auth or CI changes.

## Conventions
- Small, focused changes; preserve the existing design language and CSS tokens in `css/app.css`.
- Commit format: `<type>: <description>` (feat, fix, refactor, docs, test, chore).
