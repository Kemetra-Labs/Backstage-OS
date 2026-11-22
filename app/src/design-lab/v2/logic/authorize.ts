// BACK-30 (ratified M05-D05-B): Technical-only evidence, and everything supported only by it, is removed from the world
// an unauthorized persona is given. Persona is a display switch, not authorization: this scopes the synthetic demo world
// and no server-side identity, tenant or X02/X04 enforcement exists or is claimed.
import { freshnessOf } from '../../../contract/rules';
import type { DisplayState, EvidenceReference, Persona } from '../../../contract/types';
import type { Mission, ReplayEvent, SourceMeta, World, WorldEdge, WorldNode } from '../types';

type Visible = (id: string) => boolean;

const memo = new WeakMap<World, Map<Persona, World>>();

const keepRef = (r: EvidenceReference): boolean => r.visibility !== 'technical';

function scopeState(state: DisplayState, sources: readonly SourceMeta[], provider: WorldNode['provider']): DisplayState {
  const basis = state.basis.filter(keepRef);
  if (basis.length === state.basis.length) return state;
  if (basis.length > 0) return { ...state, basis };
  // The whole basis was restricted. A claim that rested only on it is unknown, never healthy. Freshness falls back to what
  // the (authorized) source authority says; a node with no source of its own has nothing to say. Connectivity is a source fact.
  const src = provider ? sources.find((s) => s.provider === provider)?.source : undefined;
  return { ...state, basis, health: 'unknown', freshness: src ? freshnessOf(src) : 'unknown' };
}

function scopeNode(n: WorldNode, visible: Visible, sources: readonly SourceMeta[]): WorldNode {
  const { descWithoutEvidence, ...rest } = n;
  const evidence = n.evidence.filter(visible);
  // A description written from a record this persona may not read would describe that record. When the node's whole
  // evidence is withheld it falls back to the generic "no evidence has been read" wording its fixture declares.
  const withheldAll = n.evidence.length > 0 && evidence.length === 0;
  return { ...rest, state: scopeState(n.state, sources, n.provider), evidence, ...(withheldAll && descWithoutEvidence ? { descKey: descWithoutEvidence } : {}) };
}

function scopeEdge(e: WorldEdge, visible: Visible): WorldEdge {
  return { ...e, evidence: e.evidence.filter(visible) };
}

function scopeSource(s: SourceMeta): SourceMeta {
  const health = scopeState(s.health, [s], s.provider);
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

function build(w: World): World {
  const evidenceById = Object.fromEntries(Object.entries(w.evidenceById).filter(([, r]) => keepRef(r)));
  const visible: Visible = (id) => evidenceById[id] !== undefined;
  const sources = w.sources.map(scopeSource);
  // A link whose only evidence was restricted has no authorized basis and is removed. Links that never had evidence stay.
  const edges = w.edges.filter((e) => e.evidence.length === 0 || e.evidence.some(visible)).map((e) => scopeEdge(e, visible));
  return {
    ...w,
    nodes: w.nodes.map((n) => scopeNode(n, visible, sources)),
    edges,
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
  if (!scoped) { scoped = build(w); byPersona.set(persona, scoped); }
  return scoped;
}
