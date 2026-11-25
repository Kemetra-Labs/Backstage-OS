// BACK-85 (S5a): a pure, read-only translation from the host app's state (persona, language, route) to the minimal presentation
// context a future B+C Mission Map lens needs, and back from a map selection to a host route.
//
// There is no state here: no React, no provider, no storage, no setter. The host (`AppContext`, one persona, one language, one
// route) stays the only authority, so a lens that consumes this can never hold a second copy that drifts. A selection is only
// ever a node of the persona's authorized world (V2 `authorizedWorld`, which is the canonical scoping of BACK-84): an id that is
// not in that world, restricted or foreign, becomes "no selection" and never appears in the output. Persona is a display switch,
// not authorization; no server-side identity is claimed. Synthetic data only.
import type { Lang, Persona } from '../contract/types';
import { WORLD } from '../fixture/world';
import { authorizedWorld } from '../view/authorize';
import type { World as MapWorld } from '../contract/world';
import type { MapScope, Route } from '../nav/routes';
import { COMPONENT_PROJECT, isSharedComponent, mapIdOfProject, projectOfMapId } from './identity';

/** What the host knows. A subset of `AppState`, so the host passes its own state straight in. */
export interface HostView {
  readonly persona: Persona;
  readonly lang: Lang;
  readonly route: Route;
}

/** How the route relates to the map: 'map' on the Mission Map route itself, 'none' for any other route that is not a project, else the identity status of its project. */
export type MapOrigin = 'verified' | 'unresolved' | 'ambiguous' | 'foreign' | 'map' | 'none';

/** The minimal context a map lens consumes. Plain data: it carries ids and presentation switches only, never evidence. */
export interface MapContext {
  readonly persona: Persona;
  readonly lang: Lang;
  readonly dir: 'ltr' | 'rtl';
  /** The map scope: a verified map node id, or 'all' when the host route has no verified counterpart. */
  readonly scope: string;
  /** The selected node, only when it is a node of this persona's authorized world and the host route names it. */
  readonly node: string | null;
  readonly origin: MapOrigin;
}

/** A map selection. The same shape as the V2 route fields it replaces. */
export interface MapSelection {
  readonly scope: string;
  readonly node: string | null;
}

const ALL = 'all';
/** The map's scope when the route names none: the approved render opens on Retail Tower (a test pins it to the V2 default). */
export const MAP_DEFAULT_SCOPE: MapScope = 'retail-tower';

/** An id is selectable only when the authorized world holds that node. */
export const permittedNode = (world: MapWorld, id: string): string | null =>
  world.graph.nodes.some((n) => n.id === id) ? id : null;

const authorized = (persona: Persona): MapWorld => authorizedWorld(WORLD, persona);

/** `toMapContext` against an explicit authorized world. */
export function toMapContextIn(view: HostView, world: MapWorld): MapContext {
  const base = { persona: view.persona, lang: view.lang, dir: view.lang === 'ar' ? 'rtl' : 'ltr' } as const;
  const { route } = view;
  if (route.name === 'map') {
    return { ...base, scope: route.scope ?? MAP_DEFAULT_SCOPE, node: route.node === undefined ? null : permittedNode(world, route.node), origin: 'map' };
  }
  if (route.name !== 'project') return { ...base, scope: ALL, node: null, origin: 'none' };
  const mapped = mapIdOfProject(route.projectId);
  if (mapped.kind !== 'verified') return { ...base, scope: ALL, node: null, origin: mapped.kind };
  // Only a component both sides share, on the project that owns them, can be a selection. The rest is "no selection".
  const shared = route.projectId === COMPONENT_PROJECT && route.componentId !== undefined && isSharedComponent(route.componentId);
  return { ...base, scope: mapped.id, node: shared ? permittedNode(world, route.componentId!) : null, origin: 'verified' };
}

/** The map context for the host's state. Derived on every call from the route: nothing is remembered between calls. */
export const toMapContext = (view: HostView): MapContext => toMapContextIn(view, authorized(view.persona));

/**
 * The host route a map selection corresponds to, or null when it has none (a service, an unverified node, a node this persona's
 * world does not hold). A shared component maps to `#/project/RT/<component>`, a verified product to `#/project/RT`.
 */
export function toHostRouteIn(sel: MapSelection, world: MapWorld): Route | null {
  if (sel.node !== null) {
    if (permittedNode(world, sel.node) === null) return null;
    if (isSharedComponent(sel.node)) return { name: 'project', projectId: COMPONENT_PROJECT, componentId: sel.node };
    const p = projectOfMapId(sel.node);
    return p.kind === 'verified' ? { name: 'project', projectId: p.id } : null;
  }
  const p = projectOfMapId(sel.scope);
  return p.kind === 'verified' ? { name: 'project', projectId: p.id } : null;
}

export const toHostRoute = (sel: MapSelection, persona: Persona): Route | null => toHostRouteIn(sel, authorized(persona));
