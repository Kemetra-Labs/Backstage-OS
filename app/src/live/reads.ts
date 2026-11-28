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
}

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

/**
 * GET /investigations/:id and GET /decisions?investigationId=:id, in parallel. The case is the one named in the address; with
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
  return { status: 'ok', body: { investigation: inv.body, decisions: dec.ok ? dec.body : null, chosen } };
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
