import { describe, expect, it } from 'vitest';
import type { Persona } from '../contract/types';
import { WORLD as V1_WORLD } from '../fixture/world';
import { EVIDENCE, INV_DEMO_7, SOURCES } from '../fixture/inv-demo-7';
import { authorizedWorld } from '../lenses/logic/authorize';
import { nodeStatus } from '../lenses/logic/status';
import { WORLD } from '../lenses/fixtures/world';
import type { WorldNode } from '../lenses/types';
import { authorizedWorld as v1Authorized } from '../view/authorize';
import { evidenceViewFor } from '../view/evidence';
import { triadOf } from '../view/world';
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
  it('toV1 evidence equals the V1 evidence', () => {
    expect(toV1Evidence(DOMAIN)).toEqual(Object.values(EVIDENCE));
  });

  it('toV1 sources equal the V1 sources', () => {
    expect(DOMAIN.sources).toEqual(Object.values(SOURCES));
  });

  it('toV2 evidence equals the V2 evidenceById', () => {
    expect(toV2EvidenceById(DOMAIN)).toEqual(WORLD.evidenceById);
  });

  it('the V2 dep edges between shared components are the canonical dependencies', () => {
    const expected = [...toV2Edges(DOMAIN)].sort((x, y) => edgeKey(x).localeCompare(edgeKey(y)));
    const actual = WORLD.edges
      .filter((e) => e.cls === 'dep' && isShared(e.a) && isShared(e.b))
      .map((e) => ({ a: e.a, b: e.b, truth: e.truth, evidence: e.evidence }))
      .sort((x, y) => edgeKey(x).localeCompare(edgeKey(y)));
    expect(actual).toEqual(expected);
  });

  // Same facts through both consumers, as each consumer derives them (V1 triadOf on its world, V2 nodeStatus on its world),
  // against what the canonical model says once it is scoped for the persona. Language never enters these facts.
  const all: Persona[] = ['owner', 'technical', 'nontechnical'];
  for (const p of all) {
    it(`V1 and V2 give the same health, freshness, failing check and basis for ${p}`, () => {
      const canon = toV1Nodes(scopeFixture(DOMAIN, p));
      const v1rt = byId(v1Authorized(V1_WORLD, p).projects, 'RT');
      const w2 = authorizedWorld(WORLD, p);
      for (const c of canon) {
        const want = { health: triadOf(c.state).health, freshness: triadOf(c.state).freshness, check: c.check === 'failing', basis: c.state.basis.map((b) => b.id) };
        const k1 = byId(v1rt.components, c.id);
        const got1 = { health: triadOf(k1.state).health, freshness: triadOf(k1.state).freshness, check: k1.checkFailing === true, basis: k1.state.basis.map((b) => b.id) };
        const k2 = byId(w2.nodes, c.id);
        const st2 = nodeStatus(k2);
        const got2 = { health: st2.health, freshness: st2.freshness, check: st2.checkFailing, basis: k2.state.basis.map((b) => b.id) };
        expect(got1, `V1 ${p}/${c.id}`).toEqual(want);
        expect(got2, `V2 ${p}/${c.id}`).toEqual(want);
        expect(k2.evidence, `V2 evidence ids ${p}/${c.id}`).toEqual(scopeFixture(DOMAIN, p).components.find((x) => x.id === c.id)!.evidence);
      }
    });

    it(`V1 and V2 list the same canonical evidence ids for ${p}`, () => {
      const scoped = scopeFixture(DOMAIN, p);
      const canonV1 = toV1Evidence(scoped).map((e) => e.id).sort();
      const inCanon = new Set(Object.keys(DOMAIN.evidence));
      const v1ids = Object.keys(v1Authorized(V1_WORLD, p).evidence).filter((id) => inCanon.has(id)).sort();
      expect(v1ids).toEqual(canonV1);
      expect(Object.keys(authorizedWorld(WORLD, p).evidenceById).sort()).toEqual(Object.keys(scoped.evidence).sort());
    });

    it(`source provenance for the five sources is the same object through V1 and V2 for ${p}`, () => {
      for (const s of DOMAIN.sources) {
        const v2 = WORLD.sources.find((m) => m.provider === s.provider);
        expect(v2?.source, `V2 ${s.provider}`).toBe(s);
        expect(INV_DEMO_7.sources, `V1 ${s.provider}`).toContain(s);
      }
    });
  }

  it('Unknown is never Healthy for a lay persona where the basis is withheld, in either consumer', () => {
    for (const p of ['owner', 'nontechnical'] as const) {
      expect(triadOf(byId(byId(v1Authorized(V1_WORLD, p).projects, 'RT').components, 'inventory').state).health).toBe('unknown');
      expect(nodeStatus(byId(authorizedWorld(WORLD, p).nodes, 'inventory')).health).toBe('unknown');
    }
    expect(triadOf(byId(byId(V1_WORLD.projects, 'RT').components, 'inventory').state).health).toBe('unknown');
  });

  // Withheld-only scenario. Inventory's whole basis and evidence is the Technical-only E-5, so for a lay persona every
  // consumer-held structure for the overlap must carry no trace of E-5 or its observation O-5: ids, counts, edges, sources.
  it('no trace of E-5 or O-5 in what either consumer holds for a lay persona', () => {
    for (const p of ['owner', 'nontechnical'] as const) {
      const v1 = JSON.stringify(v1Authorized(V1_WORLD, p));
      const v2 = JSON.stringify(authorizedWorld(WORLD, p));
      const f = JSON.stringify(scopeFixture(DOMAIN, p));
      for (const [name, json] of [['V1 world', v1], ['V2 world', v2], ['canonical', f]] as const) {
        expect(json, `${name} ${p}`).not.toMatch(/"E-5"|"O-5"/);
      }
    }
    // Positive control: Technical still holds it, so the checks above are not vacuous.
    expect(JSON.stringify(authorizedWorld(WORLD, 'technical'))).toMatch(/"E-5"/);
    expect(JSON.stringify(v1Authorized(V1_WORLD, 'technical'))).toMatch(/"E-5"/);
  });

  const scoped: Persona[] = ['owner', 'nontechnical'];
  for (const p of scoped) {
    it(`scoped V2 projection equals authorizedWorld for ${p}`, () => {
      const f = scopeFixture(DOMAIN, p);
      const w = authorizedWorld(WORLD, p);
      expect(toV2EvidenceById(f)).toEqual(w.evidenceById);
      const nodes = toV2Nodes(f);
      for (const id of SHARED) expect(byId(nodes, id)).toEqual(slice(byId(w.nodes, id)));
      const technicalIds = Object.values(DOMAIN.evidence).filter((e) => e.visibility === 'technical').map((e) => e.id);
      expect(technicalIds.length).toBeGreaterThan(0);
      const json = JSON.stringify(f);
      for (const id of technicalIds) expect(json).not.toContain(id);
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

  const v1Edge = () => V1_WORLD.projects.find((p) => p.id === 'RT')?.edges.find((e) => e.from === 'stock-sync' && e.to === 'inventory');

  it('V1 world edge stock-sync→inventory is authored on E-7 today (pins the known divergence)', () => {
    expect(V1_WORLD.projects.some((p) => p.id === 'RT')).toBe(true);
    expect(v1Edge()).toBeDefined();
    expect(v1Edge()?.kind).toBe('authored');
    expect(v1Edge()?.basis.map((b) => b.id)).toEqual(['E-7']);
  });

  it('V1 has no evidence view of E-5 for Owner: the scoped world omits it and the projection refuses it (BACK-73, BACK-92 R7)', () => {
    expect(v1Authorized(V1_WORLD, 'owner').evidence['E-5']).toBeUndefined();
    expect(() => evidenceViewFor('owner', EVIDENCE.sentryErrors)).toThrow(/unscoped evidence/);
  });

  // Known divergences. Each is expected to fail until the named follow-up lands.
  it.fails('V1 world edge stock-sync→inventory agrees with the canonical truth (BACK-71 finding: V1 says authored on unread E-7)', () => {
    const edge = v1Edge();
    expect(edge).toBeDefined();
    expect(edge?.kind).toBe(toV1EdgeKind('hypothesis'));
  });
});
