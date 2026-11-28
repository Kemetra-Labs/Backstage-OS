// Live reads (BACK-51 P1, owner decisions D1 (a) and D2 (a), 2026-11-26). Live mode is a build-time switch, off by default:
// only VITE_KAWALYS_LIVE=1 turns it on. In the default build LIVE folds to false and none of this code is called, so the app
// reads its committed fixtures and makes no request. In live mode, Portfolio and the Investigation Room read the server here,
// the only module allowed to import src/live/http.ts (src/live/live.guard.test.ts). The bodies then go through the same view modules and
// src/api adapters as the fixtures, so the BACK-98 parity tests keep covering their shapes.
import { apiRequest, type Fetcher, type HttpFailure } from './http';
import type { StateKind } from '../i18n/shell';

/** True only for exactly VITE_KAWALYS_LIVE=1. */
export function liveMode(env: { readonly VITE_KAWALYS_LIVE?: string }): boolean {
  return env.VITE_KAWALYS_LIVE === '1';
}

/** Written inline (not through liveMode()) so Vite replaces it and the default build drops the live code. */
export const LIVE: boolean = import.meta.env.VITE_KAWALYS_LIVE === '1';

/** Why a live panel shows nothing: an HTTP failure, or no investigation to show (none named, and none visible on the server). */
/** `locked`: the session was signed in and cannot be confirmed (BACK-127): no read is made and nothing is shown. */
export type LiveFailure = HttpFailure | 'notChosen' | 'locked';

export type LiveRead<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly body: T }
  | { readonly status: 'failed'; readonly failure: LiveFailure };

export interface InvestigationBodies {
  readonly investigation: unknown;
  /** null when GET /decisions failed: the view then says the list is incomplete, never that there are none. */
  readonly decisions: unknown;
  /** Where the case came from: the address (`?investigation=`), or the newest one the server lists for this session. */
  readonly chosen: 'address' | 'newest';
  /**
   * BACK-148 (decision L): GET /evidence?projectId=<case project>&type=Observation. null when it failed (or the case body had no
   * project id to ask with): the room then says the list could not be read, never that there are none. It never fails the room.
   */
  readonly observations: unknown;
  /** GET /evidence/:id for cited records found in neither list, by id; null for one the server did not return (unknown). */
  readonly cited: Readonly<Record<string, unknown>>;
}

/** At most this many cited records are read one by one per room read; the rest stay unresolved (shown as unknown). */
export const CITED_RESOLVE_MAX = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The investigation named in the address, `?investigation=<uuid>` (npm run local:up prints one). Anything but a UUID is no choice
 * at all, and readInvestigation() then opens the newest visible investigation instead.
 */
export function investigationIdFrom(search: string): string | null {
  const v = new URLSearchParams(search).get('investigation');
  return v !== null && UUID.test(v) ? v : null;
}

/** GET /portfolio. null when aborted: the caller sets no state. */
export async function readPortfolio(signal?: AbortSignal, fetcher?: Fetcher): Promise<LiveRead<unknown> | null> {
  const r = await apiRequest('/api/portfolio', { signal, fetcher });
  if (!r.ok) return r.aborted ? null : { status: 'failed', failure: r.failure };
  return { status: 'ok', body: r.body };
}

type Pick = { readonly id: string } | { readonly failure: LiveFailure } | null;

/**
 * The newest investigation this session can see: the first item of GET /investigations, which the server sorts newest first and
 * limits to visible projects. An empty list is notChosen; a malformed list, or a first item without a UUID id, is an error, so no
 * case is guessed and no request path is built from an unchecked value. null when aborted.
 */
async function newestInvestigation(signal?: AbortSignal, fetcher?: Fetcher): Promise<Pick> {
  const r = await apiRequest('/api/investigations', { signal, fetcher });
  if (!r.ok) return r.aborted ? null : { failure: r.failure };
  const items = typeof r.body === 'object' && r.body !== null ? (r.body as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return { failure: 'error' };
  if (items.length === 0) return { failure: 'notChosen' };
  const first: unknown = items[0];
  const id = typeof first === 'object' && first !== null ? (first as { id?: unknown }).id : undefined;
  return typeof id === 'string' && UUID.test(id) ? { id } : { failure: 'error' };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const listItems = (body: unknown): unknown[] => (isObj(body) && Array.isArray(body['items']) ? (body['items'] as unknown[]) : []);
const idsOf = (items: readonly unknown[]): string[] => items.flatMap((r) => (isObj(r) && typeof r['id'] === 'string' ? [r['id']] : []));
const citationsOf = (items: readonly unknown[]): string[] =>
  items.flatMap((r) => (isObj(r) && Array.isArray(r['citations']) ? (r['citations'] as unknown[]).filter((c): c is string => typeof c === 'string') : []));

/**
 * The cited ids the room cannot resolve from its own lists (the case's evidence and the project observations): cited by a decision
 * of GET /decisions or by a decision in the case body, UUIDs only, each once, in first-cited order, at most `max`.
 */
export function citationsToResolve(investigation: unknown, decisions: unknown, observations: unknown, max: number = CITED_RESOLVE_MAX): string[] {
  const evidence = isObj(investigation) && Array.isArray(investigation['evidence']) ? (investigation['evidence'] as unknown[]) : [];
  const known = new Set([...idsOf(evidence), ...idsOf(listItems(observations))]);
  const out: string[] = [];
  for (const id of [...citationsOf(listItems(decisions)), ...citationsOf(evidence)]) {
    if (out.length >= max) break;
    if (UUID.test(id) && !known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The UUID `projectId` of an investigation body, or null: no request path is built from anything else. */
function projectIdOf(investigation: unknown): string | null {
  const v = isObj(investigation) ? investigation['projectId'] : undefined;
  return typeof v === 'string' && UUID.test(v) ? v : null;
}

/**
 * The project observations, then each cited record found in neither list (GET /evidence/:id). A failure of either is data for the
 * view (null), never a room failure. null only when aborted.
 */
async function readReferences(
  investigation: unknown,
  decisions: unknown,
  signal?: AbortSignal,
  fetcher?: Fetcher,
): Promise<{ observations: unknown; cited: Record<string, unknown> } | null> {
  const projectId = projectIdOf(investigation);
  let observations: unknown = null;
  if (projectId !== null) {
    const r = await apiRequest(`/api/evidence?projectId=${projectId}&type=Observation`, { signal, fetcher });
    if (!r.ok && r.aborted) return null;
    observations = r.ok ? r.body : null;
  }
  const ids = citationsToResolve(investigation, decisions, observations);
  const answers = await Promise.all(ids.map((id) => apiRequest(`/api/evidence/${id}`, { signal, fetcher })));
  const cited: Record<string, unknown> = {};
  for (const [i, r] of answers.entries()) {
    if (!r.ok && r.aborted) return null;
    cited[ids[i]!] = r.ok ? r.body : null;
  }
  return { observations, cited };
}

/**
 * GET /investigations/:id and GET /decisions?investigationId=:id, in parallel; then (BACK-148) the case project's observations and
 * any cited record neither list holds. The case is the one named in the address; with
 * none, the newest visible one (owner decision 2026-11-26), so a live demo needs no id copied into the link. null when aborted.
 */
export async function readInvestigation(named: string | null, signal?: AbortSignal, fetcher?: Fetcher): Promise<LiveRead<InvestigationBodies> | null> {
  let id = named;
  if (id === null) {
    const pick = await newestInvestigation(signal, fetcher);
    if (pick === null) return null;
    if ('failure' in pick) return { status: 'failed', failure: pick.failure };
    id = pick.id;
  }
  const chosen = named === null ? 'newest' : 'address';
  const path = encodeURIComponent(id);
  const [inv, dec] = await Promise.all([
    apiRequest(`/api/investigations/${path}`, { signal, fetcher }),
    apiRequest(`/api/decisions?investigationId=${path}`, { signal, fetcher }),
  ]);
  if ((!inv.ok && inv.aborted) || (!dec.ok && dec.aborted)) return null;
  if (!inv.ok) return { status: 'failed', failure: inv.failure };
  const decisions = dec.ok ? dec.body : null;
  const refs = await readReferences(inv.body, decisions, signal, fetcher);
  if (refs === null) return null;
  return { status: 'ok', body: { investigation: inv.body, decisions, chosen, ...refs } };
}

/**
 * The StateBlock kind for a live panel that has nothing to show. Not found reads as unknown (the server never says whether it
 * exists); a refusal or a server error is an error; nothing maps to empty or to a healthy word.
 */
export function liveStateKind(s: LiveFailure | 'loading'): StateKind {
  switch (s) {
    case 'loading': return 'loading';
    case 'not_found':
    case 'notChosen':
    case 'locked': return 'unknown';
    case 'unavailable': return 'unavailable';
    case 'invalid':
    case 'rate_limited':
    case 'error': return 'error';
  }
}

/** COG-07 live shadow search: the project named in the address, `?project=<uuid>`. Anything but a UUID is no project. */
export function projectIdFrom(search: string): string | null {
  const v = new URLSearchParams(search).get('project');
  return v !== null && UUID.test(v) ? v : null;
}

/** The shadow search queries from the address, `?q=...` (repeatable): up to five, each non-blank and within the server bound. */
export const MAX_SHADOW_QUERIES = 5;
export function searchQueriesFrom(search: string): string[] {
  return new URLSearchParams(search)
    .getAll('q')
    .filter((q) => q.trim() !== '' && q.length <= 500)
    .slice(0, MAX_SHADOW_QUERIES);
}

/**
 * GET /cognition/projects/:id/search?q= for each query, in parallel and in order (owner decision 2026-11-27: search only). Any failed
 * search fails the whole read with that failure, so a partial set is never shown as complete. null when aborted.
 */
export async function readCognitionSearches(
  projectId: string,
  queries: readonly string[],
  signal?: AbortSignal,
  fetcher?: Fetcher,
): Promise<LiveRead<unknown[]> | null> {
  if (!UUID.test(projectId)) return { status: 'failed', failure: 'not_found' };
  const results = await Promise.all(
    queries.map((q) => apiRequest(`/api/cognition/projects/${projectId}/search?q=${encodeURIComponent(q)}`, { signal, fetcher })),
  );
  const bodies: unknown[] = [];
  for (const r of results) {
    if (!r.ok) return r.aborted ? null : { status: 'failed', failure: r.failure };
    bodies.push(r.body);
  }
  return { status: 'ok', body: bodies };
}
