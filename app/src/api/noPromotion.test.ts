// BACK-54: the server-record adapter never promotes an inference (see also src/contract/noPromotion.test.ts).
import { describe, expect, it } from 'vitest';
import { resolveLabel } from '../contract/rules';
import type { SourceAuthority } from '../contract/types';
import { decisionLabel, toEvidenceReference } from './evidence';

const SOURCE: SourceAuthority = {
  provider: 'github', connectivity: 'reachable', lastSuccessAt: '2026-11-25T10:00:00Z', ageMinutes: 5, ttlSeconds: 3600, synthetic: true,
};

describe('the evidence adapter never promotes (BACK-54)', () => {
  const sources = new Map([['src-1', SOURCE]]);
  const now = new Date('2026-11-25T10:10:00Z');
  const record = (type: string, extra: Record<string, unknown> = {}) => ({
    id: 'r-1', type, state: 'ok', sourceId: 'src-1', observedAt: '2026-11-25T10:00:00Z', receivedAt: '2026-11-25T10:00:00Z', payload: {}, citations: [], ...extra,
  });

  it('maps Correlation and Hypothesis records to their own labels, never observed', () => {
    expect(toEvidenceReference(record('Correlation'), sources, now)?.classification).toBe('correlated');
    expect(toEvidenceReference(record('Hypothesis'), sources, now)?.classification).toBe('hypothesis');
    for (const t of ['Correlation', 'Hypothesis']) {
      const r = toEvidenceReference(record(t, { payload: { url: 'https://github.com/o/r/pull/1', rule: 'x' } }), sources, now)!;
      expect(resolveLabel(r)).not.toBe('observed');
      expect(resolveLabel(r)).not.toBe('approved');
    }
  });

  it('refuses a record with no type or an unknown type instead of guessing one', () => {
    for (const type of [undefined, '', 'observation', 'Fact', 'HumanDecision']) {
      expect(toEvidenceReference(record(type as string), sources, now)).toBeNull();
    }
  });

  it('a decision is approved only with citations and an owning-record link; otherwise proposed', () => {
    const d = (citations: string[], url?: string) => ({ id: 'd-1', type: 'HumanDecision', citations, payload: url ? { url } : {} });
    expect(decisionLabel(d([]))).toBe('proposed');
    expect(decisionLabel(d(['e-1']))).toBe('proposed');
    expect(decisionLabel(d([], 'https://github.com/o/r/issues/1'))).toBe('proposed');
    expect(decisionLabel(d(['e-1'], 'https://github.com/o/r/issues/1'))).toBe('approved');
    expect(decisionLabel({ ...d(['e-1'], 'https://github.com/o/r/issues/1'), type: 'Hypothesis' })).toBeNull();
  });
});
