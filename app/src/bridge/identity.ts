// BACK-85 (S5a), BACK-102: the typed identity between a portfolio project (`#/project/<id>`) and a node of the mission graph. It is
// read from the one world: a graph node that is a project carries a `projectLink` (contract/world.ts), so there is no second table.
// Only verified links are identities. A similar name is not proof: a project whose link is not verified resolves to 'unresolved' or
// 'ambiguous' and the caller must treat it as having no counterpart. Nothing here renames an id, a route or a fixture, and nothing
// here holds state. The links are structural (no evidence, never scoped by persona), so the fixture is read as is. Synthetic demo
// data only; persona is a display switch, not authorization.
import type { IdentityStatus, NodeKind, ProjectId } from '../contract/world';
import { DOMAIN } from '../domain/fixture';
import { WORLD } from '../fixture/world';

export type { IdentityStatus };

export interface IdentityEntry {
  /** The portfolio project id, as in `#/project/<id>`. Always a project. */
  readonly host: ProjectId;
  /** The graph node id and the kind the graph gives it. */
  readonly map: string;
  readonly mapKind: NodeKind;
  readonly status: IdentityStatus;
  /** Why the entry has this status. Written for a reviewer; tests pin it to the fixture. */
  readonly basis: string;
}

/** Every graph node that carries a project link, as an entry: the enumeration of each project against its candidate node. */
export const IDENTITIES: readonly IdentityEntry[] = WORLD.graph.nodes.flatMap((n) =>
  n.projectLink ? [{ host: n.projectLink.project, map: n.id, mapKind: n.kind, status: n.projectLink.status, basis: n.projectLink.basis }] : []);

/** The result of a lookup. Nothing falls back to a guess: only 'verified' carries an id. */
export type Resolution<T extends string = string> =
  | { readonly kind: 'verified'; readonly id: T }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'ambiguous' }
  /** The id is not linked at all (unknown or foreign). */
  | { readonly kind: 'foreign' };

function resolveEntry<T extends string>(e: IdentityEntry | undefined, pick: (v: IdentityEntry) => T): Resolution<T> {
  if (!e) return { kind: 'foreign' };
  if (e.status === 'verified') return { kind: 'verified', id: pick(e) };
  return { kind: e.status };
}

const byHost = new Map<string, IdentityEntry>(IDENTITIES.map((e) => [e.host, e]));
const byMap = new Map<string, IdentityEntry>(IDENTITIES.map((e) => [e.map, e]));

/** Portfolio project id to graph node id. */
export const mapIdOfProject = (host: string): Resolution => resolveEntry(byHost.get(host), (v) => v.map);

/** Graph node id to portfolio project id. The inverse of `mapIdOfProject` on verified entries. */
export const projectOfMapId = (map: string): Resolution<ProjectId> => resolveEntry(byMap.get(map), (v) => v.host);

/** The one project that owns the shared (canonical) components. */
export const COMPONENT_PROJECT: ProjectId = 'RT';

const sharedComponentIds: ReadonlySet<string> = new Set(DOMAIN.components.map((c) => c.id));

/**
 * True when the id names a component both the project and the graph share, as owned by the canonical domain model. A component
 * the project has and the graph lacks (payments, api-gateway) or the reverse (github) is not shared.
 */
export const isSharedComponent = (id: string): boolean => sharedComponentIds.has(id);
