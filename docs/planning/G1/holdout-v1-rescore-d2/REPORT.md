# BACK-79: Graphify normalizer fix D2 (dynamic import is unknown) and Graphify re-score

**Date:** 2026-11-22.

**Authority.** The owner approved this on 22 Nov with "pick codegraph, fix D2 too". It is the owner's **second** approved re-score.

**Informational only.** This re-score was made **after** the owner had already picked CodeGraph ([back-23/DECISION-2026-11-22.md](../back-23/DECISION-2026-11-22.md)). It covers Graphify only and does not affect the engine choice.

**Earlier records stand.**
- BACK-77 (`holdout-v1-run/`) remains the frozen hold-out record.
- BACK-78 (`holdout-v1-rescore/`) remains the first approved re-score.
- Neither is superseded.

**Nothing else was changed:**
- `holdout-v1/`, `holdout-v1-run/` and `holdout-v1-rescore/`;
- `fixture/`, including `score.py` and both schemas;
- `back-28/golden/`;
- the CodeGraph normalizer.

**No engine was run.** The BACK-77 run-1 Graphify output was re-normalized read-only. All figures are counts.

## Evidence in this folder

| File | What it holds |
|---|---|
| `graphify.envelope.json` | BACK-77 run-1 raw Graphify output, re-normalized with `--contract v1` by the D2-fixed normalizer |
| `score-graphify.json`, `score-graphify.txt` | `fixture/score.py` output; the scorer is unchanged |
| `breakdown.py`, `breakdown.txt` | A copy of `holdout-v1-rescore/breakdown.py`. Graphify comes from this folder. CodeGraph is BACK-78's unchanged score, shown for reference only |

## 1. Provenance and hashes

`<SANDBOX>` is the BACK-77 sandbox, `/tmp/claude-0/<session>/scratchpad/g1-sandbox`.

| Input | Check | Result |
|---|---|---|
| `runs/graphify-1/graphify-out/graph.json` | sha256 | `c0ff6d5ff48c5808f9935a5d016223911ba747a22fa5b194e6ac3c8df68512dc`, equal to `holdout-v1-run/runs.md` |
| `<SANDBOX>/holdout-copy` | `score.py` `tree_hash` | `c17bb1c50fd1c9173a850e5862dba1f75f63d392822daa5cc91119fb673bfde8`, equal to `MANIFEST.json` |

**Reproduction check before the fix.**
- The HEAD (`b4fb83d`) normalizer was run with the exact BACK-78 arguments: the `--stderr` log, `--contract v1` and the literal `--cmd`.
- It reproduced the committed `holdout-v1-rescore/graphify.envelope.json` byte for byte (`38fcf68e…4820b`).
- Every delta below therefore comes from the code change alone.

**Commands** (fixed code; `<env>` is this folder):

    python3 -I docs/planning/G1/back-21/normalize_graphify.py <SANDBOX>/runs/graphify-1/graphify-out/graph.json <SANDBOX>/holdout-copy <env>/graphify.envelope.json \
        --stderr <SANDBOX>/logs/graphify-run1.stderr.log --contract v1 --cmd "graphify extract holdout-copy --code-only --out runs/graphify-N"
    python3 -B docs/planning/G1/fixture/score.py <env>/graphify.envelope.json --ground-truth docs/planning/G1/holdout-v1/ground-truth.json \
        --json <env>/score-graphify.json > <env>/score-graphify.txt
    python3 -B docs/planning/G1/holdout-v1-rescore-d2/breakdown.py > docs/planning/G1/holdout-v1-rescore-d2/breakdown.txt

**Normalizer output.** `[OK] 88 nodes, 108 edges, 25 omissions`, the same totals as BACK-78.

**Output hashes:**
- `graphify.envelope.json` is `62eb7cdb14d8f34ac54114f58fe17bcee7d27ddbf72918999209b03516804cdf`.
- `score-graphify.txt` is `08bb3ac33f54e571fe4317194bed552683694edece2105636b3697f69d203797`.

**Independent re-score check.** The controller re-ran `score.py` on the committed envelope and got output byte-identical to the committed `score-graphify.txt`.

**Envelope diff against BACK-78.** These are the only changes:
1. One edge changed. It was `imports App.tsx::openMonthly -> views/monthly.ts @ App.tsx:8 [observed, form import]`. It is now `imports App.tsx::openMonthly -> null @ App.tsx:8 [unknown, form dynamic]`, whose `target_hint` names `views/monthly.ts` and whose `engine_native_id` is the same as before.
2. The omission "1 Graphify edge(s) of relation dynamic_import … (not mapped)" is gone.
3. A new omission, "1 Graphify dynamic_import link(s)", records 1 companion converted, 0 orphans and 0 symbol imports.
4. The form-default omission goes from 30 to 29 import edges, and it now names V10.

## 2. Code change (v1 path only), `back-21/normalize_graphify.py`

**What Graphify emits.** Graphify 0.9.114 represents `import('./x')` with two links:
- an EXTRACTED `imports_from` link at the call line. On the hold-out its source is the enclosing function, `App.tsx::openMonthly`.
- a line-less `dynamic_import` link from the module (`App.tsx`) to the same target.

**The defect.** v1 dropped the `dynamic_import` and emitted the companion as an observed import. That violates R5, under which a dynamic import is always unknown.

**What `normalize_v1()` does now.**
- It collects `dynamic_import` links:
  - A link with an unmapped endpoint is still dropped, and counted.
  - A link to an engine-marked external node counts towards `external_refs` (V6).
- A new helper, `_dynamic_imports(recs, dyn_links)`, applies V10 before the V1-V3 statement building.
- The resulting unknown edges are appended after the statement edges.
- Two omissions disclose the mapping: a summary count, and an ambiguity count when that count is non-zero.

**Representation.** The change uses only what the v1 schema and `score.py` already support; neither was changed. The edge is `type: imports`, `form: dynamic`, `basis: unknown`, `to: null`. Its `target_hint` names the candidate target file, and its `line` is the companion's line. The edge has no line only when there is no companion; R7 allows an unknown edge to omit the line.

**The v0 path is untouched.** `normalize()` still drops `dynamic_import`.

### New rule V10 (BACK-79, D2), as written in the code header

**Pair key.** The key is (module of the mapped source, module of the mapped target). A key's *companions* are its `imports_from` links, plus its `imports` links to a module that carry a line.

**a) A line decides where it can.** A `dynamic_import` that carries a line converts only the companions of its key at that line.

**b) A line-less `dynamic_import`** converts every remaining companion line of its key.
- Sometimes the key has more remaining companion lines than line-less `dynamic_import` links. Then a static import and a dynamic import of one target in one module cannot be told apart by line.
- In that case all of those lines become unknown, and the count is recorded as an omission. Unknown is the weaker label, so nothing is upgraded, in line with V4.

**c) A converted companion** is emitted once per (from, line), as an unknown dynamic import with its own file and line.
- No observed or inferred import is emitted for it.
- Symbol `imports` links into that target on that line are not emitted, and they are counted.

**d) A `dynamic_import` with no companion** is emitted from its own source as an unknown dynamic import. It carries its line if it has one, and no line otherwise.

**e) Only a key that carries a `dynamic_import` is affected.**
- A static import of the same target from another module stays observed.
- A `dynamic_import` to an external node counts towards `external_refs`.

## 3. Tests, `back-28/test_normalizers_v1.py` (+3, synthetic inputs only)

| Test | Proves |
|---|---|
| `test_d2_dynamic_import_companion_becomes_unknown_dynamic_and_keeps_its_line` (positive) | The companion at `shell.tsx:8` becomes `to: null`, unknown, dynamic, line 8, with the target in `target_hint`, and no observed import from `shell.tsx` remains. A companion-less `dynamic_import` becomes a line-less unknown. The envelope is schema- and contract-valid. v0 behaviour is unchanged |
| `test_d2_negative_static_import_of_the_same_target_from_another_module_stays_observed` (negative) | A static `orders.ts:5 -> views/monthly.ts` stays observed. No ambiguity is reported, and a graph with no `dynamic_import` has no unknown edge |
| `test_d2_same_module_static_and_dynamic_import_is_decided_by_line` | If the `dynamic_import` has no line, both the static L2 and the dynamic L8 in one module become unknown, and the ambiguity is recorded. If the `dynamic_import` carries L8, only L8 is unknown and L2 stays observed |

**Against the HEAD (`b4fb83d`) normalizer.** 46 tests ran and 2 failed: the positive test and the same-module test. The controller re-checked this independently. The negative test passes on both versions because it is a guard against over-conversion.

**Verification.**
- `python3 -B -I -m unittest discover -s docs/planning/G1/back-28 -p "test_*.py"`: 46 tests, OK.
- `score.py --self-check`: SELF-CHECK PASSED.
- `holdout-v1/verify.py`: HOLDOUT VERIFY PASSED.
- v0 goldens: unchanged.
- v0 output on the raw hold-out, from the HEAD code and from the fixed code: byte-identical (`2a671f79…aac2aa`, the same hash BACK-78 reported).

## 4. Graphify, frozen (BACK-77) vs BACK-78 vs BACK-79

| Graphify | Frozen (BACK-77) | BACK-78 | BACK-79 |
|---|---|---|---|
| **VERDICT** | FAIL | FAIL | **FAIL** |
| TP / FN / FP (114) | 89 / 25 / 3 | 96 / 18 / 3 | **96 / 18 / 2** |
| imports TP/FN/FP (33) | 27 / 6 / 1 | 32 / 1 / 1 | **32 / 1 / 0** |
| calls TP/FN/FP (30) | 17 / 13 / 2 | 17 / 13 / 2 | 17 / 13 / 2 |
| contains TP/FN/FP (51) | 45 / 6 / 0 | 47 / 4 / 0 | 47 / 4 / 0 |
| HARD total | 6 | 6 | **3** |
| HARD: false observed | 2 | 2 | **1** (the N05 edge) |
| HARD: negatives hit (of 23) | 3 (N05, N20, N23) | 3 | **2 (N05, N23)** |
| HARD: unknown claimed as observed | 1 (E064) | 1 | **0** |
| HARD: schema / contract errors | 0 / 0 | 0 / 0 | 0 / 0 |
| Reported: false inferred | 1 (N23 edge) | 1 | 1 |
| Unknowns (7) | claimed 1, silent 6 | claimed 1, silent 6 | **marked 1 (E064), silent 6** |
| Files seen / total | 31 / 36 | 35 / 36 | 35 / 36 |
| `external_refs` (truth 8) | 8 | 9 | 9 |

**What D2 changed.**
- E064 is now `marked_unknown`, and N20 is no longer hit.
- The false observed import at `App.tsx:8` is gone, so the imports FP count went from 1 to 0.
- No truth edge was gained or lost, and no new failure was introduced.

**Breakdown.** In the case-class breakdown, only two Graphify rows move: "Unknowns, dynamic" and "Omissions and coverage". In both, the N20 hit is gone. Every other row equals BACK-78.

**Graphify still FAILS on 3 hard counts from 2 engine edges.**
- N05: a shadowed parameter labelled observed. It counts once as a false observed edge and once as a negative hit.
- N23: a value reference read as an inferred call.

Both are engine-side, not normalizer-side.

**CodeGraph, for reference: BACK-78, unchanged.** TP/FN/FP is 107/7/3, with 2 false observed edges, so it is FAIL.

## 5. Remaining open items

**Open owner decisions.**
- **Decorator mapping.** Graphify `references` and CodeGraph `decorates` are still dropped. Mapping them as calls would still run into open Ruling 1.
- **Ruling 16** stays open and is applied as pinned. It had no effect here, because Graphify's only unknown edge carries a line. V10 d) could produce a line-less unknown on other inputs.

**Minor defects.**
- **D3:** the Graphify stderr parser keeps only the first file.
- **D5:** `files_total` counts `tsconfig.json`.
- **D6:** hard-coded `fixture_version` and `scope` labels.
- **`ingest/__init__.py`:** still not a module, because it has no node line. It costs no truth edge.

**Graphify engine-side.**
- N05 and N23.
- Misses on:
  - anonymous and CommonJS default exports;
  - the conditional `require`;
  - TS `super`;
  - receiver-typed calls;
  - the `__all__` chain.
- No unknown class beyond the `dynamic_import` signal.

## 6. Status of the record

BACK-77 (`holdout-v1-run/`) remains the frozen hold-out record. BACK-78 (`holdout-v1-rescore/`) remains the first approved re-score.

This folder is the owner's second approved re-score. It is Graphify-only and informational, because the owner had already selected CodeGraph.

It changes no engine decision and authorizes no further re-score or tuning on the hold-out.
