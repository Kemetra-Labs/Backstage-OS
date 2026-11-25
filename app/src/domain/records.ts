// The canonical synthetic records for INV-DEMO-7: the five sources and evidence E-1..E-9. Every value is invented. Keys use
// RT-DEMO-, links use *.example.invalid. These moved here from the two former fixtures (E-1..E-7 and E-8, E-9) in BACK-83, byte for
// byte, so each is defined once; the world and the investigation read them directly or through the projections in project.ts.
import type {
  EntityRef, EvidenceReference, Observation, Provider, SourceAuthority,
} from '../contract/types';

const source = (
  provider: Provider, connectivity: SourceAuthority['connectivity'], ageMinutes: number | null, ttlSeconds: number,
): SourceAuthority => ({
  provider,
  connectivity,
  ageMinutes,
  ttlSeconds,
  lastSuccessAt: ageMinutes === null ? null : '2026-11-16T14:03:00Z',
  synthetic: true,
});

export const SOURCES = {
  github: source('github', 'reachable', 6, 1800),
  jira: source('jira', 'reachable', 12, 7200),
  sentry: source('sentry', 'reachable', 540, 900),
  datadog: source('datadog', 'not_configured', null, 900),
  port: source('port', 'unavailable', 1500, 86400),
} as const satisfies Record<string, SourceAuthority>;

const check: EntityRef = { kind: 'check', id: 'check:integration-tests-stock-sync', externalId: '#DEMO-4471', label: 'ci / integration-tests (stock-sync)' };
const pr: EntityRef = { kind: 'check', id: 'pr:DEMO-88', externalId: 'PR #DEMO-88', label: 'fixture timezone update' };
const issue: EntityRef = { kind: 'workItem', id: 'jira:RT-DEMO-112', externalId: 'RT-DEMO-112', label: 'stock-sync integration test flaky' };
const inventory: EntityRef = { kind: 'component', id: 'component:inventory', label: 'Inventory service' };
const ghTarget: EntityRef = { kind: 'component', id: 'component:github', label: 'GitHub API (synthetic)' };
const portTarget: EntityRef = { kind: 'component', id: 'component:port-catalog', label: 'Port catalogue (synthetic)' };

const observation = (id: string, target: EntityRef, src: SourceAuthority, observedAt: string, url?: string): Observation => ({
  id, target, source: src, observedAt, ingestedAt: '2026-11-16T14:03:00Z', environment: 'ci', ...(url ? { sourceUrl: url } : {}),
});

/** E-1..E-7: the evidence the host investigation, evidence and project screens read. */
export const EVIDENCE = {
  checkFailed: {
    id: 'E-1', classification: 'observed', freshness: 'current', visibility: 'all',
    observation: observation('O-1', check, SOURCES.github, '2026-11-16T14:02:00Z', 'https://github.example.invalid/run/DEMO-4471'),
  },
  prMerged: {
    id: 'E-2', classification: 'observed', freshness: 'current', visibility: 'all',
    observation: observation('O-2', pr, SOURCES.github, '2026-11-16T13:27:00Z', 'https://github.example.invalid/pull/DEMO-88'),
  },
  issueLinked: {
    id: 'E-3', classification: 'correlated', freshness: 'current', visibility: 'all', rule: 'Jira key in the commit message of the merged PR',
    observation: observation('O-3', issue, SOURCES.jira, '2026-11-16T13:51:00Z', 'https://jira.example.invalid/browse/RT-DEMO-112'),
  },
  release: {
    id: 'E-4', classification: 'observed', freshness: 'current', visibility: 'all',
    observation: observation('O-4', issue, SOURCES.jira, '2026-11-16T13:51:00Z', 'https://jira.example.invalid/browse/RT-DEMO-112'),
  },
  // Technical-only (M05-D05-B): Owner and Nontechnical never receive it.
  sentryErrors: {
    id: 'E-5', classification: 'observed', freshness: 'stale', visibility: 'technical',
    observation: { ...observation('O-5', inventory, SOURCES.sentry, '2026-11-16T05:03:00Z'), environment: 'staging' },
  },
  runtime: {
    id: 'E-6', classification: 'observed', freshness: 'unknown', visibility: 'all', observation: null, notReadReason: 'not_configured',
  },
  catalogOwner: {
    id: 'E-7', classification: 'observed', freshness: 'stale', visibility: 'all', observation: null, notReadReason: 'unavailable',
  },
} as const satisfies Record<string, EvidenceReference>;

/** E-8, E-9: reads of a source itself (World.sourceProbes), read by the Source Observatory and Mission Map. The catalogue does not list them. */
export const EXTRA_EVIDENCE = {
  // A current Observed read of GitHub itself. It is why GitHub may show Healthy and nothing else may.
  githubProbe: {
    id: 'E-8', classification: 'observed', freshness: 'current', visibility: 'all',
    observation: { id: 'O-8', target: ghTarget, source: SOURCES.github, observedAt: '2026-11-16T14:03:00Z', ingestedAt: '2026-11-16T14:03:00Z', environment: 'ci' },
  },
  // Port's last good read, a day old. Evidence that it once answered, not that it is healthy now.
  portLastRead: {
    id: 'E-9', classification: 'observed', freshness: 'stale', visibility: 'all',
    observation: { id: 'O-9', target: portTarget, source: SOURCES.port, observedAt: '2026-11-15T13:09:00Z', ingestedAt: '2026-11-15T13:09:00Z', environment: 'ci' },
  },
} as const satisfies Record<string, EvidenceReference>;
