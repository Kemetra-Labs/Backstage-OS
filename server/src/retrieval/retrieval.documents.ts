// Documents (BACK-106 R2, R5): one per memory item the reader can see. Built on every call from the
// projection; nothing is kept between calls (R1).
import { scopeRoot } from '../memory/memory.policy';
import type { MemoryItem, MemoryProjection, Run } from '../memory/memory.types';
import { normalizeText, tokensOf } from './retrieval.normalize';
import { TITLE_FIELD } from './retrieval.policy';
import type { ItemIdentity } from './retrieval.types';

export interface Doc {
  readonly identity: ItemIdentity;
  /** Canonical order key: (sourceId, sourceRef, kind). */
  readonly key: string;
  readonly item: MemoryItem;
  readonly title: string | null;
  readonly titleTokens: readonly string[];
  /** Folded native identifiers (exact-match only). */
  readonly identifiers: readonly string[];
  readonly identifierTokens: readonly string[];
  readonly evidence: readonly string[];
  readonly revision: string | null;
  readonly lastObservedAt: string | null;
  /** Payload of the run that supplies the text. */
  readonly payload: Readonly<Record<string, unknown>>;
}

export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const identityKey = (i: ItemIdentity): string => JSON.stringify([i.sourceId, i.sourceRef, i.kind]);
export const sortedUnique = (xs: readonly string[]): string[] => [...new Set(xs)].sort(cmp);

/** The current run, or the newest returned run when there is no current revision (R2). */
function textRun(item: MemoryItem): Run | null {
  if (item.current) return item.current;
  let newest: Run | null = null;
  for (const r of item.history) {
    if (!newest || cmp(`${r.firstObservedAt}|${r.firstKnownAt}|${r.firstEvidenceId}`, `${newest.firstObservedAt}|${newest.firstKnownAt}|${newest.firstEvidenceId}`) > 0) newest = r;
  }
  return newest;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

function nativeIdentifiers(kind: string, sourceRef: string, payload: Readonly<Record<string, unknown>>): string[] {
  const out = [sourceRef];
  if (kind === 'pull_request' || kind === 'issue') {
    const n = num(payload['number']);
    const word = kind === 'pull_request' ? 'pr' : 'issue';
    if (n !== null) out.push(`#${n}`, `${n}`, `${word} ${n}`, `${word} #${n}`);
  } else if (kind === 'jira_issue') {
    const key = str(payload['key']);
    if (key) out.push(key);
  } else if (kind === 'confluence_page') {
    const pageId = str(payload['pageId']);
    if (pageId) out.push(pageId);
  } else if (kind === 'repository') {
    const fullName = str(payload['fullName']);
    if (fullName) out.push(fullName, fullName.slice(fullName.indexOf('/') + 1));
  }
  return sortedUnique(out.map(normalizeText));
}

export function toDoc(item: MemoryItem): Doc {
  const identity: ItemIdentity = { sourceId: item.sourceId, sourceRef: item.sourceRef, kind: item.kind };
  const run = textRun(item);
  const payload = run?.payload ?? {};
  const field = TITLE_FIELD[item.kind];
  const title = field ? str(payload[field]) : null;
  const identifiers = nativeIdentifiers(item.kind, item.sourceRef, payload);
  return {
    identity,
    key: identityKey(identity),
    item,
    title,
    titleTokens: title ? tokensOf(title) : [],
    identifiers,
    identifierTokens: tokensOf(identifiers.join(' ')),
    evidence: run ? sortedUnique([run.firstEvidenceId, run.lastEvidenceId]) : [],
    revision: item.current?.contentKey ?? null,
    lastObservedAt: run?.lastObservedAt ?? null,
    payload,
  };
}

export const docsOf = (projection: MemoryProjection): Doc[] => projection.items.map(toDoc).sort((a, b) => cmp(a.key, b.key));

/** The GitHub repository scope of a PR or issue (`github:<owner/repo>`). */
export const repoScope = (d: Doc): string => scopeRoot(d.identity.sourceRef);
