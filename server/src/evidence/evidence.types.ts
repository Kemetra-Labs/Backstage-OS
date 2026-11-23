// Kawalys-owned evidence contract (BACK-55). Independent of Retail Tower schemas.

export const EVIDENCE_TYPES = ['Observation', 'Correlation', 'Hypothesis', 'HumanDecision'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/** Source state. There is no "healthy": `ok` only means the read succeeded and is fresh. */
export const EVIDENCE_STATES = ['ok', 'stale', 'unknown', 'denied', 'error'] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

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
  /** Evidence a HumanDecision cites (all visible to the reader, or the decision is hidden). */
  readonly citations: readonly string[];
}

export interface EvidenceFilter {
  readonly sourceId?: string;
  readonly investigationId?: string;
  readonly projectId?: string;
}

/** The record does not exist or the caller may not see it. Callers map this to 404. */
export class NotVisibleError extends Error {}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
