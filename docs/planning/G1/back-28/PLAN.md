# BACK-28 (G1-C1 Step 1c): plan for v1 normalizer mappings and calibrated replay

Update: the owner approved implementation with the section 7 defaults on 2026-11-21; what was built and its evidence are in [RESULT.md](RESULT.md), including two deviations from this plan. The text below is the plan as approved and is unchanged.

Status when written: **PLANNING ONLY.** Date 2026-11-21. Prepared against `main` at `63767e9` (Step 1a/1b is merged PR #30, `e1a8fb5`). This document authorizes nothing: no normalizer edit, no engine run, no dependency, no external read, no commit, no PR and no Jira transition. Execution is gated (section 8).

Inputs read: `contract-v1/CONTRACT-V1.md` (R1-R8), `fixture/envelope.schema.v1.json`, `fixture/score.py` (v1 path), `back-21/normalize_graphify.py` and `normalize_codegraph.py`, `back-21/REPORT.md`, `back-21/runs.md`, the two stored v0 envelopes. Engines pinned in BACK-21: Graphify `graphifyy` 0.9.114, CodeGraph 1.6.4.

## 1. Baseline measured today (read-only, stdlib, no engine run)

| Check | Result |
|---|---|
| `score.py --self-check` | SELF-CHECK PASSED, tree sha256 `b359992d...0bca` unchanged |
| v0 scorer on both stored envelopes vs committed `score-graphify.txt` / `score-codegraph.txt` | Both identical, so v0 reproduces today |
| v1 calibration preview, Graphify | imports 11/11, calls 11/11, contains 17/19 (E31, E32 missed). 0 false observed, 0 overclaimed, 1 derived (barrel), 1 form mismatch (E06 got `reexport`, truth `import`), unknown silent x3, exact lines 39. Verdict PASS (preview) |
| v1 calibration preview, CodeGraph | imports 11/11, calls 11/11, contains 19/19. 0 false observed, **2 overclaimed (E13, E22: receiver-typed calls labelled observed)**, 1 derived, unknown marked x3, lines exact 22 / missing 19. Verdict **FAIL (preview)** |

Two things differ from CONTRACT-V1 section 3 and are findings, not edits:
- Section 3 says both engines pass "no false observed edges" under v1. That is true for the false-observed count, but the scorer's later hard-fail list also includes **overclaim**, so the CodeGraph preview fails on E13 and E22. The v1 normalizer mapping for receiver calls (row C3) is exactly what resolves this.
- Section 3 says CodeGraph line provenance becomes "exact 39". The preview shows exact 22 / missing 19, because R7 `line_source: derived` for `contains` is a normalizer output that the v0 envelope does not have. This is the expected effect of row C6, not a scorer problem.

The preview is **calibration only**. It cannot rank engines: the rules were chosen after seeing these results (CONTRACT-V1 section 3).

## 2. Hard constraints for the implementation step

1. v1 is a **separate code path** (new function or flag). The v0 `normalize()` and its output stay byte-identical. Proof: the v0 scorer reproduces the committed `score-*.txt` and the committed `*.envelope.json` are untouched.
2. **No v1 envelope is derived from the stored v0 envelopes.** They dropped the native fields v1 needs (`metadata.resolvedBy`, `confidence`, `_origin`, statement grouping). Only the scorer preview may replay them, and it is labelled "calibration preview".
3. The raw Graphify `graph.json` and the CodeGraph `codegraph.db` are **not in the repo**. No test may claim to be an engine rerun or independent replay. Behaviour that depends on native fields not provable from the repo is marked **BLOCKED** below.
4. The normalizer never upgrades a label (R4), never invents a `file:line` (R7), never synthesizes an unknown or `contains` edge the engine did not report, and never re-parses fixture source to fill an engine gap (that would credit the normalizer's analysis to the engine).
5. No change to `app/`, CI, dependencies, the contract, the schema or `score.py`.

## 3. Mapping matrix

Status key: **S** supported by a native field the v0 normalizers already read; **D** derived deterministically from native fields in the same output; **U** unsupported by the engine (reported, never filled); **B** blocked: needs the raw output to prove; defer to a separately authorized rerun.

### 3.1 Graphify (`graph.json`: nodes, links with `relation`, `confidence`, `_origin`, `source_location`, `external`)

| # | v1 field | Native source | Mapping | Rule | Status |
|---|---|---|---|---|---|
| G1 | `imports` edge identity, `to` | `imports_from` link (module to module) | One edge per `imports_from` link: `to` = literal specifier file, `line` = its `source_location` | R1 | S |
| G2 | `names[]` | `imports` links (module to symbol) at the same source file and line | Fold symbol labels into `names[]` of the G1 edge, no separate edge | R1 | D |
| G3 | `via: barrel` | symbol `imports` link whose target file differs from the line's literal specifier file, where the literal file is a source of `re_exports` links in the same graph | Emit the resolved edge with `via: barrel` (only because the engine emitted it) | R2 | D |
| G4 | `form` for TS/JS `export ... from` | `re_exports` links (module variant and symbol variant) on `.ts`/`.tsx`/`.js` | One `imports` edge, `form: reexport`, `to` = module file (matches `gt_v1_edges`, E10 target is `orders.ts`), symbol goes to `names[]` | R1, R3 | D |
| G5 | `form` for Python `from .x import Y` | `re_exports` link on a `.py` file with no `imports_from` (BACK-21 E06) | `form: import`, never `reexport`, even with `__all__`. Keyed on file language, not on a fixture name. Fixes the E06 form mismatch seen in the preview | R3 | D |
| G6 | `form: require` | `imports_from`/`imports` on CommonJS file (E04) | Engine does not say `require` vs `import`. Default `import` and list the count of defaulted forms in `omissions`. Form mismatch is reported only, never a gate | R3 | U |
| G7 | `form: dynamic` | none | Graphify emits nothing for `import(x)` / `importlib` | R3, R5 | U |
| G8 | `basis` | `confidence`, `_origin` | EXTRACTED and `ast` = observed. INFERRED, AMBIGUOUS or non-`ast` = inferred. `indirect_call` = inferred. Unchanged from v0 | R4 | S |
| G9 | `unknown`, `to: null`, `target_hint` | none (no unknown class in the format) | Emit none. E23, E24, E25 stay silent and are listed as engine-unsupported | R4, R5 | U |
| G10 | `external_refs` | links whose target node has `external: true` (concept nodes such as `ref_react`) | Count them in `external_refs`. Optionally keep the observed edge: R5 allows it and the scorer ignores it (`external_ignored`) | R5, R8 | S |
| G11 | `contains` provenance | `contains` and `method` links | `line` = the child node's definition line, `line_source: derived`, regardless of the engine's own link line | R7 | S |
| G12 | `contains` for CommonJS functions | engine omits them (E31, E32) | Not back-filled. Reported as engine gap, counted as missed | R7, R8 | U |
| G13 | `coverage` | no file inventory in `graph.json` | `files_total` from the scope walk (as `tree_hash` already does). `files_seen` = module nodes in the output. The engine stderr warning ("file yielded no symbols", `index.ts`) stays an omission. Exact `graph.json` shape for a file inventory is **not verified** | R8 | D / B |

### 3.2 CodeGraph (`codegraph.db`: `nodes`, `edges`, `unresolved_refs`, edge `provenance`, `metadata.resolvedBy`, `metadata.confidence`)

| # | v1 field | Native source | Mapping | Rule | Status |
|---|---|---|---|---|---|
| C1 | `imports` identity, `names[]` | `imports` edges file to file, and file to symbol at the same file and line | File-to-file edge is the statement edge. Symbol edges at the same file and line fold into `names[]` | R1 | D |
| C2 | `form` | no `reexport`/`require`/`dynamic` signal read by the v0 normalizer. `export ... from` in `index.ts` arrives as plain `imports` (BACK-21) | Emit `form: import`, list the defaulted count in `omissions`. The re-export mismatch is reported, not a gate. **Whether `kind=import` nodes or edge metadata carry the statement text is not verifiable without the DB** | R3 | U / B |
| C3 | `basis` for receiver calls | `metadata.resolvedBy = instance-method` (confidence 0.9) and `fuzzy` | `instance-method`, `fuzzy`, or `confidence < 0.8` = inferred; `provenance = heuristic` = inferred. Fixes the 2 overclaims (E13, E22). Whether `exact-match` (name-only) resolution counts as deterministic is **an open owner question** (see section 7); until decided it keeps the v0 value observed | R4 | S, with one open question |
| C4 | `observed` for import bindings | `resolvedBy = import`, `file-path`, `qualified-name`, `function-ref` | observed, unchanged | R4 | S |
| C5 | `unknown` for genuinely unresolved | `unresolved_refs` with `reference_kind` in `calls`, `imports` | `to: null`, `target_hint` = `reference_name`, `line` from the row. For `importlib`/dynamic `import()` this is what satisfies E23 and E24 (matched on file, line, enclosing symbol; R5) | R4, R5 | S |
| C6 | `contains` provenance | `edges.line` is NULL for `contains` | `line` = child node `start_line`, `line_source: derived`. The v0 path keeps `null` (v0 rule E6 stays) | R7 | S |
| C7 | externals vs unknown | `unresolved_refs` also holds react, json, requests, dataclasses, builtins (21 unknown edges emitted by v0 vs 3 expected) | Move a ref to `external_refs` **only if the engine itself marks it external**. The `status` column exists, but whether it separates externals is not verifiable without the DB. A shape heuristic (bare specifier) is rejected: it would misclassify path aliases (a hold-out v1 case) and fits the fixture. Default until proven: keep as unknown and report the count | R8 | B |
| C8 | `coverage` | `files` table and `kind=file` nodes | `files_seen` from the `files` table, `files_total` from the scope walk | R8 | S |
| C9 | cross-runtime HTTP (E25) | recorded as a `calls` unresolved ref | stays unknown, never observed | R5 | S |

## 4. Native outputs unavailable, checks blocked

- Raw Graphify `graph.json` (sha256 `a2c2016b...`, 27,532 bytes in BACK-21) and the CodeGraph `.codegraph/codegraph.db` (canonical content hash `325b64b9...`): **not in the repo**. Not re-created, not guessed.
- Blocked until a separately authorized rerun: rows G13 (file inventory shape), C2 (re-export signal), C3 `exact-match` question, C7 (external flag). A rerun also needs the same sandbox and config guard as BACK-21 (library API only for CodeGraph, never `install`, telemetry off).
- The v0 replay of `normalize_*.py` on the raw files cannot be repeated in the repo for the same reason. The only repo-provable reproduction is the committed v0 envelope scoring identically (section 1).

## 5. Test plan for the gated step (synthetic, native-shaped, never called an engine run)

Inputs are a hand-built `graph.json` dict (nodes and links with the field names above) and an in-memory `sqlite3` database with the `nodes`, `edges`, `unresolved_refs` columns the v0 normalizer reads. Each fixture is labelled **SYNTHETIC ADAPTER FIXTURE** in the test and in any report. Each acceptance case gets a positive and a negative test:

| Acceptance case | Positive | Negative |
|---|---|---|
| Per-import-statement identity (R1) | One statement with 2 symbols gives one edge with `names` of 2 | Two statements to the same file on different lines give two edges, not one |
| Re-exports (R3) | TS `export { x } from` gives `form: reexport` | Python `from .x import Y` with `__all__` gives `form: import` |
| Barrel (R2) | Symbol resolved through `index.ts` gives `via: barrel` | Symbol import from the real defining file gives no `via` |
| Inferred receiver calls (R4) | `instance-method` 0.9 gives inferred; Graphify INFERRED gives inferred | A direct import-bound call stays observed; no label is upgraded |
| `contains` provenance (R7) | child line plus `line_source: derived` | v0 path still emits `null` for CodeGraph `contains` |
| Unknown and null target (R4, R5, R6) | unresolved dynamic ref gives `to: null` plus `target_hint`, matches on file and line | Graphify with no unknowns emits none; observed edge with null target is a contract error |
| External refs (R8) | Graphify `external: true` target counted in `external_refs` | CodeGraph unknown ref not marked external stays unknown, no bare-name heuristic |
| No fabricated provenance | every observed or inferred edge has an integer line from a native field | missing native line gives no edge (or unknown), never a guessed `source:line` |
| v0 reproducibility | v0 scorer output on the committed envelopes is identical to `score-*.txt` | v1 flag off means the v0 `normalize()` output is byte-identical |

Self-check addition: each synthetic v1 envelope passes `score.py` schema and `contract_errors`. The v1 scorer self-check must still pass.

## 6. Replay output (calibration only)

After implementation, the deliverable is a table of v1 scorer results on **synthetic adapter fixtures**, plus the unchanged preview of the stored v0 envelopes. It is described as "calibrated comparison, not an engine decision". No claim that Graphify or CodeGraph was rerun.

## 7. Open owner decisions

1. **CodeGraph `exact-match` resolution** (name-only, unique candidate): observed or inferred? CONTRACT R4 says inferred needs type, dataflow, fuzzy or model resolution, which does not clearly cover it. Proposed default: keep observed and report the count of `exact-match` observed edges until a rerun shows real values.
2. **Defaulted `form`** (G6, C2): confirm that an engine silent on `form` defaults to `import` with a count in `omissions`, accepting a reported-only form mismatch, rather than leaving `form` out (which is a contract error).
3. **Optional derived barrel edge** (G3): emit the resolved `via: barrel` edge, or drop it and keep only the literal edge with `names[]`. Proposed: emit it, because the engine reported it.

## 8. Approval ask (needs your separate go-ahead; nothing below has started)

Please confirm:
1. **Implement** the v1 path in `back-21/normalize_graphify.py` and `back-21/normalize_codegraph.py` (flag, v0 untouched) plus synthetic-fixture tests as in section 5, in a new branch from `main`. Expected changed files: the two normalizers, one new test module under `docs/planning/G1/back-28/`, and `docs/planning/G1/back-28/RESULT.md`. No dependency, no `app/`, no CI.
2. The three decisions in section 7.
3. Whether the raw-output-dependent checks (section 4) stay deferred, as the ticket says, to a later separately authorized rerun.

## 9. Evidence and changed files

- Commands run (read-only, stdlib): `score.py --self-check`; `score.py back-21/{graphify,codegraph}.envelope.json --contract v1`; `score.py ... --contract v0` diffed against `back-21/score-*.txt`.
- Changed files: **this document only** (`docs/planning/G1/back-28/PLAN.md`), uncommitted.
- **No engine is selected.** Nothing here ranks Graphify against CodeGraph.
