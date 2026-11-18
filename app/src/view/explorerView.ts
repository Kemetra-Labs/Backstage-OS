// Pure derivations for the Evidence Explorer (BACK-11). Persona redaction comes from evidenceViewFor only.
import type { EvidenceReference, Persona } from '../contract/types';
import type { Decision, InvestigationSummary, World, WorldComponent, WorldProject } from '../contract/world';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { evidenceViewFor } from './evidence';
import type { EvidenceView } from './viewFor';
import { componentById, contextOfEvidence, evidenceById, investigationById, projectById } from './world';

export interface ExplorerView {
  readonly id: string;
  readonly view: EvidenceView;
  /** view.rawOutput is set for Technical only, and only for E-1. */
  /** The investigation the reader came from (valid `from`) or the first that cites the item. */
  readonly investigation?: InvestigationSummary;
  readonly project?: WorldProject;
  readonly component?: WorldComponent;
  readonly citedBy: readonly InvestigationSummary[];
  readonly decisions: readonly Decision[];
  readonly siblings: readonly EvidenceView[];
}

const cites = (inv: InvestigationSummary, id: string): boolean => inv.evidence.some((e) => e.id === id);

const decisionCites = (d: Decision, id: string): boolean =>
  d.observed.some((e) => e.id === id) || d.record?.id === id || d.options.some((o) => o.evidence.some((e) => e.id === id));

/** A project that cites the item through a component, a delivery item, an attention item or its own health. */
function projectCiting(w: World, id: string): WorldProject | undefined {
  const has = (list: readonly EvidenceReference[]): boolean => list.some((e) => e.id === id);
  return w.projects.find(
    (p) =>
      p.components.some((c) => has(c.state.basis)) ||
      p.delivery.some((d) => d.evidence.id === id) ||
      p.attention.some((a) => has(a.evidence)) ||
      has(p.health.basis),
  );
}

/** The investigation for crumbs and the back link: `from` wins only when that case really cites the item. */
export function resolveInvestigation(w: World, id: string, from?: string): InvestigationSummary | undefined {
  const fromInv = from ? investigationById(w, from) : undefined;
  if (fromInv && cites(fromInv, id)) return fromInv;
  return contextOfEvidence(w, id).investigation;
}

export function explorerFor(
  w: World,
  id: string,
  persona: Persona,
  from?: string,
  raw: { readonly evidenceId: string; readonly text: string } = INV_DEMO_7.rawOutput,
): ExplorerView | undefined {
  const ref = evidenceById(w, id);
  if (!ref) return undefined;
  const investigation = resolveInvestigation(w, id, from);
  const decisions = w.decisions.filter((d) => decisionCites(d, id));
  const project =
    (investigation ? projectById(w, investigation.projectId) : undefined) ??
    projectCiting(w, id) ??
    (decisions[0] ? projectById(w, decisions[0].projectId) : undefined);
  const component = project
    ? (investigation ? componentById(project, investigation.componentId) : undefined) ??
      project.components.find((c) => c.state.basis.some((e) => e.id === id))
    : undefined;
  const rawText = raw.evidenceId === id ? raw.text : undefined;
  return {
    id,
    view: evidenceViewFor(persona, ref, rawText),
    ...(investigation ? { investigation } : {}),
    ...(project ? { project } : {}),
    ...(component ? { component } : {}),
    citedBy: w.investigations.filter((i) => cites(i, id)),
    decisions,
    siblings: investigation ? investigation.evidence.filter((e) => e.id !== id).map((e) => evidenceViewFor(persona, e)) : [],
  };
}
