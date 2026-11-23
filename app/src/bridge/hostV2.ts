// BACK-87: the host-owned presentation adapter for the B+C Mission Map. It builds the value the map's components read through
// `useV2()` from the host's own state (persona, language, route), so the host stays the one authority. There is no V2Provider, no
// state and no React in this file: the lens component supplies the result through the exported `V2Context`, and every change the
// map asks for (select a node, change scope, open another screen) becomes a host navigation. Synthetic demo data only; persona is
// a display switch, not authorization.
import { DOMAIN } from '../domain/fixture';
import type { V2 } from '../design-lab/v2/context';
import { translate } from '../design-lab/v2/i18n/t';
import { DEFAULT_ROUTE, type Route as V2Route } from '../design-lab/v2/navigation/route';
import type { ScreenId } from '../design-lab/v2/types';
import { COPY } from '../i18n/strings';
import { MAP_SCOPES, type MapScope, type Route } from '../nav/routes';
import { toMapContext, toMapContextIn, type HostView, type MapContext } from './mapContext';
import type { World as MapWorld } from '../design-lab/v2/types';

/** How the adapter asks the host to go somewhere. The host decides what that means (a hash change). */
export interface HostNav {
  readonly navigate: (route: Route) => void;
}

const isScope = (v: string): v is MapScope => (MAP_SCOPES as readonly string[]).includes(v);

/** The Mission Map route for the current context with a patch applied. A changed scope without a node clears the selection. */
export function mapRoute(ctx: MapContext, patch: { readonly scope?: string; readonly node?: string | null }): Route {
  // A scope that is not a map scope is ignored altogether: it neither moves the map nor clears the selection.
  const next = patch.scope !== undefined && isScope(patch.scope) ? patch.scope : undefined;
  const scope = next ?? (isScope(ctx.scope) ? ctx.scope : 'all');
  const node = 'node' in patch ? patch.node : next !== undefined && next !== ctx.scope ? null : ctx.node;
  return node ? { name: 'map', scope, node } : { name: 'map', scope };
}

/** Where each of the lab's other screens lives in the host. The Observatory, Replay and Flight Deck are folded into these in later slices. */
export function hostRouteFor(screen: ScreenId, ctx: MapContext, patch?: { readonly scope?: string; readonly node?: string | null }): Route {
  switch (screen) {
    case 'mission-map': return mapRoute(ctx, patch ?? {});
    case 'source-observatory': return { name: 'sources' };
    case 'mission-replay': return { name: 'investigation', id: DOMAIN.investigationId };
    case 'agent-flight-deck': return { name: 'agents' };
  }
}

/** The `useV2()` value for the host's state. `world` is for tests: by default the persona's authorized world is used. */
export function toV2(view: HostView, nav: HostNav, world?: MapWorld): V2 {
  const ctx = world ? toMapContextIn(view, world) : toMapContext(view);
  const route: V2Route = { ...DEFAULT_ROUTE, screen: 'mission-map', persona: ctx.persona, lang: ctx.lang, scope: ctx.scope, node: ctx.node };
  return {
    route,
    copy: COPY[view.lang],
    t: (key, vars) => translate(key, view.lang, view.persona, vars),
    // The lab replaced the history entry for a selection; in the host a selection is a navigation, so Back returns to the previous one.
    go: (patch) => nav.navigate(mapRoute(ctx, patch)),
    open: (screen, patch) => nav.navigate(hostRouteFor(screen, ctx, patch)),
  };
}
