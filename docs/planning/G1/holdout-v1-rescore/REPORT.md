# BACK-78: G1 normalizer fixes D1 and D4, and the single approved hold-out re-score

**Date:** 2026-11-22.

**Authority.** The owner approved this on 22 Nov with "fix D1 and D4, re-score approved". This is the **one** approved re-score, and nothing further follows it.

**Frozen record.** The BACK-77 figures in `holdout-v1-run/` remain the frozen record. Nothing was changed under:
- `holdout-v1-run/`
- `holdout-v1/`
- `fixture/` (including `score.py` and the schemas)
- `back-28/golden/`

**No engine was run.** Both raw run-1 outputs from BACK-77 were re-normalized read-only.

All figures are counts. **This report does not select an engine.**

## Evidence in this folder

| File | What it holds |
|---|---|
| `graphify.envelope.json`, `codegraph.envelope.json` | The run-1 raw output re-normalized with `--contract v1` by the fixed normalizers |
| `score-*.json`, `score-*.txt` | `fixture/score.py` output; the scorer is unchanged |
| `breakdown.py`, `breakdown.txt` | A copy of `holdout-v1-run/breakdown.py` (only the docstring's first line differs), run on the re-score JSON |

## 1. Provenance and hashes

`<SANDBOX>` is the BACK-77 sandbox, `/tmp/claude-0/<session>/scratchpad/g1-sandbox`.

| Input | Check | Result |
|---|---|---|
| `runs/graphify-1/graphify-out/graph.json` | sha256 | `c0ff6d5ff48c5808f9935a5d016223911ba747a22fa5b194e6ac3c8df68512dc`, equal to `holdout-v1-run/runs.md` |
| `runs/codegraph-1/.codegraph/codegraph.db` | sha256 | `044e8b51a846d8d9b2b0226465c019b2696d63372f4f4fdc839c9032e6861cce`, equal to `runs.md` |
| the same DB | canonical hash via `holdout-v1-run/logs/cg_canon.py` | `5f0462c9af7542c1322db8e64ba5233c6d79ead1346ddb0e01d40263a44e72cb` (nodes 145, edges 216, files 35, unresolved_refs 73), equal to `runs.md` |
| `<SANDBOX>/holdout-copy` | `score.py` `tree_hash` | `c17bb1c50fd1c9173a850e5862dba1f75f63d392822daa5cc91119fb673bfde8`, equal to `MANIFEST.json` `src_tree_sha256` |

**Reproduction check before the fix.**
- The HEAD (`f315823`) normalizers were run with the exact `runs.md` arguments, including the literal `--cmd "graphify extract holdout-copy --code-only --out runs/graphify-N"`, which feeds `config_digest`.
- They reproduced both committed BACK-77 envelopes byte for byte: `graphify.envelope.json` `89c18664…8b90e4c` and `codegraph.envelope.json` `51b4eeff…b8f407f`.
- Every delta below therefore comes from the code change alone.

**Commands.** These use the fixed code; `<env>` is this folder.

    python3 -I docs/planning/G1/back-21/normalize_graphify.py <SANDBOX>/runs/graphify-1/graphify-out/graph.json <SANDBOX>/holdout-copy <env>/graphify.envelope.json \
        --stderr <SANDBOX>/logs/graphify-run1.stderr.log --contract v1 --cmd "graphify extract holdout-copy --code-only --out runs/graphify-N"
    python3 -I docs/planning/G1/back-21/normalize_codegraph.py <SANDBOX>/runs/codegraph-1/.codegraph/codegraph.db <SANDBOX>/holdout-copy <env>/codegraph.envelope.json \
        --contract v1 --cmd "node cg_run.js holdout-copy  (vendored linux-x64 node; CodeGraph.init + indexAll, library API)"
    python3 -B docs/planning/G1/fixture/score.py <env>/<engine>.envelope.json --ground-truth docs/planning/G1/holdout-v1/ground-truth.json \
        --json <env>/score-<engine>.json > <env>/score-<engine>.txt
    python3 -B docs/planning/G1/holdout-v1-rescore/breakdown.py > docs/planning/G1/holdout-v1-rescore/breakdown.txt

**Normalizer summaries.**
- Graphify: `[OK] 88 nodes, 108 edges, 25 omissions` (frozen: 84 / 101 / 32).
- CodeGraph: `[OK] 88 nodes, 178 edges, 18 omissions` (frozen: 91 / 182 / 17).

**Output hashes.**

| File | sha256 |
|---|---|
| `graphify.envelope.json` | `38fcf68e6704fe7b047d572a233cbd382033e22b626faebc4fdfd7adec24820b` |
| `codegraph.envelope.json` | `f67faa342f7e3c4e1b1fc0b8ffa79c21122de70fedde08781bd8bc77427b17db` |

## 2. Code changes (v1 path only)

### D1, `back-21/normalize_graphify.py` (new rule V9)

**Where the change is.** `normalize()` gains a keyword, `module_suffix=False`.
- The v0 call path never sets it, so N1 (bare basename, at L1) is unchanged.
- `normalize_v1()` calls it with `module_suffix=True`.

**Helpers.**
- `_candidate_files(graph, fixture_dir)` returns the scope walk of `src/` together with every code node's `source_file`.
- `_suffix_match(label, sf, candidates)` returns:
  - `"unique"` when the label contains a `/`, equals `sf` or a trailing path-component suffix of it (`sf.endswith("/" + label)`), and matches no other candidate file;
  - `"ambiguous"` when the suffix also matches another file;
  - `None` otherwise.

**v1 behaviour.**
- A code node at L1 with a `"unique"` match is a module, and its id is its `source_file`.
- An `"ambiguous"` node stays dropped and is recorded as an omission with the reason "module label is a path suffix that matches more than one file; ambiguous, not mapped (BACK-78 D1)". v1 keeps that omission.

**Effect on the hold-out.**
- `vault/models.py`, `ingest/models.py`, `vault/__init__.py` and `plugins/__init__.py` are now modules.
- No ambiguity arose.
- `ingest/__init__.py` is still not a module. It is an empty file, Graphify gives its node no `source_location`, and so it fails N1's L1 condition, which was not changed. No truth edge involves it.

### D4, `back-21/normalize_codegraph.py` (new rule V7)

**`nested_folds(con)`.**
- A `function` or `method` node is nested when its `qualified_name` parent (`Outer` in `Outer::inner`) is a `function` or `method` node in the same file.
- A nested node is mapped to its innermost enclosing emitted node. The mapping climbs through parents that are themselves nested, with a cycle guard.
- Class methods (`Class::method`, whose parent kind is `class` or `interface`) are not touched.

**In `normalize_v1()`.**
- Nested nodes are removed from `nodes`.
- Their outgoing `calls`, `instantiates` and `contains` edges, and their unresolved `calls`/`imports` rows, take the enclosing node as `from`.
- Edges *into* a nested node are not emitted, and they are counted. Re-targeting them would assert a relation the engine did not report.

**`_fold_cleanup()`.**
- A folded edge that becomes a self-edge is dropped.
- A folded edge equal on (type, from, to, file, line, target_hint) to another edge is merged into it, and the weaker basis wins.
- Edges that were not folded keep their order and are never touched.

**Counts and omissions.**
- The exact-match count is now taken over the emitted edges. It is unchanged when nothing is folded.
- One omission, "N CodeGraph nested function node(s) … (BACK-78 D4)", gives the counts of self-edges dropped, duplicates merged and edges into a nested function.

**Effect on the hold-out.**
- `expose::wrap`, `LedgerPanel::add` and `LedgerPanel::close` are no longer nodes.
- `add → postEntry` at `LedgerPanel.tsx:11` is now `LedgerPanel → postEntry`, which is E043.
- The two unresolved refs (`setRows` at L11, `fetch` at L12) now start from `LedgerPanel`.
- 4 edges into nested nodes are not emitted: 3 `contains` and the exact-match call `LedgerPanel → add` at L17. Exact-match calls therefore go from 6 to 5.
- Every emitted id matches the v1 schema id pattern, so schema errors go from 6 to 0.

### Tests, `back-28/test_normalizers_v1.py` (+4)

All four use synthetic inputs in the style of `synthetic.py`. Nothing is taken from the hold-out.

| Test | Proves |
|---|---|
| `test_d1_path_suffix_module_label_is_recognized_when_unique` | `svc/models.py` and `jobs/models.py` become modules; the import (with `names`) and the `contains` edge are emitted; the result is schema-valid; v0 still drops them |
| `test_d1_negative_ambiguous_path_suffix_stays_dropped_and_is_reported` | `svc/models.py` also matches `src/old/svc/models.py`, so it is not mapped, an ambiguity omission is recorded, and none of its edges are emitted |
| `test_d4_nested_functions_fold_into_the_enclosing_symbol` | One and two levels of nesting fold to `buildOrder`; duplicates merge; no self-edges; no edges into nested nodes; the unknown ref is folded; schema and contract are valid |
| `test_d4_negative_class_methods_are_not_folded` | `Cart::addItem` stays `Cart.addItem` with its own calls; a function whose parent is a class is not folded; no D4 omission |

Against the HEAD (`f315823`) normalizers, the 2 D1 tests and the D4 positive test fail. The controller checked this independently: 3 failures, all 43 run. The D4 negative test is a guard against over-folding, so it passes on both versions.

### Verification

| Command | Result |
|---|---|
| `python3 -B -I -m unittest discover -s docs/planning/G1/back-28 -p "test_*.py"` | Ran 43 tests, OK. The ResourceWarnings about unclosed sqlite handles also appear on HEAD |
| `python3 -B docs/planning/G1/fixture/score.py --self-check` | SELF-CHECK PASSED |
| `python3 -B docs/planning/G1/holdout-v1/verify.py` | HOLDOUT VERIFY PASSED, exit 0 |
| v0 goldens, `back-28/golden/*` | unchanged; the golden tests pass |
| v0 on the raw hold-out outputs, HEAD code vs fixed code | byte-identical (Graphify `2a671f79…aac2aa`, CodeGraph `75e7de07…fcfe0`) |
| Controller re-score of both committed envelopes | byte-identical to the committed `score-*.txt` |

## 3. Frozen (BACK-77) vs re-scored (BACK-78)

| | Graphify frozen | Graphify re-score | Δ | CodeGraph frozen | CodeGraph re-score | Δ |
|---|---|---|---|---|---|---|
| **VERDICT** | FAIL | **FAIL** | – | FAIL | **FAIL** | – |
| TP / FN / FP (114) | 89 / 25 / 3 | **96 / 18 / 3** | +7 / −7 / 0 | 106 / 8 / 4 | **107 / 7 / 3** | +1 / −1 / −1 |
| imports TP/FN/FP (33) | 27 / 6 / 1 | 32 / 1 / 1 | +5 / −5 / 0 | 33 / 0 / 0 | 33 / 0 / 0 | 0 |
| calls TP/FN/FP (30) | 17 / 13 / 2 | 17 / 13 / 2 | 0 | 23 / 7 / 4 | 24 / 6 / 3 | +1 / −1 / −1 |
| contains TP/FN/FP (51) | 45 / 6 / 0 | 47 / 4 / 0 | +2 / −2 / 0 | 50 / 1 / 0 | 50 / 1 / 0 | 0 |
| HARD: false observed | 2 | 2 | 0 | 3 | **2** | −1 |
| HARD: negatives hit (of 23) | 3 (N05, N20, N23) | 3 (same) | 0 | 0 | 0 | 0 |
| HARD: unknown claimed as observed | 1 (E064) | 1 | 0 | 0 | 0 | 0 |
| HARD: overclaimed / invalid | 0 / 0 | 0 / 0 | 0 | 0 / 0 | 0 / 0 | 0 |
| HARD: schema / contract errors | 0 / 0 | 0 / 0 | 0 | 6 / 0 | **0 / 0** | −6 |
| Reported: false inferred | 1 | 1 | 0 | 1 | 1 | 0 |
| Reported: understated | 0 | 0 | 0 | 2 (E034, E051) | 2 | 0 |
| Reported: form mismatches | 2 | 2 | 0 | 6 | 6 | 0 |
| Line provenance, exact | 89 | 96 | +7 | 106 | 107 | +1 |
| Unknowns (7) | claimed 1, silent 6 | same | 0 | marked 7 | marked 7 | 0 |
| Files seen / total | 31 / 36 | 35 / 36 | +4 | 35 / 36 | 35 / 36 | 0 |
| `external_refs` (truth 8) | 8 | 9 | +1 | 0 | 0 | 0 |
| Coverage, Python tp/expected | 41/54 | 48/54 | +7 | 52/54 | 52/54 | 0 |
| Coverage, TSX tp/expected | 10/11 | 10/11 | 0 | 9/11 | 10/11 | +1 |

**Recovered truth edges.**
- Graphify: E023, E028, E029, E030, E033, E097 and E119. These are exactly the 7 edges BACK-77 attributed to D1; each is an EXTRACTED link at the correct line.
- CodeGraph: E043.

**False observed removed.** CodeGraph's `LedgerPanel::add → postEntry` is now the true edge E043.

**New failures introduced by the fixes: none.**
- Neither engine gained a new FP, negative hit, false observed edge, label finding or schema error.
- N13 still holds: `compat.py` has no link to `ingest/models.py`.

**Graphify `external_refs` 8 → 9.** This is not a new error.
- The frozen figure of 8 matched the truth's 8 only by coincidence. It counted the call site `plugin_host.py::activate` L6 → `importlib`, and it missed `from dataclasses import` at `ingest/models.py:2` because D1 had dropped that module.
- The re-score now holds all 8 truth externals plus that one call-site reference.

## 4. Case-class breakdown, before and after (`breakdown.txt`)

| Case class | Graphify frozen | Graphify re-score | CodeGraph frozen | CodeGraph re-score |
|---|---|---|---|---|
| Path aliases (7) | 6/1 FN E042 | 6/1 FN E042 | 5/2 FN E042, E043 | **6/1** FN E042 |
| `__all__` star imports (5) | 4/1 FN E051 | 4/1 | 5/0, E051 understated | same |
| Conditional imports (4) | 2/2 FN E019, E028 | **3/1** FN E019 | 4/0 | 4/0 |
| Decorators (5) | 2/3 FN E039, E052, E054 | same | 3/2 FN E039, E054 | same |
| Inheritance (8) | 3/5 FN E030, E034, E037, E061, E062 | **4/4** FN E034, E037, E061, E062 | 7/1 FN E058, E034 understated | same |
| Default exports (8) | 6/2 FN E045, E048; hit N23 | same | 7/1 FN E045 | same |
| Barrel re-exports (4) | 4/0 | 4/0 | 4/0 | 4/0 |
| Cross-package collisions (8) | 4/4 FN E023, E028, E033, E041; 0 of 8 hit | **7/1** FN E041; 0 of 8 hit | 7/1 FN E041; 0 hit | same |
| Unknowns, dynamic (5) | E064 claimed_observed, 4 silent; hit N20 | same | 5 marked_unknown | same |
| Unknowns, HTTP (2) | 2 silent | same | 2 marked_unknown | same |
| Omissions and coverage (3) | 3/0 | same | 3/0 | same |
| Negatives: comment / string / shadow | hit N05 | same | 0 | 0 |
| No case tag (65) | 57/8 FN E029, E056, E087, E094, E095, E096, E097, E119 | **60/5** FN E056, E087, E094, E095, E096 | 64/1 FN E087 | same |

## 5. Remaining open items (not addressed here)

**Open owner decisions.**
- **D2, Graphify dynamic import.** The EXTRACTED `imports_from` link at `App.tsx:8` still passes as observed. As a result N20 is hit, E064 is claimed, and there is 1 false observed edge. This is a mapping decision for the owner.
- **Decorator mapping.** Graphify `references` and CodeGraph `decorates` are still dropped: E039, E052, E054 for Graphify, and E039, E054 for CodeGraph. Mapping them as calls would still run into open Ruling 1.
- **Ruling 16** is still open and is applied as pinned. It had no effect in this re-score either, because no line-less unknown reaches the scorer.

**Other defects, not fixed.**
- **D3, Graphify stderr parser:** only the first file of a multi-file warning is kept.
- **D5:** `files_total` is 36 against the truth's 35, because `tsconfig.json` is counted.
- **D6:** `fixture_version` and the `scope` label are hard-coded.
- **Graphify `ingest/__init__.py`:** it has no node line, so it is still not a module. It costs no truth edge.

**Engine-side failures, unchanged.**
- Graphify:
  - N05, a shadowed parameter;
  - N23, a value reference read as an inferred call;
  - misses on anonymous default exports, CommonJS, TS `super` and receiver-typed calls.
- CodeGraph:
  - the 2 `summary.ts` calls attributed to the module, because there is no `::default` node. These are its remaining hard failures.
  - Python `super()` (E058);
  - `makeSummary` (E045).

## 6. Status of the record

**BACK-77 (`holdout-v1-run/`) remains the frozen hold-out record, and its figures are not superseded.**

This folder is the single owner-approved re-score after the mechanical fixes D1 and D4. It is reported next to the frozen figures, as the hold-out procedure requires. This ticket authorizes no further re-score or tuning on the hold-out.

## 7. What this means for BACK-23 (evidence only; no engine is picked here)

**Strict v1 verdict.** Both engines still FAIL after D1 and D4.
- Graphify's 6 hard counts are unchanged. They come from 3 engine edges: 2 wrong relations (N05 and N23) and the dynamic-import observed label (D2, still open).
- CodeGraph's hard failures fall to 2 false observed edges. Both are granularity misses at `summary.ts:6`: the anonymous default is attributed to the module. CodeGraph now has 0 schema errors and asserts no relation absent from the source.

**Recall on the same pinned mapping.** CodeGraph is at 107/114 and Graphify at 96/114.
- The D1 gap is closed. All 18 remaining Graphify FNs are on the engine side or the mapping side: anonymous and CommonJS default exports, the conditional `require`, TS `super`, receiver-typed calls, the `__all__` chain, and decorators.
- CodeGraph's 7 remaining FNs are anonymous default exports (4), decorators (2) and Python `super()` (1).

**Precision.** FP is 3 for each engine.
- Graphify's 3 include 2 negatives hit.
- CodeGraph's 3 are the 2 `summary.ts` calls plus 1 false inferred.

**Unchanged by this re-score.**
- Labelling: neither engine overclaims.
- Unknown handling: Graphify has no unknown class; CodeGraph marks all 7 through generic unresolved markers.
- Line provenance: exact on every matched edge.
- Determinism, resource cost and licence status: as reported in BACK-77.

**What could still move the hard counts.** D2, the decorator mapping and Ruling 16 would move them further, Graphify's most of all. These are owner decisions and are not applied here.
