# Kawalys graph evidence contract v1 (`kawalys.graph.v1`): owner-approved semantic rules

Status: **approved by the owner in chat on 2026-11-21 as proposed**, including the recommended answer to each of the six open questions. This records a design decision. It is not engine selection, not approval to change the scorer, normalizers, fixtures or application code, and not approval to run any experiment. Those are the next gate (section 6).

Supersedes the draft semantics in `../fixture/envelope.schema.json` (`kawalys.graph.v0`) once adopted. Conforms to the ratified M03 decisions (Kawalys-owned typed graph, observed / inferred / unknown kept distinct, evidence-linked, independent full-map coverage gate) and to K-ARCH-01 (replaceable engines). Evidence behind it: [BACK-21 report](../back-21/REPORT.md), [BACK-22 report](../back-22/REPORT.md), [BACK-23 decision package](../back-23/DECISION-PACKAGE.md).

## 1. Rules

| # | Topic | Rule |
|---|---|---|
| R1 | File vs symbol imports | One `imports` edge per import statement, from the importing module to the **literal specifier's file**. Imported symbols are an optional `names[]` attribute on that edge, never separate edges. |
| R2 | Resolved through a barrel | A symbol resolved through a re-export file is a **derived** relation, reported as `via: barrel` on the symbol detail. It is never an import claim and never counted as a false edge. |
| R3 | Re-exports | One relation family: `imports` with `form` in `import`, `reexport`, `require`, `dynamic`. `export ... from` is `form: reexport`. Python `from .x import Y` stays `form: import`, even with `__all__`. |
| R4 | Basis | **observed**: the relation is written at `file:line` and the target resolves by a deterministic static rule, including import/require bindings and destructuring. **inferred**: needs type, dataflow, fuzzy or model resolution (for example receiver typing). **unknown**: target not statically resolvable; `to: null` plus `target_hint`. Normalizers map from the engine's resolution method and never upgrade a label. Overclaiming is a failure; underclaiming is reported only. |
| R5 | Dynamic and cross-runtime | Dynamic `import()`, `importlib` and HTTP / route calls are always `unknown`. An observed edge to an external package does not claim the unknown target. An unknown matches on file + line + enclosing symbol regardless of edge type. A cross-runtime link stays unknown until a separately approved route-matching gate. |
| R6 | Missing endpoints | The envelope stays truthful with `to: null`. A **view model** adds a placeholder "Unresolved target" node so each drawn edge has two ends. `DepGraph.tsx` is not changed until BACK-26 is approved. |
| R7 | Provenance | `file` is the file where the relation is written. `line` is 1-based and mandatory for observed and inferred edges; unknown edges may omit it. A `contains` edge uses the child's definition line with `line_source: derived`. |
| R8 | False claims and coverage | Counts only, never percentages. **Hard fail:** false observed edges and negatives hit. **Reported, not a gate:** false inferred, derived, understated, unknown coverage, per-language and per-type coverage. The envelope states files seen vs files total and lists omissions. External and builtin references are counted separately as `external_refs`, not as unknown claims. |

## 2. Examples (fixture v0)

- `orders.ts:3` `import { Cart, computeTotal } from './pricing'` is **one** edge `orders.ts -> pricing.ts`, `form: import`, `names: [Cart, computeTotal]` (R1). It is not two symbol edges.
- `OrderList.tsx:4` imports from `./index`. The edge targets `index.ts`. A resolved `orders.ts::buildOrder` is recorded as `via: barrel` detail only (R2).
- `index.ts:2` `export { buildOrder } from './orders'` is an `imports` edge with `form: reexport` (R3).
- `loader.ts:3` `import(pluginPath)` and `gateway.py:14` `importlib.import_module(name)` are `unknown` edges, `to: null` (R5).
- `gateway.py:18` `requests.post(BASE + "/orders")` is never an observed edge to `handler.ts`. An observed edge to the external `requests` package is allowed and does not count as claiming the unknown (R5).
- `cart.addItem(...)` after `cart = Cart()` needs receiver typing: **inferred** (R4). `const { formatMoney } = require('./format')` followed by `formatMoney()` is observed.

## 3. Retrospective effect on the existing outputs (calibration, not evidence)

Counted from the committed envelopes with no engine run. The rules were chosen after seeing these results, so this does not rank the engines.

| Measure | Graphify | CodeGraph |
|---|---|---|
| Import / re-export edges matched (of 11 at module level) | as scored: 8 matched, 1 missed, 11 false (imports) → under v1: 11 matched, 0 missed, 0 false observed, 1 derived | as scored: 9 matched, 0 missed, 10 false, 3 type mismatches → under v1: 11 matched, 0 missed, 0 false observed, 1 derived |
| Line provenance | unchanged | exact 20, missing 19 → exact 39 (R7) |
| E23 / E24 / E25 | silent / silent / claimed observed → silent × 3 (no unknown class) | silent / silent / marked unknown → marked unknown × 3 |
| Receiver-typed calls | already labelled inferred | observed → inferred (R4) |

Under v1 both engines pass the "no false observed edges" criterion on fixture v0. What still separates them there is outside the rules: Graphify has no unknown class and misses `contains` edges for 2 CommonJS files; CodeGraph labels inferred calls with high confidence and its license check is incomplete.

## 4. Not decided by this contract

Engine or vendor selection, any renderer choice, the D3 and dependency decision, a route-matching gate for cross-runtime links, the CodeGraph license sign-off, X02 / X04 and source access, and the M03 full-map coverage gate. BACK-8, BACK-22, BACK-24 and BACK-26 boundaries are unchanged.

## 5. Open items

Whether false inferred edges should ever become a gate (currently reported only). Revisit after the hold-out run.

## 6. Next execution gate (G1-C1; each part needs its own go-ahead)

1. **Paper, no engines:** freeze these rules as `kawalys.graph.v1`; update `score.py`, its self-check and the schema; adjust ground truth for R3 and R4; update the normalizers' mapping rules; re-score the committed outputs for calibration only.
2. **Hold-out fixture v1** (about 30 to 40 files), with ground truth written and hash-pinned before any engine sees it. It covers what v0 does not: path aliases, `__all__` star imports, conditional imports, decorators, inheritance, default exports, cross-package name clashes.
3. **One engine pass each** on the hold-out under the pre-registered v1 rules, using the same sandbox procedure and config guard.
