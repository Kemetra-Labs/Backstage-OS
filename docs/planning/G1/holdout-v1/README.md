# G1 hold-out fixture v1 (Jira BACK-29, G1-C1 section 6 item 2)

Status: **frozen 2026-11-22**. Scored under `kawalys.graph.v1` ([CONTRACT-V1.md](../contract-v1/CONTRACT-V1.md)). Hashes are pinned in [MANIFEST.json](MANIFEST.json). Re-verify with `python3 -B docs/planning/G1/holdout-v1/verify.py`.

## Purpose

The v1 contract rules were chosen after seeing how Graphify and CodeGraph did on fixture v0, so v0 can only calibrate. This hold-out is the independent test for the next gate (section 6 item 3: one engine pass each). Its ground truth was written and hash-pinned before any engine saw the sources.

It covers what v0 does not: path aliases, Python `__all__` star imports, conditional imports, decorators, inheritance, default exports and cross-package name clashes. It also has negatives, unknowns and coverage cases. The structure and names share nothing with v0, beyond the language mix and the unavoidable `index.ts` and `__init__.py`. An engine or normalizer tuned on v0 gains nothing here.

All data is synthetic. There are no real names, no secrets and no live endpoints: the only URL is `http://atlas.invalid`, and nothing in `src/` is ever executed.

## Freeze statement: no engine has seen this

- The sources and `ground-truth.json` were written by hand on 2026-11-22.
- No analyzer, engine or normalizer was installed, downloaded or run: no Graphify, CodeGraph, archify, npm or pip.
- The ground truth was not derived from any stored v0 engine output (the BACK-21 and BACK-22 envelopes and logs).
- These were the only programs run:
  - Python's own `ast.parse`, as a syntax check of the `.py` files;
  - a throwaway stdlib script, not kept, that turned the hand-written edge table into JSON;
  - the existing `../fixture/score.py`;
  - `verify.py`.
- The ground truth was derived twice: once to write it, and again file by file against `cat -n` of every source. The two passes were reconciled with no difference in edges. The second pass added one `omissions` entry, for inheritance.
- Limit: both passes are by the same author. No independent second annotator was used (see Limitations).

## Layout

The paths below are relative to this directory. Ids use the same form, for example `src/vault/store.py::persist`.

| Package | Language | Files |
|---|---|---|
| `src/packages/ledger/src/` | TypeScript | `money.ts`, `entry.ts`, `credit.ts`, `journal.ts`, `audit.ts`, `period.ts`, `index.ts` (barrel) |
| `src/packages/atlas/src/` | TS, TSX, CommonJS JS | `text.ts`, `summary.ts`, `LedgerPanel.tsx`, `App.tsx`, `views/monthly.ts`, `views/lookup.ts`, `server/health.ts`, `legacy/bridge.js`, `legacy/csv.js`, `legacy/debug-panel.js` |
| `src/ingest/` | Python | `__init__.py` (0 bytes), `models.py`, `textkit.py`, `legacy.py`, `clean.py`, `registry.py`, `endpoints.py`, `plugin_host.py`, `plugins/__init__.py`, `plugins/csv_sink.py`, `probe.py`, `_speedups.py`, `_purechecksum.py`, `compat.py` |
| `src/vault/` | Python | `__init__.py`, `base.py`, `models.py`, `store.py` |
| `src/tsconfig.json` | config | `baseUrl "."` (= `src/`); paths `@ledger` → `packages/ledger/src/index.ts`, `@ledger/*` → `packages/ledger/src/*`, `~atlas/*` → `packages/atlas/src/*` |

36 files under `src/`. 35 are source modules: 12 TypeScript, 2 TSX, 3 JavaScript and 18 Python. The Python source root is `src/`, so `vault.models` is `src/vault/models.py`.

Other files: `ground-truth.json`, `verify.py`, `MANIFEST.json`, this README, and `.gitattributes` (`* text eol=lf`).

## Ground truth (`ground-truth.json`)

One file serves two roles:

- It is a `kawalys.graph.v1` envelope (engine `ground-truth`). It validates against `../fixture/envelope.schema.v1.json` with 0 `contract_errors`.
- It is also the truth that `../fixture/score.py --ground-truth` loads.

The extra keys are ignored by the schema: `id`, `v1_form`, `specifier`, `evidence_token`, `local_name`, `case`, `note`, `negatives`, `external_imports`, `coverage_cases` and `conventions`. `v1_form` repeats `form` because `score.py` reads `v1_form`.

| | count |
|---|---|
| Nodes | 86: 35 module, 36 function, 6 class, 8 method, 1 component |
| Edges, observed | 109: 33 imports (27 `import`, 3 `reexport`, 3 `require`), 25 calls, 51 contains |
| Edges, inferred | 5 calls (receiver typing or inherited-method lookup) |
| Edges, unknown | 7: 5 imports (dynamic or variable loading), 2 calls (HTTP cross-runtime) |
| Negatives (explicit "must not exist") | 22 (8 imports, 14 calls): 2 comment, 2 string, 2 shadowed name, 8 cross-package collision (one also a comment, one also TYPE_CHECKING), 2 override, 1 `__all__` exclusion, 1 TYPE_CHECKING-only call, 3 cross-runtime, 2 dynamic-only module |
| External import statements (`external_refs`) | 8 |
| Coverage | files_seen = files_total = 35. `src/tsconfig.json` is listed in `omissions` as configuration |


Every node and edge carries `file:line`. Every edge also carries an `evidence_token` that `verify.py` finds on that line.

## Case catalogue

Paths are shortened: `ledger/` means `src/packages/ledger/src/`, `atlas/` means `src/packages/atlas/src/`, and `ingest/` and `vault/` sit under `src/`. "NOT" marks a negative: an observed or inferred engine edge matching it is a hard fail (R8). UNKNOWN means the truth has `to: null` and a `target_hint`. An observed or inferred engine edge on that file and line claims the unknown, which is a hard fail (R5, R8).

| Case | Where | Expected |
|---|---|---|
| Path alias, prefix | `atlas/summary.ts:2` `'@ledger/money'` | E010 imports → `ledger/money.ts` |
| Path alias, prefix | `atlas/LedgerPanel.tsx:2` `'@ledger/journal'` | E011 imports → `ledger/journal.ts`; call E043 at `:11` → `ledger/journal.ts::postEntry` |
| Path alias, exact, to a barrel | `atlas/LedgerPanel.tsx:3` `'@ledger'` | E012 imports → `ledger/index.ts` (the literal specifier's file, R1). An engine edge to `ledger/money.ts` at this line is `derived` (R2), not false |
| Path alias, second style | `atlas/LedgerPanel.tsx:5` `'~atlas/text'` | E014 imports → `atlas/text.ts`; call E044 at `:15` → `atlas/text.ts::initials` |
| Alias in a string | `atlas/LedgerPanel.tsx:7` | NOT imports → `ledger/period.ts` (N03) |
| `__all__` star import | `ingest/clean.py:2`, `:3` | E020 → `ingest/legacy.py`, E021 → `ingest/textkit.py`, both form `import` (R3) |
| `__all__` resolution | `ingest/clean.py:7` | E049 → `textkit.py::clamp`, E050 → `textkit.py::slugify`, E051 → `legacy.py::trim`, all observed. `textkit.__all__` omits `trim`, so the earlier `legacy` star import still binds it: NOT → `textkit.py::trim` (N07) |
| Shadowed star name | `ingest/clean.py:11` | NOT `clean_rows` → `textkit.py::slugify`, because `slugify` is a parameter here (N06) |
| Conditional `require` | `atlas/legacy/bridge.js:4` (ternary on an env flag) | E019 imports/require → `atlas/legacy/debug-panel.js`, observed |
| try/except ImportError | `ingest/compat.py:5`, `:7` | E026 → `ingest/_speedups.py`, E027 → `ingest/_purechecksum.py`, both observed |
| `if TYPE_CHECKING:` | `ingest/compat.py:10` | E028 → `vault/models.py`. NOT → `ingest/models.py` (N13). NOT `fingerprint` → `vault/models.py::Record`, which is used in an annotation only (N17) |
| TS class decorator | `ledger/period.ts:4` `@auditTrail` | E039 calls from module `ledger/period.ts` → `ledger/audit.ts::auditTrail` |
| Python decorator factory | `ingest/endpoints.py:7` `@expose(...)` | E052 calls from module `ingest/endpoints.py` → `ingest/registry.py::expose` |
| Python plain decorator | `ingest/endpoints.py:12` `@plugin` | E054 calls from module → `ingest/registry.py::plugin` |
| Inheritance, super (TS) | `ledger/credit.ts:6` | E034 `CreditEntry.describe` → `ledger/entry.ts::BaseEntry.describe`, observed |
| Inheritance, super (Py) | `vault/models.py:7` | E058 `Record.save` → `vault/base.py::BaseModel.save`, observed |
| Inherited method | `ledger/journal.ts:7`; `vault/store.py:10` | E037 → `BaseEntry.amount`; E061 → `BaseModel.describe`. Both inferred (receiver typing plus lookup) |
| Override | `ledger/journal.ts:8`; `vault/store.py:11` | E038 → `CreditEntry.describe`; E062 → `vault/models.py::Record.save`. Both inferred. NOT → the base method (N15, N16) |
| Default export, class | `ledger/journal.ts:1`, `:6` | E002 imports → `ledger/credit.ts`; E035 calls → `ledger/credit.ts::CreditEntry` |
| Default re-exported by name | `ledger/index.ts:3` | E007 imports/reexport → `ledger/credit.ts` |
| Anonymous default function | `atlas/LedgerPanel.tsx:4`, `:16` (`makeSummary`) | E013 imports → `atlas/summary.ts`; E045 calls → `atlas/summary.ts::default` |
| Default component | `atlas/App.tsx:2` | E015 imports → `atlas/LedgerPanel.tsx`. The route table at `:5` only references it, so there is no call |
| CommonJS default | `atlas/legacy/bridge.js:3`, `:9` | E018 imports/require → `atlas/legacy/csv.js`; E048 calls → `csv.js::toCsv` |
| Barrel re-exports | `ledger/index.ts:2`-`:4` | E006, E007, E008, imports/reexport → `journal.ts`, `credit.ts`, `money.ts` |
| Cross-package `normalize` | `atlas/summary.ts:6`; `atlas/views/monthly.ts:5` | E041, E046 → `atlas/text.ts::normalize`. NOT → `ledger/money.ts::normalize` (N08, N09) |
| Cross-package `Record` | `ingest/endpoints.py:3`, `:14`; `vault/store.py:4`, `:9` | E023, E055 → `ingest/models.py`. E033, E059 → `vault/models.py`. NOT the other package (N10, N11, N12) |
| Collision in a comment | `vault/store.py:5` `# from ingest.models import Record` | NOT imports → `ingest/models.py` (N02) |
| Cross-language method name | `vault/store.py:10` `rec.describe()` | NOT → `ledger/entry.ts::BaseEntry.describe` (N14) |
| Commented-out import | `ledger/journal.ts:3` | NOT imports → `ledger/period.ts` (N01) |
| Import-like string | `ingest/probe.py:6` | NOT imports → `ingest/plugin_host.py` (N04) |
| Shadowed parameter | `ledger/journal.ts:12` | NOT `previewEntry` → `ledger/money.ts::roundCents` (N05) |
| Dynamic `import()`, literal | `atlas/App.tsx:8` | UNKNOWN E064. R5 makes it unknown even with a literal. The `.render()` call on the same line goes through the loaded module and is covered by this unknown. NOT `*` imports → `atlas/views/monthly.ts` (N20) |
| Dynamic `import()`, template | `atlas/views/lookup.ts:3` | UNKNOWN E065 |
| `require(variable)` | `atlas/legacy/bridge.js:7` | UNKNOWN E066 (form `require`) |
| `importlib.import_module` | `ingest/plugin_host.py:6` | UNKNOWN E067. NOT `*` imports → `ingest/plugins/csv_sink.py` (N21) |
| `__import__(name)` | `ingest/plugin_host.py:10` | UNKNOWN E068 |
| HTTP, TS to Python | `atlas/LedgerPanel.tsx:12` `fetch('/api/ledger/close')` | UNKNOWN E069, hint `ingest/endpoints.py::close_ledger`. NOT that call as observed or inferred (N18) |
| HTTP, Python to TS | `ingest/probe.py:10` `urlopen(... "/healthz")` | UNKNOWN E070, hint `atlas/server/health.ts::healthHandler`. NOT (N19); NOT `*` calls → `healthHandler` (N22) |
| Coverage: empty module | `ingest/__init__.py` (0 bytes) | module node; counts in files_total |
| Coverage: docstring-only module | `ingest/plugins/__init__.py` | module node, no edges |
| Coverage: dynamic-only modules | `atlas/views/monthly.ts`, `ingest/plugins/csv_sink.py` | must be seen. Their own outgoing edges are observed: E016, E046, E025, E057 |
| Coverage: no static caller | `atlas/server/health.ts:7` | node and contains edge only |
| Coverage: entry points | `App.tsx`, `lookup.ts`, `health.ts`, `plugin_host.py`, `probe.py`, `store.py` | no incoming imports edge |
| Coverage: parse stress | `ingest/probe.py:12`-`:18` (`match` with a walrus guard); `ledger/period.ts:4` (decorator before `export class`); `atlas/summary.ts:5` (anonymous default) | An engine that cannot parse a file must list it in `omissions` and report files_seen below 35. Dropping it silently is reported as `silent` or as missed edges |
| Omission: config file | `src/tsconfig.json` | not a module. It is in the truth's `omissions` |

`ground-truth.json` has the full list: 22 negatives, 8 external imports (`react`, `react-dom/client`, `dataclasses`, `typing` ×2, `importlib`, `json`, `urllib.request`) and the 10 `coverage_cases`.

## Rulings (ambiguities and how the contract text resolved them)

1. **Decorator call source.** A decorator application is a `calls` edge on the `@` line. It starts at the scope that evaluates the decorator, which is the module for a top-level decorator, and not at the decorated function.
   - Basis: R7 (`file`/`line` where the relation is written), plus the innermost-enclosing-symbol rule from v0. The `@` line is outside the function body, and Python evaluates the decorator in the enclosing scope.
   - **Open.** An engine that attributes it to the decorated function will show a false observed edge. The owner may want to confirm this before the engine pass.
2. **Star import with a literal `__all__`.** The import stays form `import`, with `names: ["*"]` (R3). Calls through it are **observed**, because reading a literal `__all__` is a deterministic static rule (R4).
3. **`super` calls are observed.** `super.m()` / `super().m()` with single inheritance, where the base defines `m` directly, binds lexically to the `extends` clause or base list (R4).
   - A method call on an instance (`line.amount()`, `rec.save()`) needs receiver typing and, where the method is inherited, lookup. Those calls are **inferred**.
   - **Open (lenient on purpose).** An engine that labels a `super` call inferred is only `understated` (R4: underclaiming is reported, not failed).
4. **`import('./views/monthly')` is unknown.** R5 says dynamic `import()` is *always* unknown. As the more specific rule, it overrides R4's "statically resolvable". The candidate is named in `target_hint` only. **Open:** flag it if the owner meant "always" only for non-literal specifiers.
5. **`require(variable)`** has basis `unknown` and form `require`. Form describes the syntax (R3) and basis describes resolvability (R4). Form is not a match key, so this choice cannot fail an engine.
6. **Conditional imports are observed.** These are try/except, `if TYPE_CHECKING:` and the env-flag ternary `require`. The statement is written and resolves statically, and R4 does not depend on whether the branch is reachable at runtime.
   - The fixture deliberately never *calls* a conditionally bound name such as `checksum`. Its target would depend on the runtime environment.
7. **Decorator registration is not an HTTP call.** `@expose("POST", "/api/ledger/close")` is a direct call to a local function.
   - R5's "HTTP / route calls" is read as a call whose target is reached through an HTTP request or URL route. That describes the client side: `fetch`, `urlopen`.
8. **Path aliases.** The imports target is the file that the `tsconfig.json` paths resolve to (R1: "the literal specifier's file"). The exact alias `@ledger` therefore targets the barrel `index.ts`, and anything resolved through it is `derived` (R2).
9. **Default exports.** The node id is the declared name: `CreditEntry`, `LedgerPanel`, or `toCsv` for `module.exports = function toCsv`. An anonymous default function is `path::default`. A call goes to that node, whatever the local binding is called (`makeSummary`).
10. **Not relations.** JSX element usage, value references (the `routes` table), type annotations and `extends` clauses are not `imports`, `calls` or `contains`. They are listed in the truth's `omissions`.
    - No fixture component is rendered as JSX, so no engine is penalised for that modelling choice.
11. **Unknown sites are isolated.** No observed or inferred truth edge shares a `file:line` with an unknown. `score.py` matches unknowns on file plus line regardless of type (R5), so a shared line would make a correct edge "claim" the unknown.
12. **`external_refs`** is the number of external or standard-library import statements, which is 8. R8 asks for a separate count but does not define it.
    - Builtin and external calls such as `fetch`, `urlopen`, `json.loads` and `useState`, and the decorator `@dataclass`, are out of scope. They are not counted again.
13. **Coverage denominator.** files_total is the 35 source modules. `src/tsconfig.json` is configuration (R8 asks for "files seen vs files total" and lists omissions).
14. **One file, not two.** v0 kept a separate `ground-truth.envelope.json`. Here `ground-truth.json` is itself the v1 envelope, so it can validate against the v1 schema directly.
    - Re-exports therefore use type `imports` with form `reexport`. The legacy type `reexports` would fail the v1 schema's type enum.
    - Consequence: `score.py` resolves `barrel::Name` *call* targets only from legacy `reexports` edges (`build_alias`), so it would not resolve them here. The fixture has **no calls through a barrel**: the barrel is consumed only for a constant. **Open scorer note:** a later hold-out with barrel calls needs that alias built from `form: reexport` too. That is a `score.py` change, outside this ticket.
15. **Re-export of a default** (`export { default as CreditEntry } from './credit'`) is one `reexport` edge to `credit.ts`, with `names: ["default"]`.

## Language and runtime limitations (no claim of universal support)

- **Languages.** Only TypeScript, TSX, CommonJS JavaScript and Python 3.10+ (`match`, walrus). There is no Go, Java, C#, Rust, SQL, templates or IaC, and no ESM `.mjs`/`.cjs`.
- **TypeScript.**
  - Legacy `experimentalDecorators` only, not TC39 decorators.
  - Aliases come only from one `tsconfig.json`. There are no `package.json` workspaces, `exports` maps or project references.
- **Python.**
  - No namespace-package edge cases, `importlib.resources`, `sys.path` edits or `.pyi` stubs.
  - No consumer imports through a package `__init__` re-export.
- **Cross-runtime.** Both HTTP links are unknown by contract, with a candidate in `target_hint`. Nothing here tests route matching (R5 defers that to a separate gate). There are no queues or RPC.
- **Size and authorship.** 35 modules and 121 edges is a small sample. The ground truth has one author, checked by a second pass from the same author and by `verify.py`, not by an independent annotator.
  - A result on this fixture is evidence about these cases only, not about real repositories.

## Execution procedure for the later engine pass (needs its own approval: section 6 item 3)

1. **Before.**
   - Run `python3 -B docs/planning/G1/holdout-v1/verify.py` and record its output, including the manifest tree hash and the `score.py` pin.
   - If it fails, stop.
2. **Sandbox.** Use the same sandbox and config guard as BACK-21 ([REPORT](../back-21/REPORT.md), [preflight](../back-21/preflight.md)):
   - work under `<HOME>\kawalys-g1-sandbox\`, offline, with no keys;
   - use the same pinned engine versions and modes (Graphify `extract --code-only`; the CodeGraph library API through `cg_run.js`);
   - never run `install` or `init` CLIs, hooks or MCP registration;
   - take agent-config snapshots (`baseline/snapshot.py`) before and after each engine window;
   - make the copy of `src/` an isolated directory outside any git repository (BACK-21 found that Graphify records the enclosing repository's HEAD).
3. **Input.** Copy only `holdout-v1/src/` into the sandbox. Engines never see `ground-truth.json`, `verify.py`, this README or `MANIFEST.json`.
4. **One pass per engine.**
   - No reruns to improve a result.
   - A second identical run is allowed only as a determinism check, as in BACK-21, and any difference is reported.
5. **Normalizers.**
   - Use the v1 normalizers exactly as committed before the pass (section 6 item 1).
   - **No tuning of normalizers or scorer on hold-out results.** A normalizer or scorer defect found during the pass is reported, not fixed, for this pass.
6. **Score.**
   ```
   python3 -B docs/planning/G1/fixture/score.py <engine>.envelope.json --ground-truth docs/planning/G1/holdout-v1/ground-truth.json --json <engine>.score.json
   ```
   The envelope's `source.revision` must equal the `src/` tree hash in `MANIFEST.json`.
7. **Truth errors.**
   - The ground truth is not edited after an engine has seen the sources.
   - A suspected truth error is reported as an erratum against this frozen version. A corrected version would be a new, separately frozen `holdout-v1.1`, and scores would be reported under both.

## Re-verify

```
python3 -B docs/planning/G1/holdout-v1/verify.py
```

`verify.py` checks the following and exits non-zero on any failure:

- every manifest hash, the manifest tree hash, and the pins for `score.py` and `envelope.schema.v1.json`;
- that the `src/` tree hash equals `fixture.tree_sha256` and `source.revision`;
- every provenance line: node symbols, evidence tokens, import specifiers resolved through tsconfig paths / relative / Python dotted rules, callee names, enclosing symbols, and contains lines;
- an import census (every import-like line is accounted for);
- coverage of the required cases;
- a 100% self-score with the existing `score.py` (114/114 on exact lines, 7/7 unknowns marked, PASS);
- four discrimination controls (overclaim, claimed unknown, collision negative, barrel `derived`).

The manifest tree hash can also be checked without Python:

```
cd docs/planning/G1/holdout-v1 && find . -type f ! -name MANIFEST.json ! -path '*/__pycache__/*' ! -name '*.pyc' \
  | sed 's|^\./||' | LC_ALL=C sort | xargs sha256sum | sha256sum
```

**Pins.** A change to `../fixture/score.py` or `../fixture/envelope.schema.v1.json` fails `verify.py` until the pin in `MANIFEST.json` is updated. That is deliberate: the hold-out is scored with the pinned scorer, and re-pinning needs owner approval.

`MANIFEST.json` is excluded from its own hashes, so re-pinning does not change any fixture hash. CI runs `verify.py` together with the scorer self-check whenever `docs/planning/G1/fixture/` or `docs/planning/G1/holdout-v1/` changes.
