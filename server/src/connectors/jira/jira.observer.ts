// Jira observation mapper (BACK-53 mock slice). Turns read-only Jira Cloud REST answers for the
// configured project keys into typed Observations for EvidenceRepository.ingest().
//
// Reuse: ADAPT of server/src/connectors/github/github.observer.ts (76a9a13): one source_status record
// per failed endpoint, fixed reason codes, allow-listed fields, one bad item fails its endpoint.
//
// Rules:
// - Every failure becomes a `source_status` Observation with state denied/unknown/error, never ok.
//   Jira's error text, URLs and thrown messages are never stored.
// - An answer whose `date` header is older than the TTL yields `stale` items, never `ok`.
// - observedAt is the time of the read; the issue's own update time is payload.updatedAt.
// - Only key, summary, status category and update time are kept (X04): no description, comments,
//   assignee, reporter, emails or account ids.
// - A link is built only on the configured site, and only when it is https://<name>.atlassian.net.
import type { ObservationInput } from '../../evidence/evidence.repository';
import {
  clip,
  isClipped,
  DEFAULT_TTL_MS,
  isObject,
  isoDate,
  list,
  Malformed,
  PAGE_SIZE,
  read,
  RefMismatch,
  siteBase,
  validKeys,
  validTtl,
  type Make,
  type StatusReason,
} from '../atlassian/atlassian.read';
import type { JiraReadTransport } from './jira.transport';

/** Jira project key as configured (upper case, 2-10 characters). */
export const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,9}$/;
const ISSUE_NUMBER = /^[1-9][0-9]{0,9}$/;
/** Jira's three status categories. Anything else (including Jira's own "undefined") is refused. */
export const STATUS_CATEGORIES = new Set(['new', 'indeterminate', 'done']);

export interface JiraSource {
  readonly sourceId: string;
  /** The configured site, e.g. `https://example.atlassian.net`. Used for links only. */
  readonly site: string;
  readonly projectKeys: readonly string[];
}

export interface ObserveOptions {
  readonly ttlMs?: number;
}

const statusPayload = (reason: StatusReason, project?: string) =>
  project === undefined ? { kind: 'source_status', endpoint: 'issues', reason } : { kind: 'source_status', endpoint: 'issues', project, reason };

export const searchPath = (key: string) =>
  `/rest/api/3/search/jql?jql=${encodeURIComponent(`project = "${key}" ORDER BY updated DESC`)}&maxResults=${PAGE_SIZE}&fields=summary,status,updated`;

function issuePayload(item: unknown, projectKey: string, base: string | null): Record<string, unknown> {
  if (!isObject(item) || !isObject(item['fields'])) throw new Malformed();
  const { key } = item;
  const { summary, status, updated } = item['fields'];
  if (typeof key !== 'string' || key.length > 32) throw new Malformed();
  const dash = key.lastIndexOf('-');
  if (dash < 1 || !ISSUE_NUMBER.test(key.slice(dash + 1))) throw new Malformed();
  // An issue from another project must not be stored under this one (a moved issue, a wrong answer).
  if (key.slice(0, dash) !== projectKey) throw new RefMismatch();
  if (typeof summary !== 'string') throw new Malformed();
  const category = isObject(status) && isObject(status['statusCategory']) ? status['statusCategory']['key'] : undefined;
  if (typeof category !== 'string' || !STATUS_CATEGORIES.has(category)) throw new Malformed();
  return {
    kind: 'jira_issue',
    key,
    summary: clip(summary),
    textClipped: isClipped(summary),
    statusCategory: category,
    updatedAt: isoDate(updated),
    url: base === null ? null : `${base}/browse/${key}`,
  };
}

async function observeProject(
  transport: JiraReadTransport,
  key: string,
  base: string | null,
  now: Date,
  ttlMs: number,
  make: Make,
): Promise<ObservationInput[]> {
  const root = `jira:${key}`;
  const answer = await read(transport, searchPath(key), now, ttlMs);
  if (!answer.ok) return [make(answer.state, root, statusPayload(answer.reason, key))];
  try {
    const payloads = list(answer.body, 'issues').map((i) => issuePayload(i, key, base));
    if (new Set(payloads.map((p) => p['key'])).size !== payloads.length) throw new Malformed();
    const state = answer.fresh ? 'ok' : 'stale';
    return payloads.map((p) => make(state, `${root}#issue/${p['key'] as string}`, p));
  } catch (err) {
    // One bad issue poisons its project: a partial list would look complete.
    return [make('error', root, statusPayload(err instanceof RefMismatch ? 'ref_mismatch' : 'malformed', key))];
  }
}

/**
 * Observe the configured Jira projects through a read-only transport: up to 20 most recently updated
 * issues each. Never throws for an upstream failure: every failure is a `source_status` Observation
 * that is never `ok`, isolated to its project. Invalid project keys make no request at all.
 */
export async function observeJiraProjects(
  transport: JiraReadTransport,
  source: JiraSource,
  now: Date,
  options: ObserveOptions = {},
): Promise<ObservationInput[]> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  validTtl(ttlMs);
  const at = new Date(now.getTime());
  const make: Make = (state, sourceRef, payload) => ({ sourceId: source.sourceId, type: 'Observation', state, sourceRef, observedAt: at, payload });

  if (!validKeys(source.projectKeys, PROJECT_KEY)) return [make('error', 'jira:invalid-ref', statusPayload('invalid_ref'))];
  const base = siteBase(source.site);
  const out: ObservationInput[] = [];
  for (const key of source.projectKeys) out.push(...(await observeProject(transport, key, base, at, ttlMs, make)));
  return out;
}
