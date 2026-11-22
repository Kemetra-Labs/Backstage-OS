// The single canonical synthetic fixture for INV-DEMO-7. Every value is invented. It owns the overlap facts (sources, evidence
// E-1..E-9, the components pos, stock-sync and inventory, and the dependencies between them). The V1 fixture and the V2 world
// read them through toV1.ts and toV2.ts (BACK-83); nothing else in the app defines these facts.
import { EVIDENCE, EXTRA_EVIDENCE, SOURCES } from './records';
import type { DomainFixture } from './types';

const evidenceList = [...Object.values(EVIDENCE), ...Object.values(EXTRA_EVIDENCE)];

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
    // Ruling (BACK-71): V2's reading. V1's world still says authored on E-7, which was never read (notReadReason 'unavailable').
    // That V1 edge is NOT projected from here: changing it would change the V1 map, an owner decision (BACK-83 report).
    { from: 'stock-sync', to: 'inventory', truth: 'hypothesis', evidence: [] },
  ],
};
