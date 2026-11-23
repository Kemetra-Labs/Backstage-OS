// BACK-30 (ratified M05-D05-B): Technical-only evidence, and everything supported only by it, is removed from the world
// an unauthorized persona is given. Persona is a display switch, not authorization: this scopes the synthetic demo world
// and no server-side identity, tenant or X02/X04 enforcement exists or is claimed.
//
// BACK-84: the INV-DEMO-7 overlap (evidence E-1..E-9, nodes pos / stock-sync / inventory, the dependencies between them) is decided
// once, by scopeFixture through domain/runtime. Every other record keeps keepRef. A structure outside the overlap that cites an
// overlap record (the sentry node, edge d4, a mission, a replay row, a source's health basis) is pruned through the same decision.
import { freshnessOf } from '../../../contract/rules';
import type { DisplayState, EvidenceReference, Persona } from '../../../contract/types';
import { canonicalComponent, canonicalFor, dependencyVerdict, evidenceVerdict } from '../../../domain/runtime';
import { toV2NodeFacts } from '../../../domain/toV2';
import type { Mission, ReplayEvent, SourceMeta, World, WorldEdge, WorldNode } from '../types';

type Visible = (id: string) => boolean;
type Keep = (r: EvidenceReference) => boolean;

const memo = new WeakMap<World, Map<Persona, World>>();

/** The rule for evidence the canonical fixture does not own. */
const keepRef = (r: EvidenceReference): boolean => r.visibility !== 'technical';

const keepFor = (persona: Persona): Keep => (r) => {
  const v = evidenceVerdict(persona, r.id);
  return v === 'foreign' ? keepRef(r) : v === 'visible';
};

function scopeState(state: DisplayState, sources: readonly SourceMeta[], provider: WorldNode['provider'], keep: Keep): DisplayState {
  const basis = state.basis.filter(keep);
  if (basis.length === state.basis.length) return state;
  if (basis.length > 0) return { ...state, basis };
  // The whole basis was restricted. A claim that rested only on it is unknown, never healthy. Freshness falls back to what
  // the (authorized) source authority says; a node with no source of its own has nothing to say. Connectivity is a source fact.
  const src = provider ? sources.find((s) => s.provider === provider)?.source : undefined;
  return { ...state, basis, health: 'unknown', freshness: src ? freshnessOf(src) : 'unknown' };
}

function scopeNode(n: WorldNode, visible: Visible, sources: readonly SourceMeta[], keep: Keep, persona: Persona): WorldNode {
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

function scopeEdge(e: WorldEdge, visible: Visible): WorldEdge {
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

// A mission keeps the evidence it still has. Each withheld reference takes its event out of the count (the fixture does not say what
// `events` counts; one event per reference is the assumption, and a lower number never reveals a hidden record). A mission whose
// whole basis was withheld keeps no claim: unknown label, no evidence, no events.
function scopeMission(m: Mission, visible: Visible): Mission {
  const evidence = m.evidence.filter(visible);
  const withheld = m.evidence.length - evidence.length;
  if (withheld === 0) return m;
  if (evidence.length === 0) return { ...m, evidence, events: 0, label: 'unknown' };
  return { ...m, evidence, events: Math.max(0, m.events - withheld) };
}

// An overlap dependency is kept, or removed, by the scoped canonical fixture and carries its truth and evidence ids. Any other link
// is removed when its only evidence was restricted; links that never had evidence stay.
function scopeEdges(list: readonly WorldEdge[], visible: Visible, persona: Persona): WorldEdge[] {
  return list.flatMap((e) => {
    const d = e.cls === 'dep' ? dependencyVerdict(persona, e.a, e.b) : ({ kind: 'foreign' } as const);
    if (d.kind === 'withheld') return [];
    if (d.kind === 'visible') return [{ ...e, truth: d.dependency.truth, evidence: d.dependency.evidence }];
    return e.evidence.length === 0 || e.evidence.some(visible) ? [scopeEdge(e, visible)] : [];
  });
}

function build(w: World, persona: Persona): World {
  const keep = keepFor(persona);
  const evidenceById = Object.fromEntries(Object.entries(w.evidenceById).filter(([, r]) => keep(r)));
  const visible: Visible = (id) => evidenceById[id] !== undefined;
  const sources = w.sources.map((s) => scopeSource(s, keep));
  return {
    ...w,
    nodes: w.nodes.map((n) => scopeNode(n, visible, sources, keep, persona)),
    edges: scopeEdges(w.edges, visible, persona),
    sources,
    replay: w.replay.filter((r) => keepReplay(r, visible)),
    missions: w.missions.map((m) => scopeMission(m, visible)),
    evidenceById,
  };
}

/** The world as this persona is authorized to see it. Technical gets the input itself; others never receive a restricted record. */
export function authorizedWorld(w: World, persona: Persona): World {
  if (persona === 'technical') return w;
  let byPersona = memo.get(w);
  if (!byPersona) { byPersona = new Map(); memo.set(w, byPersona); }
  let scoped = byPersona.get(persona);
  if (!scoped) { scoped = build(w, persona); byPersona.set(persona, scoped); }
  return scoped;
}
