import { describe, expect, it } from 'vitest';
import { isForbiddenControlLabel } from '../../contract/rules';
import { PROJECT_COPY, type ProjectCopy } from './project';

function allStrings(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'function') return [[path, String((node as (...a: unknown[]) => unknown)(3))]];
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => allStrings(v, path ? `${path}.${k}` : k));
  return [];
}
const keys = (c: ProjectCopy) => allStrings(c).map(([p]) => p).sort();

describe('project copy', () => {
  it('has the same keys in English and Arabic, none empty', () => {
    expect(keys(PROJECT_COPY.ar)).toEqual(keys(PROJECT_COPY.en));
    for (const lang of ['en', 'ar'] as const) {
      for (const [p, s] of allStrings(PROJECT_COPY[lang])) expect(s.trim(), `${lang}.${p}`).not.toBe('');
    }
  });

  it('has balanced braces and Latin digits only', () => {
    for (const lang of ['en', 'ar'] as const) {
      for (const [p, s] of allStrings(PROJECT_COPY[lang])) {
        expect((s.match(/\{/g) ?? []).length, `${lang}.${p}`).toBe((s.match(/\}/g) ?? []).length);
        expect(s, `${lang}.${p}`).not.toMatch(/[٠-٩۰-۹]/);
      }
    }
  });

  it('has no Latin outside {braces} in Arabic', () => {
    for (const [p, s] of allStrings(PROJECT_COPY.ar)) expect(s.replace(/\{[^{}]*\}/g, ''), `ar.${p}`).not.toMatch(/[A-Za-z]/);
  });

  it('keeps the product name in the English h1 only (ScreenHeader takes a plain string)', () => {
    expect(PROJECT_COPY.en.h1('Retail Tower OS')).toBe('Project Intelligence: Retail Tower OS');
    expect(PROJECT_COPY.ar.h1('Retail Tower OS')).not.toMatch(/[A-Za-z]/);
  });

  it('never gives a link or button an action verb', () => {
    for (const lang of ['en', 'ar'] as const) {
      const c = PROJECT_COPY[lang];
      const controls = [
        c.notFound.openPortfolio, c.notFound.viewProject('Retail Tower OS'), c.selected.openCase('INV-DEMO-7'),
        c.selected.inspect('E-1'), c.selected.closeSelection, c.map.clearFilters, c.map.all, c.map.viewMap, c.map.viewTable,
        ...Object.values(c.layer.standard), ...Object.values(c.layer.plain),
      ];
      for (const label of controls) expect(isForbiddenControlLabel(label), `${lang}: ${label}`).toBe(false);
    }
  });

  it('pluralises the component count', () => {
    expect(PROJECT_COPY.en.componentsCount(1)).toBe('1 component');
    expect(PROJECT_COPY.en.componentsCount(6)).toBe('6 components');
    expect(PROJECT_COPY.ar.componentsCount(1)).toBe('مكوّن واحد');
    expect(PROJECT_COPY.ar.componentsCount(6)).toContain('6');
  });
});
