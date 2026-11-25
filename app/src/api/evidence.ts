// Evidence record adapter (BACK-57 slice 3). Pure: one record from the server's `GET /evidence`
// (server/src/evidence/evidence.types.ts EvidenceRecord, shape duplicated here) to an EvidenceReference.
// No request code; nothing in app/ calls the server (see portfolio.ts).
//
// HumanDecision mapping, accepted by the owner on BACK-94 (comment 18828): `approved` only when the
// decision cites evidence AND links to the owning record; otherwise `proposed`. The server stores no
// such link today, so every server decision resolves to `proposed`. resolveLabel() enforces the same.
//
// A non-ok record is unread (observation null, reason `unavailable`): never restricted, because the
// server already hid what the caller may not see (it answers 404), and the client never re-derives it.
import type { EvidenceReference, Freshness, SourceAuthority, TruthLabel } from '../contract/types';
import { githubUrl } from './portfolio';

/** Source-derived types only. A HumanDecision has no source: see decisionLabel(). */
const TYPES: Readonly<Record<string, TruthLabel>> = {
  Observation: 'observed',
  Correlation: 'correlated',
  Hypothesis: 'hypothesis',
};
const STATES: readonly string[] = ['ok', 'stale', 'unknown', 'error', 'denied'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const httpsLink = (v: unknown): string | undefined => githubUrl(v) ?? undefined;

/**
 * The server never ages stored evidence, so the record's own age decides: past the source TTL is stale,
 * a time in the future is unknown. A stale state stays stale.
 */
function recordFreshness(state: string, observedAt: string, source: SourceAuthority, now: Date): Freshness {
  if (state === 'stale') return 'stale';
  const ageMs = now.getTime() - Date.parse(observedAt);
  if (ageMs < 0) return 'unknown';
  return ageMs / 1000 > source.ttlSeconds ? 'stale' : 'current';
}

/**
 * The display classification of a server HumanDecision record: `approved` only with citations AND an
 * https github.com link to the owning record, else `proposed`. null for anything that is not a valid
 * decision. The server stores no such link today (only `decision` and `rationale`), so `payload.url`
 * is where a future link would arrive and every current decision is `proposed`.
 */
export function decisionLabel(record: unknown): Extract<TruthLabel, 'proposed' | 'approved'> | null {
  if (!isObject(record) || record['type'] !== 'HumanDecision' || typeof record['id'] !== 'string' || record['id'].length === 0) return null;
  const payload = isObject(record['payload']) ? record['payload'] : {};
  const cited = Array.isArray(record['citations']) && record['citations'].length > 0;
  return cited && httpsLink(payload['url']) ? 'approved' : 'proposed';
}

/**
 * One source-derived record (Observation, Correlation, Hypothesis). `sources` maps a server source id to
 * the authority the portfolio adapter built for it; `now` is injected. A HumanDecision is not source evidence: null here,
 * use decisionLabel(). Invalid input is null, never a throw.
 */
export function toEvidenceReference(record: unknown, sources: ReadonlyMap<string, SourceAuthority>, now: Date): EvidenceReference | null {
  if (!isObject(record)) return null;
  const { id, type, state, sourceId, observedAt, receivedAt } = record;
  const payload = isObject(record['payload']) ? record['payload'] : {};
  if (typeof id !== 'string' || id.length === 0 || typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(TYPES, type)) return null;
  if (typeof state !== 'string' || !STATES.includes(state)) return null;
  if (typeof observedAt !== 'string' || Number.isNaN(Date.parse(observedAt))) return null;

  const link = httpsLink(payload['url']);
  const rule = type === 'Correlation' && typeof payload['rule'] === 'string' ? payload['rule'] : undefined;
  const base = { id, classification: TYPES[type]!, visibility: 'all' as const, ...(rule ? { rule } : {}) };

  const source = typeof sourceId === 'string' ? sources.get(sourceId) : undefined;
  // Not ok, or a source the caller holds no authority for: unread. Never restricted, never invented.
  if ((state !== 'ok' && state !== 'stale') || !source) {
    return { ...base, observation: null, freshness: 'unknown', notReadReason: 'unavailable' };
  }
  return {
    ...base,
    freshness: recordFreshness(state, observedAt, source, now),
    observation: {
      id,
      target: { kind: 'workItem', id, label: id },
      source,
      observedAt,
      ingestedAt: typeof receivedAt === 'string' ? receivedAt : observedAt,
      environment: 'unknown',
      ...(link ? { sourceUrl: link } : {}),
    },
  };
}
