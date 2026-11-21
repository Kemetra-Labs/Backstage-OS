# BACK-21 (Kawalys G1-02) report: Graphify vs CodeGraph on the G1 fixture

Date 2026-11-21. Executed with owner approval given in chat on 2026-11-21 (install and execution authorized; fixture accepted at the G1-01 gate). All figures are counts. NOT RUN means not run.

Evidence in this folder:
- `preflight.md`: versions, licenses, install scripts, network and LLM dependencies.
- `runs.md`: commands, environment, timings, reproducibility, config snapshots.
- `*.envelope.json`: normalized output.
- `score-*.txt/.json`: scorer output.
- `normalize_*.py`: mapping rules.
- `logs/`.

## Question

On the pinned fixture, which analyzer reproduces the hand-verified ground truth without false observed edges? The ground truth has 41 observed edges, 3 unknown and 12 negatives. The fixture is `../fixture/`: 16 files of TS, TSX, JS and Python, tree sha256 `b359992d…0bca`. The runs were offline and keyless. The cost is recorded in runtime, privacy and license terms.

One tiny fixture proves nothing about scale, full-map coverage (M03) or private code. Go, Java, C#, Rust, SQL, Jinja2 and Terraform/HCL are NOT RUN.

## Setup

| | Graphify | CodeGraph |
|---|---|---|
| Version | `graphifyy` 0.9.114, tag v0.9.114, SHA `ae37e0bd4d6d…` | `codegraph` 1.6.4, tag v1.6.4, SHA `461a5d87a873…` |
| Install | Local venv, from the pinned clone | Local `npm install --ignore-scripts`, exact version |
| Mode | `graphify extract --code-only` (AST only, no LLM pass) | Library API `CodeGraph.init(root,{index:false})` + `indexAll()` (`cg_run.js`) |
| Native output | `graph.json` | SQLite `codegraph.db` |

`graphify install` and `codegraph install` were never run, and neither were `init` CLIs, MCP registration or hooks. The CodeGraph CLI `init` path can reach `installGitSyncHook`, and the fixture copy sits inside a git repository (the home directory), so only the library API was used. Engines saw only a copy of the fixture.

## Results (scorer output, unchanged)

| Edge type | Expected | Graphify TP/FN/FP | CodeGraph TP/FN/FP |
|---|---|---|---|
| imports | 9 | 8 / 1 / 11 | 9 / 0 / 10 |
| calls | 11 | 11 / 0 / 0 | 11 / 0 / 0 |
| reexports | 2 | 2 / 0 / 1 | 0 / 2 / 0 |
| contains | 19 | 17 / 2 / 0 | 19 / 0 / 0 |
| **total** | **41** | **38 / 3 / 12** | **39 / 2 / 10** |

| Criterion | Graphify | CodeGraph |
|---|---|---|
| False observed edges (scorer rule) | 12, **FAIL** | 10, **FAIL** |
| Of those, wrong relations after hand check | 0 | 0 |
| Negatives hit (collision trap, comments, strings, unused module, type-only, HTTP) | 0 of 12 | 0 of 12 |
| Line provenance of matched edges | exact 38, missing 0 | exact 20, missing 19 (all `contains`) |
| E23 dynamic `import()` / E24 `importlib` / E25 HTTP | silent / silent / see note | silent (recorded as unresolved ref) / silent (same) / marked unknown |
| Languages with zero nodes | none | none |

### Why both FAIL, and what the failures are

The fixture convention (`../fixture/README.md`) has two parts:
- An `imports` edge targets the imported **file**.
- A re-export targets the defining symbol.

Both engines also emit **symbol-level** import edges, such as `orders.ts → pricing.ts::Cart` for `import { Cart, computeTotal } from './pricing'`. The normalizers emit these verbatim, and the scorer counts each one as a false observed edge.

I opened all 22 such edges at their cited lines. Each one is a true import at symbol granularity that duplicates a credited module-level edge. **No edge asserts a relation that does not exist in the source.**

So the strict, pre-registered verdict stays FAIL. In substance, the failure is a disagreement over granularity between the envelope and the engines, not wrong facts. The next slice must decide the envelope rule (see below) before any re-score. No mapping was changed after scoring.

### Other hand-verified findings

- **Collision trap held in both engines.** `app.py:8` resolves to `schema.py::validate` and `service.py:18` to `validators.py::validate`.
- **E25, Graphify.** The scorer tags Graphify's E25 as "claimed observed". It is actually a true external `calls submit_order → requests` edge at `gateway.py:18`. Graphify emits no edge to `handler.ts`, so negative N12 is not hit. The scorer's unknown-match rule (same file and line) over-matches here. Recorded as a scorer limitation, not an engine error.
- **CodeGraph E23 and E24.** These are stored in its `unresolved_refs` table as `calls`-kind references. They appear as `unknown` edges of type `calls`, so the type-strict scorer reports them as silent. Rated partial.
- **Graphify E06.** For `from .service import OrderService` in `svc/__init__.py`, Graphify emits a symbol-level import and a `re_exports` edge (`__all__` makes that reading defensible), but no module-level import.
- **Graphify `contains`, 2 missed.** `format.js` and `report.js` (CommonJS) get nodes and call edges, but no `contains` edges to their functions.
- **CodeGraph re-exports.** The `export … from` lines in `index.ts` become `imports` edges, so `reexports` is not a distinct relation (2 FN, 3 type mismatches).
- **Self-labelling asymmetry.**
  - Graphify labels the 2 calls that need local type inference (`cart.addItem`, `service.place`) as INFERRED.
  - CodeGraph resolves them with confidence 0.9/0.95 and no provenance, so they normalize as observed.
  - Graphify is the more honest of the two about inference.
- **Matched edges spot-checked and correct:** E04, E05, E13, E14, E16, E18 and E19, by the executing agent. The orchestrator separately checked fixture source lines for 11 ground-truth edges (Phase 0), not engine output.

## Language-gap matrix (G = Graphify, C = CodeGraph; fixture-level only)

| Capability | TypeScript | TSX | JavaScript (CommonJS) | Python |
|---|---|---|---|---|
| Parse | G observed, C observed | G observed, C observed | G observed, C observed | G observed, C observed |
| Symbols | G observed, C observed | G partial, C partial (component not a distinct kind) | G partial (no `contains`), C observed | G observed, C observed |
| Module imports | G observed (incl. `import type`), C observed | G observed, C observed | G observed (`require`), C observed | G partial (relative import in `__init__`), C observed |
| Re-export barrels | G observed, C not observed as a distinct relation | n/a | n/a | n/a |
| Cross-file calls | G observed, C observed | G observed (through the barrel), C observed | G observed, C observed | G observed (collision trap handled), C observed |
| file:line | G observed, C partial (`contains` has no line) | same | same | same |
| Dynamic / unknown | G not observed, C partial | no fixture case | no fixture case | G not observed, C partial |
| Cross-runtime (HTTP) | not observed as an edge by either (correct) | | | |

Go, Java, C#, Rust, SQL, Jinja2 and Terraform/HCL: NOT RUN. README language claims are not verified.

## Reproducibility and cost

| | Graphify | CodeGraph |
|---|---|---|
| Run 1 vs run 2 | `graph.json` byte-identical (sha256 `a2c2016b…`) | raw DB bytes differ (timestamps, page layout); canonical content hash equal |
| **Third run by the orchestrator** | byte-identical again (`a2c2016b…`) | normalized envelope equal to the committed one (ignoring `generated_at`) |
| Wall time, run 1 / run 2 (warm) | 2.7 s / 1.2 s | 3.4 s / 0.9 s |
| Peak RSS (sampled process tree) | 112 MB | 184 / 165 MB |
| Install footprint | venv, 30 packages | about 276 MB unpacked platform bundle incl. a 37 MB native kernel |

## Privacy, network and side effects

- **Agent-config snapshots** (sandbox `baseline/snapshot.py`, 1,960 files tracked):
  - 0 changes around both installs and all engine runs.
  - 0 changes around the orchestrator's two extra runs.
- **Unattributed change: `claude_desktop_config.json`.** It changed outside every guarded BACK-21 engine window: mtime 13:58, and again by 14:04.
  - The BACK-22 renderer work was running in parallel during that period, so neither time can be placed outside all activity.
  - The old content was not kept, so the change itself cannot be shown.
  - Its `mcpServers` is currently `{}`, and neither engine name appears in any agent config.
  - It is reported as unattributed.
- **Unattributed change: `~/.claude.json#mcpServers`.** It also changed between the orchestrator's baseline and the start of the agents' work, before any engine was installed. Also unattributed.
- **Network:**
  - Python honours the dead proxy, and no proxy or connection errors appear in the logs.
  - Node 24 does not honour proxy variables without `NODE_USE_ENV_PROXY=1`, so CodeGraph's no-network evidence is limited: a source grep, plus `CODEGRAPH_TELEMETRY=0`, `DO_NOT_TRACK=1` and the no-update / no-download variables. **Actual traffic was not captured.**
  - CodeGraph's CLI has telemetry on by default (see `preflight.md`).
- **Finding: Graphify writes the enclosing git repository's HEAD** (`built_at_commit`) into `graph.json`. Here that is the home-directory repository. In a real deployment, the analyzer must run in an isolated checkout so it records only the approved repository's revision.
- No writes to `~/.graphify`, `~/.codegraph`, `~/.cache`, `~/.config` or `~/.local` were observed.

## Licenses (provisional, not legal clearance)

- **Graphify:** Apache-2.0 with MIT-licensed portions; 30 Python packages inventoried, all permissive.
- **CodeGraph:** MIT root; 12 bundled JS packages (11 MIT, 1 Unlicense).
  - **NOT VERIFIED:** the vendored `node.exe`, the 73 Rust crates behind the native kernel, and the 36 wasm grammars.
  - **Its license sign-off is incomplete.**

## Recommendation (per engine; the owner decides in BACK-23)

- **Graphify: accept for the next evaluation slice.**
  - Fully offline AST mode with no key.
  - 38 of 41 edges, 0 negatives hit, exact lines on every matched edge.
  - Explicit EXTRACTED / INFERRED labels.
  - Byte-identical across three runs.
  - Permissive, fully inventoried license.
  - Watch:
    - no unknown/dynamic edge class;
    - a Python relative-import module edge and 2 CommonJS `contains` edges missed;
    - it embeds the enclosing repository's commit;
    - its default query log and `install` write to the home directory, so never run `install`.
- **CodeGraph: accept for the next slice only on these conditions.**
  - Strengths: 39 of 41 edges, 0 negatives hit, every module import and `contains` edge present, and it records unresolved references.
  - Conditions:
    - complete license sign-off (Rust kernel, node.exe, grammars);
    - telemetry forced off;
    - library API only (the CLI cannot index without `init`);
    - an audit of the 37 MB native binary.
  - Watch: re-exports not distinguished, `contains` lines missing, inference labelled as fact.
- **Neither engine is rejected; neither is selected.** Both FAIL the strict false-observed-edge rule, and every failure is a granularity duplicate, not an invented fact.
- **Before the next slice, decide the envelope rules:**
  - module-level vs symbol-level imports;
  - how dynamic and unresolved relations are represented;
  - re-export typing.

  These rules move the score more than the engine choice does. Then re-score these same outputs, and add a second, larger fixture.
