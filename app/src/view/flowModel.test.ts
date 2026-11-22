import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../components/DepGraph';
import type { EvidenceReference, Persona } from '../contract/types';
import { WORLD } from '../fixture/world';
import { authorizedWorld } from './authorize';
import { FLOW_MIN_NODE_W, FLOW_PAD, layoutFor, toFlowModel } from './flowModel';
import { DEFAULT_FILTERS, mapFor } from './projectView';
import { triadOf } from './world';

const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];

/** Every evidence id in the world whose visibility is not 'all', found wherever it is referenced. */
function restrictedIds(root: unknown, out = new Set<string>()): string[] {
  if (Array.isArray(root)) root.forEach((x) => restrictedIds(x, out));
  else if (root && typeof root === 'object') {
    const o = root as { id?: unknown; visibility?: unknown };
    if (typeof o.id === 'string' && typeof o.visibility === 'string' && o.visibility !== 'all') out.add(o.id);
    Object.values(root).forEach((x) => restrictedIds(x, out));
  }
  return [...out];
}

const triad = triadOf({ health: 'unknown', freshness: 'unknown', connectivity: 'connected', basis: [] } as never);
const node = (id: string, col: number, row: number): GraphNode => ({ id, name: id, col, row, triad });
const ref = (id: string): EvidenceReference => ({ id, observation: null, classification: 'observed', freshness: 'unknown', visibility: 'all' });
const edge = (from: string, to: string, kind: GraphEdge['kind'] = 'authored', basis: readonly EvidenceReference[] = []): GraphEdge => ({ from, to, kind, basis });

describe('layoutFor', () => {
  it('keeps nodes at or above the minimum width and at least as wide as the container', () => {
    const wide = layoutFor(3, 2, 1200);
    expect(wide.width).toBeGreaterThanOrEqual(1200);
    expect(wide.nodeW).toBeGreaterThanOrEqual(FLOW_MIN_NODE_W);
    const narrow = layoutFor(5, 2, 400);
    expect(narrow.nodeW).toBe(FLOW_MIN_NODE_W);
    // Too wide for the container: the canvas is wider than it, so the reader pans and nothing is shrunk below 44 px.
    expect(narrow.width).toBeGreaterThan(400);
  });

  it('never returns a zero-size canvas', () => {
    const l = layoutFor(0, 0, 0);
    expect(l.width).toBeGreaterThan(0);
    expect(l.height).toBeGreaterThan(0);
  });
});

describe('toFlowModel', () => {
  const nodes = [node('a', 0, 0), node('b', 1, 0), node('c', 1, 1)];

  it('places nodes on the column/row grid, left to right, with the pad as origin', () => {
    const m = toFlowModel(nodes, [], 1000);
    const at = (id: string) => m.nodes.find((n) => n.id === id)!;
    expect(at('a').x).toBe(FLOW_PAD);
    expect(at('a').x).toBeLessThan(at('b').x);
    expect(at('b').x).toBe(at('c').x);
    expect(at('b').y).toBeLessThan(at('c').y);
    expect(m.nodes.every((n) => n.width === m.layout.nodeW)).toBe(true);
  });

  it('keeps edge certainty exactly as given and never upgrades it', () => {
    const m = toFlowModel(nodes, [edge('a', 'b', 'authored'), edge('b', 'c', 'provisional'), edge('a', 'c', 'hypothesis')], 1000);
    expect(m.edges.map((e) => e.kind)).toEqual(['authored', 'provisional', 'hypothesis']);
  });

  it('surfaces an edge with a missing endpoint as undrawn instead of dropping it', () => {
    const m = toFlowModel(nodes, [edge('a', 'b'), edge('a', 'ghost'), edge('ghost', 'c')], 1000);
    expect(m.edges).toHaveLength(1);
    expect(m.undrawn).toBe(2);
  });

  it('gives duplicate relations distinct ids', () => {
    const m = toFlowModel(nodes, [edge('a', 'b'), edge('a', 'b'), edge('a', 'b', 'hypothesis')], 1000);
    expect(new Set(m.edges.map((e) => e.id)).size).toBe(3);
  });

  it('carries no evidence reference into the flow model', () => {
    const m = toFlowModel(nodes, [edge('a', 'b', 'authored', [ref('E-5'), ref('E-12')])], 1000);
    const json = JSON.stringify({ edges: m.edges, layout: m.layout, ids: m.nodes.map((n) => n.id) });
    expect(json).not.toContain('E-5');
    expect(json).not.toContain('E-12');
    expect(Object.keys(m.edges[0]!).sort()).toEqual(['id', 'kind', 'source', 'target']);
  });
});

describe('flow model parity with the authorized project map, every persona and product', () => {
  for (const persona of PERSONAS) {
    const world = authorizedWorld(WORLD, persona);
    for (const p of world.projects) {
      it(`${persona}/${p.id}: same nodes, same edge kinds, nothing lost`, () => {
        const map = mapFor(p, DEFAULT_FILTERS);
        const gn: GraphNode[] = map.nodes.map((n) => ({ id: n.id, name: n.name, col: n.col, row: n.row, triad: n.triad, checkFailing: n.checkFailing }));
        const m = toFlowModel(gn, map.edges, 1100);
        expect(m.nodes.map((n) => n.id)).toEqual(map.nodes.map((n) => n.id));
        expect(m.edges.length + m.undrawn).toBe(map.edges.length);
        expect(m.edges.map((e) => e.kind)).toEqual(map.edges.map((e) => e.kind));
        // An Unknown component is never promoted to Healthy by the adapter.
        for (const n of m.nodes) expect(n.graph.triad.health).toBe(map.nodes.find((x) => x.id === n.id)!.triad.health);
      });

      it(`${persona}/${p.id}: no restricted evidence id appears anywhere in the flow model`, () => {
        const map = mapFor(p, DEFAULT_FILTERS);
        const gn: GraphNode[] = map.nodes.map((n) => ({ id: n.id, name: n.name, col: n.col, row: n.row, triad: n.triad }));
        const json = JSON.stringify(toFlowModel(gn, map.edges, 1100));
        const withheld = restrictedIds(WORLD);
        // The fixture really holds restricted evidence (E-5 on inventory, E-12 on payments), so this is not vacuous.
        expect(withheld).toEqual(expect.arrayContaining(['E-5', 'E-12']));
        // The adapter drops basis entirely, so no evidence id of any kind is present, for any persona.
        for (const id of withheld) expect(json.includes(`"${id}"`), `${persona}/${p.id}: ${id}`).toBe(false);
        expect(json).not.toMatch(/"E-\d+"/);
      });
    }
  }
});
