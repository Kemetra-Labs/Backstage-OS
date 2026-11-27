// Versioned retrieval policy (BACK-106 R2, R4, R6). Changing any rule here is a policy change:
// bump RETRIEVAL_POLICY_VERSION.

/**
 * v2 (2026-11-27): normalization strips Unicode format characters (R3).
 * v3 (2026-11-27, COG-08 review): combining marks and dashes fold; any-script and longer identifier
 * shapes; every token counts toward the bound; title tightness ranks the identifier tier too (R4);
 * traversal caps unresolved mentions.
 * v4 (2026-11-27, second COG-08 review): marks kept in ordinary words, dropped only for the shape test;
 * any decimal digit folds; Latin/Greek/Cyrillic key shapes with underscores and long numbers; mention
 * parsing follows provider grammars with Unicode word boundaries; links carry their text's status and
 * are suppressed without an established revision; edge and unresolved budgets on both entry points.
 * v5 (2026-11-27, third COG-08 review): no digit-count ceiling on identifier shapes; combining marks
 * count as word characters at mention boundaries.
 * v6 (2026-11-27, third review rerun): whitespace collapses after marks in the shape fold; mention
 * boundaries look through format characters; `#n` follows the observer's positive safe integers; each
 * title has its own unresolved allowance, and traversal caps only what it visits.
 */
export const RETRIEVAL_POLICY_VERSION = 'retrieval-v6';

export const MAX_QUERY_CHARS = 500;
export const MAX_QUERY_TOKENS = 32;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
export const DEFAULT_DEPTH = 2;
export const MAX_DEPTH = 3;
export const DEFAULT_MAX_NODES = 25;
export const MAX_NODES = 50;
/** Unresolved mentions returned by relationships() or one traversal (R6). */
export const MAX_UNRESOLVED = 50;
/** Edges built by one relationships() call; work stops there and the result says `truncated` (R6). */
export const MAX_EDGES = 2000;

/** The payload field that holds an item's original text, per kind. */
export const TITLE_FIELD: Readonly<Record<string, string>> = {
  pull_request: 'title',
  issue: 'title',
  jira_issue: 'summary',
  confluence_page: 'title',
  repository: 'fullName',
};

/** A Jira key as it appears in text. Bounded quantifiers only (no catastrophic backtracking). */
// Jira project keys allow digits and underscores; a key glued to a letter, mark or digit (any script)
// is not one.
// Plain, linear patterns: the word-boundary test (which looks through invisible format characters) is
// done in code by `isMentionBoundary`, not by lookarounds, which backtrack super-linearly (Sonar S8786).
export const JIRA_KEY_IN_TEXT = /[A-Z][A-Z0-9_]{1,63}-\d{1,18}/gu;
/** A same-repository GitHub reference as it appears in a GitHub item's text. */
// Up to 16 digits (the safe-integer range); the parser then keeps positive safe integers only, as the observer does.
export const GITHUB_NUMBER_IN_TEXT = /#(\d{1,16})/gu;

const WORD = /^[\p{L}\p{M}\p{N}_]$/u;
const FORMAT_CHAR = /^\p{Cf}$/u;

/** The nearest code point before the index (step -1) or at or after it (step 1), skipping format characters. */
function neighbour(text: string, from: number, step: -1 | 1): string {
  let i = from;
  for (;;) {
    let ch: string;
    if (step === -1) {
      if (i <= 0) return '';
      const low = text.charCodeAt(i - 1);
      const astral = low >= 0xdc00 && low <= 0xdfff && i >= 2;
      ch = text.slice(astral ? i - 2 : i - 1, i);
      i -= ch.length;
    } else {
      if (i >= text.length) return '';
      ch = String.fromCodePoint(text.codePointAt(i)!);
      i += ch.length;
    }
    if (!FORMAT_CHAR.test(ch)) return ch;
  }
}

/**
 * True when the match `[start, end)` is a whole word: the nearest visible characters on both sides are
 * not letters, marks, digits or `_` (nor `extraBefore` before it). Linear in the format characters it skips.
 */
export function isMentionBoundary(text: string, start: number, end: number, extraBefore = ''): boolean {
  const before = neighbour(text, start, -1);
  const after = neighbour(text, end, 1);
  return !WORD.test(before) && !(extraBefore !== '' && before === extraBefore) && !WORD.test(after);
}

/**
 * Queries shaped like a native identifier are answered by exact match only, never fuzzily (R4):
 * `#12`, `12`, `pr 12`, `issue #12`, a Jira key, `owner/repo`, or a source ref (`provider:...`).
 */
const IDENTIFIER_SHAPES: readonly RegExp[] = [
  // No digit-count ceiling: the query bound (500 characters) already bounds the work.
  /^#?\d+$/u,
  /^(?:pr|issue) #?\d+$/u,
  // Latin, Greek and Cyrillic (the scripts that impersonate each other): a lookalike key is still
  // key-shaped, so it can only match exactly. Other scripts (CJK, Arabic) stay ordinary text.
  /^[\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}][\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}\p{N}_]+-\d+$/u,
  /^[\w.-]{1,100}\/[\w.-]{1,100}$/,
  /^(?:github|jira|confluence):\S{1,400}$/,
];

/** Takes `shapeFold(query)`: marks are already gone, so they cannot hide a shape. */
export const isIdentifierShaped = (shapeFolded: string): boolean => IDENTIFIER_SHAPES.some((r) => r.test(shapeFolded));
