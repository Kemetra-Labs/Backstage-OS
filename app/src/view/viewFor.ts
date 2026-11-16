// Persona selector (Blueprint v4 §5, D-5). Builds each view from an allowlist per persona, so a Nontechnical or Owner
// component never receives raw output, job names, run ids or links. In a real build the server applies the same rule.
import {
  confidenceDisplay, effectiveFreshness, freshnessOf, needsDemoMarker, resolveHealth, resolveLabel, worstFreshness,
} from '../contract/rules';
import { evidenceViewFor } from './evidence';
import type { ConfidenceView } from '../contract/rules';
import type {
  DisplayLabel, Environment, EvidenceReference, FactKey, FactRef, Freshness, Health, InvestigationData, MapNode, NodeId,
  Persona, Provider,
} from '../contract/types';

export type { FactKey } from '../contract/types';

export interface FactView {
  readonly key: FactKey;
  readonly label: DisplayLabel;
  readonly provider?: Provider;
  readonly ageMinutes?: number | null;
  readonly freshness?: Freshness;
}

export interface EvidenceView {
  readonly id: string;
  readonly label: DisplayLabel;
  readonly freshness: Freshness;
  readonly ageMinutes: number | null;
  readonly inert: boolean;
  readonly restricted?: true;
  readonly provider?: Provider;
  readonly notReadReason?: EvidenceReference['notReadReason'];
  // Owner and Technical
  readonly observedAt?: string;
  readonly environment?: Environment;
  // Technical only
  readonly targetLabel?: string;
  readonly ingestedAt?: string;
  readonly externalId?: string;
  readonly url?: string;
  readonly rule?: string;
  readonly rawOutput?: string;
}

export interface NodeView {
  readonly id: NodeId;
  readonly health: Health;
  readonly freshness: Freshness;
  readonly ageMinutes: number | null;
  readonly checkFailing: boolean;
}

export interface MetaView {
  readonly id: string;
  readonly product: string;
  readonly startedMinutesAgo: number;
  readonly component?: string;
  readonly environment?: Environment;
}

export interface PersonaView {
  readonly persona: Persona;
  readonly labelStyle: 'standard' | 'plain';
  readonly stageFirst: boolean;
  readonly demo: boolean;
  readonly meta: MetaView;
  readonly facts: readonly FactView[];
  readonly evidence: readonly EvidenceView[];
  readonly hypothesis: { readonly confidence: ConfidenceView; readonly showForAgainst: boolean };
  readonly nodes: readonly NodeView[];
  readonly impact: 'unknown';
  readonly sourcesNotCurrent: { readonly notCurrent: number; readonly total: number };
}

function evidenceFor(persona: Persona, ref: EvidenceReference, inv: InvestigationData): EvidenceView {
  return evidenceViewFor(persona, ref, inv.rawOutput.evidenceId === ref.id ? inv.rawOutput.text : undefined);
}

/** A fact with evidence takes its label from the contract. Without evidence, only facts that need none keep theirs. */
function factFor({ key, evidence }: FactRef): FactView {
  if (!evidence) {
    const needsEvidence = key === 'observed' || key === 'correlated';
    return { key, label: needsEvidence ? 'unknown' : key };
  }
  const label = resolveLabel(evidence);
  const src = evidence.observation?.source;
  return src
    ? { key, label, provider: src.provider, ageMinutes: src.ageMinutes, freshness: effectiveFreshness(evidence) }
    : { key, label };
}

function nodeFor(n: MapNode): NodeView {
  const read = n.state.basis.filter((r) => r.observation !== null);
  const freshness = worstFreshness(read.map(effectiveFreshness));
  const ages = read.map((r) => r.observation?.source.ageMinutes).filter((a): a is number => typeof a === 'number');
  return {
    id: n.id,
    health: resolveHealth(n.state),
    freshness,
    ageMinutes: ages.length ? Math.max(...ages) : null,
    checkFailing: n.check === 'failing',
  };
}

function metaFor(persona: Persona, inv: InvestigationData): MetaView {
  const base: MetaView = { id: inv.id, product: inv.product, startedMinutesAgo: inv.startedMinutesAgo };
  return persona === 'nontechnical' ? base : { ...base, component: inv.component.label, environment: inv.environment };
}

export function viewFor(persona: Persona, inv: InvestigationData): PersonaView {
  const freshness = inv.sources.map(freshnessOf);
  return {
    persona,
    labelStyle: persona === 'nontechnical' ? 'plain' : 'standard',
    stageFirst: persona === 'technical',
    demo: needsDemoMarker(inv.sources),
    meta: metaFor(persona, inv),
    facts: inv.facts.map(factFor),
    evidence: inv.evidence.map((e) => evidenceFor(persona, e, inv)),
    hypothesis: { confidence: confidenceDisplay(inv.hypothesis, persona), showForAgainst: persona === 'technical' },
    nodes: inv.nodes.map(nodeFor),
    impact: 'unknown',
    sourcesNotCurrent: { notCurrent: freshness.filter((f) => f !== 'current').length, total: freshness.length },
  };
}
