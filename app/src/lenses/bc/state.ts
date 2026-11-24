// In-memory screen state for the B+C pilot. Nothing is stored: a reload starts again from the URL seed (view, tab, f).
// The state is held at module level so that leaving to another screen and coming back keeps the reviewer's context.
import { useCallback, useState } from 'react';
import { parseSeed, type BcMode, type BcTab } from '../logic/bc';
import type { MapFilter } from '../logic/graph';

export interface BcUi {
  readonly mode: BcMode;
  readonly tab: BcTab;
  readonly filter: MapFilter;
}

let store: BcUi | null = null;
/** The first-load orbit plays once per page session. A reload resets this, which is intended (D-24.8). */
let introPlayed = false;

export const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initial(): BcUi {
  const seed = parseSeed(window.location.search);
  return {
    mode: seed.mode ?? (window.matchMedia('(max-width: 640px)').matches ? 'list' : 'map'),
    tab: seed.tab ?? 'overview',
    filter: seed.filter ?? 'all',
  };
}

export function useBcUi(): readonly [BcUi, (patch: Partial<BcUi>) => void] {
  const [ui, set] = useState<BcUi>(() => (store ??= initial()));
  const update = useCallback((patch: Partial<BcUi>) => {
    set((cur) => {
      const next = { ...cur, ...patch };
      store = next;
      return next;
    });
  }, []);
  return [ui, update];
}

/** True only for the very first render of the map in this page session, and never under reduced motion. */
export const introWanted = (): boolean => !introPlayed && !prefersReducedMotion();
export const markIntroPlayed = (): void => { introPlayed = true; };
