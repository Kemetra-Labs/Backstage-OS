// Search-only normalization (BACK-106 R3), adapted from the COG-01 research port's normalize/tokens
// (server/test/research/cognitive-core/memory.ts) with alef maqsura, ta marbuta and digit folding added.
// It is used only to compare. Stored and returned text and native identifiers are never changed.

const DIACRITICS = /[\u064b-\u065f\u0670\u0640]/gu; // harakat, superscript alef, tatweel
// Invisible format characters (zero-width space/joiners, word joiner, bidi controls, BOM). Without this,
// `BACK\u200B-8` escapes the identifier-shape check and is fuzzy-matched (COG-08 adversarial finding).
const FORMAT = /\p{Cf}/gu;
// Combining marks (e.g. U+034F) and every Unicode dash (U+2011, U+2013, ...) fold too, so a spoofed key
// still has an identifier's shape and is answered by exact match only (COG-08 review).
const MARKS = /\p{Mn}/gu;
const DASHES = /\p{Pd}/gu;
const ALEF = /[\u0623\u0625\u0622\u0671]/gu; // أ إ آ ٱ
const ARABIC_INDIC = /[\u0660-\u0669]/gu;
const PERSIAN = /[\u06f0-\u06f9]/gu;

export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(FORMAT, '')
    .replace(MARKS, '')
    .replace(DASHES, '-')
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(ALEF, 'ا') // ا
    .replace(/\u0649/gu, '\u064a') // ى -> ي
    .replace(/\u0629/gu, '\u0647') // ة -> ه
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/gu, ' ')
    .trim();
}

const TOKEN = /[\p{L}\p{N}]+/gu;

/** Every token occurrence, duplicates included: the query bound counts these (R3). */
export const tokenCount = (s: string): number => (normalizeText(s).match(TOKEN) ?? []).length;

/** Distinct tokens in first-seen order: maximal runs of letters or digits after normalization. */
export function tokensOf(s: string): string[] {
  return [...new Set(normalizeText(s).match(TOKEN) ?? [])];
}
