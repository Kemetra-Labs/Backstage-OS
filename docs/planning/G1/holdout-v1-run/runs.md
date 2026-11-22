# BACK-77 runs (2026-11-22): commands and environment

`<SANDBOX>` = `/tmp/claude-0/<session>/scratchpad/g1-sandbox`: a Linux cloud container's session scratchpad, deleted with the session. It is not inside any git repository: `git -C <SANDBOX> rev-parse` and `git -C <SANDBOX>/holdout-copy rev-parse` both exited 128 with `fatal: not a git repository`.

## 0. Before

```
$ python3 -B docs/planning/G1/holdout-v1/verify.py
holdout-v1: src files=36 (source modules=35) nodes=86 edges=121 negatives=23 external_imports=8
edges by (type, basis): calls/inferred=5, calls/observed=25, calls/unknown=2, contains/observed=51, imports/observed=33, imports/unknown=5
self-score with fixture/score.py (kawalys.graph.v1): tp=114/114 fn=0 fp=0 unknown marked=7/7 verdict=PASS
manifest tree sha256: 23308150467adee168a03cd7f84d5aa6975e71f7afba19e74363ee5b28cf8a63 (40 files); src tree sha256: c17bb1c50fd1c9173a850e5862dba1f75f63d392822daa5cc91119fb673bfde8
HOLDOUT VERIFY PASSED
```

That is exit 0, the `score.py` pin `3946e862…786e` and the schema pin `58f28a69…46aa` are as in `MANIFEST.json`, and the worktree at `c875385` was clean.

## 1. Input

- `cp -a docs/planning/G1/holdout-v1/src <SANDBOX>/holdout-copy/src`. Nothing else was copied: there is no `ground-truth.json`, `verify.py`, `MANIFEST.json` or README in the sandbox.
- 36 files. The `tree_hash` (the same function as `score.py`) of `holdout-copy` was `c17bb1c50fd1c9173a850e5862dba1f75f63d392822daa5cc91119fb673bfde8` before the runs and again after all 4 runs. It equals `MANIFEST.json` `src_tree_sha256`.
- The engines ran with `cwd=<SANDBOX>` and the argument `holdout-copy`, so their paths are `src/...` and match the ground-truth ids.

## 2. Toolchain

| | Value |
|---|---|
| Host | Linux 6.18 x86_64 cloud container, 4 vCPU, 16 GB RAM, no swap |
| System Python | 3.13.18 (`/usr/local/bin/python3`); used for the venvs, snapshots, normalizers and scorer |
| System Node | v22.23.5; **not used by any engine** |
| Harness venv | `<SANDBOX>/venv-harness`, `psutil==7.1.3` (the version BACK-21 used); used only to run `measure.py` |
| Graphify venv | `<SANDBOX>/venv-graphify`: `python3 -m venv`, then `PIP_NO_CACHE_DIR=1 pip install graphifyy==0.9.114` from PyPI. 31 packages, see `logs/pip-freeze-graphify.txt` |
| CodeGraph | `<SANDBOX>/cg-install`: `npm install --save-exact --ignore-scripts @colbymchenry/codegraph@1.6.4`. npm 10.9.9 added 2 packages, the shim and `@colbymchenry/codegraph-linux-x64`. See `logs/codegraph-install-package-lock.json` |
| CodeGraph runtime | **the bundle's vendored Node**, `codegraph-linux-x64/node`, v24.22.1 (LTS Krypton, OpenSSL 3.5.9). This is the same Node version as BACK-21's `node.exe` |

### Graphify install versus BACK-21

The runtime set matches BACK-21's `pip-freeze-graphify.txt` package for package, at the same versions. The only differences are:

- BACK-21's harness extras: `pip-licenses`, `prettytable`, `psutil`, `tomli` and `wcwidth`;
- `graphifyy` came from the PyPI wheel here, not from the local clone of tag v0.9.114.

PyPI's published sha256 for `graphifyy-0.9.114-py3-none-any.whl` is `cf3cb57e87840a0c6ef7399578a95ad7ff6a83539dc71dcef0465b1b7f3a3453`. pip ran without a cache and without `--require-hashes`, so the downloaded file's own hash was not captured. The installed `RECORD` sha256 is `54c62001df2183306bec70d95f2ce12984059152efc2f5cbbdd25bf958b0d186`.

### CodeGraph install versus BACK-21

The 7 `integrity` values in the lock (the shim and the 6 platform packages) are **identical** to BACK-21's lock, so these are the same registry tarballs. The shim's integrity is `sha512-Vn4rKe3w…1hyjZg==`, and `codegraph-linux-x64` is `sha512-oY1ycOKN…l41UvA==`.

The installed linux-x64 bundle has these sha256 values:

| File | Size | sha256 |
|---|---|---|
| `node` | 126,879,696 bytes; ELF, not stripped | `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb` |
| `lib/kernel/codegraph-kernel.node` | 37,549,944 bytes; ELF shared object, stripped | `5810089412d8cbf0961b26ad949c7dfe72633a3cd22f157263754e3aa9d4a07b` |
| `bin/codegraph` | | `8b1aead316bcbeb8797f57239d304e3b12e7368319621a67c6611cf749300703` |

`scripts` is absent from both installed `package.json` files. The inner `lib/package.json` still carries the repository's `preuninstall`, which was never run, as in BACK-21.

## 3. Invocations (each through `logs/measure.linux.py`)

```
G1_SANDBOX=<SANDBOX> venv-harness/bin/python -I harness/measure.py --label graphify-runN --cwd <SANDBOX> --logs <SANDBOX>/logs -- \
    <SANDBOX>/venv-graphify/bin/graphify extract holdout-copy --code-only --out runs/graphify-N
G1_SANDBOX=<SANDBOX> venv-harness/bin/python -I harness/measure.py --label codegraph-runN --cwd <SANDBOX> --logs <SANDBOX>/logs -- \
    <SANDBOX>/cg-install/node_modules/@colbymchenry/codegraph-linux-x64/node cg_run.js holdout-copy
mv holdout-copy/.codegraph runs/codegraph-N/        # after each CodeGraph run
```

- `cg_run.js` is `back-21/cg_run.js` with only `LIB` changed, from `codegraph-win32-x64` to `codegraph-linux-x64`. It is copied as `logs/cg_run.linux.js`, sha256 `69e143b439f426ee727a702b472420d83699e6d941160857c06d1ce46a89d438`. `diff` against the original shows only that one changed line.
- Order: graphify-run1, graphify-run2, codegraph-run1, codegraph-run2, each run straight after the one before.
- No `install`, `uninstall`, `init` CLI, `index`, `hook`, `serve`, `mcp`, `upgrade`, `daemon` or `clone` command of either engine was run. As in BACK-21, `cg_run.js` calls the library API `CodeGraph.init(root, {index:false})` and then `indexAll()`.
- The bundle's `lib/dist/index.js` and `engine.js` do not `require` the `telemetry/`, `upgrade/` or `installer/` modules. `installGitSyncHook` appears only in `installer/index.js` and `sync/`. This is a first-level `require` grep, not a full call-graph audit.

## 4. Environment for every engine invocation

The harness is `back-21/measure.py`, copied to `logs/measure.linux.py`. Its changes are listed in its docstring, and nothing else changed:

1. `SANDBOX`, `SNAP` and the snaps dir point at the Linux sandbox and `harness/snapshot.py`, instead of the Windows backslash paths.
2. **`NODE_USE_ENV_PROXY=1` is added.** This is the improvement on BACK-21.
3. The container has more proxy carriers than the Windows host had, so each is handled:
   - every inherited variable whose name ends in `_PROXY` is set to the dead proxy;
   - the no-proxy lists are emptied;
   - other proxy carriers are dropped.
4. The meta file records the removed variable **names**, never their values.

Removed by BACK-21's rule (unchanged):
- every name matching `API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|ACCESS_KEY|SESSION`;
- the prefixes `AWS_ ANTHROPIC_ OPENAI_ GEMINI_ GOOGLE_ AZURE_ CLAUDE`.

Here that removed, among others, `GH_TOKEN`, `GITHUB_TOKEN`, `AWS_*`, `CLOUDSDK_AUTH_ACCESS_TOKEN`, all `CLAUDE*`, `ANTHROPIC_BASE_URL` and the `CCR_*` session variables. The full name list is in `logs/*.meta.json` under `env_keys_removed`.

Also removed (the BACK-77 addition): `CLOUDSDK_PROXY_ADDRESS`, `CLOUDSDK_PROXY_PORT`, `CLOUDSDK_PROXY_TYPE`, `CCR_*PROXY*`, `ELECTRON_GET_USE_PROXY` and `JAVA_TOOL_OPTIONS`, which carried the live proxy.

Set:
- `DO_NOT_TRACK=1`
- `CODEGRAPH_TELEMETRY=0`
- `CODEGRAPH_NO_UPDATE_CHECK=1`
- `CODEGRAPH_NO_DOWNLOAD=1`
- `GRAPHIFY_BACKEND=none`
- `GRAPHIFY_QUERY_LOG_DISABLE=1`
- `PYTHONUTF8=1`
- `PYTHONDONTWRITEBYTECODE=1`
- `NODE_USE_ENV_PROXY=1`

Dead proxy `http://127.0.0.1:9`, upper and lower case: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, plus the inherited `DOCKER_HTTPS_PROXY`, `GLOBAL_AGENT_HTTPS_PROXY`, `YARN_HTTPS_PROXY` and `npm_config_https_proxy`.

Emptied: `NO_PROXY`, `no_proxy`, `GLOBAL_AGENT_NO_PROXY` and `npm_config_noproxy`.

### Proof that the dead proxy binds, run on the toolchain, not an engine

This used `env -i` with only `PATH`, the dead proxy and the flag.

| Runtime | Call | With `NODE_USE_ENV_PROXY=1` | Without it (control) |
|---|---|---|---|
| Vendored Node v24.22.1 | `fetch('http://example.com/')` | `ECONNREFUSED 127.0.0.1:9` | `ENOTFOUND` (proxy ignored) |
| Vendored Node v24.22.1 | `https.get('https://example.com/')` | `ECONNREFUSED 127.0.0.1:9` | `ENOTFOUND` (proxy ignored) |
| Graphify venv Python | `urllib.request.urlopen('https://example.com/')` | `Connection refused` | n/a |

So for CodeGraph, unlike BACK-21, any `fetch` or `http(s)` request from the Node process would have had to go to the dead proxy. A raw socket, or code that ignores the proxy agent, would not be caught. **Actual traffic was not captured**: there was no packet capture or strace, because a capture would have needed a third run.

`grep -il "proxy|ECONN|getaddrinfo|ETIMEDOUT|connect"` over all 8 run stdout and stderr logs found nothing.

## 5. Results

| Run | Exit | Wall (s) | Peak RSS, sampled process tree (MB) | Config snapshot diff (pre vs post) | Watched home dirs changed |
|---|---|---|---|---|---|
| graphify-run1 | 0 | 1.786 | 89.8 | 0 | none |
| graphify-run2 | 0 | 1.661 | 89.6 | 0 | none |
| codegraph-run1 | 0 | 1.194 | 202.8 | 0 | none |
| codegraph-run2 | 0 | 0.738 | 201.3 | 0 | none |

How to read these numbers:
- Wall time is the harness's whole-process time.
- CodeGraph's own `durationMs` was 887 for run 1 and 422 for run 2.
- Run 2 follows run 1 immediately, with a warm OS file cache and, for CodeGraph, the V8 compile cache in the temp dir (not cleared, not inspected).
- RSS is a 20 ms sampled peak.

What the engines reported:
- **Graphify** (both runs): it found 36 code files, counting `src/tsconfig.json` as code, and wrote 129 nodes, 183 edges and 14 communities. It printed the warning `3 code file(s) yielded no symbols … src/packages/atlas/src/legacy/csv.js, src/packages/atlas/src/summary.ts, src/packages/ledger/src/index.ts` and "AST cache: 0/36 files served from cache".
- **CodeGraph** (both runs): `filesIndexed 35, filesSkipped 0, filesErrored 0, filesSkippedUnsupported 1 (.json)`, 145 nodes, 216 edges. The DB has 73 `unresolved_refs`, all with status `failed`.
- Neither engine has any errors in its stderr. CodeGraph's stderr is empty, and Graphify's holds only the cache line and the warning.

## 6. Determinism (run 1 vs run 2, each into a clean output dir)

**Graphify.** `graph.json` is **byte-identical**: sha256 `c0ff6d5ff48c5808f9935a5d016223911ba747a22fa5b194e6ac3c8df68512dc`, 77,073 bytes. Of the 26 files in `graphify-out/`, only `manifest.json` and `cache/stat-index.json` differ (timestamps).
- The normalized envelopes are equal once `generated_at` (the file mtime) is dropped.
- `graph.json` has no `built_at_commit` key and no absolute path. `.graphify_root` (not normalized) holds the absolute sandbox path.

**CodeGraph.** The raw `codegraph.db` differs (405,504 bytes each, timestamps and page layout):

| | sha256 |
|---|---|
| `codegraph.db`, run 1 | `044e8b51a846d8d9b2b0226465c019b2696d63372f4f4fdc839c9032e6861cce` |
| `codegraph.db`, run 2 | `78d4e0cf62db30caf613aa9aebf011239c553f90bd4834ae2f5e87539515f0f3` |
| canonical content hash, both runs | `5f0462c9af7542c1322db8e64ba5233c6d79ead1346ddb0e01d40263a44e72cb` |

- The canonical content hash is computed by `logs/cg_canon.py`, which uses the BACK-21 `runs.md` column list. All columns are present, and the row counts are nodes 145, edges 216, files 35 and unresolved_refs 73.
- `project_metadata` holds `indexed_at_commit = ''`, because there is no git repository, plus mtime-bearing config fingerprints.
- The normalized envelopes are equal once `generated_at` is dropped.

Both engines are deterministic on this input on this machine. Not tested: other machines, other Python or Node versions, hash seeds, or larger inputs.

## 7. Config snapshots (`logs/snapshot.py`, new for this pass; `logs/snapshot-diffs.txt`)

BACK-21's `baseline/snapshot.py` is not in the repository, so an equivalent was written. It records sha256 and size per file, and records symlinks by target. The scope is the one the ticket names:

- `~/.claude/` (recursive)
- `~/.claude.json`
- `~/.config`, `~/.cache`, `~/.local`
- `~/.graphify`, `~/.codegraph`

`~/.graphify` and `~/.codegraph` do not exist and are recorded as absent, so their creation would show as a change. 46,202 files were tracked, against 1,960 in BACK-21. The scope differs: BACK-21 tracked Windows agent configs, while this one includes the whole `~/.cache` and `~/.local`.

| Window | Diff |
|---|---|
| install Graphify (s02 vs s03) | **0** |
| install CodeGraph (s04 vs s05) | **0** |
| each of the 4 engine invocations (pre vs post) | **0**, 4 of 4 |
| watched home dirs (`measure.py` listing) around each run | none, 4 of 4 |
| `~/.graphify`, `~/.codegraph` | absent at start and at end |
| harness venv (s00 vs s01), outside any engine window | 3: `~/.claude.json`, plus 1 removed and 1 added `~/.claude/backups/.claude.json.backup.*` |
| whole session (s00_start vs s99_final) | 13, all of them Claude Code's own files: `~/.claude.json`; 5 removed and 5 added rotating `~/.claude/backups/.claude.json.backup.<epoch-ms>`; this agent's own transcript `~/.claude/projects/…/subagents/agent-….jsonl`; one Claude Code MCP connection log under `~/.cache/claude-cli-nodejs/…/mcp-logs-…` |

The 13 whole-session changes fall in the gaps between the guarded windows, in the parts where the Claude Code session that drives this pass was writing its own state. No such change falls inside an install or engine window. Their content was not diffed, because these files belong to the running agent, and `~/.claude.json` is rewritten with a backup about once a minute. They are reported, not attributed to either engine.

## 8. Normalize and score

The normalizers ran from the repository as committed. `git diff` on `back-21/` and `back-28/` is empty.

```
python3 -I docs/planning/G1/back-21/normalize_graphify.py  <SANDBOX>/runs/graphify-N/graphify-out/graph.json <SANDBOX>/holdout-copy <env> \
    --stderr <SANDBOX>/logs/graphify-runN.stderr.log --contract v1 --cmd "graphify extract holdout-copy --code-only --out runs/graphify-N"
python3 -I docs/planning/G1/back-21/normalize_codegraph.py <SANDBOX>/runs/codegraph-N/.codegraph/codegraph.db <SANDBOX>/holdout-copy <env> \
    --contract v1 --cmd "node cg_run.js holdout-copy  (vendored linux-x64 node; CodeGraph.init + indexAll, library API)"
python3 -B docs/planning/G1/fixture/score.py docs/planning/G1/holdout-v1-run/<engine>.envelope.json \
    --ground-truth docs/planning/G1/holdout-v1/ground-truth.json --json docs/planning/G1/holdout-v1-run/score-<engine>.json \
    > docs/planning/G1/holdout-v1-run/score-<engine>.txt
python3 -B docs/planning/G1/holdout-v1-run/breakdown.py > docs/planning/G1/holdout-v1-run/breakdown.txt
```

The normalizers reported:
- Graphify: `[OK] 84 nodes, 101 edges, 32 omissions`
- CodeGraph: `[OK] 91 nodes, 182 edges, 17 omissions`

Both runs of each engine gave the same counts.

The committed envelopes are the run-1 outputs. In both, `source.revision` = `c17bb1c50fd1c9173a850e5862dba1f75f63d392822daa5cc91119fb673bfde8`, which equals `MANIFEST.json` `src_tree_sha256`.

`breakdown.py` only regroups the scorer's JSON by the `case` tags already in `ground-truth.json`. It does not re-score.

## 9. Raw artefacts (not committed; sha256 only)

| Artefact | sha256 |
|---|---|
| `runs/graphify-1/graphify-out/graph.json` (= run 2) | `c0ff6d5ff48c5808f9935a5d016223911ba747a22fa5b194e6ac3c8df68512dc` |
| `runs/graphify-1/graphify-out/manifest.json` | `80e9339dfb23026dc784321599ffa851a6bc495eda9ec787876d86f7b571f4af` |
| `runs/graphify-2/graphify-out/manifest.json` | `e73bedb5a2d3e63b3b6564c05d4dc9bfceae9f3c627387ab1939d13e5e28dd5a` |
| `runs/codegraph-1/.codegraph/codegraph.db` | `044e8b51a846d8d9b2b0226465c019b2696d63372f4f4fdc839c9032e6861cce` |
| `runs/codegraph-2/.codegraph/codegraph.db` | `78d4e0cf62db30caf613aa9aebf011239c553f90bd4834ae2f5e87539515f0f3` |
| `.codegraph/.gitignore` (both runs) | `47c0dacebca9f56c9020b68584470dfc51f07650a3719904e98f4b447a5dd003` |
| normalized run-2 envelopes (not committed; equal to run 1 except `generated_at`) | graphify `c064bde9…1950`, codegraph `3998cd0d…0965` |
| committed `graphify.envelope.json` | `89c186645dd7d4efbee5eeb9896ee0d5834a95245c5b2d82496113dbc8b90e4c` |
| committed `codegraph.envelope.json` | `51b4eeff5536bca4f57a4b5e0c32e3b2375f9735eacd7fe630f34e9a9d26407f` |

Install footprint: the Graphify venv is 175 MB. `cg-install` is 302 MB, of which 300 MB is the linux-x64 bundle: a 127 MB Node, a 37.5 MB kernel, and wasm grammars.

## 10. After

`verify.py` was run again after the scoring; its output is in REPORT.md under "Fixture unchanged". `git status` showed changes only under `docs/planning/G1/holdout-v1-run/`.
