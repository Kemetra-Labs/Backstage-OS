# G1-01 evaluation fixture and ground truth (Jira BACK-20)

Status: fixture built 2026-11-21; accepted by the owner in chat 2026-11-21 (G1-01 gate passed). Analyzer and renderer runs are recorded in ../back-21 and ../back-22.

## Purpose

A tiny synthetic "order-service" (16 source files, TypeScript, TSX, JavaScript, Python) with a hand-verified ground truth. Later tasks (BACK-21) run two code-graph analyzers (Graphify, CodeGraph) against `src/`, normalise their output into the envelope in `envelope.schema.json`, and score it with `score.py`. BACK-22 renders `ground-truth.envelope.json` in three renderers. Nothing here installs or runs an analyzer. All data is synthetic: no real company names, no secrets.

Ids are relative to this directory (`src/web/orders.ts`, `src/web/pricing.ts::Cart.addItem`). The Python source root is `src/`, so `svc.service` means `src/svc/service.py`.

## Files

| File | Language | Case it covers |
|---|---|---|
| `src/web/types.ts` | typescript | types-only module, target of the type-only import |
| `src/web/pricing.ts` | typescript | leaf module; exported function `computeTotal`; class `Cart` with method `addItem` |
| `src/web/orders.ts` | typescript | ESM named import + cross-file calls; `import type`; class method call; commented-out import (negative) |
| `src/web/index.ts` | typescript | re-export barrel: `export { x } from` and `export * from` |
| `src/web/OrderList.tsx` | tsx | React component importing through the barrel; import-like string literal (negative); external `react` import |
| `src/web/format.js` | javascript | CommonJS `module.exports` |
| `src/web/report.js` | javascript | CommonJS `require` of a sibling and call of the required function |
| `src/web/loader.ts` | typescript | dynamic `import(variable)`: expected unknown |
| `src/web/handler.ts` | typescript | handler for `POST /orders` (target of the cross-runtime relation) |
| `src/svc/__init__.py` | python | package-relative import (`from .service import`) |
| `src/svc/service.py` | python | relative import; classes `Order`, `OrderService` with methods; cross-module call |
| `src/svc/validators.py` | python | collision trap, `validate` definition 1 of 2 |
| `src/svc/schema.py` | python | collision trap, `validate` definition 2 of 2 |
| `src/svc/app.py` | python | absolute in-package imports; collision caller; method call; commented-out import (negative) |
| `src/svc/gateway.py` | python | `importlib.import_module(name)` (unknown); `requests.post(BASE + "/orders")` cross-runtime (unknown); import-like string (negative) |
| `src/svc/unused.py` | python | unused module: no incoming import edge allowed |

## Ground truth counts (`ground-truth.json`)

Nodes: 35 (16 module, 12 function, 3 class, 3 method, 1 component). Edges: 44.

| Type | observed | unknown |
|---|---|---|
| imports | 9 | 2 |
| calls | 11 | 1 |
| reexports | 2 | 0 |
| contains | 19 | 0 |
| total | 41 | 3 |

Negatives: 12 (4 name-collision trap, 2 commented-out imports, 2 import-like string literals, 2 unused-module wildcards, 1 type-only import treated as a runtime call, 1 cross-runtime HTTP relation reported as observed). External imports (react, dataclasses, importlib, json, requests) are listed in `external_imports` and are out of scope.

Unknown edges: dynamic `import(pluginPath)` in `loader.ts`, `importlib.import_module(name)` and the HTTP call `POST /orders` in `gateway.py`. The HTTP relation to `src/web/handler.ts::createOrderHandler` is recorded only as an unknown edge with a `target_hint`; it is never an observed edge.

Modelling conventions (full text in `ground-truth.json` under `conventions`):
- Only cross-file calls and imports are enumerated. Same-file calls, builtins and external packages are out of scope.
- A `calls` edge starts at the enclosing symbol. Two calls rely on simple local-variable receiver typing (`cart.addItem`, `service.place`).
- Re-exports are `reexports` edges only (no extra `imports` edge). A call through the barrel is credited to the defining symbol. An `imports` edge targets the literal specifier's file (`OrderList.tsx` -> `index.ts`).
- A type-only import is an observed `imports` edge; a `calls` edge to the type is a negative.

## Files in this directory

- `ground-truth.json`: nodes, edges (with `evidence_token` checked by the self-check), negatives, external imports, scope notes.
- `envelope.schema.json`: draft provider-neutral Kawalys graph evidence envelope (`kawalys.graph.v0`, JSON Schema draft 2020-12).
- `ground-truth.envelope.json`: the ground truth in that envelope, engine name `ground-truth` (what renderers load).
- `test/mutated.envelope.json`: hand-made scorer test (1 missing edge, 1 wrong line, 2 false edges of which 1 is a negative hit).
- `score.py`: scorer, validator, tree hash and self-check (stdlib only).
- `.gitattributes`: `* text eol=lf` so line numbers and the hash are stable.

## Scorer usage

```
python score.py <normalized-envelope.json> [--ground-truth ground-truth.json] [--json out.json]
python score.py --self-check
python score.py --tree-hash
```

Output is an ASCII report of counts only (no ratios): per edge type expected / TP / FN / FP; false observed edges (listed; any above 0 is FAIL for that criterion); negatives hit; line provenance (exact, off by n, missing); handling of each unknown edge (marked_unknown, omission, claimed_observed, silent); languages with zero extracted nodes; and ignored-edge counters. The normalisation rule, scope rules and unknown matching rule are in the `score.py` docstring. `--self-check` verifies the tree hash, that every cited line contains its token, an import census (every import-like line is an edge or a listed external import), key uniqueness, schema validity of the ground-truth envelope, and the two scorer scenarios. Use `python -B` to avoid writing `__pycache__`.

Tree hash: sha256 over files under `src/` sorted by relative posix path (`src/...`); per file the path in UTF-8, a NUL byte, the bytes with CRLF turned into LF, a NUL byte. `__pycache__` and `*.pyc` are excluded.

## Contract v1 (G1-C1 Step 1, paper only)

`envelope.schema.v1.json` and the v1 mode of `score.py` implement the owner-approved rules R1 to R8 in [../contract-v1/CONTRACT-V1.md](../contract-v1/CONTRACT-V1.md). Nothing about v0 changed: `envelope.schema.json`, `ground-truth.envelope.json` and the v0 scoring path are untouched, and the stored BACK-21 v0 scores reproduce. `ground-truth.json` gained additive keys only: `v1_form: reexport` on E10 and E11 (R3) and `v1_basis: inferred` on E13 and E22, the two receiver-typed calls (R4).

- `score.py <envelope>` picks the contract from the envelope's `envelope_version`. `--contract v1` on a v0 envelope is a calibration preview only. A v1 envelope cannot be scored with `--contract v0`.
- A v1 envelope adds `coverage` (files seen and total) and `external_refs`, edge `form`, `names`, `via` and `line_source`, and has no `reexports` type.
- Hard fail: false observed edges, overclaimed inferred truths, negatives hit, invalid claims (an observed or inferred edge without a target, an unknown naming one), an unknown claimed as observed, and any schema or contract error in a v1 envelope. Duplicate keys keep the strongest label. Everything else is reported as counts. A v0 envelope scored with `--contract v1` is labelled "not checked" for schema and contract rules.
- `--self-check` now also covers the v1 overlay, schema, `contract_errors` and one scenario per rule. The hold-out fixture, the normalizers and the v1 re-score of the stored BACK-21 envelopes are not part of this step.

## NOT VERIFIED

Go, Java, C#, Rust, SQL, Jinja2, Terraform/HCL, and cross-runtime runtime wiring (HTTP, queues, RPC between Python and TypeScript). Also not covered: monorepo workspaces and path aliases, Python `__all__` star imports, conditional or lazy imports other than the two dynamic cases, decorators, and inheritance or interface resolution.
