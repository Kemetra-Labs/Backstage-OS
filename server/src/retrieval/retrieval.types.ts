// COG-03 retrieval contract (BACK-106 S1). See docs/planning/BACK-106/cog-03-design.md.
// Retrieval reads only a COG-02 MemoryProjection, which already holds nothing but items the reader
// may see (R1). It stores nothing, keeps no index between calls and decides no permission.
import type { FactStatus } from '../memory/memory.types';

/** A memory item's identity (COG-02 D2). Ordered everywhere by (sourceId, sourceRef, kind). */
export interface ItemIdentity {
  readonly sourceId: string;
  readonly sourceRef: string;
  readonly kind: string;
}

export type MatchTier = 'identifier' | 'title' | 'any';

export interface RetrievalHit {
  readonly identity: ItemIdentity;
  readonly kind: string;
  /** Original text as stored; never normalized. Null when the item carries no text. */
  readonly title: string | null;
  /** From COG-02, never upgraded. */
  readonly status: FactStatus;
  readonly reason: string | null;
  readonly tier: MatchTier;
  readonly matchedOn: 'identifier' | 'title' | 'title+identifier';
  /** The current run's content key, or null when the item has no current revision. */
  readonly revision: string | null;
  /** Sorted evidence ids supporting the returned text. */
  readonly evidence: readonly string[];
  readonly lastObservedAt: string | null;
}

export type SearchOutcome = 'match' | 'ambiguous' | 'no-match' | 'invalid-query';

export interface SearchResult {
  readonly outcome: SearchOutcome;
  readonly selected: ItemIdentity | null;
  readonly hits: readonly RetrievalHit[];
  /** Over the reader's visible items only (R4). */
  readonly totalMatches: number;
  readonly truncated: boolean;
  readonly fingerprint: string;
  readonly policyVersion: string;
  readonly retrievalPolicyVersion: string;
}

export interface SearchOptions {
  readonly limit?: number;
}

export interface Edge {
  readonly type: 'contains' | 'mentions';
  readonly from: ItemIdentity;
  readonly to: ItemIdentity;
  /** For `mentions`: the identifier text as it appears in the mentioning title. */
  readonly text?: string;
  /** For `mentions`: the status of the item whose title holds the text (COG-02, never upgraded). */
  readonly basis?: FactStatus;
  readonly evidence: readonly string[];
}

/** A mention whose target is not visible: identical whether hidden, revoked or nonexistent (R6). */
export interface UnresolvedMention {
  readonly type: 'mentions';
  readonly from: ItemIdentity;
  readonly text: string;
  readonly target: null;
  readonly status: 'unresolved';
  /** The status of the item whose title holds the text. */
  readonly basis: FactStatus;
  readonly evidence: readonly string[];
}

export interface Relationships {
  readonly edges: readonly Edge[];
  readonly unresolved: readonly UnresolvedMention[];
  /** True when the edge or unresolved budget stopped the work (R6). */
  readonly truncated: boolean;
}

export interface TraversalNode {
  readonly identity: ItemIdentity;
  readonly depth: number;
  /** The edge that first reached this node; null for the start. */
  readonly via: Edge | null;
}

export interface TraversalOptions {
  readonly depth?: number;
  readonly maxNodes?: number;
}

export interface Traversal {
  readonly outcome: 'found' | 'not-found' | 'invalid-request';
  readonly nodes: readonly TraversalNode[];
  readonly unresolved: readonly UnresolvedMention[];
  readonly truncated: boolean;
}
