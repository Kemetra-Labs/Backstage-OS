// The single canonical synthetic fixture for INV-DEMO-7. Every value is invented.
// For now it collects the existing records instead of copying them: sources and E-1..E-7 from the V1 fixture, E-8 and E-9
// (GitHub probe, Port's last good read) from the V2 fixture. A later S3b step inverts this so V1 and V2 import from here.
import type { EvidenceReference } from '../contract/types';
import { WORLD as V2_WORLD } from '../design-lab/v2/fixtures/world';
import { EVIDENCE, SOURCES } from '../fixture/inv-demo-7';
import type { DomainFixture } from './types';

const fromV2 = (id: string): EvidenceReference => {
  const e = V2_WORLD.evidenceById[id];
  if (!e) throw new Error(`canonical fixture: V2 fixture has no ${id}`);
  return e;
};

const evidenceList: readonly EvidenceReference[] = [...Object.values(EVIDENCE), fromV2('E-8'), fromV2('E-9')];

export const DOMAIN: DomainFixture = {
  investigationId: 'INV-DEMO-7',
  now: '2026-11-16T14:09:00Z',
  sources: Object.values(SOURCES),
  evidence: Object.fromEntries(evidenceList.map((e) => [e.id, e])),
  components: [
    { id: 'pos', health: 'unknown', connectivity: 'not_configured', freshness: 'unknown', basis: [], evidence: [] },
    {
      id: 'stock-sync', health: 'unknown', connectivity: 'not_configured', freshness: 'unknown',
      basis: ['E-6'], evidence: ['E-1', 'E-2', 'E-3', 'E-6'], check: 'failing',
    },
    // The last stale read said healthy. The contract turns that into unknown.
    { id: 'inventory', health: 'healthy', connectivity: 'reachable', freshness: 'stale', basis: ['E-5'], evidence: ['E-5'] },
  ],
  dependencies: [
    { from: 'pos', to: 'stock-sync', truth: 'unknown', evidence: [] },
    // Ruling: V2's reading. V1's only basis for "authored" is E-7, which was never read (notReadReason 'unavailable').
    { from: 'stock-sync', to: 'inventory', truth: 'hypothesis', evidence: [] },
  ],
};
