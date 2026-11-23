# BACK-85 (S5a): typed project identity crosswalk and host-to-map context

Synthetic only. No new UI, route, library, backend, schema, CSS or CI change; no screen is touched and nothing mounts B+C. Persona is a display switch, not authorization: no server-side identity, tenant or X02/X04 enforcement exists or is claimed.

Base: `c7f9825` (BACK-84, PR #59, merged). Main CI for `c7f9825` was still in progress when work began (PENDING at that time).

## What changed

| File | Change |
|---|---|
| `src/bridge/identity.ts` (new) | `IDENTITIES`: every host project against its candidate map node, with a status (`verified`, `unresolved`, `ambiguous`) and the basis for it. `mapIdOfProject` / `projectOfMapId` return a typed `Resolution` (`verified` carries the id; `unresolved`, `ambiguous`, `foreign` carry none). `isSharedComponent`: the component ids the canonical domain model owns. |
| `src/bridge/mapContext.ts` (new) | `toMapContext(host)`: pure, read-only translation from the host's persona, language and route to the minimal context a map lens needs (`persona`, `lang`, `dir`, `scope`, `node`, `origin`). `toHostRoute(selection, persona)`: the reverse, from a map selection to a host route. `...In` variants take an explicit authorized world, for tests. |
| `src/bridge/bridge.test.ts` (new) | 41 tests (below). |
| `vite.config.ts` | `src/bridge/**` added to the coverage include list (widens coverage, thresholds unchanged). |

Unchanged: `App.tsx`, `AppContext.tsx`, `nav/*`, `shell/*`, every screen, both fixtures, `domain/*`, `design-lab/v2/*`.

## Identity verdicts (grounded in the fixtures, pinned by tests)

| Host project | Map node | Status | Why |
|---|---|---|---|
| `RT` Retail Tower OS | `retail-tower` (product) | **verified** | Not by name alone: V1 RT owns `pos`, `stock-sync`, `inventory`; the canonical model owns exactly those ids; V2 groups exactly those ids under `retail-tower` (edges g1 to g3). |
| `KH` Khepri | `khepri` (product) | unresolved | Same display name only. No shared component, evidence or dependency, and the fixtures disagree on health (V1 degraded, V2 healthy with no basis). |
| `SB` Seshat-BI | `seshat-bi` (service) | ambiguous | V1 SB is a project, V2 seshat-bi is a service. Similar names are not proof of one entity. |

Component identity is separate: only `pos`, `stock-sync`, `inventory` are shared, and only on project RT. `payments`, `api-gateway`, `reporting` (host only) and `github`, `jira`, `sentry`, `port` (map only) are not.

## Context rules

- One authority: the host. The bridge has no React, no provider, no storage, no setter and no module state (a test scans the sources). It cannot hold a second copy of persona or language.
- Scope and selection come from the route only, so Back and Forward re-derive them. `#/project/RT/<shared component>` gives scope `retail-tower` and that node. A project route for KH, SB or an unknown id gives scope `all`, no node, and the identity status as `origin`. A route that is not a project gives `all`, no node, `none`.
- A selection is only ever a node of the persona's authorized world (V2 `authorizedWorld`, itself the BACK-84 canonical scoping). An id that world does not hold, restricted or foreign, becomes "no selection". The context carries ids and presentation switches only, never evidence, so no `E-5` / `O-5`, count or derived status can ride in it.
- A map selection maps back to `#/project/RT/<component>` (shared component), `#/project/RT` (the verified product or scope), or `null` (services, unverified products, unmapped scopes, foreign ids, nodes the persona's world lacks). The route survives `hrefFor` and `parseHash` unchanged.

## Tests (41, all in `src/bridge/bridge.test.ts`)

- Crosswalk pinned to the fixtures: names every V1 project exactly once; every map id exists with the recorded kind; RT agrees across host, canonical model and map; KH shares nothing; SB kind mismatch; exactly one verified entry.
- Resolution: RT both ways and round-trip; KH `unresolved`, SB `ambiguous`; `XX`, empty, `rt`, `constructor`, `__proto__`, `toString`, `E-5`, `github` are `foreign` both ways.
- Context: persona x language matrix (EN and AR, LTR and RTL); EN and AR differ only in `lang` and `dir`; non-project routes; KH, SB and unknown projects never mapped and their components never selected; host-only and foreign component ids not selected; selection cleared when the authorized world lacks the node (and kept for others); persona switch sequence re-derives from the route.
- Privacy: no `E-5` / `O-5` in the context for any persona, language or route, including `#/evidence/E-5`, `#/project/RT/E-5`, `#/investigation/O-5`; the lay worlds hold none, the Technical world does (so the test is not vacuous).
- Reverse mapping: every shared component round-trips for all persona and language pairs; verified product and scope; href and parser round-trip; null for services, unverified, foreign and trimmed-world nodes.
- Back and Forward: a five-step history replayed forward and backward gives identical contexts; the function is pure and does not change its input.
- No second authority: no React, V2 provider, V2 context or navigation import, no hooks, no `let`/`var`, no storage.
- Mutation proof, run by hand and reverted: marking KH `verified` fails 5 tests.

## Evidence

| Check | Result |
|---|---|
| Preflight: PR #59 merged as `c7f9825`, no open PR, `origin/main` at `c7f9825` | PASS. Main CI for `c7f9825`: PENDING at preflight, not claimed. |
| `npm run check` (tsc, vitest with coverage) | PASS: 597 tests in 36 files (was 556), coverage 99.83%, `src/bridge` 100%. |
| `npm run build` | PASS |
| `npm run e2e` (Chromium + WebKit) | PASS: 1,448 passed, 66 skipped, 0 failed (same counts as the base) |
| `npm run e2e:v2` (Chromium) | PASS: 313 passed, 32 skipped, 0 failed (two separate runs) |
| `git diff --check` | PASS |
| Axe, screen reader, real devices (BACK-32), native Arabic (BACK-31), production or tenant security (X02/X04) | NOT RUN, not claimed |

## Not done here (by ticket)

No route, no B+C mount, no `AppShell` change, no CSS. The V1 `stock-sync` to `inventory` authored versus hypothesis edge is untouched. KH and SB stay unmapped until an owner decision gives them a semantic basis.

## Rollback

Delete `src/bridge/` and revert the one line in `vite.config.ts`. Nothing else imports the bridge.

## Smallest next slice (S5b, BACK-87)

Add a host route for the map (for example `#/map`) and a lens component that renders the existing B+C children from `toMapContext(useApp())`, so the host stays the single authority. Selection changes call `toHostRoute` and navigate through the host. This needs the S4 style isolation first (BACK-86).
