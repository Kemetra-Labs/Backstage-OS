// Kawalys-owned evidence contract (BACK-55). Independent of Retail Tower schemas.

export const EVIDENCE_TYPES = ['Observation', 'Correlation', 'Hypothesis', 'HumanDecision'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/** Source state. There is no "healthy": `ok` only means the read succeeded and is fresh. */
export const EVIDENCE_STATES = ['ok', 'stale', 'unknown', 'denied', 'error'] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** Stored source providers: the CHECK on sources.provider (migrations/0003, widened in 0005 for BACK-99). */
export const SOURCE_PROVIDERS = ['github', 'jira', 'confluence'] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

/** Worst first is the one that needs attention most. `ok` is only ever the best of all-ok. */
const SEVERITY: Readonly<Record<EvidenceState, number>> = { ok: 0, stale: 1, unknown: 2, error: 3, denied: 4 };

/** The worst of several states; nothing at all is `unknown`, never `ok`. */
export function worstState(states: readonly EvidenceState[]): EvidenceState {
  if (states.length === 0) return 'unknown';
  return states.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a));
}

/** The types a user may write as a note (BACK-50). Observation comes from connectors only. */
export const NOTE_TYPES = ['Correlation', 'Hypothesis'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export interface EvidenceRecord {
  readonly id: string;
  readonly type: EvidenceType;
  readonly state: EvidenceState;
  readonly projectId: string;
  readonly sourceId: string | null;
  readonly investigationId: string | null;
  readonly sourceRef: string;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Evidence a HumanDecision or a user note cites; empty for connector evidence. A decision is hidden
   * unless all of it is visible; a note's citations all share the note's own source. */
  readonly citations: readonly string[];
}

/** One HumanDecision as the recent-decisions list returns it (BACK-59). */
export interface DecisionRecord {
  readonly id: string;
  readonly investigationId: string;
  readonly decision: string;
  readonly rationale: string;
  readonly citations: readonly string[];
  /** The deciding user, from the `decision.recorded` audit row written in the same transaction.
   * Null only for a row inserted without that audit row, which the application never does. */
  readonly createdBy: string | null;
  /** When the database stored the decision (`received_at`, set by the database alone). */
  readonly createdAt: string;
}

/** One GET /decisions page. `nextCursor` reads the next page; it is null on the last one. */
export interface DecisionPage {
  readonly items: readonly DecisionRecord[];
  readonly nextCursor: string | null;
}

/** GET /decisions page size: the default and the most a caller may ask for. */
export const DECISION_LIMIT_DEFAULT = 20;
export const DECISION_LIMIT_MAX = 100;

export interface EvidenceFilter {
  readonly sourceId?: string;
  readonly investigationId?: string;
  readonly projectId?: string;
}

/** The record does not exist or the caller may not see it. Callers map this to 404. */
export class NotVisibleError extends Error {}

/** An Idempotency-Key was already used by this caller for a different request. Callers map this to 422. */
export class IdempotencyConflictError extends Error {}

/** A well-formed request that breaks a rule and reveals nothing hidden. Callers map this to 400. */
export class RefusedError extends Error {}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
