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
  return { ...n, state: scopeState(n.state, sources, n.provider), evidence: n.evidence.filter(visible) };
}

function scopeEdge(e: WorldEdge, visible: Visible): WorldEdge {
  return { ...e, evidence: e.evidence.filter(visible) };
}

function scopeSource(s: SourceMeta): SourceMeta {
  const health = scopeState(s.health, [s], s.provider);
  return health === s.health ? s : { ...s, health };
}

const scopeReplay = (r: ReplayEvent, visible: Visible): ReplayEvent => (r.evidence !== null && !visible(r.evidence) ? { ...r, evidence: null } : r);
const scopeMission = (m: Mission, visible: Visible): Mission => ({ ...m, evidence: m.evidence.filter(visible) });

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
    replay: w.replay.map((r) => scopeReplay(r, visible)),
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
