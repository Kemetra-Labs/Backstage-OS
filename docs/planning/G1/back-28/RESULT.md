# BACK-28 (G1-C1 Step 1c) result: v1 normalizer mappings and calibrated replay

Date 2026-11-21. Implemented after the owner's go-ahead in chat ("Approve, defaults"), which accepted the three defaults of [PLAN.md](PLAN.md) section 7. **Nothing is committed, pushed or in a PR, and no Jira state changed.** No engine was run, no package installed, no external source read, nothing under `app/`, CI, the contract, the schema or `score.py` changed.

**No engine is selected. This is a calibration of the adapters, not a comparison of Graphify and CodeGraph.**

## What changed

| File | Change |
|---|---|
| `back-21/normalize_graphify.py` | Added `normalize_v1()` and `--contract v0\|v1` (default v0). 2 lines of v0 code touched: the call site in `main()` |
| `back-21/normalize_codegraph.py` | Same: `normalize_v1()`, `basis_of_v1()`, `--contract`, one call site |
| `back-28/synthetic.py` | Native-shaped SYNTHETIC ADAPTER FIXTURES: a `graph.json`-shaped dict and a `codegraph.db`-shaped sqlite file builder |
| `back-28/test_normalizers_v1.py` | 39 tests, a positive and a negative per acceptance case |
| `back-28/golden/v0-*.synthetic.json` | v0 outputs captured from the **unmodified** v0 code before any edit |
| `back-28/PLAN.md`, `RESULT.md` | Plan (approved) and this file |

The v1 functions call the existing v0 `normalize()` only to reuse its node mapping, so the v0 function bodies were not edited. `git diff` shows 358 insertions and 2 deletions across the two normalizers; the 2 deleted lines are the `env = normalize(...)` call sites, now `(normalize_v1 if a.contract == "v1" else normalize)(...)`.

## Commands and results

| Command | Result |
|---|---|
| `python -B -I -m unittest discover -s docs/planning/G1/back-28 -p "test_*.py"` | Ran 39 tests, OK |
| `python -B docs/planning/G1/fixture/score.py --self-check` | SELF-CHECK PASSED (v1 scorer self-check, unchanged) |
| `score.py back-21/{graphify,codegraph}.envelope.json --contract v0` vs committed `score-*.txt` | Both identical |
| `git diff -U0 back-21/normalize_*.py \| grep '^-'` | Only the 2 call-site lines |
| `ruff check` on `back-28/` and on the v1 additions | All checks passed. Pre-existing unused `import sys` in v0 `normalize_graphify.py` left as is |

v0 byte-identity is proven in two ways: the v0 output on the synthetic fixtures equals the golden captured before the edits (both normalizers, library call and CLI default), and the committed v0 envelopes still score identically. It is **not** proven on raw engine bytes, which are not in the repo.

## Calibrated replay on SYNTHETIC fixtures (not an engine rerun)

Scorer v1 on the adapter output, counts only, `ground-truth.json` as truth. The synthetic inputs contain only a few ground-truth locations, so these rows show adapter behavior, not engine quality.

| Output | False observed | Overclaimed | Derived | Form mismatches | Schema / contract errors |
|---|---|---|---|---|---|
| Graphify, v0 mapping | 0 | 0 | 1 | 1 (E06 got reexport) | n/a (v0 envelope) |
| Graphify, **v1** | 0 | 0 | 1 | **0** | 0 / 0 |
| CodeGraph, v0 mapping | 0 | **1** (receiver call E13 labelled observed) | 1 | 0 | n/a |
| CodeGraph, **v1** | 0 | **0** | 0 | 1 (re-export defaulted to import) | 0 / 0 |

Reading: the two defects the plan predicted are fixed by mapping alone: Graphify E06 (Python re-export form) and CodeGraph receiver-call overclaim (E13/E22 class). The remaining CodeGraph form mismatch and derived 0 are honest gaps below, not scorer artefacts.

## Acceptance checklist

- [x] Exact mapping matrix traced to R1-R8 and the pinned versions (PLAN.md section 3; the rules are also written in each normalizer's v1 header, V1-V8).
- [x] Positive and negative synthetic tests for per-statement identity, re-exports, inferred receiver calls, contains provenance, unknown and external refs, barrel, basis merging, no guessed line, v0 reproducibility (39 tests).
- [x] No unproven observed upgrades or guessed `source:line`: edges without a native line are not emitted and are counted; duplicate merges keep the weaker label; contains lines come from the child's **native** location with `line_source: derived`. A child with no native location (Graphify no `source_location`, CodeGraph NULL `start_line`) gets no `contains` edge and is counted. This was found in review: the first draft inherited v0's node default of line 1 into `contains` edges; it is fixed and covered by 2 negative tests.
- [x] v0 stored outputs unchanged under the v0 scorer; v1 scorer self-check passes.
- [x] Unavailable native outputs and blocked checks named (below).
- [x] Evidence, changed files, commands and results (this file); no engine selected.

## Deviations from PLAN.md, and gaps

1. **CodeGraph emits no derived `via: barrel` edge** (derived 0, where the v0-shape preview showed 1). Barrel status cannot be proven from the columns read, and a false `via` claim would be a false observed edge. The symbol name is folded into `names[]` of the literal edge and the case is an omission. The plan's decision 3 (emit the derived edge because the engine reported it) is applied to Graphify only, where `re_exports` links give real evidence.
2. **Unknown `imports` edges carry `form: import`.** `contract_errors` requires `form` on every `imports` edge, including unknown ones. This default is disclosed in the omissions list with the other defaulted forms.
3. **Graphify non-barrel symbol imports** at a line whose symbol resolves to a different file are folded into `names[]` and counted, not emitted as derived edges.

4. **Node lines still use v0's default.** The schema requires a node `line`, and the v0 node mapping writes `1` when Graphify gives no `source_location`. v1 keeps those nodes but discloses the count in an omission, and no edge uses the defaulted line. A CodeGraph node with a NULL `start_line` surfaces as a schema error in the scorer, not as a silent default.
5. **These tests do not run in CI.** Every changed file is under `docs/`, so CI treats the change as docs-only and skips the browser suite, and the G1 self-check job only triggers on `docs/planning/G1/fixture/` changes. The 39 tests are local only; wiring them into CI would touch `.github/`, which the ticket forbids without separate approval.

## Blocked or unsupported (need the raw outputs, i.e. a separately authorized rerun)

- Graphify: `form` `require`/`dynamic`, any unknown class (E23-E25 stay silent), the two CommonJS `contains` edges, and the exact `graph.json` file-inventory shape behind `coverage.files_seen` (uses module nodes).
- CodeGraph: the re-export signal (`kind=import` nodes or edge metadata may carry it; unverified), whether the `unresolved_refs.status` column marks externals (so `external_refs` is 0 and externals stay unknown), and the real distribution of `resolvedBy` values, including the owner-decided `exact-match` default (kept observed, count disclosed in omissions).
- The raw `graph.json` and `codegraph.db` are not in the repo; nothing here reconstructs them or claims independent replay.

## Independent review

`pr-review` (quick mode) ran in a fresh subagent with no author context: 0 Critical, 0 Major, 1 Minor, 3 Trivial, verdict OK to push. The Minor is gap 5 above (the tests and normalizer edits run in no CI job; fixing it needs `.github/` approval, not done). The 3 Trivial items were fixed: stale insertion count here, a wrong omission reason for symbol imports with no statement edge (now its own omission plus a test), and a weak disjunctive assertion in the coverage test.

## Not done, needs a separate go-ahead

Commit, push, PR, Jira comment or transition, the hold-out fixture (Step 2), and any engine rerun.
