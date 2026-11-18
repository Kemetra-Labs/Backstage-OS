// The shared synthetic world (BACK-10..13): one typed model every screen reads, so all screens tell the same story.
// Display contract, not an API. Health is a claim plus basis: screens render resolveHealth(), never the claim.
import type {
  DisplayState, EntityRef, Environment, EvidenceReference, Persona, SourceAuthority, TruthLabel,
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

export interface World {
  readonly projects: readonly WorldProject[];
  readonly investigations: readonly InvestigationSummary[];
  readonly decisions: readonly Decision[];
  readonly agents: readonly AgentDemo[];
  readonly activity: readonly ActivityEvent[];
  /** Every evidence item by id, including INV-DEMO-7's E-1..E-7. */
  readonly evidence: Readonly<Record<string, EvidenceReference>>;
  /** Titles for evidence outside INV-DEMO-7 (INV-DEMO-7 titles live in i18n/strings.ts evidenceItem). */
  readonly evidenceText: Readonly<Record<string, ByPersonaL10n>>;
}
