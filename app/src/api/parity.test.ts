// App half of the evidence / investigation / decision response parity check (BACK-98). The server half,
// server/test/evidence/evidence-parity.spec.ts, builds these three bodies through the real repositories on a
// seeded Postgres and requires them to equal these files. Here every record must parse through the app's
// adapter: nothing malformed, nothing dropped. A shape change on either side fails one of the two tests.
import { describe, expect, it } from 'vitest';
import type { SourceAuthority } from '../contract/types';
import DECISIONS from '../fixture/decisions-response.json';
import EVIDENCE from '../fixture/evidence-response.json';
import INVESTIGATION from '../fixture/investigation-response.json';
import { decisionLabel, toEvidenceReference } from './evidence';

/** The server's fixture clock (evidence-parity.spec.ts NOW). */
const NOW = new Date('2026-11-25T12:00:00.000Z');

type Rec = Record<string, unknown>;

/** The authority the portfolio adapter would build for each granted source in the body. */
function sourcesOf(records: readonly Rec[]): Map<string, SourceAuthority> {
  const ids = records.map((r) => r['sourceId']).filter((s): s is string => typeof s === 'string');
  return new Map(ids.map((id) => [id, {
    provider: 'github', connectivity: 'reachable', lastSuccessAt: NOW.toISOString(), ageMinutes: 0, ttlSeconds: 3600, synthetic: true,
  } satisfies SourceAuthority]));
}

/** Parses a list of evidence records the way the app would; returns what it dropped. */
function parseRecords(records: readonly Rec[]) {
  const sources = sourcesOf(records);
  const parsed = records.map((r) => (r['type'] === 'HumanDecision' ? decisionLabel(r) : toEvidenceReference(r, sources, NOW)));
  return { parsed, dropped: records.filter((_, i) => parsed[i] === null).map((r) => r['id']) };
}

/** GET /decisions items: the BACK-59 DecisionRecord shape (server/src/evidence/evidence.types.ts), duplicated. */
function isDecisionRecord(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Rec;
  const str = (k: string) => typeof r[k] === 'string' && (r[k] as string).length > 0;
  return str('id') && str('investigationId') && str('decision') && str('rationale') && str('createdAt')
    && !Number.isNaN(Date.parse(r['createdAt'] as string))
    && (r['createdBy'] === null || str('createdBy'))
    && Array.isArray(r['citations']) && (r['citations'] as unknown[]).every((c) => typeof c === 'string')
    && Object.keys(r).sort().join() === ['citations', 'createdAt', 'createdBy', 'decision', 'id', 'investigationId', 'rationale'].join();
}

describe('GET /evidence fixture (BACK-98)', () => {
  const items = EVIDENCE.items as Rec[];

  it('parses every record: nothing malformed, nothing dropped', () => {
    expect(items.length).toBe(6);
    expect(parseRecords(items).dropped).toEqual([]);
  });

  it('keeps each state honest: error and unknown are unread, stale stays stale, a decision is proposed', () => {
    const { parsed } = parseRecords(items);
    const at = (pred: (r: Rec) => boolean) => parsed[items.findIndex(pred)];
    const obs = (state: string) => at((r) => r['type'] === 'Observation' && r['state'] === state) as ReturnType<typeof toEvidenceReference>;
    for (const s of ['error', 'unknown']) expect(obs(s)).toMatchObject({ observation: null, freshness: 'unknown', notReadReason: 'unavailable' });
    expect(obs('stale')?.freshness).toBe('stale');
    expect(obs('ok')?.classification).toBe('observed');
    expect(at((r) => r['type'] === 'HumanDecision')).toBe('proposed');
  });

  it('the check bites: a renamed or missing field drops the record', () => {
    const renamed = items.map((r) => {
      const { observedAt, ...rest } = r;
      return { ...rest, observed_at: observedAt };
    });
    const sourceRecords = items.filter((r) => r['type'] !== 'HumanDecision').length;
    expect(parseRecords(renamed).dropped).toHaveLength(sourceRecords);
    expect(parseRecords(items.map((r) => ({ ...r, type: 'observation' }))).dropped).toHaveLength(items.length);
  });
});

describe('GET /investigations/:id fixture (BACK-98)', () => {
  const inv = INVESTIGATION as Rec;

  it('carries the investigation fields as strings and a parsable evidence list', () => {
    for (const k of ['id', 'projectId', 'title', 'createdAt']) expect(typeof inv[k]).toBe('string');
    expect(['open', 'closed']).toContain(inv['status']);
    const evidence = inv['evidence'] as Rec[];
    expect(evidence.length).toBeGreaterThan(0);
    expect(parseRecords(evidence).dropped).toEqual([]);
    expect(evidence.every((r) => r['investigationId'] === inv['id'] || r['investigationId'] === null)).toBe(true);
  });
});

describe('GET /decisions fixture (BACK-98)', () => {
  const items = DECISIONS.items as Rec[];

  it('every item has exactly the decision record shape, with creator and time', () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items.filter((d) => !isDecisionRecord(d))).toEqual([]);
  });

  it('a decision cites records that exist in the evidence body (ids are consistent across the files)', () => {
    const ids = new Set((EVIDENCE.items as Rec[]).map((r) => r['id']));
    for (const d of items) for (const c of d['citations'] as string[]) expect(ids.has(c)).toBe(true);
  });

  it('the shape check bites: an extra, missing or mistyped field fails it', () => {
    const d = items[0]!;
    expect(isDecisionRecord({ ...d, extra: 1 })).toBe(false);
    const { createdBy: _drop, ...missing } = d;
    expect(isDecisionRecord(missing)).toBe(false);
    expect(isDecisionRecord({ ...d, citations: 'e-1' })).toBe(false);
  });
});
