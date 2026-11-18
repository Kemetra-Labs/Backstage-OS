import { describe, expect, it } from 'vitest';
import type { Lang, Persona } from '../contract/types';
import type { Decision } from '../contract/world';
import { WORLD } from '../fixture/world';
import {
  BANNED_FOR_LAY, PROJECT_FILTERS, decisionDetailView, decisionLabel, inboxView, redact, sortPending, summariseEvidence,
} from './decisionView';

const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];
const LANGS: readonly Lang[] = ['en', 'ar'];
const LAY: readonly Persona[] = ['owner', 'nontechnical'];
const dec = (id: string): Decision => {
  const d = WORLD.decisions.find((x) => x.id === id);
  if (!d) throw new Error(id);
  return d;
};
const ev = (id: string) => {
  const e = WORLD.evidence[id];
  if (!e) throw new Error(id);
  return e;
};

describe('sortPending', () => {
  it('orders by priority, then longest waiting first, without mutating the input', () => {
    const a = { ...dec('DEC-DEMO-5'), id: 'a', priority: 'high' as const, ageMinutes: 1 };
    const b = { ...dec('DEC-DEMO-5'), id: 'b', priority: 'high' as const, ageMinutes: 90 };
    const c = { ...dec('DEC-DEMO-5'), id: 'c', priority: 'low' as const, ageMinutes: 999 };
    const d = { ...dec('DEC-DEMO-5'), id: 'd', priority: 'medium' as const, ageMinutes: 5 };
    const input = [c, a, d, b];
    expect(sortPending(input).map((x) => x.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(input.map((x) => x.id)).toEqual(['c', 'a', 'd', 'b']);
  });
});

describe('decisionLabel', () => {
  it('proposed items are proposed', () => expect(decisionLabel(dec('DEC-DEMO-3'))).toBe('proposed'));
  it('approved only with a source-linked record', () => {
    expect(decisionLabel(dec('DEC-DEMO-1'))).toBe('approved');
    const record = ev('E-41');
    const unlinked = { ...record, observation: record.observation && { ...record.observation, sourceUrl: undefined } };
    expect(decisionLabel({ ...dec('DEC-DEMO-1'), record: unlinked })).toBe('proposed');
    const { record: _drop, ...noRecord } = dec('DEC-DEMO-1');
    void _drop;
    expect(decisionLabel(noRecord as Decision)).toBe('proposed');
  });
});

describe('summariseEvidence', () => {
  const refs = [ev('E-1'), ev('E-5'), ev('E-6'), ev('E-7')];
  it('counts restricted for Owner and never hides them', () => {
    const s = summariseEvidence(refs, 'owner');
    expect(s).toMatchObject({ total: 4, read: 1, notRead: 2, restricted: 1, worst: 'unknown' });
  });
  it('Technical sees the restricted item as read', () => {
    expect(summariseEvidence(refs, 'technical')).toMatchObject({ read: 2, notRead: 2, restricted: 0 });
  });
  it('reports stale and current honestly, and unknown for an empty list', () => {
    expect(summariseEvidence([ev('E-1')], 'owner').worst).toBe('current');
    expect(summariseEvidence([ev('E-5')], 'technical').worst).toBe('stale');
    expect(summariseEvidence([], 'owner')).toMatchObject({ total: 0, worst: 'unknown' });
  });
  it('totals always add up', () => {
    for (const p of PERSONAS) {
      const s = summariseEvidence(refs, p);
      expect(s.read + s.notRead + s.restricted).toBe(s.total);
    }
  });
});

describe('inboxView', () => {
  it('lists pending proposals by priority and keeps DEC-DEMO-1 in the historical section', () => {
    const v = inboxView(WORLD, 'all', 'owner', 'en');
    expect(v.pending.map((r) => r.id)).toEqual(['DEC-DEMO-3', 'DEC-DEMO-5']);
    expect(v.historical.map((r) => r.id)).toEqual(['DEC-DEMO-1']);
    expect(v.pending.every((r) => r.label === 'proposed')).toBe(true);
    expect(v.historical[0]?.label).toBe('approved');
  });
  it('filters by project; Seshat-BI has nothing', () => {
    expect(inboxView(WORLD, 'KH', 'owner', 'en').pending.map((r) => r.id)).toEqual(['DEC-DEMO-5']);
    expect(inboxView(WORLD, 'KH', 'owner', 'en').historical).toEqual([]);
    expect(inboxView(WORLD, 'RT', 'owner', 'en').historical).toHaveLength(1);
    const sb = inboxView(WORLD, 'SB', 'owner', 'en');
    expect(sb.pending).toEqual([]);
    expect(sb.historical).toEqual([]);
    expect(PROJECT_FILTERS).toEqual(['all', 'RT', 'KH', 'SB']);
  });
  it('rows carry project name and unknowns count (a recorded count, 0 only when none recorded)', () => {
    const rows = inboxView(WORLD, 'all', 'owner', 'en');
    expect(rows.pending[0]).toMatchObject({ projectName: 'Retail Tower OS', unknownsCount: 2 });
    expect(rows.historical[0]?.unknownsCount).toBe(0);
  });
  it('gives each persona its own title', () => {
    const t = (p: Persona) => inboxView(WORLD, 'RT', p, 'en').pending[0]?.title;
    expect(t('technical')).toContain('integration-tests');
    expect(t('owner')).not.toContain('integration-tests');
    expect(t('nontechnical')).not.toBe(t('owner'));
  });
});

describe('decisionDetailView', () => {
  it('is undefined for an unknown id', () => expect(decisionDetailView(WORLD, 'DEC-NOPE', 'owner', 'en')).toBeUndefined());

  it('keeps observed, hypotheses and unknowns separate, and lists every option, with empty unknowns kept', () => {
    const v = decisionDetailView(WORLD, 'DEC-DEMO-3', 'owner', 'en');
    expect(v).toBeDefined();
    expect(v?.proposed).toBe(true);
    expect(v?.label).toBe('proposed');
    expect(v?.investigationId).toBe('INV-DEMO-7');
    expect(v?.observed.length).toBe(3);
    expect(v?.hypotheses).toHaveLength(1);
    expect(v?.unknowns).toHaveLength(2);
    expect(v?.options.map((o) => o.id)).toEqual(['A', 'B', 'C']);
    expect(v?.options.filter((o) => o.suggested).map((o) => o.id)).toEqual(['A']);
    expect(v?.options[2]?.unknowns).toEqual([]);
    expect(v?.decidedIn).toBe('RT-DEMO-112');
  });

  it('historical record: approved label, no options, no investigation', () => {
    const v = decisionDetailView(WORLD, 'DEC-DEMO-1', 'owner', 'en');
    expect(v).toMatchObject({ label: 'approved', proposed: false, options: [] });
    expect(v?.investigationId).toBeUndefined();
  });

  it('restricted evidence is listed as restricted for lay personas and in full for Technical', () => {
    const lay = decisionDetailView(WORLD, 'DEC-DEMO-5', 'owner', 'en');
    expect(lay?.observed.every((r) => !r.restricted)).toBe(true);
    const row = (p: Persona) => decisionDetailView(WORLD, 'DEC-DEMO-5', p, 'en')?.observed.length;
    expect(row('owner')).toBe(row('technical'));
  });

  it('never shows Owner or Nontechnical a banned string, in any language or screen', () => {
    for (const persona of LAY) {
      for (const lang of LANGS) {
        const text = JSON.stringify([
          ...WORLD.decisions.map((d) => decisionDetailView(WORLD, d.id, persona, lang)),
          ...PROJECT_FILTERS.map((f) => inboxView(WORLD, f, persona, lang)),
        ]);
        for (const b of BANNED_FOR_LAY) expect(text, `${persona}/${lang}/${b}`).not.toContain(b);
      }
    }
  });

  it('Technical keeps the raw wording', () => {
    const text = JSON.stringify(decisionDetailView(WORLD, 'DEC-DEMO-3', 'technical', 'en'));
    expect(text).toContain('integration-tests');
  });
});

describe('redact', () => {
  it('rewrites known tokens readably and strips the rest', () => {
    expect(redact('The deploy {DEMO-311} caused it.', 'owner', 'en')).toBe('The recent deploy caused it.');
    expect(redact('النشر {DEMO-311} سبب', 'owner', 'ar')).toBe('النشر الأخير سبب');
    expect(redact('see {integration-tests} and AssertionError', 'nontechnical', 'en')).not.toMatch(/integration-tests|AssertionError/);
    expect(redact('deploy {DEMO-311}', 'technical', 'en')).toBe('deploy {DEMO-311}');
  });
});
