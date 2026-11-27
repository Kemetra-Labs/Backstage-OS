// Search-only normalization (BACK-106 R3), adapted from the COG-01 research port's normalize/tokens
// (server/test/research/cognitive-core/memory.ts) with alef maqsura, ta marbuta and digit folding added.
// It is used only to compare. Stored and returned text and native identifiers are never changed.

const DIACRITICS = /[ً-ٰٟـ]/gu; // harakat, superscript alef, tatweel
const ALEF = /[أإآٱ]/gu; // أ إ آ ٱ
const ARABIC_INDIC = /[٠-٩]/gu;
const PERSIAN = /[۰-۹]/gu;

export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(ALEF, 'ا')
    .replace(/ى/gu, 'ي') // ى -> ي
    .replace(/ة/gu, 'ه') // ة -> ه
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Distinct tokens in first-seen order: maximal runs of letters or digits after normalization. */
export function tokensOf(s: string): string[] {
  return [...new Set(normalizeText(s).match(/[\p{L}\p{N}]+/gu) ?? [])];
}
