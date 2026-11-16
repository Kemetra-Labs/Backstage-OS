import { describe, expect, it } from 'vitest';
import { isForbiddenControlLabel } from '../../contract/rules';
import { EVIDENCE } from './evidence';
import { INVESTIGATION } from './investigation';

function strings(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'function') return [[path, String((node as (...a: unknown[]) => unknown)('E-1'))]];
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

const outsideBraces = (s: string) => s.replace(/\{[^{}]*\}/g, '');
const keys = (c: unknown) => strings(c).map(([p]) => p).sort();
const balanced = (s: string) => (s.match(/\{/g) ?? []).length === (s.match(/\}/g) ?? []).length;

describe.each([
  ['investigation', INVESTIGATION],
  ['evidence', EVIDENCE],
] as const)('%s copy', (_name, copy) => {
  it('has the same keys in English and Arabic and no empty string', () => {
    expect(keys(copy.ar)).toEqual(keys(copy.en));
    for (const lang of ['en', 'ar'] as const) for (const [p, s] of strings(copy[lang])) expect(s.trim(), `${lang}.${p}`).not.toBe('');
  });

  it('has no Latin letters in Arabic outside {braces}, and balanced braces', () => {
    for (const [p, s] of strings(copy.ar)) expect(outsideBraces(s), `ar.${p}`).not.toMatch(/[A-Za-z]/);
    for (const lang of ['en', 'ar'] as const) for (const [p, s] of strings(copy[lang])) expect(balanced(s), `${lang}.${p}`).toBe(true);
  });

  it('uses Latin digits only', () => {
    for (const [p, s] of strings(copy.ar)) expect(s, p).not.toMatch(/[٠-٩۰-۹]/);
  });
});

describe('control labels', () => {
  it('no link label contains an action verb', () => {
    for (const lang of ['en', 'ar'] as const) {
      const i = INVESTIGATION[lang];
      const e = EVIDENCE[lang];
      const labels = [
        i.openExplorer, i.inspect('E-1'), i.decision.open('DEC-DEMO-3'), i.context.viewProject('Retail Tower OS'),
        i.context.viewComponent('stock-sync'), i.summary.openFullRoom('INV-DEMO-7'),
        e.back('INV-DEMO-7'), e.supporting.openCase('INV-DEMO-7'), e.supporting.openProposal('DEC-DEMO-3'),
        e.supporting.viewProject('Khepri'), e.supporting.viewComponent('khepri-api'), e.siblings.inspect('E-2'), e.openPortfolio,
      ];
      for (const l of labels) expect(isForbiddenControlLabel(l), `${lang}: ${l}`).toBe(false);
    }
  });
});

describe('persona redaction and truth in copy', () => {
  const BANNED = /integration-tests|#DEMO-4471|PR #DEMO-88|AssertionError|example\.invalid|DEMO-4468|DEMO-5120|DEMO-311/;
  it('Owner and Nontechnical text never carries a banned token; Technical may name the deploy', () => {
    for (const lang of ['en', 'ar'] as const) {
      const c = INVESTIGATION[lang].summary;
      for (const p of ['owner', 'nontechnical'] as const) {
        expect(c.hypothesis.text[p]).not.toMatch(BANNED);
        expect(c.impact.text[p]).not.toMatch(BANNED);
      }
      expect(c.hypothesis.text.technical).toContain('DEMO-311');
    }
  });
  it('customer impact stays unknown for every persona', () => {
    for (const s of Object.values(INVESTIGATION.en.summary.impact.text)) expect(s).toMatch(/^Unknown, not evidenced/);
    for (const s of Object.values(INVESTIGATION.ar.summary.impact.text)) expect(s).toMatch(/^مجهول، لا دليل عليه/);
  });
  it('the conflict text says health is degraded, never healthy', () => {
    expect(INVESTIGATION.en.summary.conflict.explain).toMatch(/degraded, never healthy/);
  });
  it('every truth label has an explanation', () => {
    for (const lang of ['en', 'ar'] as const) {
      expect(Object.keys(EVIDENCE[lang].classification.text).sort()).toEqual(['approved', 'correlated', 'hypothesis', 'observed', 'proposed', 'unknown']);
    }
  });
});
