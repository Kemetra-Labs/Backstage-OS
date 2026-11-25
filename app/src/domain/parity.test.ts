import { describe, expect, it } from 'vitest';
import type { Persona } from '../contract/types';
import { WORLD } from '../fixture/world';
import { EVIDENCE, INV_DEMO_7, SOURCES } from '../fixture/inv-demo-7';
import { authorizedWorld } from '../view/authorize';
import { nodeStatus } from '../lenses/logic/status';
import type { GraphNode } from '../contract/world';
import { evidenceViewFor } from '../view/evidence';
import { caseEvidence, catalogueEvidence, triadOf } from '../view/world';
import { DOMAIN } from './fixture';
import { scopeFixture } from './scope';
import { canonicalEvidence, edgeKindOf, graphEdgeSlices, graphNodeSlices, investigationEvidence, investigationNodes } from './project';
import type { DomainFixture } from './types';

const SHARED = ['pos', 'stock-sync', 'inventory'] as const;
const isShared = (id: string): boolean => (SHARED as readonly string[]).includes(id);

const slice = (n: GraphNode) => ({
  id: n.id, state: n.state, evidence: n.evidence, ...(n.check !== undefined ? { check: n.check } : {}),
});
const byId = <T extends { id: string }>(xs: readonly T[], id: string): T => {
  const x = xs.find((n) => n.id === id);
  if (!x) throw new Error(`missing ${id}`);
  return x;
};
/** The mission's case evidence of a world, by id: what the mission screens list. */
const caseMap = (w: Parameters<typeof caseEvidence>[0]) => Object.fromEntries(caseEvidence(w).map((e) => [e.id, e]));
const edgeKey = (e: { a: string; b: string }): string => e.a + e.b;

describe('canonical fixture parity', () => {
  it('the investigation evidence projection equals the investigation evidence', () => {
    expect(investigationEvidence(DOMAIN)).toEqual(Object.values(EVIDENCE));
  });

  it('the canonical sources equal the investigation sources', () => {
    expect(DOMAIN.sources).toEqual(Object.values(SOURCES));
  });

  it('the canonical evidence equals the mission case evidence', () => {
    expect(canonicalEvidence(DOMAIN)).toEqual(caseMap(WORLD));
  });

  it('the lens dep edges between shared components are the canonical dependencies', () => {
    const expected = [...graphEdgeSlices(DOMAIN)].sort((x, y) => edgeKey(x).localeCompare(edgeKey(y)));
    const actual = WORLD.graph.edges
      .filter((e) => e.cls === 'dep' && isShared(e.a) && isShared(e.b))
      .map((e) => ({ a: e.a, b: e.b, truth: e.truth, evidence: e.evidence }))
      .sort((x, y) => edgeKey(x).localeCompare(edgeKey(y)));
    expect(actual).toEqual(expected);
  });

  // Same facts through both consumers, as each consumer derives them (host triadOf on its world, lens nodeStatus on its world),
  // against what the canonical model says once it is scoped for the persona. Language never enters these facts.
  const all: Persona[] = ['owner', 'technical', 'nontechnical'];
  for (const p of all) {
    it(`host and lens give the same health, freshness, failing check and basis for ${p}`, () => {
      const canon = investigationNodes(scopeFixture(DOMAIN, p));
      const rt = byId(authorizedWorld(WORLD, p).projects, 'RT');
      const w2 = authorizedWorld(WORLD, p);
      for (const c of canon) {
        const want = { health: triadOf(c.state).health, freshness: triadOf(c.state).freshness, check: c.check === 'failing', basis: c.state.basis.map((b) => b.id) };
        const k1 = byId(rt.components, c.id);
        const got1 = { health: triadOf(k1.state).health, freshness: triadOf(k1.state).freshness, check: k1.checkFailing === true, basis: k1.state.basis.map((b) => b.id) };
        const k2 = byId(w2.graph.nodes, c.id);
        const st2 = nodeStatus(k2);
        const got2 = { health: st2.health, freshness: st2.freshness, check: st2.checkFailing, basis: k2.state.basis.map((b) => b.id) };
        expect(got1, `host ${p}/${c.id}`).toEqual(want);
        expect(got2, `lens ${p}/${c.id}`).toEqual(want);
        expect(k2.evidence, `lens evidence ids ${p}/${c.id}`).toEqual(scopeFixture(DOMAIN, p).components.find((x) => x.id === c.id)!.evidence);
      }
    });

    it(`host and lens list the same canonical evidence ids for ${p}`, () => {
      const scoped = scopeFixture(DOMAIN, p);
      const canonIds = investigationEvidence(scoped).map((e) => e.id).sort();
      const inCanon = new Set(Object.keys(DOMAIN.evidence));
      const catalogueIds = catalogueEvidence(authorizedWorld(WORLD, p)).map((e) => e.id).filter((id) => inCanon.has(id)).sort();
      expect(catalogueIds).toEqual(canonIds);
      expect(Object.keys(caseMap(authorizedWorld(WORLD, p))).sort()).toEqual(Object.keys(scoped.evidence).sort());
    });

    it(`source provenance for the five sources is the same object through host and lens for ${p}`, () => {
      for (const s of DOMAIN.sources) {
        const mission = WORLD.sources.find((m) => m.provider === s.provider);
        expect(mission?.source, `lens ${s.provider}`).toBe(s);
        expect(INV_DEMO_7.sources, `host ${s.provider}`).toContain(s);
      }
    });
  }

  it('Unknown is never Healthy for a lay persona where the basis is withheld, in either consumer', () => {
    for (const p of ['owner', 'nontechnical'] as const) {
      expect(triadOf(byId(byId(authorizedWorld(WORLD, p).projects, 'RT').components, 'inventory').state).health).toBe('unknown');
      expect(nodeStatus(byId(authorizedWorld(WORLD, p).graph.nodes, 'inventory')).health).toBe('unknown');
    }
    expect(triadOf(byId(byId(WORLD.projects, 'RT').components, 'inventory').state).health).toBe('unknown');
  });

  // Withheld-only scenario. Inventory's whole basis and evidence is the Technical-only E-5, so for a lay persona every
  // consumer-held structure for the overlap must carry no trace of E-5 or its observation O-5: ids, counts, edges, sources.
  it('no trace of E-5 or O-5 in what either consumer holds for a lay persona', () => {
    for (const p of ['owner', 'nontechnical'] as const) {
      const portfolio = JSON.stringify(authorizedWorld(WORLD, p));
      const mission = JSON.stringify(authorizedWorld(WORLD, p));
      const f = JSON.stringify(scopeFixture(DOMAIN, p));
      for (const [name, json] of [['host world', portfolio], ['lens world', mission], ['canonical', f]] as const) {
        expect(json, `${name} ${p}`).not.toMatch(/"E-5"|"O-5"/);
      }
    }
    // Positive control: Technical still holds it, so the checks above are not vacuous.
    expect(JSON.stringify(authorizedWorld(WORLD, 'technical'))).toMatch(/"E-5"/);
    expect(JSON.stringify(authorizedWorld(WORLD, 'technical'))).toMatch(/"E-5"/);
  });

  const scoped: Persona[] = ['owner', 'nontechnical'];
  for (const p of scoped) {
    it(`scoped lens projection equals authorizedWorld for ${p}`, () => {
      const f = scopeFixture(DOMAIN, p);
      const w = authorizedWorld(WORLD, p);
      expect(canonicalEvidence(f)).toEqual(caseMap(w));
      const nodes = graphNodeSlices(f);
      for (const id of SHARED) expect(byId(nodes, id)).toEqual(slice(byId(w.graph.nodes, id)));
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
    const inv = byId(investigationNodes(scopeFixture(DOMAIN, 'owner')), 'inventory');
    expect(inv.state.health).toBe('unknown');
    expect(inv.state.basis).toEqual([]);
  });

  it('projections do not mutate shared host evidence', () => {
    const before = structuredClone(EVIDENCE);
    const run = () => ({
      portfolio: investigationNodes(DOMAIN), v1e: investigationEvidence(DOMAIN), v2n: graphNodeSlices(DOMAIN), v2e: graphEdgeSlices(DOMAIN), v2ev: canonicalEvidence(DOMAIN),
      so: scopeFixture(DOMAIN, 'owner'), sn: scopeFixture(DOMAIN, 'nontechnical'),
    });
    const first = structuredClone(run());
    const second = structuredClone(run());
    expect(EVIDENCE).toEqual(before);
    expect(second).toEqual(first);
  });

  const projectEdge = () => WORLD.projects.find((p) => p.id === 'RT')?.edges.find((e) => e.from === 'stock-sync' && e.to === 'inventory');

  it('host world edge stock-sync→inventory is authored on E-7 today (pins the known divergence)', () => {
    expect(WORLD.projects.some((p) => p.id === 'RT')).toBe(true);
    expect(projectEdge()).toBeDefined();
    expect(projectEdge()?.kind).toBe('authored');
    expect(projectEdge()?.basis.map((b) => b.id)).toEqual(['E-7']);
  });

  it('host has no evidence view of E-5 for Owner: the scoped world omits it and the projection refuses it (BACK-73, BACK-92 R7)', () => {
    expect(authorizedWorld(WORLD, 'owner').evidence['E-5']).toBeUndefined();
    expect(() => evidenceViewFor('owner', EVIDENCE.sentryErrors)).toThrow(/unscoped evidence/);
  });

  // Known divergences. Each is expected to fail until the named follow-up lands.
  it.fails('host world edge stock-sync→inventory agrees with the canonical truth (BACK-71 finding: host says authored on unread E-7)', () => {
    const edge = projectEdge();
    expect(edge).toBeDefined();
    expect(edge?.kind).toBe(edgeKindOf('hypothesis'));
  });
});
