// Versioned retrieval policy (BACK-106 R2, R4, R6). Changing any rule here is a policy change:
// bump RETRIEVAL_POLICY_VERSION.

export const RETRIEVAL_POLICY_VERSION = 'retrieval-v1';

export const MAX_QUERY_CHARS = 500;
export const MAX_QUERY_TOKENS = 32;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
export const DEFAULT_DEPTH = 2;
export const MAX_DEPTH = 3;
export const DEFAULT_MAX_NODES = 25;
export const MAX_NODES = 50;

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
  /^#?\d{1,9}$/,
  /^(?:pr|issue) #?\d{1,9}$/,
  /^[a-z][a-z0-9]{1,9}-\d{1,9}$/,
  /^[\w.-]{1,100}\/[\w.-]{1,100}$/,
  /^(?:github|jira|confluence):\S{1,400}$/,
];

export const isIdentifierShaped = (folded: string): boolean => IDENTIFIER_SHAPES.some((r) => r.test(folded));
