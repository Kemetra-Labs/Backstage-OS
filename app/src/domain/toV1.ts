// Projection of the canonical fixture onto the V1 contract shapes.
import type { DisplayState, EvidenceReference, MapNode } from '../contract/types';
import type { EdgeKind } from '../contract/world';
import { resolveEvidence } from './resolve';
import type { ComponentId, DomainDependency, DomainFixture } from './types';

const V1_EVIDENCE_IDS: readonly string[] = ['E-1', 'E-2', 'E-3', 'E-4', 'E-5', 'E-6', 'E-7'];

export function toV1Nodes(f: DomainFixture): MapNode[] {
  return f.components.map((c) => ({
    id: c.id,
    ...(c.check ? { check: c.check } : {}),
    state: { connectivity: c.connectivity, freshness: c.freshness, health: c.health, basis: resolveEvidence(f, c.basis) },
  }));
}

/** The V1 world's per-component facts for one canonical component: its DisplayState and whether its check is failing. */
export function toV1ComponentFacts(f: DomainFixture, id: ComponentId): { readonly state: DisplayState; readonly checkFailing?: true } {
  const n = toV1Nodes(f).find((x) => x.id === id);
  if (!n) throw new Error(`canonical fixture has no component ${id}`);
  return { state: n.state, ...(n.check ? { checkFailing: true as const } : {}) };
}

export function toV1Evidence(f: DomainFixture): EvidenceReference[] {
  return resolveEvidence(f, V1_EVIDENCE_IDS);
}

export function toV1EdgeKind(truth: DomainDependency['truth']): EdgeKind {
  switch (truth) {
    case 'observed': case 'approved': return 'authored';
    case 'correlated': case 'proposed': return 'provisional';
    case 'hypothesis': case 'unknown': return 'hypothesis';
  }
}
