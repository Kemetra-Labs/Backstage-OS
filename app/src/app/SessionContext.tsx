import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react';
import type { SessionSnapshot, SessionStore } from '../live/session';

/**
 * The live session store (BACK-51 P2). null in the default (fixture) build: nothing checks a session and nothing is sent.
 * Mounted in App above every screen, so drafts held in it survive the screens re-rendering for a signed-out or ended session.
 */
export const SessionContext = createContext<SessionStore | null>(null);

export function useSessionStore(): SessionStore | null {
  return useContext(SessionContext);
}

const NO_STORE = () => () => undefined;
const NONE = () => null;

/** The session state, or null in fixture mode. */
export function useSession(): SessionSnapshot | null {
  const store = useContext(SessionContext);
  return useSyncExternalStore(store ? store.subscribe : NO_STORE, store ? store.getSnapshot : NONE);
}

/**
 * An unsent draft kept in memory above the screens (P3 keys its decision draft `decision:<investigationId>`). It survives a
 * session that ends and the sign-in that follows; an explicit sign-out clears it. In fixture mode it is plain component state,
 * held with its key so a key change never shows another key's draft. One component owns a key: a second component reading the
 * same key sees a change only when it next renders.
 */
export function useSessionDraft<T>(key: string): readonly [T | undefined, (value: T | undefined) => void] {
  const store = useContext(SessionContext);
  // Re-render on every session change, so a draft cleared by sign-out disappears at once.
  useSession();
  const [local, setLocal] = useState<{ readonly key: string; readonly value: T | undefined }>({ key, value: undefined });
  const [, bump] = useState(0);
  const set = useCallback((value: T | undefined) => {
    if (store) {
      store.setDraft(key, value);
      bump((n) => n + 1);
    } else setLocal({ key, value });
  }, [store, key]);
  // With a store, the store is the only copy: no component state can outlive a cleared draft.
  return [store ? store.getDraft<T>(key) : local.key === key ? local.value : undefined, set] as const;
}
