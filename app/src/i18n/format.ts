// The one formatter for every copy string, host and lens alike (BACK-92 R7). Conventions:
//   {braces}  mark a left-to-right token (ids, times, product names, code); rendered as an isolate by <Text>/<Tx>, stripped by plain().
//   $name     is a variable in a keyed table entry, filled by fill(). Host copy trees take arguments as functions instead.
//   Digits are Latin in both languages (D-3).
import type { Lang } from '../contract/types';

export interface Segment {
  readonly ltr: boolean;
  readonly text: string;
}

const TOKEN = /\{([^{}]+)\}/g;

/**
 * Splits copy into plain and left-to-right segments. Tokens are marked explicitly with {braces} by the copy author,
 * so isolation never depends on guessing which words are Latin. Punctuation outside the braces stays outside the isolate.
 */
export function segments(text: string): readonly Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ ltr: false, text: text.slice(last, at) });
    out.push({ ltr: true, text: m[1] ?? '' });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ ltr: false, text: text.slice(last) });
  return out;
}

/** Strips the {brace} markers for attributes (aria-label, title) and matching, where isolates cannot be rendered. */
export const plain = (s: string): string => s.replace(/[{}]/g, '');

export type Vars = Readonly<Record<string, string | number>>;

/** The $name variable pattern; a name starts with a lower-case letter. */
export const VAR = /\$([a-z][A-Za-z0-9]*)/g;

/** Fills $name variables from `vars`; a variable with no value stays as written, so a gap is visible rather than blank. */
export function fill(raw: string, vars?: Vars): string {
  if (!vars) return raw;
  return raw.replace(VAR, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Relative age with Latin digits in both languages (D-3). */
export function formatAge(minutes: number | null, lang: Lang): string {
  if (minutes === null) return lang === 'ar' ? 'لم يُقرأ قط' : 'never read';
  if (minutes < 1) return lang === 'ar' ? 'الآن' : 'just now';
  if (minutes < 60) return lang === 'ar' ? `قبل ${minutes} د` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return lang === 'ar' ? `قبل ${hours} س` : `${hours} h ago`;
}
