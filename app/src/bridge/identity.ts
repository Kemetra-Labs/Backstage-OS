// BACK-85 (S5a): the typed identity crosswalk between the host app (V1 projects, `#/project/<id>`) and the B+C map lens (V2 nodes).
// Only verified identities are mapped. A similar name is not proof: a project that is not verified resolves to 'unresolved' or
// 'ambiguous' and the caller must treat it as having no counterpart. Nothing here renames an id, a route or a fixture, and nothing
// here holds state. Synthetic demo data only; persona is a display switch, not authorization.
import { DOMAIN } from '../domain/fixture';
import type { NodeKind } from '../lenses/types';

export type IdentityStatus = 'verified' | 'unresolved' | 'ambiguous';

export interface IdentityEntry {
  /** The host (V1) project id, as in `#/project/<id>`. Always a project. */
  readonly host: string;
  /** The map (V2) node id and the kind the V2 fixture gives it. */
  readonly map: string;
  readonly mapKind: NodeKind;
  readonly status: IdentityStatus;
  /** Why the entry has this status. Written for a reviewer; tests pin it to the fixtures. */
  readonly basis: string;
}

/**
 * The enumeration of every host project against its candidate map node.
 * - RT is verified structurally, not by name: V1's RT owns the components pos, stock-sync and inventory, the canonical domain
 *   model (BACK-83/84) owns exactly those ids, and V2 groups the same three ids under `retail-tower` (edges g1 to g3).
 * - KH has the same display name as `khepri` but shares no component, evidence or dependency with it, and the two fixtures
 *   disagree on its health (V1 degraded, V2 healthy with no basis). Name alone is not identity.
 * - SB is a project in V1 and a service in V2. A product or project and a service with similar names are not the same entity.
 */
export const IDENTITIES = [
  {
    host: 'RT', map: 'retail-tower', mapKind: 'product', status: 'verified',
    basis: 'V1 project RT owns pos, stock-sync and inventory; the canonical domain model owns those ids; V2 groups them under retail-tower.',
  },
  {
    host: 'KH', map: 'khepri', mapKind: 'product', status: 'unresolved',
    basis: 'Same display name only. No shared component, evidence or dependency, and the fixtures disagree on health.',
  },
  {
    host: 'SB', map: 'seshat-bi', mapKind: 'service', status: 'ambiguous',
    basis: 'V1 SB is a project, V2 seshat-bi is a service. Similar names are not proof of one entity.',
  },
] as const satisfies readonly IdentityEntry[];

type Entry = (typeof IDENTITIES)[number];
export type VerifiedEntry = Extract<Entry, { readonly status: 'verified' }>;
/** The host project ids that have a verified map counterpart, and the map ids they map to. */
export type VerifiedHostId = VerifiedEntry['host'];
export type VerifiedMapId = VerifiedEntry['map'];

/** The result of a lookup. Nothing falls back to a guess: only 'verified' carries an id. */
export type Resolution<T extends string = string> =
  | { readonly kind: 'verified'; readonly id: T }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'ambiguous' }
  /** The id is not in the crosswalk at all (unknown or foreign). */
  | { readonly kind: 'foreign' };

function resolveEntry<T extends string>(e: Entry | undefined, pick: (v: VerifiedEntry) => T): Resolution<T> {
  if (!e) return { kind: 'foreign' };
  if (e.status === 'verified') return { kind: 'verified', id: pick(e as VerifiedEntry) };
  return { kind: e.status };
}

const byHost = new Map<string, Entry>(IDENTITIES.map((e) => [e.host, e]));
const byMap = new Map<string, Entry>(IDENTITIES.map((e) => [e.map, e]));

/** Host project id to map node id. */
export const mapIdOfProject = (host: string): Resolution<VerifiedMapId> => resolveEntry(byHost.get(host), (v) => v.map);

/** Map node id to host project id. The inverse of `mapIdOfProject` on verified entries. */
export const projectOfMapId = (map: string): Resolution<VerifiedHostId> => resolveEntry(byMap.get(map), (v) => v.host);

/** The one host project that owns the shared (canonical) components. */
export const COMPONENT_PROJECT: VerifiedHostId = 'RT';

const sharedComponentIds: ReadonlySet<string> = new Set(DOMAIN.components.map((c) => c.id));

/**
 * True when the id names a component both the host and the map share, as owned by the canonical domain model. A component
 * the host has and the map lacks (payments, api-gateway) or the reverse (github) is not shared.
 */
export const isSharedComponent = (id: string): boolean => sharedComponentIds.has(id);
