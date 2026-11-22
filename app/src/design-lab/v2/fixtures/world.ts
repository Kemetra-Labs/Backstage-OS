// The ONE synthetic world every V2 screen reads. It extends V1's INV-DEMO-7 fixture (same sources, evidence ids and
// identities) and adds only what V2 needs: a catalogue graph, source events, a replay script and simulated agents.
// Every value is invented. Keys use RT-DEMO-, links use *.example.invalid, nothing here is live telemetry.
import { EVIDENCE, INV_DEMO_7, SOURCES } from '../../../fixture/inv-demo-7';
import type { DisplayState, EvidenceReference, Observation, SourceAuthority } from '../../../contract/types';
import type { Agent, Mission, ReplayEvent, SourceEvent, SourceMeta, World, WorldEdge, WorldNode } from '../types';

/** Fixed "now" so every screen, test and screenshot is deterministic. V1 reads at 14:03 are 6 minutes old here. */
export const NOW = '2026-11-16T14:09:00Z';

const ghTarget = { kind: 'component', id: 'component:github', label: 'GitHub API (synthetic)' } as const;
const portTarget = { kind: 'component', id: 'component:port-catalog', label: 'Port catalogue (synthetic)' } as const;

const obs = (id: string, target: Observation['target'], src: SourceAuthority, at: string): Observation => ({
  id, target, source: src, observedAt: at, ingestedAt: at, environment: 'ci',
});

/** E-8: a current Observed read of GitHub itself. It is why GitHub may show Healthy and nothing else may. */
const ghProbe: EvidenceReference = {
  id: 'E-8', classification: 'observed', freshness: 'current', visibility: 'all',
  observation: obs('O-8', ghTarget, SOURCES.github, '2026-11-16T14:03:00Z'),
};

/** E-9: Port's last good read, a day old. Evidence that it once answered, not that it is healthy now. */
const portLast: EvidenceReference = {
  id: 'E-9', classification: 'observed', freshness: 'stale', visibility: 'all',
  observation: obs('O-9', portTarget, SOURCES.port, '2026-11-15T13:09:00Z'),
};

/** Confluence is a known provider type that V1's fixture does not list. Added here, never read. */
const confluence: SourceAuthority = {
  provider: 'confluence', connectivity: 'not_configured', lastSuccessAt: null, ageMinutes: null, ttlSeconds: 3600, synthetic: true,
};

const none = (c: DisplayState['connectivity'], f: DisplayState['freshness']): DisplayState => ({
  connectivity: c, freshness: f, health: 'unknown', basis: [],
});

export const SOURCE_LIST: readonly SourceMeta[] = [
  {
    provider: 'github', kind: 'integration', target: 'GitHub API', source: SOURCES.github,
    health: { connectivity: 'reachable', freshness: 'current', health: 'healthy', basis: [ghProbe] },
  },
  {
    // Claimed healthy with no evidence: the contract turns this into Unknown.
    provider: 'jira', kind: 'integration', target: 'Jira API', source: SOURCES.jira,
    health: { connectivity: 'reachable', freshness: 'current', health: 'healthy', basis: [] },
  },
  {
    // Claimed healthy on a stale read: Unknown.
    provider: 'sentry', kind: 'data', target: 'Sentry API', source: SOURCES.sentry,
    health: { connectivity: 'reachable', freshness: 'stale', health: 'healthy', basis: [EVIDENCE.sentryErrors] },
  },
  { provider: 'datadog', kind: 'data', target: 'Datadog API', source: SOURCES.datadog, health: none('not_configured', 'unknown') },
  { provider: 'confluence', kind: 'integration', target: 'Confluence API', source: confluence, health: none('not_configured', 'unknown') },
  {
    provider: 'port', kind: 'integration', target: 'Port API', source: SOURCES.port,
    health: { connectivity: 'unavailable', freshness: 'stale', health: 'unknown', basis: [portLast] },
  },
];

const state = (health: DisplayState['health'], basis: DisplayState['basis'], c: DisplayState['connectivity'] = 'not_configured', f: DisplayState['freshness'] = 'unknown'): DisplayState => ({
  connectivity: c, freshness: f, health, basis,
});
const svc = (p: SourceMeta['provider']): DisplayState => SOURCE_LIST.find((s) => s.provider === p)!.health;

// Layout is a 1000 x 600 canvas. The hub sits at the centre; nothing here is a measurement, only placement.
export const NODES: readonly WorldNode[] = [
  { id: 'retail-tower', kind: 'product', title: 'Retail Tower OS', x: 500, y: 335, state: state('unknown', [EVIDENCE.checkFailed]), evidence: ['E-1', 'E-2'] },
  { id: 'khepri', kind: 'product', title: 'Khepri', x: 170, y: 150, state: state('healthy', []), evidence: [] },
  { id: 'stock-sync', kind: 'project', title: 'stock-sync', x: 500, y: 120, state: state('unknown', [EVIDENCE.runtime]), check: 'failing', evidence: ['E-1', 'E-2', 'E-3', 'E-6'] },
  { id: 'pos', kind: 'project', title: 'POS client', x: 300, y: 300, state: state('unknown', []), evidence: [] },
  { id: 'inventory', kind: 'project', title: 'Inventory service', x: 700, y: 305, state: state('healthy', [EVIDENCE.sentryErrors], 'reachable', 'stale'), evidence: ['E-5'], descWithoutEvidence: 'map.nl.inventory.none' },
  { id: 'github', kind: 'service', title: 'GitHub', x: 830, y: 140, provider: 'github', state: svc('github'), evidence: ['E-1', 'E-2', 'E-8'] },
  { id: 'jira', kind: 'service', title: 'Jira', x: 850, y: 420, provider: 'jira', state: svc('jira'), evidence: ['E-3', 'E-4'] },
  { id: 'sentry', kind: 'service', title: 'Sentry', x: 925, y: 255, provider: 'sentry', state: svc('sentry'), evidence: ['E-5'] },
  { id: 'port', kind: 'service', title: 'Port', x: 70, y: 300, provider: 'port', state: svc('port'), evidence: ['E-7', 'E-9'] },
  { id: 'seshat-bi', kind: 'service', title: 'Seshat BI', x: 175, y: 450, state: state('degraded', []), evidence: [] },
];

export const EDGES: readonly WorldEdge[] = [
  { id: 'g1', a: 'retail-tower', b: 'stock-sync', cls: 'group', truth: 'unknown', basisKey: 'edge.group', evidence: [] },
  { id: 'g2', a: 'retail-tower', b: 'pos', cls: 'group', truth: 'unknown', basisKey: 'edge.group', evidence: [] },
  { id: 'g3', a: 'retail-tower', b: 'inventory', cls: 'group', truth: 'unknown', basisKey: 'edge.group', evidence: [] },
  { id: 'd1', a: 'stock-sync', b: 'github', cls: 'dep', truth: 'observed', basisKey: 'edge.ciOnGithub', evidence: ['E-1'] },
  { id: 'd2', a: 'stock-sync', b: 'jira', cls: 'dep', truth: 'correlated', basisKey: 'edge.commitKey', evidence: ['E-3'] },
  { id: 'd3', a: 'stock-sync', b: 'inventory', cls: 'dep', truth: 'hypothesis', basisKey: 'edge.readsInventory', evidence: [] },
  { id: 'd4', a: 'inventory', b: 'sentry', cls: 'dep', truth: 'observed', basisKey: 'edge.errorsInSentry', evidence: ['E-5'] },
  { id: 'd5', a: 'pos', b: 'stock-sync', cls: 'dep', truth: 'unknown', basisKey: 'edge.posUnknown', evidence: [] },
  { id: 'd6', a: 'retail-tower', b: 'khepri', cls: 'dep', truth: 'unknown', basisKey: 'edge.notEvidenced', evidence: [] },
  { id: 'd7', a: 'retail-tower', b: 'seshat-bi', cls: 'dep', truth: 'unknown', basisKey: 'edge.notEvidenced', evidence: [] },
  { id: 'd8', a: 'retail-tower', b: 'port', cls: 'dep', truth: 'unknown', basisKey: 'edge.catalogUnavailable', evidence: ['E-7'] },
];

export const SOURCE_EVENTS: readonly SourceEvent[] = [
  { id: 'S-1', at: '2026-11-15T13:09:00Z', provider: 'port', axis: 'connectivity', tone: 'bad', key: 'sev.portLast' },
  { id: 'S-2', at: '2026-11-16T05:09:00Z', provider: 'sentry', axis: 'freshness', tone: 'ok', key: 'sev.sentryLast' },
  { id: 'S-3', at: '2026-11-16T05:24:00Z', provider: 'sentry', axis: 'freshness', tone: 'warn', key: 'sev.sentryStale' },
  { id: 'S-4', at: '2026-11-16T13:57:00Z', provider: 'jira', axis: 'connectivity', tone: 'ok', key: 'sev.jiraRead' },
  { id: 'S-5', at: '2026-11-16T14:02:00Z', provider: 'github', axis: 'incident', tone: 'bad', key: 'sev.ciFailed' },
  { id: 'S-6', at: '2026-11-16T14:03:00Z', provider: 'github', axis: 'connectivity', tone: 'ok', key: 'sev.githubRead' },
];

export const REPLAY: readonly ReplayEvent[] = [
  { id: 'R-1', clock: '14:02', stage: 'observed', label: 'observed', evidence: 'E-1', kind: 'event', key: 'rp.checkFailed' },
  { id: 'R-2', clock: '14:03', stage: 'observed', label: 'observed', evidence: 'E-2', kind: 'event', key: 'rp.prMerged' },
  { id: 'R-3', clock: '14:04', stage: 'ingested', label: 'observed', evidence: null, kind: 'event', key: 'rp.ingested' },
  { id: 'R-4', clock: '14:05', stage: 'correlated', label: 'correlated', evidence: 'E-3', kind: 'event', key: 'rp.linked' },
  { id: 'R-5', clock: '14:06', stage: 'correlated', label: 'unknown', evidence: 'E-6', kind: 'gap', key: 'rp.gapRuntime' },
  { id: 'R-6', clock: '14:07', stage: 'hypothesis', label: 'hypothesis', evidence: null, kind: 'event', key: 'rp.hypothesis' },
  { id: 'R-7', clock: '14:08', stage: 'proposed', label: 'proposed', evidence: null, kind: 'event', key: 'rp.proposed' },
];

export const AGENTS: readonly Agent[] = [
  { id: 'AG-1', key: 'ag.collector', role: 'sensing' },
  { id: 'AG-2', key: 'ag.watcher', role: 'sensing' },
  { id: 'AG-3', key: 'ag.correlator', role: 'analysis' },
  { id: 'AG-4', key: 'ag.analyst', role: 'analysis' },
  { id: 'AG-5', key: 'ag.drafter', role: 'proposal' },
];

export const MISSIONS: readonly Mission[] = [
  { id: 'MSN-DEMO-1', agent: 'AG-1', kind: 'sensing', status: 'observing', human: 'monitoring', startedMinutesAgo: 7, events: 3, label: 'observed', evidence: ['E-1', 'E-2'], key: 'ms.ci' },
  { id: 'MSN-DEMO-2', agent: 'AG-2', kind: 'sensing', status: 'observing', human: 'monitoring', startedMinutesAgo: 9, events: 4, label: 'observed', evidence: ['E-5', 'E-9'], key: 'ms.fresh' },
  { id: 'MSN-DEMO-3', agent: 'AG-3', kind: 'analysis', status: 'analyzing', human: 'reviewing', startedMinutesAgo: 4, events: 2, label: 'correlated', evidence: ['E-3'], key: 'ms.link' },
  { id: 'MSN-DEMO-4', agent: 'AG-4', kind: 'analysis', status: 'analyzing', human: 'reviewing', startedMinutesAgo: 2, events: 3, label: 'hypothesis', evidence: ['E-1', 'E-2', 'E-3'], key: 'ms.hyp' },
  { id: 'MSN-DEMO-5', agent: 'AG-5', kind: 'proposal', status: 'waiting_review', human: 'needs_review', startedMinutesAgo: 1, events: 2, label: 'proposed', evidence: ['E-1', 'E-3'], key: 'ms.proposal' },
];

const evidenceList: readonly EvidenceReference[] = [...Object.values(EVIDENCE), ghProbe, portLast];

export const WORLD: World = {
  now: NOW,
  investigationId: INV_DEMO_7.id,
  nodes: NODES,
  edges: EDGES,
  sources: SOURCE_LIST,
  sourceEvents: SOURCE_EVENTS,
  replay: REPLAY,
  agents: AGENTS,
  missions: MISSIONS,
  evidenceById: Object.fromEntries(evidenceList.map((e) => [e.id, e])),
};
