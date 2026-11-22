# BACK-77 report: G1 hold-out v1 engine pass, Graphify vs CodeGraph

**Date:** 2026-11-22.

**Authority.** The owner approved this engine pass (contract v1 §6 item 3).
- Hold-out Ruling 3 is closed: `super` calls are **observed**. The key already said so, so nothing changed.
- Ruling 16 is **not** decided, so `score.py` was used exactly as pinned.

**Scope.**
- Each engine ran one pass. One identical second run per engine was a determinism check only; no rerun was made to improve a result.
- The normalizers and the scorer ran exactly as committed.
- Nothing under `holdout-v1/`, `fixture/`, `back-21/` or `back-28/` changed.

All figures are counts. **This report does not select an engine.**

## Evidence in this folder

| File | What it holds |
|---|---|
| `runs.md` | Commands, toolchain, environment, timings, determinism, snapshots and the sha256 of the raw artefacts |
| `graphify.envelope.json`, `codegraph.envelope.json` | Normalized run-1 output (`kawalys.graph.v1`) |
| `score-*.json`, `score-*.txt` | Scorer output, unchanged. The controller re-ran `score.py` on both envelopes and got byte-identical `.txt` output |
| `breakdown.py`, `breakdown.txt` | A per-case-class regrouping of the scorer JSON. It does not re-score |
| `logs/` | The pip freeze, npm lock, licence metadata, run meta, snapshot diffs and harness copies (`measure.linux.py`, `snapshot.py`, `cg_canon.py`, `cg_run.linux.js`). The stdout/stderr `.log` files are gitignored (`*.log`), as in BACK-21, and their content is quoted in `runs.md` |

## Verdicts (the scorer's own)

| | Graphify 0.9.114 | CodeGraph 1.6.4 |
|---|---|---|
| **VERDICT** | **FAIL** | **FAIL** |
| TP / FN / FP (of 114 observed + inferred truth edges) | **89 / 25 / 3** | **106 / 8 / 4** |
| imports TP/FN/FP (33) | 27 / 6 / 1 | 33 / 0 / 0 |
| calls TP/FN/FP (30) | 17 / 13 / 2 | 23 / 7 / 4 |
| contains TP/FN/FP (51) | 45 / 6 / 0 | 50 / 1 / 0 |
| HARD: false observed | 2 | 3 |
| HARD: negatives hit (of 23) | 3 (N05, N20, N23) | 0 |
| HARD: unknown claimed as observed/inferred | 1 (E064) | 0 |
| HARD: overclaimed / invalid claims | 0 / 0 | 0 / 0 |
| HARD: schema errors / contract errors | 0 / 0 | **6** / 0 |
| Reported: false inferred | 1 | 1 |
| Reported: understated | 0 | 2 (E034, E051) |
| Reported: form mismatches | 2 (require → import) | 6 (3 require, 3 reexport → import) |
| Line provenance of matched edges | exact 89, off 0, missing 0 | exact 106, off 0, missing 0 |
| Unknowns (7) | claimed_observed 1, silent 6 | marked_unknown 7 (see the caveat below) |
| Files seen / total (normalizer) | 31 / 36 | 35 / 36 |
| `external_refs` (truth 8) | 8 | 0 |
| Coverage tp/expected | JS 3/8, Py 41/54, TSX 10/11, TS 35/41 | JS 8/8, Py 52/54, TSX 9/11, TS 37/41 |

### What the hard failures are (each checked by hand at the source line)

**Graphify: 3 distinct engine edges behind 6 hard counts.**
1. `journal.ts:12` `previewEntry → money.ts::roundCents`, labelled observed, hits N05. The `roundCents` at that line is a parameter that shadows the import. **This is a wrong relation**, an engine error.
2. `App.tsx:8` `openMonthly` imports `views/monthly.ts`, labelled observed. It hits N20, claims unknown E064, and counts as 1 false observed edge.
   - For `await import('./views/monthly')` the engine emits two links. One is an `imports_from` link at L8 labelled EXTRACTED. The other is a separate, line-less `dynamic_import` link, which the normalizer drops as an unmapped relation (defect D2).
   - Rule R5 makes every dynamic `import()` unknown, so the observed label is a contract violation. The target file itself is right.
3. `App.tsx:5` `App.tsx → LedgerPanel.tsx::LedgerPanel`, an `indirect_call` labelled INFERRED, hits N23. The route table only references the component as a value. **This is a wrong relation**, although it is labelled inferred.

**CodeGraph: 3 false observed edges and 6 schema errors. None asserts a relation that is absent from the source.**
1. `LedgerPanel.tsx:11` `LedgerPanel::add → journal.ts::postEntry`.
   - The call is real, but it sits inside the nested arrow function `add`. The truth convention ("nested functions are not nodes") attributes it to `LedgerPanel` (E043).
   - The normalizer passes the nested function through as `…::LedgerPanel::add`, an id that fails the v1 schema's id pattern. Three nested functions (`expose::wrap`, `LedgerPanel::add`, `LedgerPanel::close`) produce all 6 schema errors (D4).
2. and 3. `summary.ts:6` `summary.ts (module) → text.ts::normalize` and `→ money.ts::roundCents`.
   - Both calls are real. CodeGraph makes no node for the anonymous default export, so it attributes the calls to the module. The truth (E041, E042) attributes them to `summary.ts::default`.
   - This is a granularity miss, not a wrong fact. The collision trap N08 (`money.ts::normalize`) was not hit.

## Side-by-side by case class (`breakdown.txt`)

The classes are the `case` tags already in `ground-truth.json`, and one edge can carry two tags. The "neg" column counts the negatives tagged with that class. A `*` marks an FN caused by normalizer defect D1, not by the engine.

| Case class | Truth (obs/inf/unk) | neg | Graphify TP/FN | Graphify notes | CodeGraph TP/FN | CodeGraph notes |
|---|---|---|---|---|---|---|
| Path aliases | 7 (7/0/0) | 1 | 6/1 | FN E042 (summary.ts has no symbols); hit 0 | 5/2 | FN E042 (anonymous default), E043 (nested `add`); hit 0 |
| `__all__` star imports | 5 (5/0/0) | 2 | 4/1 | FN E051 (`trim` via the earlier `legacy` star import); hit 0 | 5/0 | E051 understated (exact-match, confidence 0.7 → inferred); hit 0 |
| Conditional imports | 4 (4/0/0) | 2 | 2/2 | FN E019 (ternary `require`), E028*; hit 0 | 4/0 | hit 0 |
| Decorators | 5 (5/0/0) | 0 | 2/3 | FN E039, E052, E054: the engine models all three as `references` from the decorated symbol, which the normalizer drops | 3/2 | FN E039, E054: the engine emits `decorates` from the decorated symbol, which the normalizer drops. The factory call `expose(…)` (E052) is a normal call |
| Inheritance (super, inherited, override) | 8 (4/4/0) | 2 | 3/5 | FN E030*, E034 (TS super), E037, E061, E062 (receiver-typed); hit 0 | 7/1 | FN E058 (Python `super().save` left unresolved and emitted as unknown); E034 understated (Ruling 3 says observed); all 4 inferred truths matched as inferred; hit 0 |
| Default exports | 8 (8/0/0) | 1 | 6/2 | FN E045 (anonymous default), E048 (`module.exports = function toCsv`; csv.js has no symbols); **hit N23** | 7/1 | FN E045 (`makeSummary` unresolved); hit 0 |
| Barrel re-exports | 4 (4/0/0) | 0 | 4/0 | forms correct | 4/0 | 3 form mismatches (reexport → import) |
| Cross-package collisions | 8 (8/0/0) | 8 | 4/4 | FN E023*, E028*, E033*, E041 (summary.ts); **0 of 8 collision negatives hit** | 7/1 | FN E041 (attributed to the module); **0 of 8 hit** |
| Negatives: comment / string / shadow | 0 | 2/2/2 | n/a | **hit N05** (shadowed parameter) | n/a | 0 hit |
| Unknowns, dynamic loading (E064-E068) | 5 (0/0/5) | 2 | n/a | E064 **claimed_observed** (D2); E065-E068 silent; **hit N20** | n/a | 5 marked_unknown; hit 0 |
| Unknowns, HTTP cross-runtime (E069, E070) | 2 (0/0/2) | 3 | n/a | both silent; hit 0 | n/a | both marked_unknown; hit 0 (N18, N19 and N22 held) |
| Omissions and coverage | 3 (3/0/0) | 3 | 3/0 | outgoing edges of dynamic-only modules found. files_seen 31: D1 drops 5 modules, though the engine read every file. The warning names csv.js, summary.ts and index.ts as yielding no symbols (2 of them lost to D3) | 3/0 | files_seen 35; `.json` reported as unsupported (tsconfig) |
| No case tag (plain imports, calls and contains) | 65 (64/1/0) | 0 | 57/8 | FN E029*, E056 (receiver-typed), E087 (summary.ts), E094-E096 (CommonJS `contains`), E097*, E119* | 64/1 | FN E087 (anonymous default) |

**Caveat on CodeGraph's 7 "marked_unknown".**
- The scorer matches an unknown on file plus line, regardless of edge type (R5). CodeGraph earns each credit by leaving a generic unresolved builtin call on that line:
  - `App.tsx:8` and `lookup.ts:3`: `import`
  - `bridge.js:7`: `require`
  - `plugin_host.py:6`: `importlib.import_module`
  - `plugin_host.py:10`: `__import__`
  - `LedgerPanel.tsx:12`: `fetch`
  - `probe.py:10`: `urllib.request.urlopen`
- CodeGraph does not classify these as dynamic or cross-runtime. It records them the same way as `useState`, `json.loads` or `len`, which makes 61 unknown edges in total, most of them externals.
- So the credit means "did not claim a target and left an unresolved marker", not "recognized a dynamic import".
- Graphify emits no unknown class. Its externals go to `external_refs` = 8, which exactly matches the truth.

## Defects found (reported, NOT fixed; no normalizer, scorer or truth file was edited)

**D1 (major). Graphify normalizer, module rule N1.**
- N1 recognizes a module only when its label equals the file's basename.
- When two files share a basename, Graphify 0.9.114 prefixes the label with the parent directory. Here that affects `vault/models.py`, `ingest/models.py`, `vault/__init__.py`, `ingest/__init__.py` and `plugins/__init__.py`.
- Those 5 module nodes are dropped (files_seen 31), and all their links go unmapped: 5 `imports_from`, 3 `imports`, 1 `re_exports` and 18 `contains`.
- **This loses 7 truth edges: E023, E028, E029, E030, E033, E097 and E119.** The raw `graph.json` has each of them as an EXTRACTED link on the correct line, and none of the dropped links is a wrong relation. `compat.py` has no link to `ingest/models.py`, so N13 holds.
- Fixture v0 has no duplicate basenames, which is why BACK-21 and BACK-28 could not surface this.
- The controller confirmed it: the Graphify envelope has 31 module nodes and none for any `models.py` or `__init__.py`.

**D2 (major in effect). Graphify normalizer, dynamic import.**
- Graphify signals `import('./views/monthly')` with a `dynamic_import` link that has no line. V1 drops that link as unmapped, and the engine's parallel EXTRACTED `imports_from` link at L8 goes through as an observed import.
- The result is that N20 is hit, E064 is claimed, and there is 1 false observed edge.
- BACK-28 had listed the `dynamic` form as blocked until raw output existed; it now exists. Whether the companion EXTRACTED link should map to unknown is a mapping decision for the owner.

**D3 (minor). Graphify normalizer, stderr warning parser.**
- The regex keeps only the first file of a multi-file "yielded no symbols" warning, with its trailing comma (`csv.js,`).
- `summary.ts` and `ledger/index.ts` are therefore missing from `omissions`.

**D4 (major in effect). CodeGraph normalizer, nested functions.**
- Function ids use `qualified_name` verbatim, so a nested function becomes `file::Outer::inner`. That fails the v1 schema's id pattern, which causes **6 schema errors and on its own a FAIL**.
- There is no rule to fold a nested function into its innermost listed enclosing symbol, as the truth convention does. That causes E043 to be an FN, plus 1 false observed edge.
- The controller confirmed it: the envelope has `…::expose::wrap`, `…::LedgerPanel::add` and `…::LedgerPanel::close`.

**D5 (minor, reported field only). Both normalizers, files_total.**
- `scope_file_count` counts every file under `src/`, giving 36.
- The truth's files_total is 35, because `tsconfig.json` is configuration (Ruling 13).

**D6 (cosmetic). Both normalizers, envelope labels.**
- `source.fixture_version` is hard-coded to `g1-01-v0` and `scope` to `fixture-copy`.
- `source.revision` is correct. `score.py` does not check it, so it was checked by hand.

**Scorer: no defect found.**
- **Ruling 16** (a line-less unknown matches on `from` only) had **no effect here**. Neither envelope contains a line-less unknown edge: Graphify's line-less `dynamic_import` never reached the scorer (D2), and every CodeGraph unresolved row carries a line.
- Unknown matching is type-agnostic: it accepts any unknown at the line. That is by design (R5), but it produces the weak credit described in the caveat above.

**Mapping gap, not a defect.**
- Both engines model decorator application as a non-call relation from the decorated symbol: Graphify as `references`, CodeGraph as `decorates`. The pre-registered mappings drop both.
- Mapping them as calls would still run into open Ruling 1, under which the call starts at the module.

## Errata against the frozen ground truth

**None found.** Every hard failure and every FN was checked against the source with line numbers. Each one is consistent with the key and its conventions:
- nested functions are not nodes;
- `::default` is the node for an anonymous default export;
- `super` is observed (Ruling 3, closed).

## Determinism, resources, network and config

**Determinism.**
- Graphify's `graph.json` is byte-identical across both runs (`c0ff6d5f…12dc`).
- CodeGraph's raw DB bytes differ, but its canonical content hash is equal across runs (`5f0462c9…72cb`).
- Both engines' normalized envelopes are equal once `generated_at` is dropped.

**Resources.**

| | Graphify | CodeGraph |
|---|---|---|
| Wall time, run 1 / run 2 | 1.79 s / 1.66 s | 1.19 s / 0.74 s (the engine's own figures: 887 / 422 ms) |
| Sampled peak RSS | 89.8 / 89.6 MB | 202.8 / 201.3 MB |
| Install footprint | venv 175 MB, 31 packages | 302 MB (bundle 300 MB, including Node 127 MB and the kernel 37.5 MB) |

**Network.**
- All 4 runs used a dead proxy, `http://127.0.0.1:9`, on every `*_PROXY` variable, with `NODE_USE_ENV_PROXY=1` set.
- A toolchain check showed that this binds the vendored Node: `fetch` and `https.get` get `ECONNREFUSED 127.0.0.1:9` with the flag and `ENOTFOUND` without it. Python `urllib` gets `Connection refused`.
- The logs contain no proxy, connect or DNS error.
- Raw sockets were not covered, and **actual traffic was not captured**.

**Config and side effects.**
- The snapshot diff is **0** around both installs and all 4 engine invocations.
- `~/.graphify` and `~/.codegraph` stayed absent, and the home-dir watch saw no change.
- The 13 changes over the whole session are all Claude Code's own files (`~/.claude.json` and its rotating backups, the agent transcript and one MCP log), and all of them fall outside the engine and install windows.
- CodeGraph wrote only `.codegraph/{codegraph.db,.gitignore}` inside the copy, and these were moved out after each run. The copy's tree hash was unchanged after all runs.
- Graphify wrote only into `--out`.
- **No repository commit was recorded:** `graph.json` has no `built_at_commit`, and CodeGraph's `indexed_at_commit` is empty. That confirms the BACK-21 isolation finding is handled.
- `graphify-out/.graphify_root` does hold the absolute sandbox path.

## Deviations from BACK-21

| | BACK-21 | BACK-77 |
|---|---|---|
| Host | Windows workstation, `<HOME>\kawalys-g1-sandbox` | **Linux x86_64 Claude cloud container**, session scratchpad outside any git repository (`git rev-parse` exits 128) |
| CodeGraph binary | `codegraph-win32-x64` 1.6.4, `node.exe` v24.22.1 | **`codegraph-linux-x64` 1.6.4**, vendored ELF `node` v24.22.1; the lock integrity hashes are the same for all 7 packages |
| `cg_run.js` | `LIB` points to win32-x64 | `LIB` points to linux-x64; that is the only change |
| Node used | vendored | vendored (the system Node v22.23.5 was not used) |
| Python | 3.13.14 | **3.13.18** |
| Graphify source | `pip install` from the local clone of tag v0.9.114 | **PyPI wheel** `graphifyy==0.9.114` (published sha256 `cf3cb57e…3453`). Wheel-to-tag identity was not verified; the dependency set and versions are identical |
| Snapshot tool | `baseline/snapshot.py` (not in the repository), 1,960 files of Windows agent config | **new `logs/snapshot.py`** written for this pass: `~/.claude`, `~/.claude.json`, `~/.config`, `~/.cache`, `~/.local`, `~/.graphify` and `~/.codegraph`; 46,202 files |
| Proxy | The dead proxy bound Python only; Node ignored it | **`NODE_USE_ENV_PROXY=1` added** and verified to bind the vendored Node; the container's other proxy carriers were overridden or dropped (`runs.md`) |
| `measure.py` | Windows paths | Linux copy: the paths, proxy handling and removed-name logging changed, and the measurement logic did not (`logs/measure.linux.py`) |
| Fixture | v0 (16 files) | hold-out v1 (36 files) |

## Licence notes, Linux bundle (provisional, not legal clearance)

**Graphify.** This comes from installed metadata (`logs/graphify-licenses-from-metadata.txt`).
- `graphifyy` is Apache-2.0. Its dist-info ships `LICENSE`, `LICENSE-MIT` and `NOTICE`.
- networkx is BSD-3-Clause.
- numpy is "BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0".
- PyYAML, RapidFuzz, `tree-sitter` and 24 of the 25 grammars are MIT.
- `tree-sitter-elixir` 0.3.5 declares `License-Expression: Apache-2.0` but carries an MIT classifier; BACK-21 recorded it as MIT. Either way the licence is permissive.
- No copyleft licence was seen.
- **NOT VERIFIED:** the licence files bundled inside wheels (for example numpy's vendored libraries), and that the PyPI wheel equals the reviewed tag.

**CodeGraph linux-x64.**
- The root package and the bundle are MIT.
- `lib/node_modules` holds 12 packages, the same set and versions as BACK-21. Eleven are MIT and `tree-sitter-wasms` 0.1.13 is Unlicense. All ship a licence file except `@clack/*`, which declares MIT only in `package.json`.
- **NOT VERIFIED:**
  - the vendored `node` ELF (Node v24.22.1, OpenSSL 3.5.9, V8 13.6), which ships no licence file in the package, and whose bundled third-party licences were not reviewed;
  - the native `codegraph-kernel.node` (37.5 MB, stripped ELF, dynamically linked against the host's `libgcc_s`, `libc`, `libm`, `libstdc++`, `libdl` and `libpthread`, which the package does not bundle). Its 73 Rust crates were not audited (`cargo-license` was not run), and it is not verified that the binary was built from the tag's `Cargo.lock`;
  - the 36 wasm grammars in `tree-sitter-wasms/out` (the Unlicense covers only the packaging);
  - **29 further wasm grammars vendored by CodeGraph** in `lib/dist/extraction/wasm` (arkts, cfml, cobol, erlang, luau, nix, pascal, r, terraform, vbnet and others). BACK-21's preflight did not list these, and their licences were not checked.
- **CodeGraph's licence sign-off is still incomplete.**

## Rulings and limitations

**Rulings applied.**
- Ruling 3 (closed, observed): Graphify matched E058 as observed and missed E034. CodeGraph matched E034 labelled inferred, which is understated and reported only, and missed E058.
- Ruling 16 (open): applied as the pinned scorer does. It had no effect in this pass.
- Ruling 1 (open): not exercised, because the mappings drop the decorator relations.

**Limitations.**
- There was one run per engine, on one machine. Determinism was checked only by an identical second run.
- The fixture has 35 modules and 121 edges, all synthetic, so this is evidence about these cases only.
- Every score combines engine behaviour with normalizer behaviour. D1, D2 and D4 move the hard counts and FNs materially.
- **The scores were not recomputed with fixes.** Doing so would be tuning on the hold-out, which needs new owner approval and would be reported next to the frozen figures.
- Network: no packet capture was made. Config: the snapshot covers the named directories, not the whole filesystem.

## Fixture unchanged (verify.py at the end)

```
$ python3 -B docs/planning/G1/holdout-v1/verify.py
holdout-v1: src files=36 (source modules=35) nodes=86 edges=121 negatives=23 external_imports=8
edges by (type, basis): calls/inferred=5, calls/observed=25, calls/unknown=2, contains/observed=51, imports/observed=33, imports/unknown=5
self-score with fixture/score.py (kawalys.graph.v1): tp=114/114 fn=0 fp=0 unknown marked=7/7 verdict=PASS
manifest tree sha256: 23308150467adee168a03cd7f84d5aa6975e71f7afba19e74363ee5b28cf8a63 (40 files); src tree sha256: c17bb1c50fd1c9173a850e5862dba1f75f63d392822daa5cc91119fb673bfde8
HOLDOUT VERIFY PASSED
```

`score.py --self-check` also printed SELF-CHECK PASSED.

## What this means for BACK-23 (evidence only; no engine is picked here)

**Strict v1 verdict.** Both engines FAIL on the hold-out, in different ways.
- Graphify's hard failures include **2 wrong relations**: a shadowed parameter resolved to an import (N05), and a value reference read as an inferred call (N23). In addition, the normalizer passes through as observed a dynamic import that the engine labelled EXTRACTED.
- CodeGraph's hard failures assert **no relation that is absent from the source**. They are granularity misses (a nested function and an anonymous default export) plus 6 schema errors caused by the normalizer.

**Recall.** With the same pinned mapping, CodeGraph found 106 of 114 edges and Graphify 89 of 114. Seven of Graphify's 25 misses come from normalizer defect D1, not from the engine.
- Graphify's engine-side gaps: anonymous default exports, CommonJS `module.exports = function` and conditional `require`, TS `super`, receiver-typed method calls (4 of 5 inferred truths missed), and decorators.
- CodeGraph's engine-side gaps: anonymous default exports, Python `super()`, and decorators (emitted, but as `decorates`).

**Labelling honesty.** Neither engine overclaimed an inferred truth.
- CodeGraph's `instance-method` maps to inferred, and it matched all 5 receiver-typed truths that way.
- Graphify matched 1 of those 5.

**Unknown handling.**
- Graphify has no unknown class (6 silent, 1 claimed), but it counts externals exactly (8 of 8).
- CodeGraph marks all 7 unknown sites, but only through generic unresolved-call markers mixed in with 61 externals and builtins, and it reports `external_refs` as 0.

**Provenance and determinism.** Both engines gave exact lines on every matched edge, and both were deterministic.

**Cost.**
- Graphify is lighter: about 90 MB RSS and a 175 MB venv.
- CodeGraph needs about 200 MB RSS and a 300 MB bundle with two unaudited native binaries, and its licence sign-off is still open.

**Before any re-score**, the owner would need to rule on:
- the normalizer defects (D1 and D4 are mechanical; D2 is a mapping decision);
- the decorator mapping;
- Ruling 16.

Per the hold-out procedure, a re-score after fixes is a separately approved step, and it would report both the frozen and the re-scored figures.
