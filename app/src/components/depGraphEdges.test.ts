import { describe, expect, it } from 'vitest';
import { splitEdges } from './depGraphEdges';
import { SHELL } from '../i18n/shell';

const ids = new Set(['a', 'b', 'c']);

describe('splitEdges (BACK-26)', () => {
  it('puts an edge whose endpoint is missing in undrawn instead of dropping it', () => {
    const missingTo = { from: 'a', to: 'zzz' };
    const missingFrom = { from: 'zzz', to: 'b' };
    const r = splitEdges([missingTo, missingFrom], ids);
    expect(r.drawn).toEqual([]);
    expect(r.undrawn).toEqual([missingTo, missingFrom]);
  });
  it('draws edges whose both ends are present', () => {
    const e = { from: 'a', to: 'b' };
    expect(splitEdges([e], ids)).toEqual({ drawn: [e], undrawn: [] });
  });
  it('keeps two edges between the same pair', () => {
    const e1 = { from: 'a', to: 'b', kind: 'authored' };
    const e2 = { from: 'a', to: 'b', kind: 'hypothesis' };
    const r = splitEdges([e1, e2], ids);
    expect(r.drawn).toEqual([e1, e2]);
    expect(r.undrawn).toEqual([]);
  });
  it('preserves every edge exactly once across both lists', () => {
    const edges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'x' }, { from: 'c', to: 'b' }];
    const r = splitEdges(edges, ids);
    expect(r.drawn.length + r.undrawn.length).toBe(edges.length);
  });
});

describe('undrawn links note copy', () => {
  it('pluralises English', () => {
    expect(SHELL.en.map.undrawn(1)).toBe('1 link not drawn on the map — see the table');
    expect(SHELL.en.map.undrawn(3)).toBe('3 links not drawn on the map — see the table');
  });
  it('pluralises Arabic with no Latin letters', () => {
    const f = SHELL.ar.map.undrawn;
    expect(f(1)).toBe('رابط واحد غير مرسوم على الخريطة — راجع الجدول');
    expect(f(2)).toBe('رابطان غير مرسومين على الخريطة — راجع الجدول');
    expect(f(3)).toBe('3 روابط غير مرسومة على الخريطة — راجع الجدول');
    expect(f(11)).toBe('11 رابطًا غير مرسوم على الخريطة — راجع الجدول');
    for (const n of [1, 2, 3, 11]) expect(/[A-Za-z]/.test(f(n))).toBe(false);
  });
});
