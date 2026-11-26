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

/** Why a live panel shows nothing: an HTTP failure, or no investigation chosen (no request was made). */
export type LiveFailure = HttpFailure | 'notChosen';

export type LiveRead<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly body: T }
  | { readonly status: 'failed'; readonly failure: LiveFailure };

export interface InvestigationBodies {
  readonly investigation: unknown;
  /** null when GET /decisions failed: the view then says the list is incomplete, never that there are none. */
  readonly decisions: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The investigation a live Investigation Room reads: `?investigation=<uuid>` (npm run local:up prints one). The local seed's ids
 * are random and the app has no investigation picker yet, so nothing else names one. Anything but a UUID is no choice at all.
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

/** GET /investigations/:id and GET /decisions?investigationId=:id, in parallel. null when aborted. */
export async function readInvestigation(id: string | null, signal?: AbortSignal, fetcher?: Fetcher): Promise<LiveRead<InvestigationBodies> | null> {
  if (id === null) return { status: 'failed', failure: 'notChosen' };
  const path = encodeURIComponent(id);
  const [inv, dec] = await Promise.all([
    apiRequest(`/api/investigations/${path}`, { signal, fetcher }),
    apiRequest(`/api/decisions?investigationId=${path}`, { signal, fetcher }),
  ]);
  if ((!inv.ok && inv.aborted) || (!dec.ok && dec.aborted)) return null;
  if (!inv.ok) return { status: 'failed', failure: inv.failure };
  return { status: 'ok', body: { investigation: inv.body, decisions: dec.ok ? dec.body : null } };
}

/**
 * The StateBlock kind for a live panel that has nothing to show. Not found reads as unknown (the server never says whether it
 * exists); a refusal or a server error is an error; nothing maps to empty or to a healthy word.
 */
export function liveStateKind(s: LiveFailure | 'loading'): StateKind {
  switch (s) {
    case 'loading': return 'loading';
    case 'not_found':
    case 'notChosen': return 'unknown';
    case 'unavailable': return 'unavailable';
    case 'invalid':
    case 'rate_limited':
    case 'error': return 'error';
  }
}
