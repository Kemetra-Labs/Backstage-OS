// Pure derivations for the Investigation Room additions and the summary room (BACK-11).
// Screens read these persona-shaped views; health always comes from triadOf/resolveHealth, never from a claim.
import { resolveLabel } from '../contract/rules';
import type { EvidenceReference, Lang, Persona } from '../contract/types';
import type { Decision, InvestigationSummary, World, WorldComponent, WorldProject } from '../contract/world';
import { formatAge } from '../i18n/format';
import type { Copy } from '../i18n/strings';
import { evidenceViewFor } from './evidence';
import type { EvidenceView } from './viewFor';
import { componentById, decisionById, investigationById, projectById, triadOf, type Triad } from './world';

/** The demo snapshot "now": six minutes after the last good GitHub read in the synthetic world. */
export const REFERENCE_NOW = Date.parse('2026-11-16T14:09:00Z');

export interface CrumbSpec {
  readonly label: string;
  readonly href?: string;
}

/** Pairs labels with hrefs. A missing href marks the current page. */
export function crumbTrail(labels: readonly string[], hrefs: readonly (string | undefined)[]): readonly CrumbSpec[] {
  return labels.map((label, i) => {
    const href = hrefs[i];
    return href ? { label, href } : { label };
  });
}

/** Minutes between the observation and the demo snapshot; null when nothing was observed. */
export function observedMinutesAgo(ref: EvidenceReference): number | null {
  const at = ref.observation?.observedAt;
  if (!at) return null;
  const t = Date.parse(at);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((REFERENCE_NOW - t) / 60000));
}

export interface TimelineRow {
  readonly id: string;
  readonly view: EvidenceView;
  readonly minutesAgo: number | null;
}

export interface TimelineSplit {
  /** Items with an observation time a persona may see, newest first. */
  readonly timed: readonly TimelineRow[];
  /** Unread items: no time to place, never shown as a time. */
  readonly untimed: readonly TimelineRow[];
}

export function evidenceTimeline(refs: readonly EvidenceReference[], persona: Persona): TimelineSplit {
  const rows = refs.map((r): TimelineRow => {
    return { id: r.id, view: evidenceViewFor(persona, r), minutesAgo: observedMinutesAgo(r) };
  });
  const timed = rows.filter((r) => r.minutesAgo !== null).sort((a, b) => (a.minutesAgo ?? 0) - (b.minutesAgo ?? 0));
  return { timed, untimed: rows.filter((r) => r.minutesAgo === null) };
}

/** One status line for a list row: not-read reason first, otherwise provider and freshness in words. */
export function evidenceStatusText(v: EvidenceView, copy: Copy, lang: Lang): string {
  if (v.notReadReason) return copy.notRead[v.notReadReason];
  const provider = v.provider ? `{${copy.provider[v.provider]}} · ` : '';
  const age = v.freshness === 'stale' ? ` · ${formatAge(v.ageMinutes, lang)}` : '';
  return `${provider}${copy.freshness[v.freshness]}${age}`;
}

export interface ConflictView {
  readonly passing: readonly EvidenceView[];
  readonly opposing: readonly EvidenceView[];
  readonly component?: WorldComponent;
  /** Resolved by the contract: degraded or down only with a read observation, never healthy without current Observed evidence. */
  readonly triad?: Triad;
}

export interface SummaryView {
  readonly investigation: InvestigationSummary;
  readonly project?: WorldProject;
  readonly component?: WorldComponent;
  readonly decision?: Decision;
  readonly evidence: readonly EvidenceView[];
  readonly conflict?: ConflictView;
}

const isObserved = (r: EvidenceReference): boolean => resolveLabel(r) === 'observed';

/**
 * Conflicting signals: passing delivery checks cited by the case, against other observed evidence that the case's
 * attention item cites. Both sides must be Observed; otherwise there is no conflict to explain.
 */
export function conflictOf(w: World, inv: InvestigationSummary, persona: Persona): ConflictView | undefined {
  const project = projectById(w, inv.projectId);
  if (!project) return undefined;
  const cited = new Set(inv.evidence.map((e) => e.id));
  const passing = project.delivery.filter((d) => d.status === 'passing' && cited.has(d.evidence.id)).map((d) => d.evidence).filter(isObserved);
  const passingIds = new Set(passing.map((p) => p.id));
  const opposing = project.attention
    .filter((a) => a.investigationId === inv.id)
    .flatMap((a) => a.evidence)
    .filter((e, i, all) => !passingIds.has(e.id) && isObserved(e) && all.findIndex((x) => x.id === e.id) === i);
  if (passing.length === 0 || opposing.length === 0) return undefined;
  const component = componentById(project, inv.componentId);
  return {
    passing: passing.map((r) => evidenceViewFor(persona, r)),
    opposing: opposing.map((r) => evidenceViewFor(persona, r)),
    ...(component ? { component, triad: triadOf(component.state) } : {}),
  };
}

export function summaryFor(w: World, id: string, persona: Persona): SummaryView | undefined {
  const investigation = investigationById(w, id);
  if (!investigation) return undefined;
  const project = projectById(w, investigation.projectId);
  const component = project ? componentById(project, investigation.componentId) : undefined;
  const decision = investigation.decisionId ? decisionById(w, investigation.decisionId) : undefined;
  const conflict = conflictOf(w, investigation, persona);
  return {
    investigation,
    ...(project ? { project } : {}),
    ...(component ? { component } : {}),
    ...(decision ? { decision } : {}),
    evidence: investigation.evidence.map((r) => evidenceViewFor(persona, r)),
    ...(conflict ? { conflict } : {}),
  };
}

/** A decision is shown as Approved only when its record carries a source link; everything else is Proposed. */
export function decisionLabel(d: Decision): 'proposed' | 'approved' {
  return d.classification === 'approved' && d.record && resolveLabel(d.record) === 'approved' ? 'approved' : 'proposed';
}
