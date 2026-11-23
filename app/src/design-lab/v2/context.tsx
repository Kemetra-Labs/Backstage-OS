// Shared V2 context: the URL route, language and persona, and a translator bound to them. State lives in the hash.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { COPY, type Copy } from '../../i18n/strings';
import { buildHash, parseRoute, type Route } from './navigation/route';
import { translate, type K, type Vars } from './i18n/t';
import type { ScreenId } from './types';

export interface V2 {
  readonly route: Route;
  readonly copy: Copy;
  /** Translated string for the current language and persona. {braces} still present; render with <Tx>. */
  readonly t: (key: K, vars?: Vars) => string;
  /** Patch the route. `replace` avoids adding a history entry (used for state that is not a navigation). */
  readonly go: (patch: Partial<Route>, replace?: boolean) => void;
  readonly open: (screen: ScreenId, patch?: Partial<Route>) => void;
}

const Ctx = createContext<V2 | null>(null);

/** BACK-87: the context object, exported so the host app can supply a value derived from its own state (src/bridge/hostV2.ts) instead of mounting a second V2Provider. */
export const V2Context = Ctx;

export function useV2(): V2 {
  const v = useContext(Ctx);
  if (!v) throw new Error('useV2 outside V2Provider');
  return v;
}

export function V2Provider({ children }: { readonly children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash, window.location.search));

  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash, window.location.search));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const apply = useCallback((next: Route, replace: boolean) => {
    const h = buildHash(next);
    if (replace) window.history.replaceState(null, '', h);
    else if (window.location.hash !== h) window.location.hash = h;
    setRoute(next);
  }, []);

  const value = useMemo<V2>(() => {
    const copy = COPY[route.lang];
    return {
      route,
      copy,
      t: (key, vars) => translate(key, route.lang, route.persona, vars),
      go: (patch, replace = true) => apply({ ...route, ...patch }, replace),
      open: (screen, patch) => apply({ ...route, ...patch, screen }, false),
    };
  }, [route, apply]);

  useEffect(() => {
    document.documentElement.lang = route.lang;
    document.documentElement.dir = route.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `Kawalys V2 · ${translate(TITLE[route.screen], route.lang, route.persona)}`;
  }, [route.lang, route.persona, route.screen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const TITLE: Readonly<Record<ScreenId, K>> = {
  'mission-map': 'nav.map',
  'source-observatory': 'nav.obs',
  'mission-replay': 'nav.replay',
  'agent-flight-deck': 'nav.deck',
};
