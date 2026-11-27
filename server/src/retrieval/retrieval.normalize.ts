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
// Default-ignorable code points too (e.g. U+2065, U+034F): invisible, though not all are Cf (COG-08 review 7).
const FORMAT = /[\p{Cf}\p{DI}]/gu;
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
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(FORMAT, '')
    .replace(DIACRITICS, '')
    .replace(ALEF, '\u0627') // bare alef
    .replace(/\u0649/gu, '\u064a') // alef maqsura -> ya
    .replace(/\u0629/gu, '\u0647') // ta marbuta -> ha
    .replace(DIGIT, digitValue)
    .replace(DASHES, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** For the identifier-shape test only: also drops every combining mark (e.g. U+034F, or U+0307 from lowercasing U+0130). */
export const shapeFold = (s: string): string =>
  // Whitespace collapses again after the marks go: `PR <mark> 99` must look like `pr 99` (COG-08 review 3).
  normalizeText(s).replace(MARKS, '').replace(/\s+/gu, ' ').trim();

/** A token starts with a letter or digit and keeps the marks that follow it. */
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;

/** Every token occurrence, duplicates included: the query bound counts these (R3). */
export const tokenCount = (s: string): number => (normalizeText(s).match(TOKEN) ?? []).length;

/** Distinct tokens in first-seen order. */
export function tokensOf(s: string): string[] {
  return [...new Set(normalizeText(s).match(TOKEN) ?? [])];
}
