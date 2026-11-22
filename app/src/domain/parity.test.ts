import { describe, expect, it } from 'vitest';
import type { EvidenceReference, Persona } from '../contract/types';
import { WORLD as V1_WORLD } from '../fixture/world';
import { EVIDENCE, NODES, SOURCES } from '../fixture/inv-demo-7';
import { authorizedWorld } from '../design-lab/v2/logic/authorize';
import { WORLD } from '../design-lab/v2/fixtures/world';
import type { WorldNode } from '../design-lab/v2/types';
import { evidenceViewFor } from '../view/evidence';
import { DOMAIN } from './fixture';
import { scopeFixture } from './scope';
import { toV1EdgeKind, toV1Evidence, toV1Nodes } from './toV1';
import { toV2Edges, toV2EvidenceById, toV2Nodes } from './toV2';
import type { DomainFixture } from './types';

const SHARED = ['pos', 'stock-sync', 'inventory'] as const;
const isShared = (id: string): boolean => (SHARED as readonly string[]).includes(id);

const slice = (n: WorldNode) => ({
  id: n.id, state: n.state, evidence: n.evidence, ...(n.check !== undefined ? { check: n.check } : {}),
});
const byId = <T extends { id: string }>(xs: readonly T[], id: string): T => {
  const x = xs.find((n) => n.id === id);
  if (!x) throw new Error(`missing ${id}`);
  return x;
};
const edgeKey = (e: { a: string; b: string }): string => e.a + e.b;

describe('canonical fixture parity', () => {
  it('toV1 nodes equal the V1 inv-demo-7 nodes', () => {
    expect(toV1Nodes(DOMAIN)).toEqual(NODES);
  });

  it('toV1 evidence equals the V1 evidence', () => {
    expect(toV1Evidence(DOMAIN)).toEqual(Object.values(EVIDENCE));
  });

  it('toV1 sources equal the V1 sources', () => {
    expect(DOMAIN.sources).toEqual(Object.values(SOURCES));
  });

  it('toV2 nodes equal the V2 nodes for the shared components', () => {
    const nodes = toV2Nodes(DOMAIN);
    for (const id of SHARED) expect(byId(nodes, id)).toEqual(slice(byId(WORLD.nodes, id)));
  });

  it('toV2 evidence equals the V2 evidenceById', () => {
    expect(toV2EvidenceById(DOMAIN)).toEqual(WORLD.evidenceById);
  });

  it('toV2 dependencies equal the V2 dep edges between shared components', () => {
    const expected = WORLD.edges
      .filter((e) => e.cls === 'dep' && isShared(e.a) && isShared(e.b))
      .map((e) => ({ a: e.a, b: e.b, truth: e.truth, evidence: e.evidence }))
      .sort((x, y) => edgeKey(x).localeCompare(edgeKey(y)));
    const actual = [...toV2Edges(DOMAIN)].sort((x, y) => edgeKey(x).localeCompare(edgeKey(y)));
    expect(actual).toEqual(expected);
  });

  const scoped: Persona[] = ['owner', 'nontechnical'];
  for (const p of scoped) {
    it(`scoped V2 projection equals authorizedWorld for ${p}`, () => {
      const f = scopeFixture(DOMAIN, p);
      const w = authorizedWorld(WORLD, p);
      expect(toV2EvidenceById(f)).toEqual(w.evidenceById);
      const nodes = toV2Nodes(f);
      for (const id of SHARED) expect(byId(nodes, id)).toEqual(slice(byId(w.nodes, id)));
      expect(JSON.stringify(f)).not.toContain('E-5');
    });
  }

  it('technical gets the unscoped fixture', () => {
    expect(scopeFixture(DOMAIN, 'technical')).toBe(DOMAIN);
    expect(DOMAIN.evidence['E-5']).toBeDefined();
  });

  it('scoping keeps an evidence-free dependency and drops one whose only evidence is withheld', () => {
    const f: DomainFixture = {
      ...DOMAIN,
      dependencies: [
        { from: 'pos', to: 'stock-sync', truth: 'unknown', evidence: [] },
        { from: 'stock-sync', to: 'inventory', truth: 'observed', evidence: ['E-5'] },
      ],
    };
    const s = scopeFixture(f, 'owner');
    expect(s.dependencies).toEqual([{ from: 'pos', to: 'stock-sync', truth: 'unknown', evidence: [] }]);
  });

  it('inventory is unknown, never healthy, once its only basis is withheld', () => {
    const inv = byId(toV1Nodes(scopeFixture(DOMAIN, 'owner')), 'inventory');
    expect(inv.state.health).toBe('unknown');
    expect(inv.state.basis).toEqual([]);
  });

  it('projections do not mutate shared V1 evidence', () => {
    const before = structuredClone(EVIDENCE);
    const run = () => ({
      v1: toV1Nodes(DOMAIN), v1e: toV1Evidence(DOMAIN), v2n: toV2Nodes(DOMAIN), v2e: toV2Edges(DOMAIN), v2ev: toV2EvidenceById(DOMAIN),
      so: scopeFixture(DOMAIN, 'owner'), sn: scopeFixture(DOMAIN, 'nontechnical'),
    });
    const first = structuredClone(run());
    const second = structuredClone(run());
    expect(EVIDENCE).toEqual(before);
    expect(second).toEqual(first);
  });

  // Known divergences. Each is expected to fail until the named follow-up lands.
  it.fails('V1 world edge stock-sync→inventory agrees with the canonical truth (BACK-71 finding: V1 says authored on unread E-7)', () => {
    const edge = V1_WORLD.projects.find((p) => p.id === 'RT')?.edges.find((e) => e.from === 'stock-sync' && e.to === 'inventory');
    expect(edge).toBeDefined();
    expect(edge?.kind).toBe(toV1EdgeKind('hypothesis'));
  });

  // Follow-up: S2 / BACK-73.
  it.fails('V1 evidence view hides the Technical-only id from Owner (S2 / BACK-73)', () => {
    const ref: EvidenceReference = EVIDENCE.sentryErrors;
    expect(evidenceViewFor('owner', ref).id).not.toBe('E-5');
  });
});
