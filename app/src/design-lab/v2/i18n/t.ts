// V2 copy. Each string is an [English, Arabic] pair, so parity is structural. A persona entry maps each of the three
// demo perspectives to its own pair. {braces} mark left-to-right tokens (ids, product names, code); $name is a variable.
import type { Lang, Persona } from '../../../contract/types';
import { COMMON } from './common';
import { MAP } from './map';
import { OBS } from './observatory';
import { REPLAY_COPY } from './replay';
import { DECK } from './deck';

export type Pair = readonly [string, string];
export type Entry = Pair | Readonly<Record<Persona, Pair>>;
export type Table = Readonly<Record<string, Entry>>;

export const TABLE = { ...COMMON, ...MAP, ...OBS, ...REPLAY_COPY, ...DECK } as const;
export type K = keyof typeof TABLE;

const isPair = (e: Entry): e is Pair => Array.isArray(e);

export function pairOf(key: K, persona: Persona): Pair {
  const e: Entry | undefined = (TABLE as Table)[key];
  // A missing key renders as the key itself (visible in review and caught by the copy tests), never a crash.
  if (!e) return [key, key];
  return isPair(e) ? e : e[persona];
}

export type Vars = Readonly<Record<string, string | number>>;

export function translate(key: K, lang: Lang, persona: Persona, vars?: Vars): string {
  const raw = pairOf(key, persona)[lang === 'ar' ? 1 : 0];
  if (!vars) return raw;
  return raw.replace(/\$([a-z][A-Za-z0-9]*)/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Strips the {brace} markers for attributes (aria-label, title) where isolates cannot be rendered. */
export const plain = (s: string): string => s.replace(/[{}]/g, '');

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
