# BACK-71 P1: canonical synthetic fixture + V1/V2 projections + parity tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One canonical synthetic fixture for the `inv-demo-7` overlap, scoped once per persona, projected into the V1 and V2 shapes, with tests proving both projections equal the existing V1 and V2 fixtures and that scoping matches V2's `authorizedWorld`.

**Architecture:** New folder `app/src/domain/` only. No existing file is edited. The canonical fixture reuses the shared contract types (`app/src/contract/types.ts`) and the V1 `EVIDENCE`/`SOURCES` objects (already shared by V2), and declares E-8/E-9 itself. `scopeFixture` removes Technical-only evidence before anything is derived. `toV1` and `toV2` are pure projections. Known V1/V2 disagreements are recorded as `it.fails` tests, never skipped.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest 2.1.9 (`src/**/*.test.ts`), `cd app && npm run check`.

**Spec:** Jira BACK-71 (description); BACK-70 memo `docs/planning/BACK-70/DECISION-MEMO.md` §5–6; owner decision A on BACK-65 (comment 18382); delegated rulings in `docs/superpowers/plans/2026-11-22-ticket-execution-roadmap.md`.

## Global Constraints

- Changed-file boundary: create only `app/src/domain/{types,fixture,scope,toV1,toV2}.ts` and `app/src/domain/parity.test.ts`. No other file changes (coverage config is not edited; BACK-71 default).
- Synthetic only. Persona is a display switch, not authorization; `scopeFixture` says so in a comment.
- Unknown is never Healthy: a component whose whole basis is withheld becomes `health: 'unknown'`.
- M05-D05-B: for Owner/Nontechnical no Technical-only evidence id survives scoping anywhere (evidence map, component `evidence`/`basis`, dependency `evidence`).
- Scope: components `pos`, `stock-sync`, `inventory` (`NodeId` in `contract/types.ts`), evidence `E-1`..`E-9`, sources from V1 `SOURCES`, dependencies within those three components, investigation `INV-DEMO-7`.
- Excluded (BACK-71): Mission `events` counts, layout coordinates, copy wording, projects RT/KH/SB, decisions, agents, activity.

## Review Focus

1. Scoping changes a component's freshness or connectivity the same way V2 does (V2 `scopeState`: no provider → freshness `unknown`). Test: inventory after scoping equals the V2 `authorizedWorld` inventory node state.
2. Object identity vs value: V2 tests use `toBe` for E-1..E-7. Parity must compare by value (`toEqual`) so a projection building new objects still passes; the fixture must not mutate the shared V1 objects (`Object.isFrozen` is not guaranteed). Test: projecting twice gives equal results and V1 `EVIDENCE` is unchanged (deep-equal to a structuredClone taken before).
3. Technical persona gets the unscoped fixture (same object), as `authorizedWorld` does.
4. A dependency with no evidence survives scoping; one whose only evidence is withheld is removed.
5. Arabic: not applicable (no copy in this slice) — noted, nothing to test.

---

### Task 1: Canonical fixture, scoping, projections and parity tests

**Files:**
- Create: `app/src/domain/types.ts`, `app/src/domain/fixture.ts`, `app/src/domain/scope.ts`, `app/src/domain/toV1.ts`, `app/src/domain/toV2.ts`, `app/src/domain/parity.test.ts`

**Interfaces:**
- `types.ts`:
  - `type ComponentId = NodeId` (import from `../contract/types`).
  - `interface DomainComponent { readonly id: ComponentId; readonly health: Health; readonly connectivity: Connectivity; readonly freshness: Freshness; readonly basis: readonly string[]; readonly evidence: readonly string[]; readonly check?: 'failing' }` — `basis` and `evidence` are evidence ids.
  - `interface DomainDependency { readonly from: ComponentId; readonly to: ComponentId; readonly truth: TruthLabel | 'unknown'; readonly evidence: readonly string[] }`.
  - `interface DomainFixture { readonly investigationId: string; readonly now: string; readonly sources: readonly SourceAuthority[]; readonly evidence: Readonly<Record<string, EvidenceReference>>; readonly components: readonly DomainComponent[]; readonly dependencies: readonly DomainDependency[] }`.
- `fixture.ts`: `export const DOMAIN: DomainFixture` with
  - `investigationId: 'INV-DEMO-7'`, `now: '2026-11-16T14:09:00Z'`;
  - `sources: Object.values(SOURCES)` (V1 `fixture/inv-demo-7.ts`);
  - `evidence`: V1 `EVIDENCE` values keyed by id (E-1..E-7) plus E-8 and E-9 declared here with the exact values from `design-lab/v2/fixtures/world.ts`;
  - components: `pos` (unknown, not_configured, unknown, basis [], evidence []), `stock-sync` (unknown, not_configured, unknown, basis ['E-6'], evidence ['E-1','E-2','E-3','E-6'], check 'failing'), `inventory` (healthy, reachable, stale, basis ['E-5'], evidence ['E-5']);
  - dependencies: `pos→stock-sync` (unknown, []), `stock-sync→inventory` (hypothesis, []) — ruling: V2's reading, because V1's only basis for "authored" is E-7, which was never read (`notReadReason: 'unavailable'`).
- `scope.ts`: `scopeFixture(f: DomainFixture, persona: Persona): DomainFixture` — `technical` returns `f` itself; otherwise removes evidence whose `visibility` is `'technical'` from `evidence`, every component's `basis`/`evidence`, and every dependency's `evidence`; drops a dependency only when it had evidence and none remains; a component whose non-empty basis becomes empty gets `health: 'unknown'` and `freshness: 'unknown'` (components carry no provider, matching V2 `scopeState`). Memoize per (fixture, persona) like `authorizedWorld` (WeakMap).
- `toV1.ts`:
  - `toV1Nodes(f: DomainFixture): MapNode[]` — `{ id, state: { connectivity, freshness, health, basis: basis ids resolved to f.evidence objects }, check? }`, same key order as V1 `NODES`.
  - `toV1Evidence(f: DomainFixture): EvidenceReference[]` — evidence restricted to ids present in V1 (`E-1`..`E-7`), in id order.
  - `toV1EdgeKind(truth: DomainDependency['truth']): EdgeKind` — `observed`/`approved` → `authored`, `correlated`/`proposed` → `provisional`, `hypothesis`/`unknown` → `hypothesis`.
- `toV2.ts`:
  - `type V2NodeSlice = Pick<WorldNode, 'id' | 'state' | 'evidence' | 'check'>`; `toV2Nodes(f): V2NodeSlice[]`.
  - `type V2EdgeSlice = Pick<WorldEdge, 'a' | 'b' | 'truth' | 'evidence'>`; `toV2Edges(f): V2EdgeSlice[]` (`a = from`, `b = to`).
  - `toV2EvidenceById(f): Readonly<Record<string, EvidenceReference>>`.

- [ ] **Step 1: Write `parity.test.ts`** with these tests (helper `slice(n)` picks `id, state, evidence, check` from a V2 `WorldNode`, omitting `check` when undefined):
  - `toV1 nodes equal the V1 inv-demo-7 nodes`: `expect(toV1Nodes(DOMAIN)).toEqual(NODES)` (V1 `fixture/inv-demo-7`).
  - `toV1 evidence equals the V1 evidence`: `expect(toV1Evidence(DOMAIN)).toEqual(Object.values(EVIDENCE))`.
  - `toV1 sources equal the V1 sources`: `expect(DOMAIN.sources).toEqual(Object.values(SOURCES))`.
  - `toV2 nodes equal the V2 nodes for the shared components`: for `pos`, `stock-sync`, `inventory`, `toV2Nodes(DOMAIN)` entry equals `slice(WORLD.nodes entry)` (V2 `design-lab/v2/fixtures/world`).
  - `toV2 evidence equals the V2 evidenceById`: `expect(toV2EvidenceById(DOMAIN)).toEqual(WORLD.evidenceById)`.
  - `toV2 dependencies equal the V2 dep edges between shared components`: V2 edges with `cls === 'dep'` whose `a` and `b` are both shared components, mapped to `{a,b,truth,evidence}`, equal `toV2Edges(DOMAIN)` (order-insensitive: sort by `a+b`).
  - For each persona in `['owner','nontechnical']`, `scoped V2 projection equals authorizedWorld for <persona>`: `toV2EvidenceById(scopeFixture(DOMAIN, p))` equals `authorizedWorld(WORLD, p).evidenceById`; each shared node of `toV2Nodes(scopeFixture(DOMAIN, p))` equals `slice` of the same node in `authorizedWorld(WORLD, p).nodes`; `JSON.stringify(scopeFixture(DOMAIN, p))` does not contain `E-5`.
  - `technical gets the unscoped fixture`: `expect(scopeFixture(DOMAIN, 'technical')).toBe(DOMAIN)`; E-5 present.
  - `scoping keeps an evidence-free dependency and drops one whose only evidence is withheld`: build a fixture `{...DOMAIN, dependencies: [{from:'pos',to:'stock-sync',truth:'unknown',evidence:[]},{from:'stock-sync',to:'inventory',truth:'observed',evidence:['E-5']}]}`; owner scope keeps only the first.
  - `inventory is unknown, never healthy, once its only basis is withheld`: owner-scoped `inventory` has `health: 'unknown'`.
  - `projections do not mutate shared V1 evidence`: `const before = structuredClone(EVIDENCE)`; run every projection and both scopes twice; `expect(EVIDENCE).toEqual(before)`; second results `toEqual` first.
  - Known divergences, as `it.fails` with a comment naming the follow-up:
    - `it.fails('V1 world edge stock-sync→inventory agrees with the canonical truth (BACK-71 finding: V1 says authored on unread E-7)')`: find the RT project edge `stock-sync→inventory` in V1 `WORLD` (`fixture/world`) and `expect(edge.kind).toBe(toV1EdgeKind('hypothesis'))`.
    - `it.fails('V1 evidence view hides the Technical-only id from Owner (S2 / BACK-73)')`: `expect(evidenceViewFor('owner', EVIDENCE.sentryErrors).id).not.toBe('E-5')` (import `evidenceViewFor` from `view/evidence`; use the V1 key that holds E-5).
- [ ] **Step 2:** Run `cd app && npx vitest run src/domain/parity.test.ts`. Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement the five files per Interfaces.
- [ ] **Step 4:** Run the focused test. Expected: all PASS, with the two `it.fails` reported as expected failures. If any non-`fails` parity test fails, STOP and report the mismatch (BACK-71 stop rule) instead of editing V1/V2 files or weakening the assertion.
- [ ] **Step 5:** Run `cd app && npm run check`. Expected: tsc clean, all suites pass, coverage thresholds unchanged.
- [ ] **Step 6:** Commit `feat: canonical synthetic fixture with V1/V2 projections and parity tests (BACK-71)` with the session attribution lines.
