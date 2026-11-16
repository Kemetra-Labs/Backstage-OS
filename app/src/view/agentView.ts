// Agent activity view (demo only): roster and simulated run history derived from WORLD. Pure functions.
import type { AgentCapability, AgentState, ActivityEvent, L10n, ProjectId, World } from '../contract/world';
import type { TruthLabel } from '../contract/types';

export interface AgentRow {
  readonly id: string;
  /** Technical name, rendered left to right. */
  readonly name: string;
  readonly purpose: L10n;
  readonly state: AgentState;
  readonly projects: readonly { readonly id: ProjectId; readonly name: string }[];
  readonly capabilities: readonly AgentCapability[];
  /** null means the agent has never acted. */
  readonly lastActivityMinutesAgo: number | null;
}

export interface AgentEventRow {
  readonly id: string;
  readonly minutesAgo: number;
  readonly actor: 'agent' | 'human';
  readonly agentId: string | null;
  readonly agentName: string | null;
  readonly projectId: ProjectId;
  readonly text: L10n;
  readonly truth: TruthLabel | 'unknown';
  readonly investigationId: string | null;
  readonly evidenceId: string | null;
}

export type ProjectFilter = 'all' | ProjectId;

export function agentRoster(world: World): readonly AgentRow[] {
  return world.agents.map((a) => ({
    id: a.id,
    name: a.name,
    purpose: a.purpose,
    state: a.state,
    projects: a.projectIds.flatMap((pid) => {
      const p = world.projects.find((x) => x.id === pid);
      return p ? [{ id: p.id, name: p.name }] : [];
    }),
    capabilities: a.capabilities,
    lastActivityMinutesAgo: a.lastActivityMinutesAgo,
  }));
}

const isAgentRelated = (e: ActivityEvent): boolean => e.actor === 'agent' || (e.actor === 'human' && e.agentId !== undefined);

/** Simulated agent events plus the human pause event, newest first, optionally limited to one project. */
export function agentEvents(world: World, project: ProjectFilter = 'all'): readonly AgentEventRow[] {
  return world.activity
    .filter(isAgentRelated)
    .filter((e) => project === 'all' || e.projectId === project)
    .map((e): AgentEventRow => ({
      id: e.id,
      minutesAgo: e.minutesAgo,
      actor: e.actor === 'human' ? 'human' : 'agent',
      agentId: e.agentId ?? null,
      agentName: world.agents.find((a) => a.id === e.agentId)?.name ?? null,
      projectId: e.projectId,
      text: e.text,
      truth: e.truth,
      investigationId: e.investigationId ?? null,
      evidenceId: e.evidenceId ?? null,
    }))
    .sort((a, b) => a.minutesAgo - b.minutesAgo);
}

/** Projects that have at least one agent event, for the filter. */
export function projectFilterOptions(world: World): readonly { readonly id: ProjectId; readonly name: string }[] {
  const ids = new Set(world.activity.filter(isAgentRelated).map((e) => e.projectId));
  return world.projects.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
}

export interface StateCounts {
  readonly watching: number;
  readonly idle: number;
  readonly paused: number;
  readonly not_enabled: number;
}

export function stateCounts(rows: readonly AgentRow[]): StateCounts {
  const n = (s: AgentState) => rows.filter((r) => r.state === s).length;
  return { watching: n('watching'), idle: n('idle'), paused: n('paused'), not_enabled: n('not_enabled') };
}
