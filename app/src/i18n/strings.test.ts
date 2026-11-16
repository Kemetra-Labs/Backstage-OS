import { describe, expect, it } from 'vitest';
import { isForbiddenControlLabel } from '../contract/rules';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { COPY, type Copy } from './strings';

/** Flattens every string reachable in the copy tree, calling functions with sample arguments. */
function allStrings(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'function') return [[path, String((node as (...a: unknown[]) => unknown)(3, 5))]];
  if (Array.isArray(node)) return node.flatMap((v, i) => allStrings(v, `${path}[${i}]`));
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => allStrings(v, path ? `${path}.${k}` : k));
  return [];
}

const keys = (c: Copy) => allStrings(c).map(([p]) => p).sort();

describe('copy parity and rules', () => {
  it('has the same keys in English and Arabic', () => {
    expect(keys(COPY.ar)).toEqual(keys(COPY.en));
  });

  it('has no empty strings', () => {
    for (const lang of ['en', 'ar'] as const) {
      for (const [path, s] of allStrings(COPY[lang])) expect(s.trim(), `${lang}.${path}`).not.toBe('');
    }
  });

  it('has balanced {token} braces everywhere', () => {
    for (const lang of ['en', 'ar'] as const) {
      for (const [path, s] of allStrings(COPY[lang])) {
        const open = (s.match(/\{/g) ?? []).length;
        const close = (s.match(/\}/g) ?? []).length;
        expect(open, `${lang}.${path}`).toBe(close);
      }
    }
  });

  it('uses Latin digits only, including in Arabic (D-3)', () => {
    for (const [path, s] of allStrings(COPY.ar)) expect(s, path).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('never puts a forbidden action verb on a control label', () => {
    for (const lang of ['en', 'ar'] as const) {
      const c = COPY[lang];
      const controls = [c.copyProposal, c.drawer.close, c.openEvidence('E-1'), ...Object.values(c.persona)];
      for (const label of controls) expect(isForbiddenControlLabel(label), `${lang}: ${label}`).toBe(false);
    }
  });

  it('keeps customer impact unknown in both languages for every persona', () => {
    for (const s of Object.values(COPY.en.impactUnknown)) expect(s).toMatch(/^Unknown, not evidenced/);
    for (const s of Object.values(COPY.ar.impactUnknown)) expect(s).toMatch(/^مجهول، لا دليل عليه/);
  });

  it('has a persona title for every evidence item in the fixture', () => {
    for (const lang of ['en', 'ar'] as const) {
      for (const e of INV_DEMO_7.evidence) {
        for (const p of ['owner', 'technical', 'nontechnical'] as const) expect(COPY[lang].evidenceItem[e.id]?.[p], `${lang} ${e.id} ${p}`).toBeTruthy();
      }
    }
  });

  it('keeps nontechnical copy free of ids, job names and source names', () => {
    for (const lang of ['en', 'ar'] as const) {
      const c = COPY[lang];
      const nontech = [c.caseTitle, c.decidedIn, c.impactUnknown, c.checkFailing, c.proposal, ...Object.values(c.facts), ...Object.values(c.evidenceItem)]
        .map((b) => b.nontechnical);
      for (const s of nontech) expect(s, `${lang}: ${s}`).not.toMatch(/RT-DEMO|#DEMO|integration-tests|\bPR\b|fixVersion/);
    }
  });
});
