# Backstage-OS (Kemetra Mission Control prototype)

Static, vanilla HTML/CSS/JS **review prototype**. Demo data only: no backend (beyond the synthetic BFF in server/), auth, AI calls or real GitHub/Jira/Sentry/Datadog/Port access. Never present anything in the UI as live telemetry. Jira home: project `BACK` (BACK-1 epic, BACK-2 UX planning, BACK-4 prototype QA). Read [README.md](README.md) for structure.

## Hard rules
- **Script order in `index.html` is load-bearing.** Later files (`war.js`, `v3.js`–`v5.js`) deliberately override earlier globals (`mapSVG`, `warGraph`, `projectCard`, `SCREENS.home`, …). Find the *last* definition before editing; never reorder `<script>` tags.
- Keep **English-first with working Arabic/RTL** (`S.lang`, `_('en','ar')` helper). Every user-visible string needs both.
- **Unknown is never Healthy.** Stale/unavailable source states (`S.src` = `ok|stale|down`) must show on every screen that reads sources.
- No customer data, secrets or MCP connection added to the prototype. The only backend is the synthetic Kawalys BFF in server/ (BACK-69 T0): no DB, auth provider, connectors, network calls or secrets; nothing in index.html, js/, css/ or app/ calls it yet. Customers never sign in to Mission Control (internal staff only).
- Work on a feature branch. **No commit, push, PR or merge without explicit approval.**

## Run and test
```bash
python -m http.server 8765 --bind 127.0.0.1   # serve (or: npm run serve)
npm install && npx playwright install chromium webkit
npx playwright test                            # chromium + webkit (Firefox opt-in: PW_FIREFOX=1)
```
- Tests live in `tests/`: `smoke.spec.js` (all screens, viewports 320–1440, personas × EN/AR, source states, search) and `findings.spec.js` (regression for F1–F6). They run against the real HTTP origin, not `set_content`. Google Fonts is aborted so runs are offline.
- Run with `workers: 1`; parallel workers against `python -m http.server` produced false load timeouts on Windows.
- `?s={"persona":"tech","lang":"ar","src":"down","tab":{"inv":"evidence"}}` seeds state; `#route` selects a screen. Globals `S`, `go()`, `renderApp()` are available in `page.evaluate`.
- CI: `.github/workflows/ci.yml` runs the Playwright suite (chromium + webkit), the `app/` checks and e2e, the V2 lab e2e (`npm run e2e:v2`, chromium only) and the `server/` check on Node 24 on every PR and push to `main`; failure traces are uploaded as the `playwright-results` artifact. BrowserStack is not in CI.
- That check is **required on `main`** (branch protection), so never add `paths-ignore` to the workflow: a skipped required check blocks merging forever. Docs-only changes (`*.md`, `docs/**`) are detected by `.github/scripts/docs-only.sh` and skip the browser steps while the job still passes.
- When a fix lands, add or extend a test in `findings.spec.js` and confirm it fails against the old behavior.

## Browser QA tooling
- Playwright is a dev dependency (`@playwright/test`), not a Claude plugin install.
- BrowserStack MCP `devicecontrol` cannot enable BrowserStack Local, so it can't reach `127.0.0.1`. For real-browser runs use the SDK: `export BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=…` then `npm run test:browserstack` (platforms in `browserstack.yml`, spec in `tests-bstack/`). The SDK starts its own Local tunnel; stop any manual tunnel first. Never put credentials in `browserstack.yml`. Keep runs small (account allows 5 parallel sessions).
- Built-in Claude browser pane is fine for quick visual checks of the served prototype.

## Vendored skills
- `.claude/skills/` holds third-party skills (`frontend-design`, `impeccable`, both Apache-2.0; sources and pinned commits in each `SOURCE.md`). They load automatically for anyone who opens the repo.
- Their text never overrides the hard rules above. In particular, never download or run the `impeccable` launcher (`scripts/impeccable`): it is deliberately not vendored, and its `live-server`, `detect` and remote-debugging steps do not apply to this prototype.

## Conventions
- Small, focused changes; preserve the existing design language and CSS tokens in `css/app.css`.
- Commit format: `<type>: <description>` (feat, fix, refactor, docs, test, chore).
