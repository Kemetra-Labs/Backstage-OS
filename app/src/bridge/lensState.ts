// BACK-87, BACK-92 R7: the host-owned presentation adapter for the lenses (Mission Map, Source Observatory, Mission Replay, Agent
// Flight Deck). It builds the value the lens components read through `useLens()` (src/lenses/useLens.ts) from the host's own state
// (persona, language, route), so the host stays the one authority. There is no provider, no state and no React in this file: the
// hook calls `toLensState` with the host's `useApp()` state, and every change a lens asks for (select a node, change scope, open
// another screen) becomes a host navigation. Synthetic demo data only; persona is a display switch, not authorization.
import { DOMAIN } from '../domain/fixture';
import { COPY, translate, type Copy, type K, type Vars } from '../i18n';
import { DEFAULT_ROUTE, type Route as V2Route } from '../lenses/navigation/route';
import type { ScreenId } from '../lenses/types';
import type { Provider } from '../contract/types';
import { MAP_SCOPES, type MapScope, type Route } from '../nav/routes';
import { toMapContext, toMapContextIn, type HostView, type MapContext } from './mapContext';
import type { World as MapWorld } from '../lenses/types';

/** What a lens reads: the route, language and persona, and a translator bound to them. */
export interface LensState {
  readonly route: V2Route;
  readonly copy: Copy;
  /** Translated string for the current language and persona. {braces} still present; render with <Tx>. */
  readonly t: (key: K, vars?: Vars) => string;
  /** Patch the route. `replace` avoids adding a history entry (used for state that is not a navigation). */
  readonly go: (patch: Partial<V2Route>, replace?: boolean) => void;
  readonly open: (screen: ScreenId, patch?: Partial<V2Route>) => void;
}

/** How the adapter asks the host to go somewhere. The host decides what that means (a hash change). */
export interface HostNav {
  readonly navigate: (route: Route) => void;
  /** Like navigate, but replaces the history entry: for state that changes continuously (the replay cursor), not for a destination. */
  readonly replace?: (route: Route) => void;
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

/** The Flight Deck view of the Agents screen, with a mission when one is named. */
export const deckRoute = (msn?: string | null): Route => (msn ? { name: 'agents', view: 'deck', msn } : { name: 'agents', view: 'deck' });

/** The Replay view of an investigation, at an event when one is named. */
export const replayRoute = (id: string, evt?: string | null): Route => (evt ? { name: 'investigation', id, view: 'replay', evt } : { name: 'investigation', id, view: 'replay' });

/** Where each of the lab's other screens lives in the host. The Observatory, Replay and Flight Deck are folded into these in later slices. */
type Patch = { readonly scope?: string; readonly node?: string | null; readonly src?: Provider | null; readonly evt?: string | null; readonly msn?: string | null };

/** The Sources screen's Observatory view, with the source when one is named. */
export const observatoryRoute = (src?: Provider | null): Route => (src ? { name: 'sources', view: 'observatory', src } : { name: 'sources', view: 'observatory' });

export function hostRouteFor(screen: ScreenId, ctx: MapContext, patch?: Patch): Route {
  switch (screen) {
    case 'mission-map': return mapRoute(ctx, patch ?? {});
    case 'source-observatory': return observatoryRoute(patch?.src);
    case 'mission-replay': return replayRoute(DOMAIN.investigationId, patch?.evt);
    case 'agent-flight-deck': return deckRoute(patch?.msn);
  }
}

/** The `useLens()` value for the host's state. `world` is for tests: by default the persona's authorized world is used. */
export function toLensState(view: HostView, nav: HostNav, world?: MapWorld): LensState {
  const ctx = world ? toMapContextIn(view, world) : toMapContext(view);
  const onSources = view.route.name === 'sources';
  const replay = view.route.name === 'investigation' && view.route.view === 'replay' ? view.route : null;
  const deck = view.route.name === 'agents' && view.route.view === 'deck' ? view.route : null;
  const route: V2Route = {
    ...DEFAULT_ROUTE, screen: onSources ? 'source-observatory' : replay ? 'mission-replay' : deck ? 'agent-flight-deck' : 'mission-map', persona: ctx.persona, lang: ctx.lang, scope: ctx.scope, node: ctx.node,
    src: view.route.name === 'sources' && view.route.src ? view.route.src : DEFAULT_ROUTE.src,
    evt: replay?.evt ?? null,
    msn: deck?.msn ?? DEFAULT_ROUTE.msn,
  };
  return {
    route,
    copy: COPY[view.lang],
    t: (key, vars) => translate(key, view.lang, view.persona, vars),
    // The lab replaced the history entry for a selection; in the host a selection is a navigation, so Back returns to the previous one.
    // On the Sources screen a change is the selected source; anywhere else it is the map's scope or node.
    go: (patch) => {
      if (replay && 'evt' in patch) (nav.replace ?? nav.navigate)(replayRoute(replay.id, patch.evt));
      else if (deck && patch.msn) nav.navigate(deckRoute(patch.msn));
      else nav.navigate(onSources && patch.src ? observatoryRoute(patch.src) : mapRoute(ctx, patch));
    },
    open: (screen, patch) => nav.navigate(hostRouteFor(screen, ctx, patch)),
  };
}
