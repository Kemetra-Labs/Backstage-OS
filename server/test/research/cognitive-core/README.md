# COG-01 research port: Kawalys cognitive core (BACK-104)

**Research only. Synthetic data. Not wired into the server, the app or any runtime.** Epic BACK-103, slice BACK-104 (COG-01). Nothing under `src/` or `app/src/` imports this folder; `cognitive-core.guard.spec.ts` enforces that. It lives under `server/test/` so the existing server CI job runs it without any CI or config change. It is not in `tsconfig.json`'s build.

## Provenance

| | |
|---|---|
| Source | `kawalys-cog-p0-v0.1.zip`, the COG-P0 standalone prototype supplied by the owner (not in Jira or GitHub) |
| Archive SHA-256 | `b67f5545f23abf5994ea50b2f002ae30642ab6e1c4bd24fbe34ca47952d78ae5` (matches BACK-104 and Confluence KMC 95256578 section 13.1) |
| Design | Confluence KMC 95256578 (draft workshop), section 11 (W1 contract and acceptance table) and section 13 (COG-P0). COG-D01 to D04 are proposals, not ratified ADRs. |
| Strategy | **ADAPT**: the five modules match the archive line for line, except a two-line provenance header and relative imports that drop the `.ts` extension (server Jest convention). Tests moved from `node:test` to Jest with the same names and assertions. |
| Licence | The archive has no licence file. Owner confirmation of ownership is pending before any merge. |

## Files

| File | Origin |
|---|---|
| `contract.ts`, `memory.ts`, `reasoner.ts`, `validator.ts`, `index.ts` | COG-P0 `src/`, header and imports only changed |
| `fixture.ts` | COG-P0 `fixtures/build.mjs`, types added |
| `oracle.json` | COG-P0 `fixtures/oracle.json`, byte-identical (SHA-256 `a83f972a...12a`, asserted by the spec after normalizing CRLF to LF, since Windows checkouts may convert it) |
| `frozen-fixture.json` | The archive's own `build.mjs` output, serialized once before porting (SHA-256 `da7b0592...67e8`); the spec checks `fixture.ts` still builds it exactly |
| `oracle-cases.json` | New, BACK-104 Phase B: independent oracle hand-authored from the W1 acceptance table |
| `restart-worker.ts`, `restart-hooks.mjs` | COG-P0 `test/restart-worker.mjs`, plus a resolve hook so a fresh Node process can load the extensionless `.ts` imports |

Specs: `../cognitive-core.spec.ts` (the 46 COG-P0 tests plus 2 freeze checks), `../cognitive-core.oracle.spec.ts`, `../cognitive-core.guard.spec.ts`.

## Run

```sh
cd server
node --experimental-vm-modules node_modules/jest/bin/jest.js test/research   # no Docker needed
npx tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --module esnext --moduleResolution bundler --target es2022 --types node --skipLibCheck test/research/cognitive-core/*.ts
```

## Differences from COG-P0

- F12b started its worker with `new URL(...).pathname`, which yields `/C:/...` and failed on Windows (45/46 on Node 24.22.2). The port uses plain paths and `pathToFileURL`.
- The restart worker runs with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` (`server/package.json` declares no `"type"`) and `--disable-warning=ExperimentalWarning` (an earlier Node 24 minor may flag type stripping or `registerHooks`). Errors and any other warning still fail the test.
- Process restart is covered by the ported F12b test (two fresh Node processes); `oracle-cases.json` covers the in-process cases, including input permutation (O-F12).
- Toolchain: Node 24 and TypeScript 6.0.3 (the repository's), against Node 22.16 and TypeScript 5.8.3 for COG-P0.

## What this does not prove

Not PostgreSQL persistence, row-level security, real `source_grants` revocation, connector revision semantics, audit rows, concurrency or scale. Scope and grants are trusted synthetic fixtures. The validator trusts the memory projection; the independent oracle checks the projector only on the listed cases. Real-provider gaps (server grants have no version, the server has no `validUntil` or evaluation clock, only Confluence exposes an ordered version) are recorded in BACK-104. COG-02 stays gated.
