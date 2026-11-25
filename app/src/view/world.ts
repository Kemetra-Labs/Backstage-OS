// Shared lookups and truth helpers over the synthetic world. Screens call these; they never decide health themselves.
import { effectiveFreshness, freshnessOf, resolveHealth, worstFreshness } from '../contract/rules';
import type { Connectivity, DisplayState, EvidenceReference, Freshness, Health, Lang, Persona, SourceAuthority } from '../contract/types';
import type {
  ByPersonaL10n, Decision, InvestigationSummary, L10n, World, WorldComponent, WorldProject,
} from '../contract/world';

export interface Triad {
  readonly connectivity: Connectivity;
  readonly freshness: Freshness;
  /** Resolved by the contract: unknown unless current Observed evidence supports healthy. */
  readonly health: Health;
  readonly ageMinutes: number | null;
}

/** Connectivity, freshness and health kept as three independent values. Unread basis gives unknown freshness. */
export function triadOf(state: DisplayState): Triad {
  const read = state.basis.filter((r) => r.observation !== null);
  const ages = read.map((r) => r.observation?.source.ageMinutes).filter((a): a is number => typeof a === 'number');
  return {
    connectivity: state.connectivity,
    freshness: worstFreshness(read.map(effectiveFreshness)),
    health: resolveHealth(state),
    ageMinutes: ages.length ? Math.max(...ages) : null,
  };
}

export interface SourceSummary {
  readonly total: number;
  readonly current: number;
  readonly stale: number;
  readonly unknown: number;
  readonly unavailable: number;
  readonly notConfigured: number;
}

export function sourceSummary(sources: readonly SourceAuthority[]): SourceSummary {
  const f = sources.map(freshnessOf);
  return {
    total: sources.length,
    current: f.filter((x) => x === 'current').length,
    stale: f.filter((x) => x === 'stale').length,
    unknown: f.filter((x) => x === 'unknown').length,
    unavailable: sources.filter((s) => s.connectivity === 'unavailable').length,
    notConfigured: sources.filter((s) => s.connectivity === 'not_configured').length,
  };
}

export const tr = (t: L10n, lang: Lang): string => t[lang];
export const trp = (t: ByPersonaL10n, persona: Persona, lang: Lang): string => t[persona][lang];

export const projectById = (w: World, id: string): WorldProject | undefined => w.projects.find((p) => p.id === id);
export const investigationById = (w: World, id: string): InvestigationSummary | undefined =>
  w.investigations.find((i) => i.id === id);
export const decisionById = (w: World, id: string): Decision | undefined => w.decisions.find((d) => d.id === id);
/** A catalogued evidence item: a read of a source itself (World.sourceProbes) is not in the catalogue, so it is undefined here. */
export const evidenceById = (w: World, id: string): EvidenceReference | undefined =>
  w.sourceProbes.includes(id) ? undefined : w.evidence[id];

/** The evidence catalogue the demo search and the Evidence Explorer list: every record except the source probes, in world order. */
export const catalogueEvidence = (w: World): readonly EvidenceReference[] =>
  Object.values(w.evidence).filter((e) => !w.sourceProbes.includes(e.id));

const caseMemo = new WeakMap<World, readonly EvidenceReference[]>();

/**
 * The mission's case evidence, as the records this world holds: the evidence of the investigation the mission follows, then the
 * source probes. A record the world does not hold (withheld from the persona) is absent, so this never names one.
 */
export function caseEvidence(w: World): readonly EvidenceReference[] {
  let list = caseMemo.get(w);
  if (!list) {
    const ids = [...(investigationById(w, w.investigationId)?.evidence.map((e) => e.id) ?? []), ...w.sourceProbes];
    list = [...new Set(ids)].flatMap((id) => { const e = w.evidence[id]; return e ? [e] : []; });
    caseMemo.set(w, list);
  }
  return list;
}
export const componentById = (p: WorldProject, id: string): WorldComponent | undefined => p.components.find((c) => c.id === id);

/** The project and investigation that cite an evidence item, for "return to context" links. */
export function contextOfEvidence(w: World, evidenceId: string): { investigation?: InvestigationSummary; project?: WorldProject } {
  const investigation = w.investigations.find((i) => i.evidence.some((e) => e.id === evidenceId));
  const project = investigation ? projectById(w, investigation.projectId) : undefined;
  return { ...(investigation ? { investigation } : {}), ...(project ? { project } : {}) };
}
