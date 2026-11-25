import { describe, expect, it } from 'vitest';
import { isForbiddenControlLabel } from '../../contract/rules';
import { COPY } from '../strings';
import { COMMON_CONTROL_KEYS } from './common';
import { DECK_CONTROL_KEYS } from './deck';
import { MAP_CONTROL_KEYS } from './map';
import { OBS_CONTROL_KEYS } from './observatory';
import { REPLAY_CONTROL_KEYS } from './replay';
import { TABLE, pairOf, translate, type K } from '../translate';

// Parity, braces, $placeholders, Latin digits and Latin-in-isolates are the shared rules in ../copy-rules.test.ts.
const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;

describe('lens copy', () => {
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

  it('also keeps the reused host labels clean (persona names, copy-proposal control)', () => {
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

});
