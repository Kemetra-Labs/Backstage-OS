import { describe, expect, it } from 'vitest';
import { isForbiddenControlLabel } from '../../contract/rules';
import { HOME_COPY } from './home';
import { PORTFOLIO_COPY } from './portfolio';

/** Flattens every string in a copy tree; functions are called with a sample number. */
function flat(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'function') {
    const f = node as (a: never) => unknown;
    return [[path, String(f(7 as never))]];
  }
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k));
  return [];
}

const SETS = { home: HOME_COPY, portfolio: PORTFOLIO_COPY } as const;
const LINK_KEYS = /(^|\.)(openCase|openProposal|viewProduct|inspect|open)(\(|$)/;

describe.each(Object.entries(SETS))('%s copy', (_name, copy) => {
  const en = flat(copy.en);
  const ar = flat(copy.ar);

  it('has the same keys in English and Arabic and no empty strings', () => {
    expect(ar.map(([p]) => p).sort()).toEqual(en.map(([p]) => p).sort());
    for (const [p, s] of [...en, ...ar]) expect(s.trim(), p).not.toBe('');
  });

  it('has balanced braces and Latin digits only', () => {
    for (const [p, s] of [...en, ...ar]) {
      expect((s.match(/\{/g) ?? []).length, p).toBe((s.match(/\}/g) ?? []).length);
      expect(s, p).not.toMatch(/[٠-٩۰-۹]/);
    }
  });

  it('keeps every Latin run in Arabic inside {braces}', () => {
    for (const [p, s] of ar) {
      const outside = s.replace(/\{[^{}]*\}/g, '');
      expect(outside, p).not.toMatch(/[A-Za-z]/);
    }
  });

  it('uses no forbidden action verb in link labels', () => {
    for (const [p, s] of [...en, ...ar]) if (LINK_KEYS.test(p)) expect(isForbiddenControlLabel(s.replace(/[{}]/g, '')), `${p}: ${s}`).toBe(false);
  });
});
