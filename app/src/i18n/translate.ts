// The keyed copy tables and translate(), the one lookup for keyed copy (BACK-92 R7; formerly lenses/i18n/t.ts). Each string is an
// [English, Arabic] pair, so parity is structural. A persona entry maps each of the three demo perspectives to its own pair.
// {braces} and $name follow the conventions in ./format.ts. The lenses reach this through useLens().t (bound by src/bridge/lensState.ts).
import type { Lang, Persona } from '../contract/types';
import { fill, type Vars } from './format';
import { COMMON } from './lenses/common';
import { MAP } from './lenses/map';
import { BC } from './lenses/bc';
import { OBS } from './lenses/observatory';
import { REPLAY_COPY } from './lenses/replay';
import { DECK } from './lenses/deck';

export type { Vars } from './format';
export { plain } from './format';

export type Pair = readonly [string, string];
export type Entry = Pair | Readonly<Record<Persona, Pair>>;
export type Table = Readonly<Record<string, Entry>>;

export const TABLE = { ...COMMON, ...MAP, ...BC, ...OBS, ...REPLAY_COPY, ...DECK } as const;
export type K = keyof typeof TABLE;

const isPair = (e: Entry): e is Pair => Array.isArray(e);

export function pairOf(key: K, persona: Persona): Pair {
  const e: Entry | undefined = (TABLE as Table)[key];
  // A missing key renders as the key itself (visible in review and caught by the copy tests), never a crash.
  if (!e) return [key, key];
  return isPair(e) ? e : e[persona];
}

/** The text for a key in a language and persona, with $variables filled. {braces} are kept; render with <Tx>/<Text>. */
export function translate(key: K, lang: Lang, persona: Persona, vars?: Vars): string {
  return fill(pairOf(key, persona)[lang === 'ar' ? 1 : 0], vars);
}

/** Every entry flattened to [key, lang, persona, text], for tests. */
export function allCopy(): Array<[string, Lang, Persona | null, string]> {
  const out: Array<[string, Lang, Persona | null, string]> = [];
  for (const [k, e] of Object.entries(TABLE) as Array<[string, Entry]>) {
    if (isPair(e)) {
      out.push([k, 'en', null, e[0]], [k, 'ar', null, e[1]]);
    } else {
      for (const p of ['owner', 'technical', 'nontechnical'] as const) out.push([k, 'en', p, e[p][0]], [k, 'ar', p, e[p][1]]);
    }
  }
  return out;
}
