// V2 visual lab types. Contract types (truth labels, sources, evidence) are reused from src/contract, never redefined.
import type { DisplayState, EvidenceReference, Persona, Provider, SourceAuthority, TruthLabel } from '../../contract/types';

export type ScreenId = 'mission-map' | 'source-observatory' | 'mission-replay' | 'agent-flight-deck';
export const SCREENS: readonly ScreenId[] = ['mission-map', 'source-observatory', 'mission-replay', 'agent-flight-deck'];

export type NodeKind = 'product' | 'project' | 'service';
/** Relationship classification. 'unknown' means no evidence for the link either way; it is drawn dashed. */
export type EdgeTruth = TruthLabel | 'unknown';
export type EdgeClass = 'group' | 'dep';

export interface WorldNode {
  readonly id: string;
  readonly kind: NodeKind;
  /** Proper name, never translated, always rendered as a left-to-right isolate. */
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly provider?: Provider;
  readonly state: DisplayState;
  readonly check?: 'failing';
  /** Evidence ids this node is backed by (ids from EVIDENCE_BY_ID). */
  readonly evidence: readonly string[];
  /** Fixture declaration: the description key to use instead of `map.nl.<id>` when none of this node's evidence may be shown. */
  readonly descWithoutEvidence?: string;
  /** Set by authorizedWorld only: the description key that replaces `map.nl.<id>` because its evidence was withheld. */
  readonly descKey?: string;
}

export interface WorldEdge {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly cls: EdgeClass;
  readonly truth: EdgeTruth;
  /** Why we believe it; required wording for correlated (a rule) and hypothesis (a reason). */
  readonly basisKey: string;
  readonly evidence: readonly string[];
}

export type SourceKind = 'integration' | 'data';
export interface SourceMeta {
  readonly provider: Provider;
  readonly kind: SourceKind;
  readonly target: string;
  readonly source: SourceAuthority;
  /** What the target's own health claim rests on. Rendered through resolveHealth, never directly. */
  readonly health: DisplayState;
}

export type SourceAxis = 'connectivity' | 'freshness' | 'health' | 'incident';
export interface SourceEvent {
  readonly id: string;
  readonly at: string;
  readonly provider: Provider;
  readonly axis: SourceAxis;
  readonly tone: 'ok' | 'warn' | 'bad';
  readonly key: string;
}

export type ReplayStage = 'observed' | 'ingested' | 'correlated' | 'hypothesis' | 'proposed';
export const STAGES: readonly ReplayStage[] = ['observed', 'ingested', 'correlated', 'hypothesis', 'proposed'];

export interface ReplayEvent {
  readonly id: string;
  /** Process clock, HH:MM on 2026-11-16 (UTC). Replay time is separate and evenly spaced. */
  readonly clock: string;
  readonly stage: ReplayStage;
  readonly label: TruthLabel | 'unknown';
  readonly evidence: string | null;
  readonly kind: 'event' | 'gap';
  readonly key: string;
}

export type AgentStatus = 'observing' | 'analyzing' | 'drafting' | 'waiting_review' | 'idle';
export type MissionKind = 'sensing' | 'analysis' | 'proposal';
export type HumanState = 'monitoring' | 'reviewing' | 'needs_review';

export interface Agent {
  readonly id: string;
  readonly key: string;
  readonly role: MissionKind;
}

export interface Mission {
  readonly id: string;
  readonly agent: string;
  readonly kind: MissionKind;
  readonly status: AgentStatus;
  readonly human: HumanState;
  readonly startedMinutesAgo: number;
  readonly events: number;
  /** 'unknown' only after authorizedWorld removed the whole basis of the claim. */
  readonly label: TruthLabel | 'unknown';
  readonly evidence: readonly string[];
  readonly key: string;
}

export interface World {
  readonly now: string;
  readonly investigationId: string;
  readonly nodes: readonly WorldNode[];
  readonly edges: readonly WorldEdge[];
  readonly sources: readonly SourceMeta[];
  readonly sourceEvents: readonly SourceEvent[];
  readonly replay: readonly ReplayEvent[];
  readonly agents: readonly Agent[];
  readonly missions: readonly Mission[];
  readonly evidenceById: Readonly<Record<string, EvidenceReference>>;
}

export type { Persona };
