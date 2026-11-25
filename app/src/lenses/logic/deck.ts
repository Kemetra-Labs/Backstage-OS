// Agent Flight Deck logic. All agents are simulated; these are counts and filters over fixed fixture rows.
import type { AgentStatus, Mission, MissionKind, World } from '../../contract/world';

export interface DeckCounts {
  readonly agents: number;
  readonly active: number;
  readonly needsReview: number;
  readonly reviewing: number;
  readonly monitoring: number;
  readonly byStatus: Readonly<Record<AgentStatus, number>>;
}

export function deckCounts(w: World): DeckCounts {
  const byStatus: Record<AgentStatus, number> = { observing: 0, analyzing: 0, drafting: 0, waiting_review: 0, idle: 0 };
  for (const m of w.missions) byStatus[m.status] += 1;
  return {
    agents: w.agents.length,
    active: w.missions.filter((m) => m.status !== 'idle').length,
    needsReview: w.missions.filter((m) => m.human === 'needs_review').length,
    reviewing: w.missions.filter((m) => m.human === 'reviewing').length,
    monitoring: w.missions.filter((m) => m.human === 'monitoring').length,
    byStatus,
  };
}

export interface MissionFilter {
  readonly agent: string | 'all';
  readonly status: AgentStatus | 'all';
}

export const filterMissions = (list: readonly Mission[], f: MissionFilter): readonly Mission[] =>
  list.filter((m) => (f.agent === 'all' || m.agent === f.agent) && (f.status === 'all' || m.status === f.status));

export const STATUS_ORDER: readonly AgentStatus[] = ['observing', 'analyzing', 'drafting', 'waiting_review', 'idle'];

const KIND_ORDER: readonly MissionKind[] = ['sensing', 'analysis', 'proposal'];

/** The kinds of mission an agent works, in queue order: its role on the deck. Derived from the missions; an agent with none has no role. */
export const agentRoles = (w: Pick<World, 'missions'>, agentId: string): readonly MissionKind[] =>
  KIND_ORDER.filter((k) => w.missions.some((m) => m.agent === agentId && m.kind === k));
