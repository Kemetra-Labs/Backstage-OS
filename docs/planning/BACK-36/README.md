# BACK-36: Standalone CNCF Backstage libraries, selective-reuse evaluation

Status: **research only, owner review pending.** Nothing has been installed, copied or integrated. Facts were checked on 2026-11-21 against the npm registry (`registry.npmjs.org`), published tarballs (read in a scratch directory outside the repo) and `backstage/backstage` / `backstage/community-plugins` source on GitHub.
Context: [BACK-1](https://rahmaqanater.atlassian.net/browse/BACK-1) · [BACK-14](../BACK-14/README.md) (Retail Tower audit, different scope) · [BACK-27](https://rahmaqanater.atlassian.net/browse/BACK-27) · [Architecture direction](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/78184554) · [OSS radar](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/83394626) · [Provider ADR](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/80085048)

## Recommendation (TL;DR)

**Adopt none as a package import.** No Backstage frontend package declares React 19 in its peer range. The UI library ships no RTL support and injects a document-wide CSS reset. Every official plugin needs the Backstage app runtime, and most also need its backend.

Two candidates are worth keeping, both without installing anything:

1. **`@backstage/catalog-model`: REFERENCE now, possible API later.** Use its entity envelope, `kind:namespace/name` ref grammar and paired relation vocabulary as a *documented interchange mapping*. That would let Kawalys export to, or import from, a Backstage or Port catalog through an adapter. Kawalys stays the authority (ADR rule 4).
2. **`@backstage/ui`: REFERENCE only.** It is a useful pattern source: React Aria-based accessible primitives, `@layer`-wrapped tokens, and a router-agnostic navigation hook. It is not importable today.

The optional spike (below) is paper-only and needs no installs.

## Baseline (no adoption)

- **Runtime dependencies:** `app/` uses only `react`/`react-dom` 19.3.1.
- **Components already covering the candidate surface** (`app/src/components/`): `Panel` (card), `Ledger` (table with truth label, source and time), `EvidenceList`/`EvidenceDrawer`, `TruthChip`/`SourceChip`/`HealthTriad`, `StateBlock`, `Segmented`, `StageMap`/`DepGraph`, plus bilingual `L`/`Text` with LTR isolation.
- **EN/AR/RTL:** set at runtime through `document.documentElement.dir`, using logical CSS properties. V2 and B+C have their own token sets.
- **Entity vocabulary:** `EntityRef` kinds live in `app/src/contract/types.ts`. Graph evidence is `kawalys.graph.v1` (`docs/planning/G1/contract-v1/CONTRACT-V1.md`, `fixture/envelope.schema.v1.json`).
- **BACK-14 overlap:** none. BACK-14 covered identity, MCP, AI and observability seams from Retail Tower, not Backstage packages. Nothing here proposes a second identity, permission or catalog authority.

## Decision matrix

| Candidate / verified version | Intended Kawalys use | Decision | Transitive deps and runtime requirements | React 19 / RTL / a11y / license fit | Cost / risk / exit | Recommendation |
|---|---|---|---|---|---|---|
| [`@backstage/ui`](https://www.npmjs.com/package/@backstage/ui) **0.20.0** (2026-11-17) | Table, card, filter and tab primitives, tokens | **REFERENCE** | 10 direct and ~19 transitive deps (react-aria/-components/-stately, @tanstack/react-table, @remixicon/react, marked, @braintree/sanitize-url, @internationalized/*, @backstage/version-bridge). ESM only. **Requires the global `@backstage/ui/css/styles.css`** (190 KB), which contains a `base` reset (`*`, `html`, `body`, …) and 258 `--bui-*` tokens on `:root`, all inside `@layer`. No app shell; router optional via `BUIProvider useNavigation`. | **Peer `react ^18.0.0` only** ([upstream React 19 issue still open](https://github.com/backstage/backstage/issues/28080)), so npm 7+ gives `ERESOLVE` without `--legacy-peer-deps`. **RTL: the CSS has 0 logical properties, 0 `[dir]`/`:dir()` selectors and 204 physical `margin-left`/`padding-left` rules.** a11y: built on React Aria (strong). License Apache-2.0; transitive licenses 8 MIT, 10 Apache-2.0, 1 0BSD (tslib); no copyleft. No install scripts; npm advisories: none. | 0.x with roughly monthly breaking releases, so a recurring upgrade tax. It duplicates `Panel`/`Ledger`/`Segmented`, a document-wide reset risks V1/V2/B+C visual regressions, and RTL would have to be rebuilt on top. Exit is easy only while it is unused. | Do not import. Borrow patterns: `@layer` token wrapping and a router-agnostic link hook. If accessible primitives are ever needed, evaluate `react-aria-components` directly (separate ticket; it is not a Backstage package). |
| [`@backstage/catalog-model`](https://www.npmjs.com/package/@backstage/catalog-model) **1.10.3** (2026-11-17) | Interchange vocabulary for Product/Project/System/Component | **REFERENCE** now, **API** (export/import mapping) later | 6 direct deps (ajv, ajv-errors, zod 4, lodash, @backstage/errors, @backstage/types), ~12 transitive. No peers, dual ESM/CJS, `sideEffects:false`, no Node built-ins, so it is browser-safe. Entity = `apiVersion`/`kind`/`metadata`/`spec`/`relations`; refs `[kind:][namespace/]name`; kinds Component, API, Resource, System, Domain, Group, User, Location (the tarball also ships `AiResource` and `McpServerApi`, meaning NOT VERIFIED); paired relations `ownedBy/ownerOf`, `dependsOn/dependencyOf`, `partOf/hasPart`, `providesApi`/`consumesApi`, … | React-independent. Data model only, no UI, so RTL and a11y do not apply. Apache-2.0; transitive licenses MIT, Apache-2.0, BSD-3-Clause, and (MIT OR CC0) for type-fest. Advisories: none. | Importing it adds ajv, zod and lodash runtime weight (bundle impact NOT VERIFIED) just for types and ref helpers that Kawalys already has. It also risks implying "catalog = authority" or "catalog = static code analysis", which the ticket forbids. Kawalys has no `system` kind today. Exit is easy as a documented mapping, harder once imported. | Keep Kawalys-owned types. Write a one-way mapping (Kawalys entity to Backstage Entity) as an adapter spec so a future Backstage/Port catalog sits behind a capability-named port (ADR rules 1–2). |
| [`@backstage/theme`](https://www.npmjs.com/package/@backstage/theme) 0.7.4 · [`@backstage/core-components`](https://www.npmjs.com/package/@backstage/core-components) 0.18.16 | Legacy theme and components | **REJECT** | theme: MUI v5 + emotion, peer `@material-ui/core` v4, react-router-dom 6 (~79 transitive). core-components: 45 direct deps (~370 transitive) including MUI v4, react-helmet, d3, plus Backstage app context. | Peer React `^18` (theme) or `^17‖^18` (core-components). Some transitive licenses are unusual (PSF-2.0, Unlicense, two packages with no license field, meaning NOT VERIFIED). | Heavy legacy stack. Upstream is itself moving to `@backstage/ui`. | Do not use. |
| [`@backstage/plugin-catalog`](https://www.npmjs.com/package/@backstage/plugin-catalog) 2.1.0 (+ `-react` 4.0.0) | Catalog pages | **REJECT** import, **REFERENCE** for boundaries | Needs `createApp`, ApiRegistry/`useApi`, routeRefs, react-router-dom 6, `discoveryApi`/`fetchApi`, the **catalog backend (`/api/catalog`)** and permission-react. Pulls MUI v4 **and** v5. ~492 packages, ~241 MB unpacked (approximate, not bundle size). | Peer React `^18` only. Apache-2.0. | Would mean adopting the Backstage app and backend, which contradicts the owner-agreed independent shell. | Keep Kawalys screens. Treat an external catalog as a provider behind a port. |
| [`@backstage/plugin-search`](https://www.npmjs.com/package/@backstage/plugin-search) 1.8.0 (+ `-react` 1.12.0) | Global search | **REJECT** import | App shell plus the **search backend** (index and query live in `search-backend*`). ~497 packages (approximate). | Peer React `^18`. Apache-2.0. | Same as catalog. | Keep `DemoSearch`. For real data, use a search-provider port later. |
| [`@backstage/plugin-techdocs`](https://www.npmjs.com/package/@backstage/plugin-techdocs) 1.20.0 | Docs | **REJECT** import | App shell plus the **techdocs backend** (`discoveryApi.getBaseUrl('techdocs')`, verified in `client.ts`), the catalog, a docs build and storage, and plugin-auth-react. ~490 packages (approximate). | Peer React `^18`. Apache-2.0. | Highest infrastructure cost of the set. | Link out to the docs site, or fetch through an adapter. |
| [`@backstage-community/plugin-github-actions`](https://www.npmjs.com/package/@backstage-community/plugin-github-actions) 1.6.0 (now in `backstage/community-plugins`) | CI status | **REJECT** import, **API** instead | `scmAuthApi`, which needs a GitHub OAuth app plus the Backstage **auth backend**; entity context (`github.com/project-slug`); catalog-react 3.x and BUI 0.19, which lag core. Footprint NOT VERIFIED. | Peer React `^16‖^17‖^18`. Apache-2.0. | It would put GitHub tokens in the browser and depend on Backstage auth. | Use the GitHub REST API or GitHub MCP behind a capability port. This is already gated by X02/X04 (BACK-23); no real access until cleared. |

## Reuse vs keep: measurable criteria

| Criterion | Keep current (baseline) | Import `@backstage/ui` | Import `catalog-model` |
|---|---|---|---|
| New runtime packages | 0 | ~19 (approximate) | ~12 (approximate) |
| React 19 declared support | yes | **no** (peer ^18) | n/a |
| RTL in shipped CSS | yes (logical properties) | **no** (0 logical properties) | n/a |
| Global CSS side effects | none new | document reset and `:root` tokens (layered) | none |
| Release churn | none | 0.x, roughly monthly | 1.x, stable |
| Bundle delta (gzip) | 0 | **NOT VERIFIED** | **NOT VERIFIED** |
| Visual fidelity to V1/V2/B+C | yes | **NOT VERIFIED**, likely regressions | n/a |

## Protected invariants

- The independent Kawalys shell is unchanged.
- `kawalys.graph.v1` remains the graph evidence contract. A Backstage mapping would be a derived export, never the source of truth for GitHub, Jira or code analysis.
- No catalog-implied authority and no UI-only security (BACK-30, X02/X04 still open).
- EN/AR/RTL, mobile and a11y are untouched.
- No private data went to any hosted evaluation; only public registry metadata and public source were read.

## Optional spike (one, owner-gated; not started)

**S-36-1: Kawalys to Backstage entity interchange mapping. Paper only, about 0.5 day.**
Write a mapping table and 3–5 synthetic JSON examples covering:
- Kawalys `EntityRef` kinds (`product`, `project`, `component`, …) and their owner/dependency links, mapped to Backstage `kind` / `spec` / relation pairs;
- gaps (no Kawalys `system` kind; Backstage has no truth-label, freshness or restricted-evidence fields);
- which side owns which field.

Out of scope: npm install, code, lockfile changes, real sources. Done when the owner can decide whether a future `CatalogExchangePort` is worth an ADR.

A separate, later gate, only if the owner wants numbers: an isolated scratch-directory Vite build measuring the gzip delta of `catalog-model` ref helpers, and of BUI on React 19 with `dir="rtl"`. This would fill the NOT VERIFIED cells above. It needs explicit approval because it installs packages.

## NOT VERIFIED / uncertainties

- BUI runtime behaviour on React 19.3.1, and with React Aria `I18nProvider` in RTL.
- Vite tree-shaken bundle sizes for any candidate.
- The docs site `ui.backstage.io` (blocked by the research proxy); README and shipped CSS were used instead.
- Install scripts and telemetry in *transitive* dependencies (only the target packages' manifests were checked).
- The meaning of the `AiResource` and `McpServerApi` kinds in catalog-model.
- Transitive counts and unpacked sizes come from registry-metadata resolution without a lockfile, so they are approximate.
- Advisory status is a point-in-time npm advisory DB result.
