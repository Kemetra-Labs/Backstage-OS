// COG-02 memory projection contract (BACK-105 S1). See docs/planning/BACK-105/cog-02-design.md.
// A read model over already-visible evidence rows: it stores nothing and decides no permission.
import type { EvidenceState } from '../evidence/evidence.types';

/** One evidence row as the S2 query returns it, already filtered to what the reader may see. */
export interface MemoryRow {
  readonly id: string;
  readonly sourceId: string;
  readonly type: string;
  readonly state: EvidenceState;
  readonly sourceRef: string;
  /** When the provider was read (ISO). */
  readonly observedAt: string;
  /** When the ingest transaction started (ISO, database-set). */
  readonly receivedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type Provider = 'github' | 'jira' | 'confluence';

export interface MemorySource {
  readonly sourceId: string;
  readonly provider: Provider;
  /** TTLs are not taken from the caller: they live in the versioned policy (D3, `TTL_MS`). */
  /** The purge horizon recorded for this source (ISO), or null when nothing was ever purged. */
  readonly purgeHorizon: string | null;
}

export interface MemoryRequest {
  readonly effectiveAt: string;
  readonly knownAt: string;
  readonly evaluationAt: string;
  /** The database time of the read, used only for the settle-margin warning. */
  readonly now: string;
  /** The reader's active grant ids on the involved sources (D5 fingerprint). */
  readonly activeGrantIds: readonly string[];
  readonly sources: readonly MemorySource[];
  /** History list bound; defaults to the policy cap. */
  readonly historyCap?: number;
}

export type FactStatus = 'verified' | 'stale' | 'unknown' | 'conflict' | 'insufficient-history';

/** Consecutive observations of one item with one content key (D2). */
export interface Run {
  readonly contentKey: string;
  readonly orderKey: string | number | null;
  readonly effectiveAt: string;
  readonly firstKnownAt: string;
  readonly lastKnownAt: string;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly observationCount: number;
  readonly states: readonly EvidenceState[];
  readonly lastState: EvidenceState;
  readonly firstEvidenceId: string;
  readonly lastEvidenceId: string;
  readonly retainedForCitation: boolean;
  /** The payload of the run's latest observation. */
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface MemoryItem {
  readonly sourceId: string;
  readonly sourceRef: string;
  readonly kind: string;
  readonly status: FactStatus;
  readonly reason: string | null;
  readonly orderedBy: 'provider' | 'latest-read';
  readonly current: Run | null;
  readonly history: readonly Run[];
  readonly historyInfo: { readonly complete: boolean; readonly runsReturned: number; readonly runsTotal: number };
}

export interface MemoryProjection {
  readonly items: readonly MemoryItem[];
  readonly replay: 'best-effort';
  readonly withinSettleMargin: boolean;
  readonly fingerprint: string;
  readonly policyVersion: string;
  readonly historyCap: number;
  readonly clocks: { readonly effectiveAt: string; readonly knownAt: string; readonly evaluationAt: string };
}
