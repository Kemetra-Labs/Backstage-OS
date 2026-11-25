// Shared read rules for the Jira and Confluence observation mappers (BACK-53 mock slice).
//
// Reuse: ADAPT of server/src/connectors/github/github.observer.ts (76a9a13): the same status
// classes, fixed reason codes and isoDate/clip rules. Differences: Atlassian has no GitHub-style 403
// rate limit (429 only), and an answer whose `date` header is older than the TTL is `stale`.
import type { ObservationInput } from '../../evidence/evidence.repository';
import type { EvidenceState } from '../../evidence/evidence.types';
import { AtlassianTransportFailure, type AtlassianReadTransport, type AtlassianResponse } from './atlassian.transport';

export { clip } from '../github/github.observer';

export const PAGE_SIZE = 20;
/** At most this many project or space keys per source: every key costs at least one read. */
export const MAX_KEYS = 10;
/** An answer dated more than this before the read is `stale`, never `ok`. */
export const DEFAULT_TTL_MS = 15 * 60 * 1000;

export type StatusReason =
  | 'denied'
  | 'not_visible'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'unexpected_status'
  | 'transport_error'
  | 'malformed'
  | 'ref_mismatch'
  | 'invalid_ref';

export type Outcome =
  | { readonly ok: true; readonly body: unknown; readonly fresh: boolean }
  | { readonly ok: false; readonly state: EvidenceState; readonly reason: StatusReason };

export class Malformed extends Error {}
export class RefMismatch extends Error {}

export type Make = (state: EvidenceState, sourceRef: string, payload: Record<string, unknown>) => ObservationInput;

/** HTTP status to evidence state. Nothing here can produce `ok`. */
function classify(response: AtlassianResponse, now: Date, ttlMs: number): Outcome {
  const s = response.status;
  if (s >= 200 && s < 300) {
    const date = response.headers['date'];
    if (date === undefined) return { ok: true, body: response.body, fresh: true };
    const at = Date.parse(date);
    // A date we cannot read cannot prove the answer is fresh.
    if (Number.isNaN(at)) return { ok: false, state: 'error', reason: 'malformed' };
    return { ok: true, body: response.body, fresh: now.getTime() - at <= ttlMs };
  }
  if (s === 429) return { ok: false, state: 'unknown', reason: 'rate_limited' };
  if (s === 401 || s === 403) return { ok: false, state: 'denied', reason: 'denied' };
  // Absent and not permitted look the same on Jira and Confluence; we do not try to tell them apart.
  if (s === 404) return { ok: false, state: 'denied', reason: 'not_visible' };
  if (s >= 500 && s < 600) return { ok: false, state: 'unknown', reason: 'unavailable' };
  return { ok: false, state: 'error', reason: 'unexpected_status' };
}

export async function read(transport: AtlassianReadTransport, path: string, now: Date, ttlMs: number): Promise<Outcome> {
  try {
    return classify(await transport.get(path), now, ttlMs);
  } catch (err) {
    if (err instanceof AtlassianTransportFailure) return { ok: false, state: 'unknown', reason: err.kind };
    return { ok: false, state: 'error', reason: 'transport_error' };
  }
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isoDate(v: unknown): string {
  if (typeof v !== 'string') throw new Malformed();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Malformed();
  return d.toISOString();
}

/** A page longer than requested is not a page we asked for: it is refused, not truncated. */
export function list(body: unknown, field: string): unknown[] {
  if (!isObject(body)) throw new Malformed();
  const items = body[field];
  if (!Array.isArray(items) || items.length > PAGE_SIZE) throw new Malformed();
  return items;
}

const SITE_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/;

/**
 * The configured site as `https://<name>.atlassian.net`, or null. Links are only ever built on this
 * base: anything else (http, another host, credentials, a port, a path, query or fragment) gets none.
 */
export function siteBase(site: unknown): string | null {
  if (typeof site !== 'string' || site.length > 200) return null;
  try {
    const u = new URL(site);
    const ok =
      u.protocol === 'https:' &&
      SITE_HOST.test(u.hostname) &&
      u.username === '' &&
      u.password === '' &&
      u.port === '' &&
      (u.pathname === '/' || u.pathname === '') &&
      u.search === '' &&
      u.hash === '';
    return ok ? `https://${u.hostname}` : null;
  } catch {
    return null;
  }
}

/** Keys must be unique, at most MAX_KEYS, and each must match the pattern. */
export function validKeys(keys: unknown, pattern: RegExp): keys is readonly string[] {
  return (
    Array.isArray(keys) &&
    keys.length >= 1 &&
    keys.length <= MAX_KEYS &&
    new Set(keys).size === keys.length &&
    keys.every((k) => typeof k === 'string' && pattern.test(k))
  );
}

export function validTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new RangeError('ttlMs must be a positive integer');
}
