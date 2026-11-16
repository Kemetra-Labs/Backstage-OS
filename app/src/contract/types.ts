// Display contract at the UI boundary (Blueprint v4 §8). Shapes a screen renders, not a schema or an API.
// All types are readonly: views are derived, never mutated.

export type TruthLabel = 'observed' | 'correlated' | 'hypothesis' | 'proposed' | 'approved';
export type Connectivity = 'reachable' | 'unavailable' | 'not_configured';
export type Freshness = 'current' | 'stale' | 'unknown';
export type Health = 'healthy' | 'degraded' | 'down' | 'unknown';
export type Environment = 'ci' | 'lab' | 'staging' | 'production' | 'unknown';
export type Persona = 'owner' | 'technical' | 'nontechnical';
export type Lang = 'en' | 'ar';
export type Provider = 'github' | 'jira' | 'confluence' | 'sentry' | 'datadog' | 'port';

export interface SourceAuthority {
  readonly provider: Provider;
  readonly connectivity: Connectivity;
  /** ISO 8601 time of the last good read; null means never read. */
  readonly lastSuccessAt: string | null;
  /** Age of the last good read in minutes, precomputed for the synthetic fixture; null when never read. */
  readonly ageMinutes: number | null;
  readonly ttlSeconds: number;
  readonly synthetic: boolean;
}

export interface EntityRef {
  readonly kind: 'product' | 'project' | 'component' | 'workItem' | 'check' | 'investigation' | 'decision';
  readonly id: string;
  readonly externalId?: string;
  readonly label: string;
}

export interface Observation {
  readonly id: string;
  readonly target: EntityRef;
  readonly source: SourceAuthority;
  readonly observedAt: string;
  readonly ingestedAt: string;
  readonly environment: Environment;
  readonly sourceUrl?: string;
}

export interface EvidenceReference {
  readonly id: string;
  readonly observation: Observation | null;
  readonly classification: TruthLabel;
  readonly freshness: Freshness;
  /** Required when classification is 'correlated'. */
  readonly rule?: string;
  readonly visibility: 'all' | 'technical' | 'restricted';
  readonly notReadReason?: 'unavailable' | 'not_configured' | 'restricted';
}

export interface ConfidenceBasis {
  readonly method: string;
  readonly calibration: string;
  readonly sources: readonly EvidenceReference[];
  readonly value: number;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface Hypothesis {
  readonly id: string;
  readonly confidence: ConfidenceLevel;
  readonly confidenceBasis?: ConfidenceBasis;
  readonly supporting: readonly EvidenceReference[];
  readonly contradicting: readonly EvidenceReference[];
}

export interface AggregateCount {
  readonly value: number | null;
  readonly sourcesRead: number;
  readonly sourcesTotal: number;
  readonly atLeast: boolean;
  readonly basis: readonly EvidenceReference[];
}

/** A label as rendered: a truth label, or unknown when nothing was read. */
export type DisplayLabel = TruthLabel | 'unknown';

export type FactKey = 'observed' | 'correlated' | 'hypothesis' | 'unknown' | 'proposed';

export interface FactRef {
  readonly key: FactKey;
  readonly evidence: EvidenceReference | null;
}

export type NodeId = 'pos' | 'stock-sync' | 'inventory';

export interface MapNode {
  readonly id: NodeId;
  readonly state: DisplayState;
  readonly check?: 'failing';
}

/** One investigation as the UI receives it. Any fixture or future adapter must produce this shape. */
export interface InvestigationData {
  readonly id: string;
  readonly product: string;
  readonly component: EntityRef;
  readonly environment: Environment;
  readonly sources: readonly SourceAuthority[];
  readonly facts: readonly FactRef[];
  readonly evidence: readonly EvidenceReference[];
  readonly hypothesis: Hypothesis;
  readonly nodes: readonly MapNode[];
  readonly rawOutput: { readonly evidenceId: string; readonly text: string };
  readonly startedMinutesAgo: number;
}

export interface DisplayState {
  readonly connectivity: Connectivity;
  readonly freshness: Freshness;
  /** Claimed health; the UI renders resolveHealth(), never this value directly. */
  readonly health: Health;
  readonly basis: readonly EvidenceReference[];
}
