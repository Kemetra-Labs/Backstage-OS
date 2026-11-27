// Versioned memory policy (BACK-105 S1): which rows are read, what identifies a revision, how revisions
// are ordered and which read markers cover which items. Changing any table here is a policy change:
// bump MEMORY_POLICY_VERSION. The field lists and kinds are pinned against the observers by
// test/memory/memory.guard.spec.ts (D2, D3 in docs/planning/BACK-105/cog-02-design.md).
import type { Provider } from './memory.types';

/** v2 (2026-11-27, COG-08 review): the fingerprint covers every cited field of the current run. */
// v3 (COG-08 review 7): the fingerprint covers the current run's known times.
// v4 (COG-08 review 8): and the returned history runs' known times.
// v5 (COG-08 review 9): and their observation times.
// v6 (COG-08 review 10): and the current run's whole payload.
export const MEMORY_POLICY_VERSION = 'memory-v6';
export const HISTORY_CAP = 50;
/** Freshness per provider (D3), from the existing 15-minute Atlassian default. */
export const TTL_MS: Readonly<Record<Provider, number>> = { github: 15 * 60_000, jira: 15 * 60_000, confluence: 15 * 60_000 };
export const isProvider = (p: unknown): p is Provider => typeof p === 'string' && Object.hasOwn(TTL_MS, p);
/** Late ingest commits are most likely inside this window before `now` (D3; a warning, not a guarantee). */
export const SETTLE_MARGIN_MS = 5 * 60_000;

export type ItemKind = 'pull_request' | 'issue' | 'jira_issue' | 'confluence_page' | 'repository';
export type MarkerKind = 'source_status' | 'list_page';

/** Provider-owned fields that make up the content key. `url` is built from configuration: excluded. */
export const CONTENT_FIELDS: Readonly<Record<ItemKind, readonly string[]>> = {
  pull_request: ['number', 'title', 'state', 'draft', 'updatedAt'],
  issue: ['number', 'title', 'state', 'updatedAt'],
  jira_issue: ['key', 'summary', 'statusCategory', 'updatedAt'],
  confluence_page: ['pageId', 'title', 'version', 'lastModified'],
  repository: ['fullName', 'defaultBranch', 'archived', 'private', 'pushedAt'],
};

export const ITEM_KINDS: ReadonlySet<string> = new Set(Object.keys(CONTENT_FIELDS));
export const MARKER_KINDS: ReadonlySet<string> = new Set<MarkerKind>(['source_status', 'list_page']);

export const isItemKind = (kind: unknown): kind is ItemKind => typeof kind === 'string' && ITEM_KINDS.has(kind);

/** The repository record has no provider order: its current value is the latest provider read. */
export const isOrdered = (kind: ItemKind): boolean => kind !== 'repository';

/** The payload field that carries the provider's order key, and the one that carries effective time. */
export const ORDER_FIELD: Readonly<Record<Exclude<ItemKind, 'repository'>, string>> = {
  pull_request: 'updatedAt',
  issue: 'updatedAt',
  jira_issue: 'updatedAt',
  confluence_page: 'version',
};
export const EFFECTIVE_FIELD: Readonly<Record<Exclude<ItemKind, 'repository'>, string>> = {
  pull_request: 'updatedAt',
  issue: 'updatedAt',
  jira_issue: 'updatedAt',
  confluence_page: 'lastModified',
};

/** `github:<owner/repo>#pull/1` -> `github:<owner/repo>`; `jira:BACK#issue/BACK-1` -> `jira:BACK`. */
export const scopeRoot = (sourceRef: string): string => {
  const hash = sourceRef.indexOf('#');
  return hash === -1 ? sourceRef : sourceRef.slice(0, hash);
};

/**
 * Failure rows (`source_status`) whose ref covers an item (D3 coverage table). A repository failure
 * covers everything of the source; a list failure covers its list; Atlassian project and space
 * failures cover their items; `*:invalid-ref` covers the whole source.
 */
export function coveringFailureRefs(provider: Provider, kind: ItemKind, sourceRef: string): ReadonlySet<string> {
  const root = scopeRoot(sourceRef);
  const refs = new Set([`${provider}:invalid-ref`, root]);
  if (kind === 'pull_request') refs.add(`${root}#pulls`);
  if (kind === 'issue') refs.add(`${root}#issues`);
  if (kind === 'confluence_page') refs.add(`${root}#pages`);
  return refs;
}

/**
 * How a later successful read of the item's scope is recognized (D3 read outcomes):
 * GitHub lists by their `list_page` marker; Jira and Confluence, which record no marker, by item rows
 * of the same project or space key. The repository record has no list.
 */
export type ScopeRead = { readonly by: 'list_page'; readonly ref: string } | { readonly by: 'items'; readonly prefix: string } | null;

export function scopeReadOf(kind: ItemKind, sourceRef: string): ScopeRead {
  const root = scopeRoot(sourceRef);
  if (kind === 'pull_request') return { by: 'list_page', ref: `${root}#pulls` };
  if (kind === 'issue') return { by: 'list_page', ref: `${root}#issues` };
  if (kind === 'jira_issue') return { by: 'items', prefix: `${root}#issue/` };
  if (kind === 'confluence_page') return { by: 'items', prefix: `${root}#page/` };
  return null;
}

/** A GitHub row that heads a read batch: the repository record or a repository-level failure. */
export const isGithubHead = (sourceRef: string, kind: unknown): boolean =>
  !sourceRef.includes('#') && (kind === 'repository' || kind === 'source_status');
