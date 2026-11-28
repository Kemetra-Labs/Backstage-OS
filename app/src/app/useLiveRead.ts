import { useEffect, useState } from 'react';
import type { LiveRead } from '../live/reads';
import { heldFor, liveReadKey } from '../live/session';
import { useSession, useSessionStore } from './SessionContext';

/**
 * Runs one live read (BACK-51 P1) and holds its state. `load` null means fixture mode (or no panel): nothing runs, result null.
 * The read is aborted when the panel unmounts or `key` changes; an aborted read (null) or one that resolves after that sets no
 * state, so a late answer can never overwrite a newer one. A result is held with the key it was read for: after a key change
 * the hook says loading at once, never one paint of the previous key's answer. `load` is read only when `key` changes.
 *
 * Session (BACK-51 P2): the key follows the session (liveReadKey), so every panel reads again after a (re-)sign-in and drops what
 * it held when the session is signed out or ended. Reads wait for the first session check, so a page load makes one read per
 * panel, not two. A read that fails not_found is reported to the session, which re-checks GET /api/auth/me while it believes it
 * is signed in.
 *
 * Locked (BACK-127): while the session is locked the key carries `#locked` (the held answer is dropped, an in-flight read for the
 * old key is aborted and ignored) and no read is started, so nothing is requested or shown that the server can no longer vouch for.
 * Locked panels say so in words (failed, `locked`). Unlocking is always a new generation or a sign-out, so the panel reads again.
 */
export function useLiveRead<T>(load: ((signal: AbortSignal) => Promise<LiveRead<T> | null>) | null, key: string): LiveRead<T> | null {
  const session = useSessionStore();
  const snapshot = useSession();
  const fullKey = liveReadKey(key, snapshot);
  const locked = snapshot?.locked === true;
  const waiting = snapshot?.status === 'checking' || locked;
  const [held, setHeld] = useState<{ readonly key: string; readonly read: LiveRead<T> } | null>(null);
  useEffect(() => {
    if (!load || waiting) return undefined;
    const c = new AbortController();
    load(c.signal).then(
      (r) => {
        if (!r || c.signal.aborted) return;
        setHeld({ key: fullKey, read: r });
        if (r.status === 'failed' && r.failure === 'not_found') session?.reportNotFound();
      },
      () => {
        if (!c.signal.aborted) setHeld({ key: fullKey, read: { status: 'failed', failure: 'error' } });
      },
    );
    return () => c.abort();
    // Keyed on purpose: the loader is a new function every render.
  }, [fullKey, waiting]);
  if (!load) return null;
  // Locked: said in words (LiveState 'locked'), never a spinner for a read that is not made.
  if (locked) return { status: 'failed', failure: 'locked' };
  return heldFor(held, fullKey);
}
