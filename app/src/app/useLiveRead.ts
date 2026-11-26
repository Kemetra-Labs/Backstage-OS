import { useEffect, useState } from 'react';
import type { LiveRead } from '../live/reads';

/**
 * Runs one live read (BACK-51 P1) and holds its state. `load` null means fixture mode (or no panel): nothing runs, result null.
 * The read is aborted when the panel unmounts or `key` changes; an aborted read (null) or one that resolves after that sets no
 * state, so a late answer can never overwrite a newer one. A result is held with the key it was read for: after a key change
 * the hook says loading at once, never one paint of the previous key's answer. `load` is read only when `key` changes.
 */
export function useLiveRead<T>(load: ((signal: AbortSignal) => Promise<LiveRead<T> | null>) | null, key: string): LiveRead<T> | null {
  const [held, setHeld] = useState<{ readonly key: string; readonly read: LiveRead<T> } | null>(null);
  useEffect(() => {
    if (!load) return undefined;
    const c = new AbortController();
    load(c.signal).then(
      (r) => {
        if (r && !c.signal.aborted) setHeld({ key, read: r });
      },
      () => {
        if (!c.signal.aborted) setHeld({ key, read: { status: 'failed', failure: 'error' } });
      },
    );
    return () => c.abort();
    // Keyed on purpose: the loader is a new function every render.
  }, [key]);
  if (!load) return null;
  return held && held.key === key ? held.read : { status: 'loading' };
}
