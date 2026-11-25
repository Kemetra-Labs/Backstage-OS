// Command Home derivation (BACK-1): every number comes from WORLD and nothing is invented. Pure functions.
import type { DisplayLabel, Persona } from '../contract/types';
import type { ByPersonaL10n, L10n, ProjectId, Severity, World } from '../contract/world';
import { evidenceViewFor } from './evidence';
import { SEVERITY_RANK, sourceBuckets, type SourceBuckets } from './portfolioView';
import type { EvidenceView } from './viewFor';
import { projectById, sourceSummary, triadOf, type Triad } from './world';

export interface HomeSignals {
  readonly products: number;
  readonly productsNeedingAttention: number;
  readonly openInvestigations: number;
  readonly proposedDecisions: number;
  readonly sourcesNotCurrent: { readonly notCurrent: number; readonly total: number };
}

export interface HomeAttention {
  readonly id: string;
  readonly severity: Severity;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly title: ByPersonaL10n;
  readonly evidence: readonly EvidenceView[];
  readonly investigationId?: string;
  readonly decisionId?: string;
}

export interface HomeInvestigation {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly title: ByPersonaL10n;
  readonly startedMinutesAgo: number;
  readonly evidenceCount: number;
}

export interface HomeDecision {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly priority: Severity;
  readonly title: ByPersonaL10n;
  readonly ageMinutes: number;
}

export interface HomeSourceHealth {
  readonly projectId: ProjectId;
  readonly name: string;
  readonly triad: Triad;
  readonly buckets: SourceBuckets;
}

export interface HomeActivity {
  readonly id: string;
  readonly minutesAgo: number;
  readonly actor: 'agent' | 'source' | 'human';
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly truth: DisplayLabel;
  readonly text: L10n;
  readonly investigationId?: string;
}

export interface HomeView {
  readonly signals: HomeSignals;
  readonly attention: readonly HomeAttention[];
  readonly investigations: readonly HomeInvestigation[];
  readonly decisions: readonly HomeDecision[];
  readonly sourceHealth: readonly HomeSourceHealth[];
  readonly activity: readonly HomeActivity[];
}

export function homeView(w: World, persona: Persona): HomeView {
  const nameOf = (id: ProjectId): string => projectById(w, id)?.name ?? id;
  const summary = sourceSummary(w.projects.flatMap((p) => p.sources));

  const attention: HomeAttention[] = w.projects
    .flatMap((p) => p.attention.map((a) => ({ p, a })))
    .sort((x, y) => SEVERITY_RANK[x.a.severity] - SEVERITY_RANK[y.a.severity])
    .map(({ p, a }) => ({
      id: a.id,
      severity: a.severity,
      projectId: p.id,
      projectName: p.name,
      title: a.title,
      evidence: a.evidence.map((e) => evidenceViewFor(persona, e)),
      ...(a.investigationId ? { investigationId: a.investigationId } : {}),
      ...(a.decisionId ? { decisionId: a.decisionId } : {}),
    }));

  const open = w.investigations.filter((i) => i.status === 'open');
  const proposed = w.decisions.filter((d) => d.classification === 'proposed');

  return {
    signals: {
      products: w.projects.length,
      productsNeedingAttention: w.projects.filter((p) => p.attention.length > 0).length,
      openInvestigations: open.length,
      proposedDecisions: proposed.length,
      sourcesNotCurrent: { notCurrent: summary.total - summary.current, total: summary.total },
    },
    attention,
    investigations: open.map((i) => ({
      id: i.id,
      projectId: i.projectId,
      projectName: nameOf(i.projectId),
      title: i.title,
      startedMinutesAgo: i.startedMinutesAgo,
      evidenceCount: i.evidence.length,
    })),
    decisions: proposed.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      projectName: nameOf(d.projectId),
      priority: d.priority,
      title: d.title,
      ageMinutes: d.ageMinutes,
    })),
    sourceHealth: w.projects.map((p) => ({ projectId: p.id, name: p.name, triad: triadOf(p.health), buckets: sourceBuckets(p.sources) })),
    activity: [...w.activity]
      .sort((a, b) => a.minutesAgo - b.minutesAgo)
      .map((e) => {
        const ev = e.evidenceId ? w.evidence[e.evidenceId] : undefined;
        const v = ev ? evidenceViewFor(persona, ev) : undefined;
        // Evidence behind an event decides its label (contract rules); absent evidence keeps the event's own.
        const truth: DisplayLabel = v ? v.label : e.truth;
        return {
          id: e.id,
          minutesAgo: e.minutesAgo,
          actor: e.actor,
          projectId: e.projectId,
          projectName: nameOf(e.projectId),
          truth,
          text: e.text,
          ...(e.investigationId ? { investigationId: e.investigationId } : {}),
        };
      }),
  };
}
