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
 */
export const RETRIEVAL_POLICY_VERSION = 'retrieval-v4';

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
// Jira project keys allow digits and underscores; a key glued inside a word (any script) is not one.
export const JIRA_KEY_IN_TEXT = /(?<![\p{L}\p{N}_])[A-Z][A-Z0-9_]{1,63}-\d{1,18}(?![\p{L}\p{N}_])/gu;
/** A same-repository GitHub reference as it appears in a GitHub item's text. */
export const GITHUB_NUMBER_IN_TEXT = /(?<![\p{L}\p{N}_#])#(\d{1,15})(?![\p{L}\p{N}_])/gu;

/**
 * Queries shaped like a native identifier are answered by exact match only, never fuzzily (R4):
 * `#12`, `12`, `pr 12`, `issue #12`, a Jira key, `owner/repo`, or a source ref (`provider:...`).
 */
const IDENTIFIER_SHAPES: readonly RegExp[] = [
  /^#?\d{1,64}$/u,
  /^(?:pr|issue) #?\d{1,64}$/u,
  // Latin, Greek and Cyrillic (the scripts that impersonate each other): a lookalike key is still
  // key-shaped, so it can only match exactly. Other scripts (CJK, Arabic) stay ordinary text.
  /^[\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}][\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}\p{N}_]{1,63}-\d{1,64}$/u,
  /^[\w.-]{1,100}\/[\w.-]{1,100}$/,
  /^(?:github|jira|confluence):\S{1,400}$/,
];

/** Takes `shapeFold(query)`: marks are already gone, so they cannot hide a shape. */
export const isIdentifierShaped = (shapeFolded: string): boolean => IDENTIFIER_SHAPES.some((r) => r.test(shapeFolded));
