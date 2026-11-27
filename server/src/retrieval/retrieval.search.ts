// Search (BACK-106 R4, R5): exact identifiers first, then all-terms lexical matching over original
// titles. Deterministic ranking, explicit ambiguity and abstention, bounded results. Only the best tier
// is returned. Pure: the projection holds only what the reader may see, so counts carry no side channel.
import type { MemoryProjection } from '../memory/memory.types';
import { cmp, docsOf, type Doc } from './retrieval.documents';
import { normalizeText, tokensOf } from './retrieval.normalize';
import { DEFAULT_LIMIT, isIdentifierShaped, MAX_LIMIT, MAX_QUERY_CHARS, MAX_QUERY_TOKENS, RETRIEVAL_POLICY_VERSION } from './retrieval.policy';
import type { MatchTier, RetrievalHit, SearchOptions, SearchOutcome, SearchResult } from './retrieval.types';

const MATCHED_ON: Readonly<Record<MatchTier, RetrievalHit['matchedOn']>> = { identifier: 'identifier', title: 'title', any: 'title+identifier' };

const hasAll = (set: readonly string[], terms: readonly string[]): boolean => {
  const s = new Set(set);
  return terms.every((t) => s.has(t));
};

/** Tighter title first, then identity; identifiers carry no tightness, so identity alone. */
const rank = (tier: MatchTier) => (a: Doc, b: Doc): number =>
  (tier === 'identifier' ? 0 : a.titleTokens.length - b.titleTokens.length) || cmp(a.key, b.key);

function best(docs: readonly Doc[], folded: string, terms: readonly string[]): { tier: MatchTier; docs: Doc[] } | null {
  const exact = docs.filter((d) => d.identifiers.includes(folded));
  if (exact.length) return { tier: 'identifier', docs: exact };
  if (isIdentifierShaped(folded) || !terms.length) return null;
  const title = docs.filter((d) => hasAll(d.titleTokens, terms));
  if (title.length) return { tier: 'title', docs: title };
  const any = docs.filter((d) => hasAll([...d.titleTokens, ...d.identifierTokens], terms));
  return any.length ? { tier: 'any', docs: any } : null;
}

const toHit = (d: Doc, tier: MatchTier): RetrievalHit => ({
  identity: d.identity,
  kind: d.identity.kind,
  title: d.title,
  status: d.item.status,
  reason: d.item.reason,
  tier,
  matchedOn: MATCHED_ON[tier],
  revision: d.revision,
  evidence: d.evidence,
  lastObservedAt: d.lastObservedAt,
});

export function search(projection: MemoryProjection, query: string, options: SearchOptions = {}): SearchResult {
  const meta = { fingerprint: projection.fingerprint, policyVersion: projection.policyVersion, retrievalPolicyVersion: RETRIEVAL_POLICY_VERSION };
  const empty = (outcome: SearchOutcome): SearchResult => ({ outcome, selected: null, hits: [], totalMatches: 0, truncated: false, ...meta });

  const limit = options.limit ?? DEFAULT_LIMIT;
  if (typeof query !== 'string' || query.length > MAX_QUERY_CHARS || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return empty('invalid-query');
  const folded = normalizeText(query);
  const terms = tokensOf(query);
  if (!folded || terms.length > MAX_QUERY_TOKENS) return empty('invalid-query');

  const found = best(docsOf(projection), folded, terms);
  if (!found) return empty('no-match');
  const ordered = [...found.docs].sort(rank(found.tier));
  const outcome: SearchOutcome = ordered.length === 1 ? 'match' : 'ambiguous';
  return {
    outcome,
    selected: outcome === 'match' ? ordered[0]!.identity : null,
    hits: ordered.slice(0, limit).map((d) => toHit(d, found.tier)),
    totalMatches: ordered.length,
    truncated: ordered.length > limit,
    ...meta,
  };
}
