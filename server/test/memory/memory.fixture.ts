// Synthetic evidence rows for the COG-02 S1 projector tests (BACK-105). No real source, person or data.
import type { EvidenceState } from '../../src/evidence/evidence.types';
import type { MemoryRequest, MemoryRow, MemorySource } from '../../src/memory/memory.types';

export const GH = '00000000-0000-4000-8000-0000000000a1';
export const JIRA = '00000000-0000-4000-8000-0000000000b2';
export const CONF = '00000000-0000-4000-8000-0000000000c3';
export const REPO = 'github:kemetra-labs/backstage-os';

/** An ISO instant on the fixture day; `hm` is HH:MM, `s` optional seconds. */
export const at = (hm: string, s = '00', day = '25'): string => `2026-11-${day}T${hm}:${s}.000Z`;

export const sources = (over: Partial<Record<string, Partial<MemorySource>>> = {}): MemorySource[] => [
  { sourceId: GH, provider: 'github', purgeHorizon: null, ...over[GH] },
  { sourceId: JIRA, provider: 'jira', purgeHorizon: null, ...over[JIRA] },
  { sourceId: CONF, provider: 'confluence', purgeHorizon: null, ...over[CONF] },
];

export const request = (over: Partial<MemoryRequest> = {}): MemoryRequest => ({
  effectiveAt: at('12:00'),
  knownAt: at('12:00'),
  evaluationAt: at('12:00'),
  now: at('13:00'),
  activeGrantIds: ['grant-1', 'grant-2', 'grant-3'],
  sources: sources(),
  ...over,
});

interface RowOpts {
  id: string;
  observedAt: string;
  receivedAt?: string;
  state?: EvidenceState;
  type?: string;
}

const base = (sourceId: string, sourceRef: string, payload: Record<string, unknown>, o: RowOpts): MemoryRow => ({
  id: o.id,
  sourceId,
  type: o.type ?? 'Observation',
  state: o.state ?? 'ok',
  sourceRef,
  observedAt: o.observedAt,
  receivedAt: o.receivedAt ?? o.observedAt,
  payload,
});

export const pr = (n: number, p: { title?: string; state?: string; draft?: boolean; updatedAt: string; url?: string }, o: RowOpts): MemoryRow =>
  base(GH, `${REPO}#pull/${n}`, {
    kind: 'pull_request',
    number: n,
    title: p.title ?? `PR ${n}`,
    state: p.state ?? 'open',
    draft: p.draft ?? false,
    updatedAt: p.updatedAt,
    url: p.url ?? `https://github.com/Kemetra-Labs/Backstage-OS/pull/${n}`,
  }, o);

export const ghIssue = (n: number, p: { updatedAt: string; title?: string }, o: RowOpts): MemoryRow =>
  base(GH, `${REPO}#issue/${n}`, { kind: 'issue', number: n, title: p.title ?? `Issue ${n}`, state: 'open', updatedAt: p.updatedAt, url: `https://github.com/x/${n}` }, o);

export const repo = (p: { archived?: boolean; defaultBranch?: string }, o: RowOpts): MemoryRow =>
  base(GH, REPO, {
    kind: 'repository',
    fullName: 'Kemetra-Labs/Backstage-OS',
    defaultBranch: p.defaultBranch ?? 'main',
    archived: p.archived ?? false,
    private: true,
    pushedAt: '2026-11-24T09:00:00.000Z',
  }, o);

export const jiraIssue = (key: string, p: { updatedAt: string; statusCategory?: string; url?: string }, o: RowOpts): MemoryRow => {
  const project = key.slice(0, key.lastIndexOf('-'));
  return base(JIRA, `jira:${project}#issue/${key}`, {
    kind: 'jira_issue',
    key,
    summary: `Synthetic ${key}`,
    statusCategory: p.statusCategory ?? 'indeterminate',
    updatedAt: p.updatedAt,
    url: p.url ?? `https://kemetra-synthetic.atlassian.net/browse/${key}`,
  }, o);
};

export const confPage = (space: string, pageId: string, p: { version: number; lastModified: string; title?: string }, o: RowOpts): MemoryRow =>
  base(CONF, `confluence:${space}#page/${pageId}`, {
    kind: 'confluence_page',
    pageId,
    title: p.title ?? `Page ${pageId}`,
    spaceKey: space,
    lastModified: p.lastModified,
    version: p.version,
    url: null,
  }, o);

export const status = (sourceId: string, sourceRef: string, state: EvidenceState, reason: string, o: RowOpts): MemoryRow =>
  base(sourceId, sourceRef, { kind: 'source_status', reason }, { ...o, state });

export const listPage = (list: 'pulls' | 'issues', o: RowOpts): MemoryRow =>
  base(GH, `${REPO}#${list}`, { kind: 'list_page', endpoint: list === 'pulls' ? 'pull_requests' : 'issues', returned: 0, pageSize: 30 }, o);
