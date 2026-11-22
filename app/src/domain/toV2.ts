// Projection of the canonical fixture onto the V2 design-lab world shapes (the slices the canonical model owns).
import type { EvidenceReference } from '../contract/types';
import type { WorldEdge, WorldNode } from '../design-lab/v2/types';
import { resolveEvidence } from './resolve';
import type { ComponentId, DomainFixture } from './types';

export type V2NodeSlice = Pick<WorldNode, 'id' | 'state' | 'evidence' | 'check'>;
export type V2EdgeSlice = Pick<WorldEdge, 'a' | 'b' | 'truth' | 'evidence'>;

export function toV2Nodes(f: DomainFixture): V2NodeSlice[] {
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

export function toV2Edges(f: DomainFixture): V2EdgeSlice[] {
  return f.dependencies.map((d) => ({ a: d.from, b: d.to, truth: d.truth, evidence: d.evidence }));
}

/** The canonical facts for one V2 node (state, evidence ids, failing check), without its id, layout or copy keys. */
export function toV2NodeFacts(f: DomainFixture, id: ComponentId): Omit<V2NodeSlice, 'id'> {
  const n = toV2Nodes(f).find((x) => x.id === id);
  if (!n) throw new Error(`canonical fixture has no component ${id}`);
  const { id: _id, ...facts } = n;
  return facts;
}

/** The canonical truth and evidence ids for the dependency a to b. */
export function toV2EdgeFacts(f: DomainFixture, a: ComponentId, b: ComponentId): Pick<V2EdgeSlice, 'truth' | 'evidence'> {
  const e = toV2Edges(f).find((x) => x.a === a && x.b === b);
  if (!e) throw new Error(`canonical fixture has no dependency ${a} to ${b}`);
  return { truth: e.truth, evidence: e.evidence };
}

export function toV2EvidenceById(f: DomainFixture): Readonly<Record<string, EvidenceReference>> {
  return f.evidence;
}
