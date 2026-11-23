// BACK-87: the host-owned Mission Map strings exist in both languages, with the same keys, and the Arabic is Arabic.
import { describe, expect, it } from 'vitest';
import { MAP_LENS_COPY } from './map';

describe('Mission Map lens copy', () => {
  it('has the same keys in English and Arabic, none empty', () => {
    expect(Object.keys(MAP_LENS_COPY.ar).sort()).toEqual(Object.keys(MAP_LENS_COPY.en).sort());
    for (const lang of ['en', 'ar'] as const) {
      for (const [k, v] of Object.entries(MAP_LENS_COPY[lang])) expect(v.trim().length, `${lang}.${k}`).toBeGreaterThan(5);
    }
  });

  it('writes the Arabic strings in Arabic script and the English ones without it', () => {
    for (const v of Object.values(MAP_LENS_COPY.ar)) expect(v).toMatch(/[؀-ۿ]/);
    for (const v of Object.values(MAP_LENS_COPY.en)) expect(v).not.toMatch(/[؀-ۿ]/);
  });

  it('claims no live data and promises no action the screen does not offer', () => {
    for (const lang of ['en', 'ar'] as const) {
      const all = Object.values(MAP_LENS_COPY[lang]).join(' ');
      expect(all).not.toMatch(/\blive\b|real-time|مباشر/i);
    }
  });
});
