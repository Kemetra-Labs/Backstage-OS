// BACK-73: V1 restricted-evidence non-disclosure. Technical-only evidence, and every claim resting only on it, is removed from
// the world and investigation an unauthorized persona receives. Persona is a display switch, not authorization: this scopes
// the synthetic demo data and no server-side identity, tenant or access enforcement exists or is claimed. Mirrors the V2
// precedent in design-lab/v2/logic/authorize.ts.
import type {
  ConfidenceBasis, DisplayState, EvidenceReference, FactRef, Hypothesis, InvestigationData, MapNode, Persona,
} from '../contract/types';
import type {
  ActivityEvent, ByPersonaL10n, Attention, Decision, DecisionOption, DeliveryItem, InvestigationSummary, World, WorldComponent, WorldEdge,
  WorldProject,
} from '../contract/world';

/** True when this persona may not read the evidence item. */
export const isWithheld = (e: EvidenceReference, persona: Persona): boolean =>
  persona !== 'technical' && e.visibility === 'technical';

type Keep = (e: EvidenceReference) => boolean;

const worldMemo = new WeakMap<World, Map<Persona, World>>();
const invMemo = new WeakMap<InvestigationData, Map<Persona, InvestigationData>>();

const filterRefs = (refs: readonly EvidenceReference[], keep: Keep): readonly EvidenceReference[] => refs.filter(keep);

// A claim whose whole basis was withheld is unknown, never healthy. Connectivity is a source fact and stays.
function scopeState(s: DisplayState, keep: Keep): DisplayState {
  const basis = filterRefs(s.basis, keep);
  if (basis.length === s.basis.length) return s;
  if (basis.length > 0) return { ...s, basis };
  return { ...s, basis, health: 'unknown', freshness: 'unknown' };
}

const scopeComponent = (c: WorldComponent, keep: Keep): WorldComponent => ({ ...c, state: scopeState(c.state, keep) });

// Persona text variants can name a withheld record (a job name, a deploy id). An unauthorized persona gets its own variant under
// every key, so no other persona's wording is present in the data it holds.
const collapse = (t: ByPersonaL10n, persona: Persona): ByPersonaL10n => {
  const mine = t[persona];
  return { owner: mine, technical: mine, nontechnical: mine };
};

const scopeAttention = (list: readonly Attention[], keep: Keep, persona: Persona): Attention[] =>
  list
    .map((a) => ({ a, evidence: filterRefs(a.evidence, keep) }))
    .filter(({ a, evidence }) => !(a.evidence.length > 0 && evidence.length === 0))
    .map(({ a, evidence }) => ({ ...a, title: collapse(a.title, persona), evidence }));

// An edge whose only basis was withheld has no authorized basis and is removed. Edges that never had one stay.
const scopeEdges = (list: readonly WorldEdge[], keep: Keep): WorldEdge[] =>
  list
    .filter((e) => e.basis.length === 0 || e.basis.some(keep))
    .map((e) => ({ ...e, basis: filterRefs(e.basis, keep) }));

const scopeDelivery = (list: readonly DeliveryItem[], keep: Keep): DeliveryItem[] => list.filter((d) => keep(d.evidence));

function scopeProject(p: WorldProject, keep: Keep, persona: Persona): WorldProject {
  return {
    ...p,
    health: scopeState(p.health, keep),
    components: p.components.map((c) => scopeComponent(c, keep)),
    edges: scopeEdges(p.edges, keep),
    attention: scopeAttention(p.attention, keep, persona),
    delivery: scopeDelivery(p.delivery, keep),
  };
}

const scopeInvestigationSummary = (i: InvestigationSummary, keep: Keep, persona: Persona): InvestigationSummary =>
  ({ ...i, title: collapse(i.title, persona), evidence: filterRefs(i.evidence, keep) });

const scopeOption = (o: DecisionOption, keep: Keep): DecisionOption => ({ ...o, evidence: filterRefs(o.evidence, keep) });

function scopeDecision(d: Decision, keep: Keep, persona: Persona): Decision {
  const { record, ...rest } = d;
  return {
    ...rest,
    title: collapse(d.title, persona),
    nextStep: collapse(d.nextStep, persona),
    ...(record && keep(record) ? { record } : {}),
    observed: filterRefs(d.observed, keep),
    options: d.options.map((o) => scopeOption(o, keep)),
  };
}

const scopeActivity = (list: readonly ActivityEvent[], visibleId: (id: string) => boolean): ActivityEvent[] =>
  list.filter((a) => a.evidenceId === undefined || visibleId(a.evidenceId));

function buildWorld(w: World, persona: Persona): World {
  const keep: Keep = (e) => !isWithheld(e, persona);
  const evidence = Object.fromEntries(Object.entries(w.evidence).filter(([, e]) => keep(e)));
  const visibleId = (id: string): boolean => evidence[id] !== undefined;
  const evidenceText = Object.fromEntries(Object.entries(w.evidenceText).filter(([id]) => visibleId(id)).map(([id, t]) => [id, collapse(t, persona)]));
  return {
    ...w,
    projects: w.projects.map((p) => scopeProject(p, keep, persona)),
    investigations: w.investigations.map((i) => scopeInvestigationSummary(i, keep, persona)),
    // An approved decision requires its record; with the record withheld the decision cannot be shown as approved, so it is dropped.
    decisions: w.decisions.filter((d) => !(d.classification === 'approved' && d.record && !keep(d.record))).map((d) => scopeDecision(d, keep, persona)),
    activity: scopeActivity(w.activity, visibleId),
    evidence,
    evidenceText,
  };
}

/** The world as this persona is authorized to see it. Technical gets the input itself; others never receive a restricted record. */
export function authorizedWorld(w: World, persona: Persona): World {
  if (persona === 'technical') return w;
  let byPersona = worldMemo.get(w);
  if (!byPersona) { byPersona = new Map(); worldMemo.set(w, byPersona); }
  let scoped = byPersona.get(persona);
  if (!scoped) { scoped = buildWorld(w, persona); byPersona.set(persona, scoped); }
  return scoped;
}

const scopeFact = (f: FactRef, keep: Keep): FactRef => (f.evidence && !keep(f.evidence) ? { ...f, evidence: null } : f);

function scopeConfidence(b: ConfidenceBasis, keep: Keep): ConfidenceBasis {
  return { ...b, sources: filterRefs(b.sources, keep) };
}

function scopeHypothesis(h: Hypothesis, keep: Keep): Hypothesis {
  const { confidenceBasis, ...rest } = h;
  return {
    ...rest,
    ...(confidenceBasis ? { confidenceBasis: scopeConfidence(confidenceBasis, keep) } : {}),
    supporting: filterRefs(h.supporting, keep),
    contradicting: filterRefs(h.contradicting, keep),
  };
}

const scopeNode = (n: MapNode, keep: Keep): MapNode => ({ ...n, state: scopeState(n.state, keep) });

function buildInvestigation(inv: InvestigationData, persona: Persona): InvestigationData {
  const keep: Keep = (e) => !isWithheld(e, persona);
  const evidence = filterRefs(inv.evidence, keep);
  // rawOutput is required by the type, so it is kept only when the evidence it came from is readable. The shipped fixture
  // cites E-1, which is not Technical-only; a fixture whose raw output were withheld would need the type to allow absence.
  const rawRef = inv.evidence.find((e) => e.id === inv.rawOutput.evidenceId);
  if (rawRef && isWithheld(rawRef, persona)) throw new Error('authorizedInvestigation: rawOutput evidence is withheld; rawOutput must become optional');
  return {
    ...inv,
    evidence,
    facts: inv.facts.map((f) => scopeFact(f, keep)),
    hypothesis: scopeHypothesis(inv.hypothesis, keep),
    nodes: inv.nodes.map((n) => scopeNode(n, keep)),
  };
}

/** The investigation as this persona is authorized to see it. Technical gets the input itself. */
export function authorizedInvestigation(inv: InvestigationData, persona: Persona): InvestigationData {
  if (persona === 'technical') return inv;
  let byPersona = invMemo.get(inv);
  if (!byPersona) { byPersona = new Map(); invMemo.set(inv, byPersona); }
  let scoped = byPersona.get(persona);
  if (!scoped) { scoped = buildInvestigation(inv, persona); byPersona.set(persona, scoped); }
  return scoped;
}
