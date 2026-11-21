# BACK-22 renderer harness (source only)

Evaluation harness, not product code. One Vite multi-page app with three pages sharing one adapter, layout, inspector and table fallback:

| Page | Renderer |
|---|---|
| `depgraph.html` | copy of the Kawalys `DepGraph` React/SVG component (`src/renderers/DepGraphCopy.tsx`, header comment lists every change) |
| `reactflow.html` | `@xyflow/react` 13.0.2 (`src/renderers/ReactFlowView.tsx`) |
| `archify.html` | Archify 3.2.0 output in `<iframe sandbox="allow-scripts">` from a second origin (`src/renderers/ArchifyFrame.tsx`) |

Data: `public/data/fixture-35.envelope.json` (copy of `docs/planning/G1/fixture/ground-truth.envelope.json`), `synthetic-60` and `synthetic-250` (seeded, labelled synthetic in `source.scope`), made by `tools/gen_synthetic.py`. Shared layout: `src/shared/layout.mjs` (layer-ordered packed grid, at most 12 columns, no layout library); one placeholder node per `to: null` edge.

## Re-run

Needs Node 24, Python with Playwright 1.62 and a cached Chromium headless shell (no browser is downloaded; `checks.py` finds `chromium_headless_shell-*` under `%LOCALAPPDATA%\ms-playwright`).

```bash
npm ci --ignore-scripts && npm rebuild esbuild      # esbuild has the only install script; inspect it first
npx tsc --noEmit && npx vite build                  # build once: dist/

# Archify (offline, deterministic JSON-IR renderer; never `finalize`, `preview`, `brands`, `--open`, never root `npm install`):
git clone --depth 1 --branch v3.2.0 --filter=blob:limit=2m https://github.com/tt-a1i/archify.git ../vendor/archify   # SHA 208acba8d412335185b2056fedf54b3405df43fb
#   edit archify-input/run-archify.sh paths (it sets a fake HOME/TEMP and ARCHIFY_UPDATE_CHECK_DISABLED=1), then:
python -B tools/archify_gen.py <this dir> <vendor dir>   # writes archify-work/out/*.html and public/data/archify-manifest.json
npx vite build                                           # re-bundle so the manifest is in dist/

# Serve: harness on 5190 (strict CSP), Archify output on 5191 (CSP header, frame-ancestors = 5190)
node serve.mjs                                          # HOST_CSP=relaxed|strict, ARCHIFY_CSP=<policy>, ARCHIFY_OUT=<dir>, SERVE_LOG=<file>

# Checks (twice for the two reported runs), captures, summary:
python -B tools/checks.py <this dir> checks-run1.json --webkit   # webkit is expected to fail on a revision mismatch (NOT RUN)
python -B tools/checks.py <this dir> checks-run2.json
python -B tools/captures.py <this dir> captures
python -B tools/summarize.py <back-22 dir>                       # writes checks.txt
python -B tools/csp_probe.py <label> <out.json>                  # frame CSP/sandbox probe
```

`archify-input/` holds the Archify JSON-IR the converter produced (`tools/to-archify.mjs`; `full` = every node and edge on the shared layout, `modules` = reduced scope) and `archify-gen-log.json` (validator diagnostics per attempt). The generated HTML itself is not copied (reproducible, 835 KB). Stray exploratory inputs in the same folder: `f35-180.json` and `f35-260.json` (the two extra gap settings tried on the full fixture, 12 and 24 validator violations), `fixture-35-auto.json` (Archify native-placement attempt, crashed with a TypeError; possibly malformed input), `fixture-35.json` (first-round full input, 60 violations at 90/30 px) and `mod.json` (first modules-only input).

URL parameters: `?data=fixture-35|synthetic-60|synthetic-250&lang=en|ar&view=graph|table&sel=<node key or id>&file=<archify html>`. Below 641 px the table view is the default (as in the Mission Map SPEC section 3).

Everything stays on `127.0.0.1`. No external request is made by any page.
