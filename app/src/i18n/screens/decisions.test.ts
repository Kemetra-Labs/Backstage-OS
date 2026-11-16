import { describe, expect, it } from 'vitest';
import { isForbiddenControlLabel } from '../../contract/rules';
import { DECISIONS_COPY, type DecisionsCopy } from './decisions';

// Flatten the copy into strings, calling each function with sample arguments.
function strings(c: DecisionsCopy): readonly string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') {
      out.push((v as (...a: unknown[]) => string)(0, 1, 2, 'x'), (v as (...a: unknown[]) => string)(3, 1, 2, 'x'));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(c);
  return out;
}

const keys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

describe('decisions copy', () => {
  it('EN and AR have the same keys', () => {
    expect(keys(DECISIONS_COPY.ar)).toEqual(keys(DECISIONS_COPY.en));
    expect(DECISIONS_COPY.ar.future.needs).toHaveLength(DECISIONS_COPY.en.future.needs.length);
  });

  it('Arabic has no Latin outside {braces}', () => {
    for (const s of strings(DECISIONS_COPY.ar)) {
      const outside = s.replace(/\{[^{}]*\}/g, '').replace(/\b[x]\b/g, '');
      expect(outside, s).not.toMatch(/[A-Za-z]/);
    }
  });

  it('uses Latin digits only', () => {
    for (const s of [...strings(DECISIONS_COPY.ar), ...strings(DECISIONS_COPY.en)]) expect(s).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('link labels never read as actions', () => {
    for (const lang of ['en', 'ar'] as const) {
      const c = DECISIONS_COPY[lang];
      const labels = [
        c.openProposal('DEC-DEMO-3'), c.openRecord('DEC-DEMO-1'), c.inspectEvidence('E-1'), c.openCase('INV-DEMO-7'),
        c.viewProject('Retail Tower OS'), c.error.open, c.filterAll, c.nextTitle, c.nextTitlePlain,
      ];
      for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
    }
  });

  it('counts, unknowns and the evidence summary say what they count', () => {
    const c = DECISIONS_COPY.en;
    expect(c.pendingCount(1)).toBe('1 proposal');
    expect(c.pendingCount(2)).toBe('2 proposals');
    expect(c.unknownsLine(0)).toContain('none recorded');
    expect(c.unknownsLine(2)).toBe('Unknowns: 2');
    expect(c.evidenceSummary(1, 2, 3, 'stale')).toBe('Evidence: 1 read, 2 not read, 3 restricted. Worst freshness: stale.');
    expect(DECISIONS_COPY.ar.pendingCount(2)).toContain('2');
  });

  it('says plainly that nothing is built or decided here', () => {
    const en = DECISIONS_COPY.en;
    expect(en.notice.body).toMatch(/does not record, approve or execute/);
    expect(en.future.needs.join(' ')).toMatch(/authenticated approver identity/i);
    expect(en.future.closing).toMatch(/Nothing on this page is a control/);
  });
});
