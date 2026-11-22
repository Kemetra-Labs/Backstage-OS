// Projection of the canonical fixture onto the V2 design-lab world shapes (the slices the canonical model owns).
import type { EvidenceReference } from '../contract/types';
import type { WorldEdge, WorldNode } from '../design-lab/v2/types';
import type { DomainFixture } from './types';

export type V2NodeSlice = Pick<WorldNode, 'id' | 'state' | 'evidence' | 'check'>;
export type V2EdgeSlice = Pick<WorldEdge, 'a' | 'b' | 'truth' | 'evidence'>;

export function toV2Nodes(f: DomainFixture): V2NodeSlice[] {
  return f.components.map((c) => ({
    id: c.id,
    state: {
      connectivity: c.connectivity,
      freshness: c.freshness,
      health: c.health,
      basis: c.basis.flatMap((id) => { const e = f.evidence[id]; return e ? [e] : []; }),
    },
    evidence: c.evidence,
    ...(c.check ? { check: c.check } : {}),
  }));
}

export function toV2Edges(f: DomainFixture): V2EdgeSlice[] {
  return f.dependencies.map((d) => ({ a: d.from, b: d.to, truth: d.truth, evidence: d.evidence }));
}

export function toV2EvidenceById(f: DomainFixture): Readonly<Record<string, EvidenceReference>> {
  return f.evidence;
}
