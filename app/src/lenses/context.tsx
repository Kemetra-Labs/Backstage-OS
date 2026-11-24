// The lens context: the route, language and persona, and a translator bound to them. The host supplies its value from its own state
// (src/bridge/hostV2.ts); the standalone lab's V2Provider retired with the lab entry (BACK-92 R4).
import { createContext, useContext } from 'react';
import type { Copy } from '../i18n/strings';
import type { Route } from './navigation/route';
import type { K, Vars } from './i18n/t';
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

/** BACK-87: the context object, exported so the host app supplies a value derived from its own state (src/bridge/hostV2.ts). */
export const V2Context = Ctx;

export function useV2(): V2 {
  const v = useContext(Ctx);
  if (!v) throw new Error('useV2 outside V2Context (the host supplies it, src/bridge/hostV2.ts)');
  return v;
}
