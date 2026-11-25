// Portfolio read model (BACK-49 slice 2). Pure functions over ONE read batch per source: the rows
// that one observeRepository() run stored together (one ingest transaction, one received_at).
// States are facts, never derived as healthy: no read is `unknown` / `never_read`, a failed read
// shows its failure, and `ok` needs every part of the latest read to be ok. The server does not
// compute `stale`: it returns lastReadAt, and the client applies freshness with `state` winning.
import type { Endpoint } from '../connectors/github/github.observer';
import { worstState, type EvidenceState } from '../evidence/evidence.types';

export { worstState };

export interface SourceRef {
  readonly id: string;
  readonly provider: string;
  readonly externalRef: string;
}

export interface ProjectRef {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

/** One stored Observation of a read batch, as the portfolio query returns it. */
export interface BatchRow {
  readonly id: string;
  readonly state: EvidenceState;
  readonly sourceRef: string;
  readonly observedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Reasons the read model adds to the connector's StatusReason codes. */
export type ReadReason = 'never_read' | 'not_read' | 'ambiguous_read';

export interface ListSummary {
  readonly state: EvidenceState;
  readonly reason: string | null;
  /** Open items in the latest read's single page; null whenever the list was not read successfully. */
  readonly count: number | null;
  /**
   * Whether `count` is the total. false: GitHub returned a full page, so there may be more and
   * `count` is a lower bound. null: not known (no page record) or not read.
   */
  readonly complete: boolean | null;
}

export interface PortfolioItem {
  readonly evidenceId: string;
  readonly kind: 'pull_request' | 'issue';
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly draft: boolean | null;
  readonly updatedAt: string;
  readonly url: string | null;
}

export interface SourceSummary extends SourceRef {
  readonly state: EvidenceState;
  readonly reason: string | null;
  readonly lastReadAt: string | null;
  readonly lists: { readonly pullRequests: ListSummary; readonly issues: ListSummary };
  readonly items: readonly PortfolioItem[];
}

export interface ProjectSummary extends ProjectRef {
  readonly state: EvidenceState;
  readonly sources: readonly SourceSummary[];
}

const LIST_KIND: Readonly<Record<'pull_requests' | 'issues', PortfolioItem['kind']>> = { pull_requests: 'pull_request', issues: 'issue' };

const isStatus = (r: BatchRow, endpoint: Endpoint) => r.payload['kind'] === 'source_status' && r.payload['endpoint'] === endpoint;

const failedList = (state: EvidenceState, reason: string): ListSummary => ({ state, reason, count: null, complete: null });

/** A status row that claims ok contradicts itself; it is shown as an error, never as healthy. */
function statusOf(r: BatchRow): ListSummary {
  const reason = typeof r.payload['reason'] === 'string' ? r.payload['reason'] : 'malformed';
  return r.state === 'ok' ? failedList('error', 'malformed') : failedList(r.state, reason);
}

/** From the list's page record: a page shorter than the page size is the whole list. */
function completeness(batch: readonly BatchRow[], endpoint: 'pull_requests' | 'issues'): boolean | null {
  const page = batch.find((r) => r.payload['kind'] === 'list_page' && r.payload['endpoint'] === endpoint);
  const returned = page?.payload['returned'];
  const size = page?.payload['pageSize'];
  if (typeof returned !== 'number' || typeof size !== 'number' || size < 1) return null;
  return returned < size;
}

function toItem(r: BatchRow, kind: PortfolioItem['kind']): PortfolioItem | null {
  const p = r.payload;
  if (r.state !== 'ok' || p['kind'] !== kind) return null;
  if (typeof p['number'] !== 'number' || typeof p['title'] !== 'string' || typeof p['state'] !== 'string' || typeof p['updatedAt'] !== 'string') return null;
  return {
    evidenceId: r.id,
    kind,
    number: p['number'],
    title: p['title'],
    state: p['state'],
    draft: kind === 'pull_request' ? p['draft'] === true : null,
    updatedAt: p['updatedAt'],
    url: typeof p['url'] === 'string' ? p['url'] : null,
  };
}

function summarizeList(batch: readonly BatchRow[], endpoint: 'pull_requests' | 'issues'): { list: ListSummary; items: PortfolioItem[] } {
  const failed = batch.find((r) => isStatus(r, endpoint));
  if (failed) return { list: statusOf(failed), items: [] };
  const kind = LIST_KIND[endpoint];
  const rows = batch.filter((r) => r.payload['kind'] === kind);
  const items = rows.map((r) => toItem(r, kind));
  // A stored row that no longer reads as an item means the stored list cannot be trusted whole.
  if (items.some((i) => i === null)) return { list: failedList('error', 'malformed'), items: [] };
  const valid = (items as PortfolioItem[]).sort((a, b) => a.number - b.number);
  return { list: { state: 'ok', reason: null, count: valid.length, complete: completeness(batch, endpoint) }, items: valid };
}

const unread = (reason: ReadReason): ListSummary => failedList('unknown', reason);

const isRepoLevel = (r: BatchRow) => r.payload['kind'] === 'repository' || isStatus(r, 'repository');

export function summarizeSource(source: SourceRef, batch: readonly BatchRow[]): SourceSummary {
  const heads = batch.filter(isRepoLevel);
  const head = heads[0];
  if (!head) {
    return { ...source, state: 'unknown', reason: 'never_read', lastReadAt: null, lists: { pullRequests: unread('never_read'), issues: unread('never_read') }, items: [] };
  }
  const failedRead = (state: EvidenceState, reason: string): SourceSummary => ({
    ...source,
    state,
    reason,
    lastReadAt: head.observedAt,
    lists: { pullRequests: unread('not_read'), issues: unread('not_read') },
    items: [],
  });
  // Two reads stored in one transaction cannot be told apart: show neither rather than mix them.
  if (heads.length > 1) return failedRead('error', 'ambiguous_read');
  if (isStatus(head, 'repository')) {
    const { state, reason } = statusOf(head);
    return failedRead(state, reason ?? 'malformed');
  }
  // A repository record that is not ok contradicts the mapper's contract.
  if (head.state !== 'ok') return failedRead('error', 'malformed');
  const pulls = summarizeList(batch, 'pull_requests');
  const issues = summarizeList(batch, 'issues');
  const parts = [pulls.list, issues.list];
  const state = worstState(parts.map((p) => p.state));
  const reason = state === 'ok' ? null : (parts.find((p) => p.state === state)?.reason ?? null);
  return { ...source, state, reason, lastReadAt: head.observedAt, lists: { pullRequests: pulls.list, issues: issues.list }, items: [...pulls.items, ...issues.items] };
}

export function summarizeProject(project: ProjectRef, sources: readonly SourceSummary[]): ProjectSummary {
  return { ...project, state: worstState(sources.map((s) => s.state)), sources };
}
