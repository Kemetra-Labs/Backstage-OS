// Versioned retrieval policy (BACK-106 R2, R4, R6). Changing any rule here is a policy change:
// bump RETRIEVAL_POLICY_VERSION.

/**
 * v2 (2026-11-27): normalization strips Unicode format characters (R3).
 * v3 (2026-11-27, COG-08 review): combining marks and dashes fold; any-script and longer identifier
 * shapes; every token counts toward the bound; title tightness ranks the identifier tier too (R4);
 * traversal caps unresolved mentions.
 */
export const RETRIEVAL_POLICY_VERSION = 'retrieval-v3';

export const MAX_QUERY_CHARS = 500;
export const MAX_QUERY_TOKENS = 32;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
export const DEFAULT_DEPTH = 2;
export const MAX_DEPTH = 3;
export const DEFAULT_MAX_NODES = 25;
export const MAX_NODES = 50;
/** Unresolved mentions returned by one traversal (R6). */
export const MAX_UNRESOLVED = 50;

/** The payload field that holds an item's original text, per kind. */
export const TITLE_FIELD: Readonly<Record<string, string>> = {
  pull_request: 'title',
  issue: 'title',
  jira_issue: 'summary',
  confluence_page: 'title',
  repository: 'fullName',
};

/** A Jira key as it appears in text. Bounded quantifiers only (no catastrophic backtracking). */
export const JIRA_KEY_IN_TEXT = /\b[A-Z][A-Z0-9]{1,9}-\d{1,9}\b/g;
/** A same-repository GitHub reference as it appears in a GitHub item's text. */
export const GITHUB_NUMBER_IN_TEXT = /(?<![\w#])#(\d{1,9})\b/g;

/**
 * Queries shaped like a native identifier are answered by exact match only, never fuzzily (R4):
 * `#12`, `12`, `pr 12`, `issue #12`, a Jira key, `owner/repo`, or a source ref (`provider:...`).
 */
const IDENTIFIER_SHAPES: readonly RegExp[] = [
  /^#?\d{1,18}$/u,
  /^(?:pr|issue) #?\d{1,18}$/u,
  // Any script: a Cyrillic or Greek lookalike key is still key-shaped, so it can only match exactly.
  /^\p{L}[\p{L}\p{N}]{1,9}-\d{1,18}$/u,
  /^[\w.-]{1,100}\/[\w.-]{1,100}$/,
  /^(?:github|jira|confluence):\S{1,400}$/,
];

export const isIdentifierShaped = (folded: string): boolean => IDENTIFIER_SHAPES.some((r) => r.test(folded));
