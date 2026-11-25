// The shared synthetic world (BACK-10..13): one typed model every screen reads, so all screens tell the same story.
// Display contract, not an API. Health is a claim plus basis: screens render resolveHealth(), never the claim.
import type {
  DisplayState, EntityRef, Environment, EvidenceReference, Persona, Provider, SourceAuthority, TruthLabel,
} from './types';

/** Bilingual text. {braces} mark left-to-right tokens, as in i18n/strings.ts. */
export interface L10n {
  readonly en: string;
  readonly ar: string;
}
export type ByPersonaL10n = Readonly<Record<Persona, L10n>>;

export type ProjectId = 'RT' | 'KH' | 'SB';
export type Severity = 'high' | 'medium' | 'low';
export type ComponentLayer = 'client' | 'edge' | 'service' | 'data' | 'integration';

export interface WorldComponent {
  readonly id: string;
  /** Technical name, rendered left to right. */
  readonly name: string;
  readonly layer: ComponentLayer;
  readonly environment: Environment;
  readonly state: DisplayState;
  /** Grid position for the dependency map (columns run left to right in both languages). */
  readonly pos: { readonly col: number; readonly row: number };
  readonly checkFailing?: boolean;
  readonly investigationId?: string;
  readonly note?: L10n;
}

/** authored = declared in a catalog; provisional = mapped by a rule, not confirmed; hypothesis = suspected only. */
export type EdgeKind = 'authored' | 'provisional' | 'hypothesis';

export interface WorldEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly basis: readonly EvidenceReference[];
}

export interface Attention {
  readonly id: string;
  readonly severity: Severity;
  readonly title: ByPersonaL10n;
  readonly evidence: readonly EvidenceReference[];
  readonly componentId?: string;
  readonly investigationId?: string;
  readonly decisionId?: string;
}

export interface DeliveryItem {
  readonly id: string;
  readonly kind: 'check' | 'pr' | 'release' | 'workItem';
  readonly ref: EntityRef;
  readonly evidence: EvidenceReference;
  /** What the item says, independent of whether we trust it: the screen still resolves the evidence label. */
  readonly status: 'failing' | 'passing' | 'merged' | 'planned' | 'in_progress' | 'unknown';
}

export interface WorldProject {
  readonly id: ProjectId;
  /** Product name, rendered left to right. */
  readonly name: string;
  readonly summary: L10n;
  readonly sources: readonly SourceAuthority[];
  /** Overall target health claim for the product, with its basis. */
  readonly health: DisplayState;
  readonly environments: readonly Environment[];
  readonly components: readonly WorldComponent[];
  readonly edges: readonly WorldEdge[];
  readonly attention: readonly Attention[];
  readonly delivery: readonly DeliveryItem[];
}

export interface InvestigationSummary {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly componentId: string;
  readonly title: ByPersonaL10n;
  readonly status: 'open' | 'monitoring';
  readonly startedMinutesAgo: number;
  readonly evidence: readonly EvidenceReference[];
  readonly missing: readonly L10n[];
  readonly decisionId?: string;
  /** true when the full Investigation Room exists for this case (INV-DEMO-7 only). */
  readonly fullRoom: boolean;
}

export interface DecisionOption {
  readonly id: string;
  readonly title: L10n;
  readonly benefit: L10n;
  readonly risk: L10n;
  readonly unknowns: readonly L10n[];
  readonly evidence: readonly EvidenceReference[];
  /** The option the case suggests to a human reviewer. Still only Proposed. */
  readonly suggested: boolean;
}

export interface Decision {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly investigationId?: string;
  readonly priority: Severity;
  /** 'proposed' for open items; 'approved' only for a synthetic historical record with a source link (record). */
  readonly classification: Extract<TruthLabel, 'proposed' | 'approved'>;
  readonly record?: EvidenceReference;
  readonly title: ByPersonaL10n;
  readonly context: L10n;
  readonly observed: readonly EvidenceReference[];
  readonly hypotheses: readonly L10n[];
  readonly unknowns: readonly L10n[];
  readonly options: readonly DecisionOption[];
  readonly nextStep: ByPersonaL10n;
  /** External record where a human decides, e.g. RT-DEMO-112. Kawalys never decides. */
  readonly decidedIn: string;
  readonly ageMinutes: number;
}

export type AgentState = 'watching' | 'idle' | 'paused' | 'not_enabled';

export interface AgentCapability {
  readonly id: string;
  readonly label: L10n;
  readonly status: 'simulated' | 'not_available';
}

export interface AgentDemo {
  readonly id: string;
  readonly name: string;
  readonly purpose: L10n;
  readonly state: AgentState;
  readonly projectIds: readonly ProjectId[];
  readonly capabilities: readonly AgentCapability[];
  readonly lastActivityMinutesAgo: number | null;
}

export interface ActivityEvent {
  readonly id: string;
  readonly minutesAgo: number;
  readonly actor: 'agent' | 'source' | 'human';
  readonly agentId?: string;
  readonly projectId: ProjectId;
  readonly text: L10n;
  readonly truth: TruthLabel | 'unknown';
  readonly evidenceId?: string;
  readonly investigationId?: string;
}

// ---- The mission graph and its timelines (Mission Map, Source Observatory, Mission Replay, Agent Flight Deck) ----------

export type NodeKind = 'product' | 'project' | 'service';
/** Relationship classification. 'unknown' means no evidence for the link either way; it is drawn dashed. */
export type EdgeTruth = TruthLabel | 'unknown';
export type EdgeClass = 'group' | 'dep';

/** A node of the mission graph. Not a WorldComponent: it carries canvas layout and stands for a product, project or service. */
export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  /** Proper name, never translated, always rendered as a left-to-right isolate. */
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly provider?: Provider;
  readonly state: DisplayState;
  readonly check?: 'failing';
  /** Evidence ids this node is backed by (ids of World.evidence). */
  readonly evidence: readonly string[];
  /** Fixture declaration: the description key to use instead of `map.nl.<id>` when none of this node's evidence may be shown. */
  readonly descWithoutEvidence?: string;
  /** Set by authorizedWorld only: the description key that replaces `map.nl.<id>` because its evidence was withheld. */
  readonly descKey?: string;
}

/** A link of the mission graph. Not a WorldEdge: it joins graph nodes and carries a truth label and a basis copy key. */
export interface GraphEdge {
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

/** Interim (BACK-102): the Flight Deck's own agents, until the mission agents become the World.agents roster. */
export interface MissionAgent {
  readonly id: string;
  readonly key: string;
  readonly role: MissionKind;
}

export interface Mission {
  readonly id: string;
  /** The agent working the mission. */
  readonly agent: string;
  readonly kind: MissionKind;
  readonly status: AgentStatus;
  readonly human: HumanState;
  readonly startedMinutesAgo: number;
  /** 'unknown' only after authorizedWorld removed the whole basis of the claim. */
  readonly label: TruthLabel | 'unknown';
  readonly evidence: readonly string[];
  readonly key: string;
}

export interface MissionGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** The one synthetic world. Every screen reads it, through authorizedWorld for the persona. */
export interface World {
  readonly projects: readonly WorldProject[];
  readonly investigations: readonly InvestigationSummary[];
  readonly decisions: readonly Decision[];
  readonly agents: readonly AgentDemo[];
  readonly activity: readonly ActivityEvent[];
  /** Every evidence item by id, each defined once: E-1..E-9 of INV-DEMO-7 and the records outside it. */
  readonly evidence: Readonly<Record<string, EvidenceReference>>;
  /** Titles for evidence outside INV-DEMO-7 (INV-DEMO-7 titles live in i18n/strings.ts evidenceItem). */
  readonly evidenceText: Readonly<Record<string, ByPersonaL10n>>;
  /**
   * Ids of reads of a source itself (E-8, E-9). Only source health rests on them: the evidence catalogue (demo search, Evidence
   * Explorer) does not list them; the mission's case evidence does.
   */
  readonly sourceProbes: readonly string[];
  /** Fixed "now" of the mission sections, so every screen, test and screenshot is deterministic. */
  readonly now: string;
  /** The investigation the mission sections follow (INV-DEMO-7). */
  readonly investigationId: string;
  readonly graph: MissionGraph;
  /** Every source the mission reads, with what its own health claim rests on. */
  readonly sources: readonly SourceMeta[];
  readonly sourceTimeline: readonly SourceEvent[];
  readonly replay: readonly ReplayEvent[];
  /** Interim (BACK-102): removed when the missions name World.agents. */
  readonly missionAgents: readonly MissionAgent[];
  readonly missions: readonly Mission[];
}
