# BACK-21 runs (2026-11-21)

`<SANDBOX>` = `<HOME>\kawalys-g1-sandbox\analyzers`. Engines saw only `<SANDBOX>\fixture-copy\src`, a copy of `docs/planning/G1/fixture/src`. Tree sha256 of the copy before the runs, after the runs, and of the original: `b359992de75f5eb96bcf84ac4830ee4a46b01a35227aba0873be696e931f0bca` (all equal). Engine artefacts went to `<SANDBOX>\runs\`.

## Invocation, stated plainly

- **Graphify**: `graphify.exe extract fixture-copy --code-only --out runs/graphify-N`. Whole path is the engine's own CLI; the `--out` directory keeps `graphify-out/` out of the fixture copy. No semantic pass, no cluster naming.
- **CodeGraph**: NOT the CLI. `node.exe cg_run.js fixture-copy`, where `cg_run.js` requires the installed `lib/dist/index.js` and calls `CodeGraph.init(root, { index: false })` then `indexAll({})`. This is the public library API and is the same pair of calls the CLI `init` makes internally. It is `init` by name. It was chosen because the CLI `init`/`index` path can reach `offerWatchFallback` and `installGitSyncHook`, and the fixture copy sits under a git repo (the home directory). It created `.codegraph/codegraph.db` and `.codegraph/.gitignore` inside `fixture-copy`, moved to `runs/codegraph-N/` after each run. Config-snapshot diff around both runs: 0.
- Both through `measure.py` (copied here), which per invocation: builds a scrubbed environment, takes a config snapshot before and after, lists files under `~/.codegraph ~/.graphify ~/.cache ~/.config ~/.local` before and after, samples the whole process tree with psutil 7.1.3 every 20 ms for peak RSS, and writes scrubbed logs.

## Environment for every engine invocation

Removed: every variable matching `API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|ACCESS_KEY|SESSION` and prefixes `AWS_ ANTHROPIC_ OPENAI_ GEMINI_ GOOGLE_ AZURE_ CLAUDE`. Set: `DO_NOT_TRACK=1`, `CODEGRAPH_TELEMETRY=0`, `CODEGRAPH_NO_UPDATE_CHECK=1`, `CODEGRAPH_NO_DOWNLOAD=1`, `GRAPHIFY_BACKEND=none`, `GRAPHIFY_QUERY_LOG_DISABLE=1`, `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY` (and lowercase) `=http://127.0.0.1:9`, `NO_PROXY` empty, `PYTHONUTF8=1`, `PYTHONDONTWRITEBYTECODE=1`.

Caveat on the dead proxy: Python HTTP clients honor those variables; Node 24 does not unless `NODE_USE_ENV_PROXY=1` is set (not set). So the dead proxy proves nothing for CodeGraph. For CodeGraph the no-network evidence is the source grep (library entry imports no telemetry/update code) plus the opt-out variables. No network or proxy error appears in any log (`grep -i proxy|ECONN|getaddrinfo|connect logs/*` found nothing). Actual traffic was not monitored.

## Results

| Run | Exit | Wall (s) | Peak RSS, sampled process tree (MB) | Config snapshot diff (pre vs post) | Watched home dirs changed |
|---|---|---|---|---|---|
| graphify-run1 | 0 | 2.706 | 112.2 | 0 | none |
| graphify-run2 | 0 | 1.156 | 112.0 | 0 | none |
| codegraph-run1 | 0 | 3.442 | 184.2 | 0 | none |
| codegraph-run2 | 0 | 0.861 | 165.4 | 0 | none |

Wall time is the harness time of the whole process (interpreter/Node start-up included). Run 2 follows run 1 immediately, so OS file cache (and, for CodeGraph, the V8 compile cache in the temp dir, not cleared) is warm: run 1 vs run 2 is not a like-for-like cold/warm comparison. CodeGraph's own reported `durationMs` was 964 for run 1. RSS is a sampled peak (20 ms), so a shorter spike could be missed. Details: `logs/*.meta.json`.

CodeGraph index result (both runs): 16 files indexed, 0 skipped, 0 errored, 64 nodes, 88 edges, 23 unresolved refs. Graphify (both runs): 16 code files, 50 nodes, 71 edges, 11 communities; stderr warning that `src/web/index.ts` yielded no symbols.

## Reproducibility (run 1 vs run 2, each from a clean output dir)

- **Graphify**: `graph.json` sha256 `a2c2016bfafb136b2c3dc0e9d56178913aef8a1d82fa11dd98affd6964489f93` in both runs (27,532 bytes). Both runs log "AST cache: 0/16 files served from cache". Same 14 files in `graphify-out/`; only `manifest.json` and `cache/stat-index.json` differ (timestamps). Normalized envelopes are equal once `generated_at` (file mtime) is dropped.
- **CodeGraph**: raw `codegraph.db` sha256 differs (`0b7dd09f...` vs `918b1084...`, 262,144 bytes each: timestamps, WAL/page layout). A canonical content hash is equal in both runs: `325b64b916cefcac64088c1b3827cb76bc9832e96d272b0067001b83b83fc714`, computed over sorted rows of `nodes` (id, kind, name, qualified_name, file_path, language, start/end line and column, signature, is_exported), `edges` (source, target, kind, metadata, line, col, provenance; autoincrement id excluded), `files` (path, content_hash, language, size, node_count, errors) and `unresolved_refs` (from_node_id, reference_name, reference_kind, line, col, file_path, language, status); timestamp columns excluded. Normalized envelopes are equal once `generated_at` is dropped. The hash script was an inline one-off; its definition is the column list above.

Both engines are deterministic on this fixture for these inputs. Not tested: different machines, other Python/Node versions, hash seeds (Graphify pins its own for extract; not varied), larger inputs.

## Config-snapshot results (`baseline/snapshot.py`)

| Step | Diff |
|---|---|
| install Graphify (s01 vs s02) | 0 changed |
| install CodeGraph (s03 vs s04) | 0 changed |
| each of the 4 engine invocations (pre vs post) | 0 changed (4 of 4) |
| `s00_start` (my first snapshot) vs `s99_final` | **1 changed**: `<APPDATA>/Claude/claude_desktop_config.json` |
| `baseline/before-all.json` vs `s00_start` (before any action of mine) | 2 changed: `~/.claude.json#mcpServers`, `<APPDATA>/Claude/claude_desktop_config.json` (pre-session drift, not engine-caused) |

The one change inside the session: the file's hash was identical in all 13 snapshots up to and including `codegraph-run2.post` (13:54:40), and different in `s99_final` (14:00:04); its mtime is 13:58:09. No engine process was running in that window (only normalizers, the scorer, git/grep reads). It is the Claude desktop app's own preferences file (top-level keys `mcpServers` (empty), `coworkUserFilesPath`, `preferences`); a second snapshot immediately after (`s99b`) matched `s99`. Likely written by the desktop app; not verified, and the old content was not kept so the change itself cannot be shown. Reported rather than ignored; nothing here ties it to either engine.

## Scoring commands

```
python -I normalize_graphify.py  runs/graphify-1/graphify-out/graph.json  fixture-copy graphify.envelope.json --stderr logs/graphify-run1.stderr.log
python -I normalize_codegraph.py runs/codegraph-1/.codegraph/codegraph.db fixture-copy codegraph.envelope.json
python -B docs/planning/G1/fixture/score.py <envelope> --json score-<engine>.json     # output in score-<engine>.txt
python -B docs/planning/G1/fixture/score.py --self-check                               # SELF-CHECK PASSED
```

The normalizers were written and the mapping rules fixed before the first score; no mapping was changed afterwards.
