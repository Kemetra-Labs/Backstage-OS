// BACK-82: reversible renderer switch for the Project dependency map. The in-house DepGraph stays the default; the
// React Flow variant is opt-in for review via ?renderer=flow. Any other value, or none, means the default.
export type MapRenderer = 'depgraph' | 'flow';

export const DEFAULT_RENDERER: MapRenderer = 'depgraph';

/** Reads the renderer from a URL search string. Pure: callers pass `window.location.search`. */
export function rendererFrom(search: string): MapRenderer {
  return new URLSearchParams(search).get('renderer') === 'flow' ? 'flow' : DEFAULT_RENDERER;
}
