import { describe, expect, it } from 'vitest';
import { fill, formatAge, plain, segments } from './format';

describe('fill and plain: the shared $variable and {brace} conventions (BACK-92 R7)', () => {
  it('fills known $variables and leaves an unknown one visible', () => {
    expect(fill('$n of $of', { n: 2, of: 6 })).toBe('2 of 6');
    expect(fill('$n of $of', { n: 2 })).toBe('2 of $of');
    expect(fill('no vars', undefined)).toBe('no vars');
    expect(fill('price $5', { n: 1 })).toBe('price $5');
  });
  it('strips brace markers only', () => {
    expect(plain('فحص {stock-sync} على {main}')).toBe('فحص stock-sync على main');
  });
});

describe('segments: {braces} mark left-to-right tokens', () => {
  it('splits plain text and LTR tokens in order', () => {
    expect(segments('فشل فحص {stock-sync} على {main}.')).toEqual([
      { ltr: false, text: 'فشل فحص ' },
      { ltr: true, text: 'stock-sync' },
      { ltr: false, text: ' على ' },
      { ltr: true, text: 'main' },
      { ltr: false, text: '.' },
    ]);
  });
  it('returns one plain segment when there are no tokens', () => {
    expect(segments('No tokens here')).toEqual([{ ltr: false, text: 'No tokens here' }]);
  });
  it('keeps punctuation outside the isolate', () => {
    expect(segments('({v0.9.4})')).toEqual([
      { ltr: false, text: '(' },
      { ltr: true, text: 'v0.9.4' },
      { ltr: false, text: ')' },
    ]);
  });
  it('treats an unmatched brace as plain text', () => {
    expect(segments('a {b')).toEqual([{ ltr: false, text: 'a {b' }]);
  });
});

describe('formatAge: Latin digits in both languages (D-3)', () => {
  it('formats minutes and hours in English', () => {
    expect(formatAge(6, 'en')).toBe('6 min ago');
    expect(formatAge(540, 'en')).toBe('9 h ago');
    expect(formatAge(0, 'en')).toBe('just now');
  });
  it('formats minutes and hours in Arabic with Latin digits', () => {
    expect(formatAge(6, 'ar')).toBe('قبل 6 د');
    expect(formatAge(540, 'ar')).toBe('قبل 9 س');
    expect(formatAge(0, 'ar')).toBe('الآن');
  });
  it('says never read for null', () => {
    expect(formatAge(null, 'en')).toBe('never read');
    expect(formatAge(null, 'ar')).toBe('لم يُقرأ قط');
  });
});
