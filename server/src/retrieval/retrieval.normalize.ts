// Search-only normalization (BACK-106 R3), adapted from the COG-01 research port's normalize/tokens
// (server/test/research/cognitive-core/memory.ts) with alef maqsura, ta marbuta and digit folding added.
// It is used only to compare. Stored and returned text and native identifiers are never changed.
//
// Two folds (COG-08 second review). `normalizeText` keeps combining marks, so ordinary words in any
// script stay distinct (Devanagari, for one). `shapeFold` also drops every mark and is used only to ask
// "is this shaped like an identifier?", so a key disguised with marks is still answered exactly.

const DIACRITICS = /[\u064b-\u065f\u0670\u0640]/gu; // Arabic harakat, superscript alef, tatweel
// Invisible format characters (zero-width space/joiners, word joiner, bidi controls, BOM). Without this,
// `BACK\u200B-8` escapes the identifier-shape check and is fuzzy-matched (COG-08 adversarial finding).
// Invisible in every comparison: format characters, and default-ignorable code points that are not
// combining marks (U+2065 and others outside Cf; COG-08 review 7). Default-ignorable marks such as the
// variation selectors and U+034F stay in words, where they change meaning (COG-08 review 8); the shape
// fold drops every mark, so they still cannot hide an identifier.
const FORMAT = /(?:\p{Cf}|(?!\p{M})\p{DI})/gu;
// Control characters other than whitespace are invisible, as at mention boundaries; U+0085 NEXT LINE
// separates like a newline (COG-08 review 8: one classification for queries and mentions).
const CONTROLS = /[\x00-\x08\x0e-\x1f\x7f-\x84\x86-\x9f]/gu;
const NEXT_LINE = /\x85/gu;
// Every dash, the minus sign and the small and fullwidth hyphen-minus fold to `-` (COG-08 reviews).
const DASHES = /[\p{Pd}\u2212\ufe63\uff0d]/gu;
const MARKS = /\p{M}/gu;
const ALEF = /[\u0623\u0625\u0622\u0671]/gu; // alef with hamza above, below, madda, wasla
const DIGIT = /\p{Nd}/gu;
const ND = /^\p{Nd}$/u;

/**
 * The value of any Unicode decimal digit. Unicode encodes every decimal digit set as contiguous runs of
 * ten starting at zero, so the value is the distance to the start of the run of digits, modulo 10.
 */
function digitValue(ch: string): string {
  if (ch >= '0' && ch <= '9') return ch;
  const cp = ch.codePointAt(0)!;
  let back = 0;
  while (back < 100 && ND.test(String.fromCodePoint(cp - back - 1))) back++;
  return String(back % 10);
}

export function normalizeText(s: string): string {
  return (
    s
      // Invisible characters go first: lowercasing (a Greek final sigma) and composition (a letter and its
      // accent) both look at neighbours, so an invisible one must not still be there (COG-08 review 9).
      .replace(FORMAT, '')
      .replace(CONTROLS, '')
      .replace(NEXT_LINE, ' ')
      .normalize('NFKC')
      .toLowerCase()
      .replace(FORMAT, '') // NFKC can produce none in practice; kept as a guard
      .replace(DIACRITICS, '')
      .replace(ALEF, '\u0627') // bare alef
      .replace(/\u0649/gu, '\u064a') // alef maqsura -> ya
      .replace(/\u0629/gu, '\u0647') // ta marbuta -> ha
      .replace(DIGIT, digitValue)
      .replace(DASHES, '-')
      .replace(/\s+/gu, ' ')
      .trim()
  );
}

/** For the identifier-shape test only: also drops every combining mark (e.g. U+034F, or U+0307 from lowercasing U+0130). */
export const shapeFold = (s: string): string =>
  // Decompose first, so a mark NFKC composed into a letter (P + acute) is removable too (COG-08 review 9);
  // whitespace collapses again after the marks go: `PR <mark> 99` must look like `pr 99` (review 3).
  normalizeText(s).normalize('NFD').replace(MARKS, '').replace(/\s+/gu, ' ').trim();

/** A token starts with a letter or digit and keeps the marks that follow it. */
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;

/** Every token occurrence, duplicates included: the query bound counts these (R3). */
export const tokenCount = (s: string): number => (normalizeText(s).match(TOKEN) ?? []).length;

/** Distinct tokens in first-seen order. */
export function tokensOf(s: string): string[] {
  return [...new Set(normalizeText(s).match(TOKEN) ?? [])];
}
