// Portfolio response adapter (BACK-57 slice 3). Pure functions from the server's `GET /portfolio`
// JSON to the display contract (contract/types.ts). There is deliberately NO request code here:
// nothing in app/ calls the server (CLAUDE.md), and no screen imports src/api (api.guard.test.ts).
// Wiring and any request are BACK-57 and need owner approval.
//
// The response shape is duplicated from server/src/portfolio/portfolio.model.ts (merged in #101),
// not shared: a shared package would change the CI change classifier. Drift risk: a server field
// change must be mirrored here; the parser fails closed when it is not.
//
// Rules: the server's `ok` only means the latest read succeeded, so it is never health. A failed
// latest read gives no last good read (lastSuccessAt null), so it can never read as current. A
// failure is `unavailable`, never restricted evidence. Unknown or malformed input fails closed.
import { freshnessOf } from '../contract/rules';
import type { AggregateCount, EvidenceReference, Provider, SourceAuthority } from '../contract/types';

/** GitHub TTL, the same 30 minutes as the synthetic fixture (src/fixture/world.ts SOURCES.github). */
export const GITHUB_TTL_SECONDS = 1800;

type ServerState = 'ok' | 'stale' | 'unknown' | 'error' | 'denied';
const SERVER_STATES: readonly string[] = ['ok', 'stale', 'unknown', 'error', 'denied'];
const PROVIDERS: readonly string[] = ['github', 'jira', 'confluence', 'sentry', 'datadog', 'port'];
const TITLE_MAX = 300;
/** Bidi embedding, override and isolate controls: a title must not reorder the text around it (EN/AR). */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g;

export interface ParsedList {
  readonly state: ServerState;
  readonly reason: string | null;
  readonly count: number | null;
  readonly complete: boolean | null;
}

export interface ParsedItem {
  readonly evidenceId: string;
  readonly kind: 'pull_request' | 'issue';
  readonly number: number;
  readonly title: string;
  readonly url: string | null;
}

export interface ParsedSource {
  readonly id: string;
  readonly provider: Provider;
  readonly externalRef: string;
  readonly state: ServerState;
  readonly reason: string | null;
  readonly lastReadAt: string | null;
  readonly lists: { readonly pullRequests: ParsedList; readonly issues: ParsedList };
  readonly items: readonly ParsedItem[];
}

export interface ParsedProject {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly sources: readonly ParsedSource[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const validTime = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

const MALFORMED_LIST: ParsedList = { state: 'error', reason: 'malformed', count: null, complete: null };

function parseList(v: unknown): ParsedList | null {
  if (!isObject(v) || typeof v['state'] !== 'string' || !SERVER_STATES.includes(v['state'])) return null;
  const count = v['count'];
  const okCount = count === null || (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0);
  if (!okCount) return null;
  const complete = typeof v['complete'] === 'boolean' ? v['complete'] : null;
  return { state: v['state'] as ServerState, reason: str(v['reason']), count: count as number | null, complete };
}

/** Only https links on github.com are kept; anything else is dropped, never repaired. */
export function githubUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname === 'github.com' && !u.username && !u.password && !u.port ? `https://github.com${u.pathname}` : null;
  } catch {
    return null;
  }
}

function parseItem(v: unknown): ParsedItem | null {
  if (!isObject(v)) return null;
  const evidenceId = str(v['evidenceId']);
  const kind = v['kind'];
  const number = v['number'];
  const title = v['title'];
  if (!evidenceId || (kind !== 'pull_request' && kind !== 'issue')) return null;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1 || typeof title !== 'string') return null;
  return { evidenceId, kind, number, title: Array.from(title.replace(BIDI_CONTROLS, '')).slice(0, TITLE_MAX).join(''), url: githubUrl(v['url']) };
}

/** A source we can name but not trust is kept as malformed (unavailable). One we cannot name is dropped and counted. */
function parseSource(v: unknown): ParsedSource | null {
  if (!isObject(v)) return null;
  const id = str(v['id']);
  const provider = v['provider'];
  const externalRef = str(v['externalRef']);
  if (!id || typeof provider !== 'string' || !PROVIDERS.includes(provider) || !externalRef) return null;
  const base = { id, provider: provider as Provider, externalRef };
  const malformed: ParsedSource = { ...base, state: 'error', reason: 'malformed', lastReadAt: null, lists: { pullRequests: MALFORMED_LIST, issues: MALFORMED_LIST }, items: [] };

  const state = v['state'];
  const lists = isObject(v['lists']) ? v['lists'] : null;
  const pullRequests = lists ? parseList(lists['pullRequests']) : null;
  const issues = lists ? parseList(lists['issues']) : null;
  const lastReadAt = v['lastReadAt'] === null ? null : validTime(v['lastReadAt']);
  const badTime = v['lastReadAt'] !== null && lastReadAt === null;
  if (typeof state !== 'string' || !SERVER_STATES.includes(state) || !pullRequests || !issues || badTime) return malformed;
  const items = Array.isArray(v['items']) ? v['items'].map(parseItem).filter((i): i is ParsedItem => i !== null) : [];
  return { ...base, state: state as ServerState, reason: str(v['reason']), lastReadAt, lists: { pullRequests, issues }, items };
}

function parseProject(v: unknown): (ParsedProject & { droppedSources: number }) | null {
  if (!isObject(v)) return null;
  const id = str(v['id']);
  const key = str(v['key']);
  const name = str(v['name']);
  if (!id || !key || !name || !Array.isArray(v['sources'])) return null;
  const sources = v['sources'].map(parseSource).filter((s): s is ParsedSource => s !== null);
  return { id, key, name, sources, droppedSources: v['sources'].length - sources.length };
}

export interface PortfolioParse {
  readonly projects: readonly ParsedProject[];
  /** The body was not a portfolio at all: show a failure, never an empty portfolio. */
  readonly malformed: boolean;
  /** Projects and sources that could not be expressed and were left out: the view is incomplete. */
  readonly dropped: number;
}

/** `GET /portfolio` or `GET /portfolio/:id` (wrapped as `{ projects: [project] }`). Never throws. */
export function parsePortfolio(body: unknown): PortfolioParse {
  if (!isObject(body) || !Array.isArray(body['projects'])) return { projects: [], malformed: true, dropped: 0 };
  let dropped = 0;
  const projects: ParsedProject[] = [];
  for (const raw of body['projects']) {
    const p = parseProject(raw);
    if (!p) {
      dropped += 1;
      continue;
    }
    dropped += p.droppedSources;
    projects.push({ id: p.id, key: p.key, name: p.name, sources: p.sources });
  }
  return { projects, malformed: false, dropped };
}

// ---- Display mapping ------------------------------------------------------------------------------

export interface PortfolioOptions {
  /** The clock is injected: the mapper never reads the system time. */
  readonly now: Date;
  readonly ttlSeconds: number;
  /** True while every source is canned (no transport exists): drives the demo marker and inert links. */
  readonly synthetic: boolean;
}

export interface ApiSource {
  readonly id: string;
  readonly externalRef: string;
  readonly authority: SourceAuthority;
  /** The server's reason code when the latest read is not ok; no user-visible text. */
  readonly failure: string | null;
  readonly pullRequests: AggregateCount;
  readonly issues: AggregateCount;
}

export interface ApiProject {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly sources: readonly ApiSource[];
  /** Items of every source whose latest read is ok, as observed evidence. */
  readonly items: readonly EvidenceReference[];
}

function authorityOf(s: ParsedSource, o: PortfolioOptions): SourceAuthority {
  const base = { provider: s.provider, ttlSeconds: o.ttlSeconds, synthetic: o.synthetic };
  if (s.state !== 'ok') {
    // Never read: we know nothing yet (unknown bucket). Any failure: unavailable, last good read unknown.
    const connectivity = s.reason === 'never_read' && s.state === 'unknown' ? 'reachable' : 'unavailable';
    return { ...base, connectivity, lastSuccessAt: null, ageMinutes: null };
  }
  const readAt = s.lastReadAt ? Date.parse(s.lastReadAt) : Number.NaN;
  const ageMs = o.now.getTime() - readAt;
  // No read time, or one in the future, gives no age: freshness stays unknown, never current.
  if (Number.isNaN(readAt) || ageMs < 0) return { ...base, connectivity: 'reachable', lastSuccessAt: null, ageMinutes: null };
  return { ...base, connectivity: 'reachable', lastSuccessAt: s.lastReadAt, ageMinutes: Math.floor(ageMs / 60_000) };
}

function countOf(l: ParsedList, sourceOk: boolean): AggregateCount {
  const read = sourceOk && l.state === 'ok' && l.count !== null;
  // Not known to be complete means at least: a full page or a missing page record is never a total.
  return { value: read ? l.count : null, sourcesRead: read ? 1 : 0, sourcesTotal: 1, atLeast: l.complete !== true, basis: [] };
}

function itemRef(i: ParsedItem, s: ParsedSource, authority: SourceAuthority): EvidenceReference {
  const at = s.lastReadAt as string;
  return {
    id: i.evidenceId,
    observation: {
      id: i.evidenceId,
      target: { kind: 'workItem', id: `${s.externalRef}#${i.kind}/${i.number}`, externalId: `#${i.number}`, label: i.title },
      source: authority,
      observedAt: at,
      ingestedAt: at,
      environment: 'unknown',
      ...(i.url ? { sourceUrl: i.url } : {}),
    },
    classification: 'observed',
    freshness: freshnessOf(authority),
    visibility: 'all',
  };
}

export interface ApiPortfolio {
  readonly projects: readonly ApiProject[];
  readonly malformed: boolean;
  readonly dropped: number;
}

export function toPortfolio(parse: PortfolioParse, o: PortfolioOptions): ApiPortfolio {
  const projects = parse.projects.map((p) => {
    const sources = p.sources.map((s) => {
      const authority = authorityOf(s, o);
      const ok = s.state === 'ok';
      return { parsed: s, api: { id: s.id, externalRef: s.externalRef, authority, failure: ok ? null : (s.reason ?? 'malformed'), pullRequests: countOf(s.lists.pullRequests, ok), issues: countOf(s.lists.issues, ok) } };
    });
    // Only a read with a usable time (not missing, not in the future) yields items.
    const items = sources.filter((x) => x.parsed.state === 'ok' && x.api.authority.lastSuccessAt !== null).flatMap((x) => x.parsed.items.map((i) => itemRef(i, x.parsed, x.api.authority)));
    return { id: p.id, key: p.key, name: p.name, sources: sources.map((x) => x.api), items };
  });
  return { projects, malformed: parse.malformed, dropped: parse.dropped };
}
