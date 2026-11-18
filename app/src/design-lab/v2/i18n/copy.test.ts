import { describe, expect, it } from 'vitest';
import { isForbiddenControlLabel } from '../../../contract/rules';
import { COPY } from '../../../i18n/strings';
import { COMMON_CONTROL_KEYS } from './common';
import { DECK_CONTROL_KEYS } from './deck';
import { MAP_CONTROL_KEYS } from './map';
import { OBS_CONTROL_KEYS } from './observatory';
import { REPLAY_CONTROL_KEYS } from './replay';
import { TABLE, allCopy, pairOf, translate, type K } from './t';

const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;
const all = allCopy();
const vars = (s: string): string[] => [...s.matchAll(/\$([a-z][A-Za-z0-9]*)/g)].map((m) => m[1]!).sort();
/** Text with {isolated tokens} and $placeholders removed: what an Arabic reader sees as running text. */
const running = (s: string): string => s.replace(/\{[^{}]*\}/g, '').replace(/\$[a-z][A-Za-z0-9]*/g, '');

describe('V2 copy', () => {
  it('has an English and an Arabic text for every key, every persona', () => {
    for (const [k, e] of Object.entries(TABLE)) {
      const pairs = Array.isArray(e) ? [e] : PERSONAS.map((p) => (e as Record<string, readonly [string, string]>)[p]);
      for (const pr of pairs) {
        expect(pr, k).toHaveLength(2);
        expect(pr![0].trim(), `${k} en`).not.toBe('');
        expect(pr![1].trim(), `${k} ar`).not.toBe('');
      }
    }
    expect(all.length).toBeGreaterThan(300);
  });

  it('has balanced {token} braces and the same $placeholders in both languages', () => {
    for (const [k, e] of Object.entries(TABLE)) {
      const pairs = Array.isArray(e) ? [e] : PERSONAS.map((p) => (e as Record<string, readonly [string, string]>)[p]);
      for (const pr of pairs) {
        for (const s of pr!) expect((s.match(/\{/g) ?? []).length, `${k}: ${s}`).toBe((s.match(/\}/g) ?? []).length);
        expect(vars(pr![1]), k).toEqual(vars(pr![0]));
      }
    }
  });

  it('uses Latin digits only, including in Arabic (D-3)', () => {
    for (const [k, l, p, s] of all) expect(s, `${k} ${l} ${p}`).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('keeps Latin letters in Arabic copy inside {isolates} (Blueprint v4 section 7)', () => {
    for (const [k, l, p, s] of all) {
      if (l === 'ar') expect(running(s), `${k} ${p}: ${s}`).not.toMatch(/[A-Za-z]/);
    }
  });

  it('never puts a forbidden action verb on a control label, in either language or any persona', () => {
    const keys = [...COMMON_CONTROL_KEYS, ...MAP_CONTROL_KEYS, ...OBS_CONTROL_KEYS, ...REPLAY_CONTROL_KEYS, ...DECK_CONTROL_KEYS] as readonly K[];
    expect(keys.length).toBeGreaterThan(60);
    for (const k of keys) {
      expect(TABLE[k], `unknown control key ${k}`).toBeDefined();
      for (const lang of ['en', 'ar'] as const) {
        for (const p of PERSONAS) {
          const label = translate(k, lang, p, { n: 3, of: 6 }).replace(/[{}]/g, '');
          expect(isForbiddenControlLabel(label), `${k} ${lang}/${p}: ${label}`).toBe(false);
        }
      }
    }
  });

  it('also keeps the reused V1 labels clean (persona names, copy-proposal control)', () => {
    for (const lang of ['en', 'ar'] as const) {
      const c = COPY[lang];
      for (const label of [c.copyProposal, ...Object.values(c.persona), c.language]) expect(isForbiddenControlLabel(label), `${lang}: ${label}`).toBe(false);
    }
  });

  it('substitutes variables and falls back to the key for a missing key rather than throwing', () => {
    expect(translate('map.m.sources.of', 'en', 'owner', { n: 2, of: 6 })).toBe('2 of 6');
    expect(translate('map.m.sources.of', 'ar', 'owner', { n: 2, of: 6 })).toBe('2 من 6');
    expect(pairOf('no.such.key' as K, 'owner')).toEqual(['no.such.key', 'no.such.key']);
  });

  it('never offers a composite trust or health score anywhere in the copy', () => {
    for (const [k, l, p, s] of all) expect(s, `${k} ${l} ${p}`).not.toMatch(/\b(trust score|overall trust|trust posture|mission health)\b/i);
  });
});
