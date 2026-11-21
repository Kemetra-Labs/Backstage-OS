# BACK-22 preflight (2026-11-21)

Evaluation only. Nothing here changes `app/`, the fixture, root files or CI. DepGraph is not replaced by this work. All counts, no percentages.

## Config guard (baseline `snapshot.py`)

| Step | Snapshot pair | Result |
|---|---|---|
| Before any action of this task | `before-all.json` (13:37, taken earlier by someone else) vs `pre-install.json` (13:48) | **2 entries differ**: `~/.claude.json#mcpServers` and `%APPDATA%\Claude\claude_desktop_config.json`. Present before this task installed or ran anything. |
| Install (npm, harness) | pre-install vs post-install | 0 changed |
| Archify `render` (first run) | pre-render vs post-render | 0 changed |
| Archify generator, all densities (`archify_gen.py`) | pre-gen vs post-gen | 0 changed |
| `license-checker-rseidelsohn@4.4.2` (npx) | pre-lic vs post-lic | 0 changed |
| Final Playwright runs (RF contrast fix, two reruns) plus captures | pre-final vs post-final; pre-final2 vs post-final2 | **1 entry differs in each**: `claude_desktop_config.json` |
| Archify generator second round (modules packing fix) | pre-gen2 vs post-gen2 | **1 entry differs**: `claude_desktop_config.json` (the same generator command in the first round showed 0) |
| Playwright runs 1 and 2 (earlier pair) | pre-checks (14:10:17) vs post-checks (14:12:16) | **1 entry differs**: `claude_desktop_config.json`, file mtime 14:10:20, three seconds after the pre-snapshot |

Attribution (judgement, not proven): `claude_desktop_config.json` holds Claude desktop app state (`preferences`, `launchPreviewPersistedWorkspaces`, `launchPreviewSessionScopedSessions`, ...) and has `mcpServers: {}` (empty, checked by key shape only, no values read). Other agents were running in parallel (other snapshot files in the baseline folder). Nothing this task ran writes there: Archify ran with a fake `HOME`, `USERPROFILE`, `APPDATA`, `TEMP` and `ARCHIFY_UPDATE_CHECK_DISABLED=1`, and its last run (14:02) is 8 minutes earlier. The owner should still look at it.

## Versions and SHAs

| Item | Pinned | Notes |
|---|---|---|
| react, react-dom | 18.3.1 | matches `app/package.json` |
| vite | 5.4.21 | matches app; `npm audit` reports esbuild GHSA-67mh-4wv8-2f99 (dev server only) and the vite range: 2 findings, accepted because only `vite build` and a static node server are used, never the dev server |
| typescript | 5.6.3 | matches app |
| @vitejs/plugin-react, @types/react, @types/react-dom | 4.3.4, 18.3.12, 18.3.1 | matches app |
| @xyflow/react | 13.0.2 (npm `latest` on 2026-11-21, MIT) | depends on @xyflow/system 1.0.0, zustand 5.1.0, classcat 5.0.5, react-compiler-runtime 1.0.0. API differs from v12 (changeset iterables; no `colorMode` prop, dark theme via CSS `light-dark()` / `color-scheme`) |
| axe-core | 4.14.1 (MPL-2.0) | injected through CDP evaluate, never via script tag |
| Archify | tag v3.2.0, SHA `208acba8d412335185b2056fedf54b3405df43fb`, cloned shallow (`--depth 1`, blob filter 2 MB). A first full clone was stopped after about 600 MB (the repository is about 1.7 GB on GitHub) and its directory deleted | renderer package `archify/archify` version 3.2.0 |
| Node / npm | 24.21.0 / 11.19.0 | |
| Playwright (Python) / Chromium | 1.62.0 / 159.0.8154.6 headless shell from the local cache | |

## Licenses

- Harness root: `UNLICENSED` (private, no license field). Transitive (89 packages incl. dev): MIT 69, ISC 13, Apache-2.0 2, BSD-3-Clause 2, MPL-2.0 1 (axe-core, dev only), CC-BY-4.0 1 (caniuse-lite, dev only), UNLICENSED 1 (the harness itself). Production only (`--production`, 30 entries incl. root): MIT 20, ISC 8, BSD-3-Clause 1, UNLICENSED 1 (root).
- React Flow's runtime closure pulls the D3 modules d3-color, d3-dispatch, d3-drag, d3-ease, d3-interpolate, d3-selection, d3-timer, d3-transition, d3-zoom (ISC, BSD-3-Clause for d3-ease). This bears on the owner's deferred "D3 maths" decision in `docs/design-lab/hybrid-map/ENHANCEMENT-NOTE.md`.
- Archify: conflicting statements recorded as found. GitHub API `license.spdx_id` = Apache-2.0; root `LICENSE` = MIT ("Copyright (c) 2026 tt-a1i (Archify), (c) 2025 Cocoon AI"); `archify/package.json` and SKILL front matter = MIT. `THIRD_PARTY_NOTICES.md` lists Simple Icons, OpenAI mark, JetBrains Mono (OFL), Pele (MIT, kepano). Needs an owner/legal decision before any adoption.

## Dependencies and install scripts

| | Direct | Transitive (all, incl. dev) | Install scripts |
|---|---|---|---|
| Harness (DepGraph + React Flow + tooling) | 9 | 88 packages (89 lines of `npm ls --parseable` incl. root) | exactly one: `esbuild@0.21.5` `postinstall: node install.js` (dev only). Installed with `--ignore-scripts`, then `npm rebuild esbuild` after inspecting that it only validates the platform binary. `install.js` was only partly read. |
| Production closure (react, react-dom, @xyflow/react) | 3 | 30 | none |
| `@xyflow/react` closure | 1 | 28 packages including react, react-dom (5) and @types | none |
| Archify renderer package (`archify/archify`) | 0 runtime | none needed to render | none run. Its repo root `package.json` devDependencies include the `skills` package: root `npm install` was never run. |

Archify `render` needed no `npm install` at all: the renderers import only Node built-ins and local modules (`ajv` is used only by the validator generator scripts, which were not run).

## Archify source review (what was and was not read)

Read in full: `archify/SKILL.md`, `SECURITY.md`, `schemas/architecture.schema.json`, `schemas/common.schema.json` (enums), `examples/web-app.architecture.json`, the update-check file header. Searched (grep) across `bin/`, `renderers/`, `explainer/`, `scripts/` for network, process, eval and home-directory patterns. **Not read line by line**: `bin/archify.mjs` (288 KB, 7,000+ lines), `bin/visual-check.mjs`, `bin/finalize.mjs`, and `assets/template.html` (787 KB). So "read fully first" was not met literally; the review is a targeted grep plus the CLI usage text.

Findings: (a) network code exists in `renderers/shared/brand-marks.mjs` (`node:dns`, `node:http(s)`, only for `brands capture <url>`, and for `brand` fields in the input) and `scripts/check-update.mjs` (fetches a release manifest unless `ARCHIFY_UPDATE_CHECK_DISABLED=1`, which was set on every call); (b) `finalize`, `preview`, `browser-check`, `visual-check`, `--open` and `brands` were never run; (c) SKILL.md tells an agent to append a line to `~/.claude/CLAUDE.md` and offers installs: treated as data, not followed; (d) `render` wrote only the requested HTML (no sidecar or receipt files, no writes into the fake home or fake temp, verified by listing both) ; (e) no `eval(`/`new Function` in the generated HTML.

## Production bundle size per renderer page (vite build, gzip level 9, bytes)

| Page | JS+CSS raw | JS+CSS gzip | Of which renderer-specific (gzip) | Notes |
|---|---|---|---|---|
| depgraph | 166,633 | 54,233 | 1,464 (947 JS + 517 CSS) | the rest is React + the shared shell |
| reactflow | 428,975 | 141,864 | 89,095 (86,094 JS + 3,001 CSS) | |
| archify (host) | 164,544 | 53,384 | 615 | the generated diagram is a separate HTML file, below |
| Archify generated HTML (fixture, 18 components) | 834,679 | 207,466 | all of it | self-contained: inline script and CSS, fonts as `data:` URIs; fixed size regardless of node count (template is 787 KB) |

Shared fonts (Manrope, Cairo woff2, self-hosted, used by the harness chrome only): 55,732 bytes raw.

## CSP requirements measured

- Host pages (DepGraph, React Flow, Archify host) ran under `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; ...` with **0 CSP violations** for DepGraph and React Flow (React and React Flow set styles through the CSSOM, no inline `style` attributes in served HTML, no eval, no inline script; `modulePreload.polyfill` disabled in vite because the polyfill is inline code).
- Archify generated page needs `script-src 'unsafe-inline'` (3 inline script blocks), `style-src 'unsafe-inline'` (3 `<style>` blocks, 44 `style=` attributes), `img-src data:` and `font-src data:`. No eval. With the prescribed policy (no `font-src`) it logged 6 font CSP violations (fonts fall back; page still works). **Final policy used, with the one addition and why**: `default-src 'none'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; img-src data: 'self'; font-src data:; connect-src 'none'; frame-ancestors http://127.0.0.1:5190` (`font-src data:` added because the template embeds its fonts as `data:font/woff2` URIs). With the final policy: 0 violations, 0 requests from inside the frame, 0 external requests.
- Frame isolation measured (`csp-probe-final.json`): inside the sandboxed frame `window.origin` is `null`; cookies, `localStorage`, `sessionStorage`, `window.parent.document` and `window.top.location` all throw SecurityError; the page still runs (it wraps storage in try/catch). Framing from `http://localhost:5190` (not the allowed ancestor) is refused by `frame-ancestors`. `bypass_csp` was never used.
