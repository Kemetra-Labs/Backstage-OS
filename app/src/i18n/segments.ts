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

/** Relative age with Latin digits in both languages (D-3). */
export function formatAge(minutes: number | null, lang: Lang): string {
  if (minutes === null) return lang === 'ar' ? 'لم يُقرأ قط' : 'never read';
  if (minutes < 1) return lang === 'ar' ? 'الآن' : 'just now';
  if (minutes < 60) return lang === 'ar' ? `قبل ${minutes} د` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return lang === 'ar' ? `قبل ${hours} س` : `${hours} h ago`;
}
