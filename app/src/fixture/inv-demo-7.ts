// Synthetic case INV-DEMO-7 (Blueprint v4 §4). Every value is invented. Keys use RT-DEMO-, links use *.example.invalid.
import type {
  EntityRef, EvidenceReference, Hypothesis, InvestigationData, MapNode, Observation, Provider, SourceAuthority,
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
const component: EntityRef = { kind: 'component', id: 'component:stock-sync', label: 'Backend-Core › stock-sync' };
const inventory: EntityRef = { kind: 'component', id: 'component:inventory', label: 'Inventory service' };

const observation = (id: string, target: EntityRef, src: SourceAuthority, observedAt: string, url?: string): Observation => ({
  id, target, source: src, observedAt, ingestedAt: '2026-11-16T14:03:00Z', environment: 'ci', ...(url ? { sourceUrl: url } : {}),
});

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

export const HYPOTHESIS: Hypothesis = {
  id: 'H-1',
  confidence: 'medium',
  supporting: [EVIDENCE.checkFailed, EVIDENCE.prMerged],
  contradicting: [EVIDENCE.issueLinked],
};

export const NODES: readonly MapNode[] = [
  { id: 'pos', state: { connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', basis: [] } },
  { id: 'stock-sync', check: 'failing', state: { connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', basis: [EVIDENCE.runtime] } },
  // The last stale read said healthy. The contract turns that into unknown.
  { id: 'inventory', state: { connectivity: 'reachable', freshness: 'stale', health: 'healthy', basis: [EVIDENCE.sentryErrors] } },
];

export const RAW_OUTPUT = "AssertionError: expected '2026-11-16T14:00Z' got '2026-11-16T16:00Z'";

export const INV_DEMO_7: InvestigationData = {
  id: 'INV-DEMO-7',
  product: 'Retail Tower OS',
  component,
  environment: 'ci',
  sources: Object.values(SOURCES),
  facts: [
    { key: 'observed', evidence: EVIDENCE.checkFailed },
    { key: 'correlated', evidence: EVIDENCE.issueLinked },
    { key: 'hypothesis', evidence: null },
    { key: 'unknown', evidence: null },
    { key: 'proposed', evidence: null },
  ],
  evidence: Object.values(EVIDENCE),
  hypothesis: HYPOTHESIS,
  nodes: NODES,
  rawOutput: { evidenceId: 'E-1', text: RAW_OUTPUT },
  startedMinutesAgo: 6,
};
