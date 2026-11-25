// Projections of the canonical fixture onto the shapes the world and the investigation use: the project components and
// investigation map nodes (MapNode, WorldComponent facts) and the mission graph's nodes and dependency edges (GraphNode, GraphEdge).
import type { DisplayState, EvidenceReference, MapNode } from '../contract/types';
import type { EdgeKind, GraphEdge, GraphNode } from '../contract/world';
import { resolveEvidence } from './resolve';
import type { ComponentId, DomainDependency, DomainFixture } from './types';

/** The evidence the investigation room lists: E-1..E-7. E-8 and E-9 are reads of a source itself (World.sourceProbes). */
const INVESTIGATION_EVIDENCE_IDS: readonly string[] = ['E-1', 'E-2', 'E-3', 'E-4', 'E-5', 'E-6', 'E-7'];

/** The investigation's map nodes: one per canonical component, with its DisplayState and failing check. */
export function investigationNodes(f: DomainFixture): MapNode[] {
  return f.components.map((c) => ({
    id: c.id,
    ...(c.check ? { check: c.check } : {}),
    state: { connectivity: c.connectivity, freshness: c.freshness, health: c.health, basis: resolveEvidence(f, c.basis) },
  }));
}

/** A project component's facts for one canonical component: its DisplayState and whether its check is failing. */
export function componentFacts(f: DomainFixture, id: ComponentId): { readonly state: DisplayState; readonly checkFailing?: true } {
  const n = investigationNodes(f).find((x) => x.id === id);
  if (!n) throw new Error(`canonical fixture has no component ${id}`);
  return { state: n.state, ...(n.check ? { checkFailing: true as const } : {}) };
}

export function investigationEvidence(f: DomainFixture): EvidenceReference[] {
  return resolveEvidence(f, INVESTIGATION_EVIDENCE_IDS);
}

/** How a project map draws a canonical dependency truth. */
export function edgeKindOf(truth: DomainDependency['truth']): EdgeKind {
  switch (truth) {
    case 'observed': case 'approved': return 'authored';
    case 'correlated': case 'proposed': return 'provisional';
    case 'hypothesis': case 'unknown': return 'hypothesis';
  }
}

export type GraphNodeSlice = Pick<GraphNode, 'id' | 'state' | 'evidence' | 'check'>;
export type GraphEdgeSlice = Pick<GraphEdge, 'a' | 'b' | 'truth' | 'evidence'>;

/** The mission graph's view of each canonical component (the slices the canonical model owns). */
export function graphNodeSlices(f: DomainFixture): GraphNodeSlice[] {
  return f.components.map((c) => ({
    id: c.id,
    state: {
      connectivity: c.connectivity,
      freshness: c.freshness,
      health: c.health,
      basis: resolveEvidence(f, c.basis),
    },
    evidence: c.evidence,
    ...(c.check ? { check: c.check } : {}),
  }));
}

export function graphEdgeSlices(f: DomainFixture): GraphEdgeSlice[] {
  return f.dependencies.map((d) => ({ a: d.from, b: d.to, truth: d.truth, evidence: d.evidence }));
}

/** The canonical facts for one graph node (state, evidence ids, failing check), without its id, layout or copy keys. */
export function graphNodeFacts(f: DomainFixture, id: ComponentId): Omit<GraphNodeSlice, 'id'> {
  const n = graphNodeSlices(f).find((x) => x.id === id);
  if (!n) throw new Error(`canonical fixture has no component ${id}`);
  const { id: _id, ...facts } = n;
  return facts;
}

/** The canonical truth and evidence ids for the dependency a to b. */
export function graphEdgeFacts(f: DomainFixture, a: ComponentId, b: ComponentId): Pick<GraphEdgeSlice, 'truth' | 'evidence'> {
  const e = graphEdgeSlices(f).find((x) => x.a === a && x.b === b);
  if (!e) throw new Error(`canonical fixture has no dependency ${a} to ${b}`);
  return { truth: e.truth, evidence: e.evidence };
}

/** Every canonical evidence record by id (E-1..E-9): the mission's case evidence. */
export function canonicalEvidence(f: DomainFixture): Readonly<Record<string, EvidenceReference>> {
  return f.evidence;
}
