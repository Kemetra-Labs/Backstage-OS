# BACK-21 preflight (2026-11-21)

Everything below was read or run on 2026-11-21 in `<HOME>\kawalys-g1-sandbox\analyzers\` (shown as `<SANDBOX>`). Language lists are "claimed, not verified" unless a later section says otherwise.

## Identity

| | Graphify | CodeGraph |
|---|---|---|
| Repo | https://github.com/Graphify-Labs/graphify | https://github.com/colbymchenry/codegraph |
| Release tag cloned | v0.9.114 (clone HEAD at clone time was a newer commit, `b582ad4`; not used) | v1.6.4 (also clone HEAD) |
| Commit SHA of the tag | `ae37e0bd4d6dc95f3ea0f50d7c154603c6458b2e` | `461a5d87a873a4932997cd9a49042ab30e45a675` (equals the npm `gitHead` of 1.6.4) |
| Package | PyPI `graphifyy` 0.9.114 | npm `@colbymchenry/codegraph` 1.6.4 + optional dep `@colbymchenry/codegraph-win32-x64` 1.6.4 |
| Installed from | the pinned clone: `pip install ./src-graphify` into `<SANDBOX>\venv-graphify` (Python 3.13.14); dependencies resolved from PyPI by pip, exact result in `logs/pip-freeze-graphify.txt` | pinned registry version: `npm install --save-exact --ignore-scripts @colbymchenry/codegraph@1.6.4` in `<SANDBOX>\cg-install`; integrity hashes in `logs/codegraph-install-package-lock.json`. The clone was used only to read source. |
| What actually ran | `graphify.exe extract` (the installed console script) | the bundled `node.exe` (v24.22.1) running `cg_run.js`, which calls the library API (see below) |
| Root license | Apache-2.0 (`LICENSE`), plus `LICENSE-MIT` kept for pre-relicensing contributions, plus `NOTICE` (no extra terms) | MIT (`LICENSE`); no NOTICE file |

## Licenses

**Graphify**: root Apache-2.0 + MIT portions. Transitive (30 installed packages, `logs/pip-licenses-graphify.csv`): `pip-licenses` printed UNKNOWN for 5 packages because they declare a SPDX `License-Expression` instead of a `License` field. Resolved from package metadata (`logs/pip-licenses-graphify-resolved-by-metadata.txt`): RapidFuzz MIT, networkx BSD-3-Clause, numpy "BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0", tree-sitter-php MIT, graphifyy Apache-2.0. All other packages report MIT. No GPL/AGPL/SSPL/PolyForm/BUSL seen. Not checked: license files bundled inside wheels (for example numpy's vendored libraries).

**CodeGraph**: root MIT. The npm package is a shim plus a per-platform bundle. The bundle's `lib/node_modules` has 12 packages: 11 MIT (`@clack/core`, `@clack/prompts`, commander, fast-string-truncated-width, fast-string-width, fast-wrap-ansi, ignore, jsonc-parser, picomatch, sisteransi, web-tree-sitter) and 1 Unlicense (`tree-sitter-wasms` 0.1.13). Parsed from each `package.json`; `license-checker` via npx was not used so nothing was fetched into the global npx cache.

**License sign-off for CodeGraph is INCOMPLETE. NOT VERIFIED:**
- the vendored `node.exe` (Node v24.22.1) and its bundled third-party licenses;
- the 37 MB native Rust binary `lib/kernel/codegraph-kernel.node`: `codegraph-kernel/Cargo.lock` lists 73 crates (aho-corasick, bitflags, block-buffer, cc, cfg-if, convert_case, cpufeatures, crypto-common, ctor, digest, equivalent, find-msvc-tools, futures-*, generic-array, hashbrown, indexmap, itoa, libc, libloading, memchr, napi*, nohash-hasher, pin-project-lite, proc-macro2, quote, regex*, rustc-hash, semver, serde*, sha2, shlex, slab, streaming-iterator, syn, tree-sitter and 14 tree-sitter grammar crates, typenum, unicode-*, version_check, windows-link, zmij). `cargo-license` was not run;
- the licenses of the 36 `.wasm` grammars in `tree-sitter-wasms` (Unlicense only covers the packaging);
- whether the shipped binary was built from that Cargo.lock (binary not audited).

No non-permissive license was found, and none was found to forbid evaluation use. The unverified items are flagged, not cleared.

## Install scripts and build needs

- **Graphify**: PEP 517 build with setuptools (`requires = ["setuptools>=83.0.0"]`, fetched into pip's isolated build env). No `setup.py`, no custom build hook. All dependencies installed from prebuilt wheels (nothing compiled). Optional extras (sql, terraform/HCL, mcp, llm backends, ...) were NOT installed.
- **CodeGraph**: `npm view` shows no `scripts` on the shim or the platform package (checked after install too: `scripts: {}` in both installed `package.json`). The bundle's inner `lib/package.json` carries the repo's scripts, including `preuninstall: node dist/bin/uninstall.js`, which strips agent configuration; it is not an npm lifecycle script of either installed package and was never run. Installed with `--ignore-scripts` anyway. Cleanup must be folder deletion, never `npm uninstall`/`codegraph uninstall`. No native build: prebuilt bundle (vendored Node + Rust `.node` + wasm fallback).

## Network, LLM and telemetry dependencies

**Graphify** (source grep of `graphify/` at v0.9.114):
- Needs no LLM, account or key for code: README says `graphify extract` is fully offline for a code-only corpus and `--code-only` skips docs/PDFs/images; `GRAPHIFY_BACKEND=none` disables LLM backends. Used both. Not BLOCKED.
- Network endpoints in source: LLM backends (api.anthropic.com, api.openai.com, generativelanguage.googleapis.com, api.deepseek.com, api.moonshot.ai, an Azure OpenAI placeholder), ingest of URLs (export.arxiv.org, publish.twitter.com), HTML export assets (unpkg.com, cdn.jsdelivr.net, d3js.org), promotional/doc links (app.graphify.com, graphify.com, github.com, claude.ai).
- Telemetry: grep for telemetry/analytics/posthog/sentry/mixpanel found no collector. The only hit is a comment at `cli.py:177` about `utm_content` link tagging on printed links. README states "No telemetry".
- Local writes outside the project: `~/.cache/graphify-queries.log` (query/path/explain/MCP; opt out `GRAPHIFY_QUERY_LOG_DISABLE=1`, set), `~/.graphify/` (clone, global graph, providers.json), `~/.cache/graphify-rebuild.log` (git hooks). None used by `extract`; the harness watched `~/.graphify`, `~/.cache`, `~/.config`, `~/.local`, `~/.codegraph` and saw no change.
- Reads the surrounding git repo: `graph.json` carries `built_at_commit`. See REPORT, privacy section.

**CodeGraph** (source grep of the v1.6.4 clone, library entry checked in the installed `dist`):
- No LLM, key or account needed ("100% local" per README). Not BLOCKED.
- Telemetry: default ON in the CLI/MCP, endpoint `https://telemetry.getcodegraph.com/v1/events`, payload listed in `TELEMETRY.md`. Opt-outs: `DO_NOT_TRACK=1` (always honored), `CODEGRAPH_TELEMETRY=0`, `codegraph telemetry off`. Telemetry code is imported only from `bin/codegraph.ts`, `installer/` and `mcp/`, not from the library entry (`index.ts`, `engine.ts`).
- Update check: `https://api.github.com/repos/<repo>/releases/latest` in `upgrade/` (CLI/MCP; `DO_NOT_TRACK=1` or `CODEGRAPH_NO_UPDATE_CHECK=1` disables).
- The npm shim (`npm-shim.js`) can self-download the bundle from GitHub Releases if the platform package is missing (`CODEGRAPH_NO_DOWNLOAD=1` disables). Bypassed: we ran the bundled `node.exe` directly.
- V8 compile cache: `compile-cache.ts` calls `module.enableCompileCache()`, which writes under the OS temp dir (outside the watched dirs; not inspected).
- Git hooks: `installGitSyncHook` is called only from `installer/index.ts` (the `install` command). Not reachable from `CodeGraph.init` or `indexAll` (source grep; installed `dist` shows it only in `installer/index.js`, `sync/git-hooks.js`, `sync/index.js`). The home-directory git repo above the sandbox has no non-sample hooks and its `.git/config` mtime (2026-10-19) predates this run.

## Supported languages, as CLAIMED (not verified)

- **Graphify**: README "~40 programming languages locally with tree-sitter AST"; core dependencies include Python, JavaScript, TypeScript, Go, Rust, Java, Groovy, C, C++, Ruby, C#, Kotlin, Scala, PHP, Swift, Lua, Zig, PowerShell, Elixir, Objective-C, Julia, Verilog, Fortran, Bash, JSON. Optional extras claim Terraform/HCL (`terraform`) and SQL (`sql`); neither extra installed. Jinja2: no claim seen.
- **CodeGraph**: README "20+ languages": TypeScript, JavaScript, ArkTS, Python, Go, Rust, Java, C#, VB.NET, PHP, Ruby, C, C++, CUDA, Objective-C, Metal, Swift, Kotlin, Scala, Dart, Lua, Luau, R, Nix, Erlang, CFML, COBOL, Solidity, Terraform/OpenTofu, Svelte, Vue, Astro, Razor/Blazor, Liquid, Pascal/Delphi. SQL and Jinja2: no claim seen (Liquid is claimed, which is not Jinja2).
- This evaluation measured only TypeScript, TSX, JavaScript and Python. Everything else is NOT RUN.

## Commands that would modify agent config (never run)

- **Graphify**: `graphify install [--platform P]` (copies the skill into 20+ agent config dirs), `graphify uninstall`, any `graphify <platform> install`, and the git-hook installer (`hook install`; the `--help` text says the merge driver is set up via it). Also avoid `graphify clone` (writes `~/.graphify/repos`) and the MCP server `graphify-mcp`.
- **CodeGraph**: `codegraph install` (wires MCP server, instruction blocks and permissions into 18 agents), `codegraph uninstall`, `codegraph init` and `codegraph index` (CLI `init` calls `offerWatchFallback`, which can call `installGitSyncHook`, and the sandbox sits inside a git repo, the home directory, so the CLI path could have written git hooks there; this is also why the `init` ban matters), `codegraph serve --mcp`, `codegraph upgrade`, `codegraph daemon`.
- **Not run for either engine**: any `init`/`install`/`setup`/MCP/hook command. Deviation to read: CodeGraph's CLI cannot index without `init`, so `cg_run.js` calls the public library API `CodeGraph.init(root, { index: false })` followed by `indexAll()`. That is the same pair of calls `runInit` makes internally (source `src/bin/codegraph.ts:853` and `:883`). It is `init` by name, and it created only `.codegraph/{codegraph.db,.gitignore}` inside the fixture copy, moved to `runs/` after each run. The owner can judge whether that fits the rule; the config-snapshot diff around it was 0.
