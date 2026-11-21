# BACK-23 (Kawalys G1-04): engine selection and language-coverage decision package

Date 2026-11-21. **This is an OWNER REVIEW package, not a decision.** It gives one data-backed accept, defer or reject recommendation per replaceable capability. It does not select a vendor, a backend language, a production parser, a renderer or an AI agent. Every figure is a count taken from the linked evidence. Anything not measured is marked NOT RUN or BLOCKED.

Inputs (both completed and validated by the orchestrator on 2026-11-21):
- [BACK-20 fixture and ground truth](../fixture/README.md): 16 synthetic files (TS, TSX, JS, Python), 41 observed edges, 3 unknown edges and 12 negatives. Tree sha256 `b359992d…0bca`. Accepted by the owner in chat on 2026-11-21.
- [BACK-21 analyzer report](../back-21/REPORT.md): Graphify 0.9.114 vs CodeGraph 1.6.4.
- [BACK-22 renderer report](../back-22/REPORT.md): DepGraph copy vs React Flow 13.0.2 vs Archify 3.2.0.

What the orchestrator independently re-checked:
- Both analyzer score sets were re-run and reproduce.
- Each analyzer was run a third time:
  - Graphify output was byte-identical.
  - CodeGraph's normalized output was identical.
- The renderer checks were run a third time and every functional value matched.
- All 22 analyzer "false observed" edges were read at their source lines.
- The agent-config snapshots showed no engine-caused change.

## 1. Recommendations per capability (kept separate)

| Capability port | Recommendation | Evidence | What it does not prove |
|---|---|---|---|
| **RepositoryAnalyzer** | **DEFER selection; carry both Graphify and CodeGraph into one more bounded slice.** Graphify leads on trust signals; CodeGraph leads on coverage, conditional on its license sign-off. | Totals: Graphify 38/41 matched, CodeGraph 39/41. Negatives hit: 0/12 for both, and the name-collision trap held in both. Both FAIL the strict "no false observed edge" rule, with 12 and 10. All 22 were hand-checked and are true imports at **symbol** granularity, not invented relations ([BACK-21 §Results](../back-21/REPORT.md)). Graphify: exact lines on all matches, labels its inferences, byte-reproducible over 3 runs. CodeGraph: all `contains` and module imports found, records unresolved references, but labels inferred calls as fact and gives `contains` edges no lines | Scale, full-map coverage (M03), private code, any language beyond TS/TSX/JS/Python, runtime topology |
| **DiagramRenderer** | **DEFER selection.** React Flow is the provisional candidate for the dense graph view, *if* the owner accepts its D3-bearing dependency; otherwise extend DepGraph. **Reject Archify for in-app use.** DepGraph stays the baseline and is not replaced. | React Flow: kept every truth class, axe 0, 250 nodes in about 125 ms with 0 long tasks, zoom works. Costs: 89 KB gzip, 28 packages including 9 D3 modules, a 54-press keyboard path, 74 touch targets under 44 px at 375 px. DepGraph: smallest (1.5 KB), 0 touch-target failures, but no zoom; it also silently drops `to: null` edges. Archify: full graphs rejected by its own validator at all densities, no selection bridge out of the sandbox, 4 axe violations in its frame, license statements conflict ([BACK-22 §3–4](../back-22/REPORT.md)) | Real screen reader, WebKit, real devices, the B orbit layout, user comprehension (all NOT RUN) |
| SourceConnector | Not evaluated here | — | GitHub read-only access remains gated by X02/X04 and M02 scope |
| ExplanationProvider | Not evaluated here | — | No model, prompt or cost evaluated |
| AgentRuntime | Not evaluated here | — | Out of G1 scope |

## 2. Why defer rather than choose

1. **The envelope rules move the score more than the engine does.**
   - Both analyzers "fail" only because they emit true symbol-level imports where the draft envelope expects module-level imports.
   - That gap must be settled as a Kawalys schema rule before any engine is ranked: module vs symbol imports, re-export typing, and how dynamic or unresolved relations appear.
   - Choosing an engine now would encode an accident of the draft schema.
2. **One 16-file fixture is a smoke test, not a selection basis.** It cannot speak to M03 full-map coverage, scale or language breadth.
3. **Open license gates:**
   - CodeGraph's native kernel (73 Rust crates), its vendored `node.exe` and its 36 wasm grammars are not inventoried.
   - Archify's license is stated as MIT in-repo but as Apache-2.0 by the GitHub API.
4. **The renderer choice is coupled to the deferred D3/dependency decision** (the hybrid-map ENHANCEMENT-NOTE). React Flow cannot be accepted without it.

## 3. Language-support matrix (measured on the fixture only)

G = Graphify, C = CodeGraph. "Observed" means seen working on the fixture; it is not a general support claim.

| Capability | TypeScript | TSX | JavaScript (CommonJS) | Python |
|---|---|---|---|---|
| Parsing | G observed, C observed | G observed, C observed | G observed, C observed | G observed, C observed |
| AST / symbols | G observed, C observed | G partial, C partial (no component kind) | G partial (no `contains`), C observed | G observed, C observed |
| Imports | G observed (incl. `import type`), C observed | G observed, C observed | G observed (`require`), C observed | G partial (one relative import), C observed |
| Re-export barrels | G observed, C not distinct | n/a | n/a | n/a |
| Cross-file calls | G observed, C observed | G observed, C observed | G observed, C observed | G observed (collision trap held), C observed |
| file:line provenance | G observed, C partial (`contains` has no line) | same | same | same |
| Dynamic / unknown | G not observed, C partial | no case | no case | G not observed, C partial |
| Cross-runtime wiring (HTTP) | Correctly *not* claimed by either; still UNKNOWN | | | |

**Go, Java, C#, Rust, SQL, Jinja2, Terraform/HCL: NOT RUN / UNKNOWN.** No README language claim is accepted as verification.

## 4. Comparison on the non-functional criteria

| Criterion | Graphify | CodeGraph | React Flow | DepGraph | Archify |
|---|---|---|---|---|---|
| License (provisional, not legal clearance) | Apache-2.0 plus MIT portions; 30 packages, all permissive | MIT root; **kernel, node.exe and grammars NOT VERIFIED** | MIT; D3 parts ISC/BSD-3 | in-house | **conflict: MIT vs Apache-2.0** |
| Source privacy | Offline AST mode, no key. **Embeds the enclosing git repo's HEAD SHA** in its output | Library API offline. Telemetry is on by default in the CLI. Traffic not captured on Node | Runs in-app; 0 external requests | 0 external requests | Fully sandboxed iframe; 0 requests |
| Reproducibility | Byte-identical over 3 runs | Content-identical over 3 runs | Functionally identical over 3 runs | Same | Same, at reduced scope |
| Operating cost | about 1–3 s, 112 MB on the fixture | about 1–3 s, 165–184 MB; about 276 MB install | 89 KB gzip | 1.5 KB | 207 KB gzip per diagram |
| Config side effects | 0 (never run `install`) | 0 (library API only; the CLI `init` can install a git hook) | 0 | 0 | 0 (with fake HOME) |
| Portability, swap and rollback | Output normalizes into the Kawalys envelope; node ids are Kawalys paths, not engine ids | Same | Reads the same envelope; replaceable | Baseline | Separate IR plus a generated page; weakest |

Portability holds: both analyzer outputs were rebuilt from the envelope alone, and every renderer read the same envelope. So swapping or rolling back an engine does not touch user routes (K-ARCH-01).

## 5. Risks

- **R1: schema drift.** If the envelope keeps module-only imports, both engines need lossy post-processing. If it adopts symbol-level imports, the ground truth must be extended. Decide once.
- **R2: CodeGraph's opaque native binary** (37 MB) and incomplete license inventory.
- **R3: Graphify records the commit of whatever git repository encloses the scan directory.** In production, the analyzer must run in an isolated checkout of only the authorized repository.
- **R4: React Flow's keyboard path and touch targets** need custom edge handling before any accessibility claim: edges as tab stops, small targets at 375 px.
- **R5: DepGraph silently drops edges whose endpoint is missing.** Confirmed in the real app code at `app/src/components/DepGraph.tsx:64` (`if (!a || !b) return null`). Its edge key `${e.from}-${e.to}` (lines 67 and 124) would also collide for two edges between the same nodes. It is latent wherever unresolved edges reach it. This is a separate fix-ticket candidate; it was not changed here.
- **R6: environment limits.** Results come from one Windows machine and headless Chromium. WebKit, a screen reader and real devices are NOT RUN; that overlaps BACK-6 and BACK-8.

## 6. Exact next approval slice (proposed; each item needs the owner's yes)

1. **Envelope rules decision (paper):**
   - module vs symbol import edges;
   - re-export typing;
   - how unknown or dynamic relations are represented;
   - mandatory line provenance on `contains`.

   Then re-score the existing BACK-21 outputs. No new runs are needed.
2. **Fixture v1:** a second, larger synthetic or public fixture (about 100–200 files) with the same ground-truth discipline, to test scale and coverage.
3. **CodeGraph license sign-off:** inventory the Rust crates and grammars, or drop CodeGraph.
4. **Dependency decision** (already deferred by the owner): accept or reject React Flow, and with it D3.
   - If rejected: a DepGraph extension spike (routing, zoom, unresolved edges).
   - If accepted: a React Flow spike with custom orbit nodes, edges removed from the tab order, and 44 px targets.
5. **Unchanged gates:** M01 First Verified Insight and M03 Full Architecture Map stay independent quality gates. X02/X04 (identity, permissions, retention) and BACK-8 QA remain open. Nothing here touches source access.

## 7. Acceptance criteria check (BACK-23)

| Criterion | Status |
|---|---|
| Each conclusion backed by evidence links, or BLOCKED / NOT RUN | Met (links above; NOT RUN items listed) |
| Both prior comparisons reviewed; defer if missing | Met: both completed and validated; the recommendation is a deliberate defer, with reasons |
| Clear choice or defer, with risks, for extractor and renderer separately, plus the next approval slice | Met (§1, §5, §6) |
| No backend language, engine, model or commercial-support claim without owner approval | Met: nothing selected |
| Jira and GitHub status unchanged | Met: no transitions or comments made; results live on branch `claude/kawalys-g1-eval`, not yet committed or pushed |
