// The single canonical synthetic fixture for INV-DEMO-7. Sources and E-1..E-7 come from the V1 fixture; E-8 and E-9 are
// declared here with the values V2 uses. Every value is invented.
import type { EvidenceReference, Observation, SourceAuthority } from '../contract/types';
import { EVIDENCE, SOURCES } from '../fixture/inv-demo-7';
import type { DomainFixture } from './types';

const ghTarget = { kind: 'component', id: 'component:github', label: 'GitHub API (synthetic)' } as const;
const portTarget = { kind: 'component', id: 'component:port-catalog', label: 'Port catalogue (synthetic)' } as const;

const obs = (id: string, target: Observation['target'], src: SourceAuthority, at: string): Observation => ({
  id, target, source: src, observedAt: at, ingestedAt: at, environment: 'ci',
});

/** E-8: a current Observed read of GitHub itself. */
const ghProbe: EvidenceReference = {
  id: 'E-8', classification: 'observed', freshness: 'current', visibility: 'all',
  observation: obs('O-8', ghTarget, SOURCES.github, '2026-11-16T14:03:00Z'),
};

/** E-9: Port's last good read, a day old. */
const portLast: EvidenceReference = {
  id: 'E-9', classification: 'observed', freshness: 'stale', visibility: 'all',
  observation: obs('O-9', portTarget, SOURCES.port, '2026-11-15T13:09:00Z'),
};

const evidenceList: readonly EvidenceReference[] = [...Object.values(EVIDENCE), ghProbe, portLast];

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
