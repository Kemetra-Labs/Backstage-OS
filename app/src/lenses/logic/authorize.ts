// BACK-30 (ratified M05-D05-B): Technical-only evidence, and everything supported only by it, is removed from the world
// an unauthorized persona is given. Persona is a display switch, not authorization: this scopes the synthetic demo world
// and no server-side identity, tenant or X02/X04 enforcement exists or is claimed.
//
// BACK-84: the INV-DEMO-7 overlap (evidence E-1..E-9, nodes pos / stock-sync / inventory, the dependencies between them) is decided
// once, by scopeFixture through domain/runtime. Every other record keeps keepRef. A structure outside the overlap that cites an
// overlap record (the sentry node, edge d4, a mission, a replay row, a source's health basis) is pruned through the same decision.
import { freshnessOf } from '../../contract/rules';
import type { DisplayState, EvidenceReference, Persona } from '../../contract/types';
import { canonicalComponent, canonicalFor, dependencyVerdict } from '../../domain/runtime';
import { toV2NodeFacts } from '../../domain/toV2';
import type { Mission, ReplayEvent, SourceMeta, World, GraphEdge, GraphNode } from '../../contract/world';

type Visible = (id: string) => boolean;
type Keep = (r: EvidenceReference) => boolean;

function scopeState(state: DisplayState, sources: readonly SourceMeta[], provider: GraphNode['provider'], keep: Keep): DisplayState {
  const basis = state.basis.filter(keep);
  if (basis.length === state.basis.length) return state;
  if (basis.length > 0) return { ...state, basis };
  // The whole basis was restricted. A claim that rested only on it is unknown, never healthy. Freshness falls back to what
  // the (authorized) source authority says; a node with no source of its own has nothing to say. Connectivity is a source fact.
  const src = provider ? sources.find((s) => s.provider === provider)?.source : undefined;
  return { ...state, basis, health: 'unknown', freshness: src ? freshnessOf(src) : 'unknown' };
}

function scopeNode(n: GraphNode, visible: Visible, sources: readonly SourceMeta[], keep: Keep, persona: Persona): GraphNode {
  const { descWithoutEvidence, ...rest } = n;
  // An overlap node takes its state and evidence ids from the scoped canonical fixture; any other node is scoped here.
  const canon = canonicalComponent(persona, n.id);
  const facts = canon ? toV2NodeFacts(canonicalFor(persona), canon.id) : undefined;
  const evidence = facts ? facts.evidence : n.evidence.filter(visible);
  const state = facts ? facts.state : scopeState(n.state, sources, n.provider, keep);
  // A description written from a record this persona may not read would describe that record. When the node's whole
  // evidence is withheld (judged against the node's own unscoped evidence) it falls back to the generic "no evidence has been
  // read" wording its fixture declares.
  const withheldAll = n.evidence.length > 0 && evidence.length === 0;
  return { ...rest, state, evidence, ...(withheldAll && descWithoutEvidence ? { descKey: descWithoutEvidence } : {}) };
}

function scopeEdge(e: GraphEdge, visible: Visible): GraphEdge {
  return { ...e, evidence: e.evidence.filter(visible) };
}

function scopeSource(s: SourceMeta, keep: Keep): SourceMeta {
  const health = scopeState(s.health, [s], s.provider, keep);
  return health === s.health ? s : { ...s, health };
}

// A replay row that rests on a withheld record is removed, not blanked: keeping the row with its evidence nulled would still show
// an event at that time, with its label and stage, and so tell the viewer something happened there (BACK-66, M05-D05-B). Rows that
// never had evidence, or rest on a record the viewer may read, are untouched. Replay time is evenly spaced over the remaining
// rows, so removing one leaves no gap.
const keepReplay = (r: ReplayEvent, visible: Visible): boolean => r.evidence === null || visible(r.evidence);

// A mission keeps the evidence it still has. A mission whose whole basis was withheld keeps no claim: unknown label, no evidence.
// A mission has no `events` figure (removed in BACK-96; the Deck says it is not defined, owner decision BACK-90), so there is no number
// to derive here, least of all by subtracting withheld references, which would differ by persona and so hint that a record is hidden.
function scopeMission(m: Mission, visible: Visible): Mission {
  const evidence = m.evidence.filter(visible);
  const withheld = m.evidence.length - evidence.length;
  if (withheld === 0) return m;
  if (evidence.length === 0) return { ...m, evidence, label: 'unknown' };
  return { ...m, evidence };
}

// An overlap dependency is kept, or removed, by the scoped canonical fixture and carries its truth and evidence ids. Any other link
// is removed when its only evidence was restricted; links that never had evidence stay.
function scopeEdges(list: readonly GraphEdge[], visible: Visible, persona: Persona): GraphEdge[] {
  return list.flatMap((e) => {
    const d = e.cls === 'dep' ? dependencyVerdict(persona, e.a, e.b) : ({ kind: 'foreign' } as const);
    if (d.kind === 'withheld') return [];
    if (d.kind === 'visible') return [{ ...e, truth: d.dependency.truth, evidence: d.dependency.evidence }];
    return e.evidence.length === 0 || e.evidence.some(visible) ? [scopeEdge(e, visible)] : [];
  });
}

/** The mission sections of the world as this persona may see them. `keep` and `visible` are the world's one evidence decision. */
export function scopeMissionSections(
  w: World, persona: Persona, keep: Keep, visible: Visible,
): Pick<World, 'graph' | 'sources' | 'replay' | 'missions' | 'sourceProbes'> {
  const sources = w.sources.map((s) => scopeSource(s, keep));
  return {
    graph: {
      nodes: w.graph.nodes.map((n) => scopeNode(n, visible, sources, keep, persona)),
      edges: scopeEdges(w.graph.edges, visible, persona),
    },
    sources,
    replay: w.replay.filter((r) => keepReplay(r, visible)),
    missions: w.missions.map((m) => scopeMission(m, visible)),
    sourceProbes: w.sourceProbes.filter(visible),
  };
}

/** The one authorizedWorld (src/view/authorize.ts) scopes the whole world; the mission sections through scopeMissionSections. */
export { authorizedWorld } from '../../view/authorize';
