import { useEffect, useRef, type Ref } from 'react';
import { useApp } from '../app/AppContext';
import { useSession, useSessionStore } from '../app/SessionContext';
import { StateBlock } from '../components/StateBlock';
import { Text } from '../components/Text';
import { SIGN_IN_PATH, type SessionSnapshot } from '../live/session';
import { pathWithLang } from '../live/signInFlow';

interface ViewProps {
  readonly snapshot: SessionSnapshot;
  readonly onRecheck: () => void;
  readonly onSignOut: () => void;
  /** The bar itself, so focus can land on it when a button the user pressed is replaced (sign-out). */
  readonly barRef?: Ref<HTMLElement>;
}

/**
 * The session in live mode (BACK-51 P2), in words for every state: checking, signed in (as the owner, never an id), signed out,
 * ended, unavailable or unreadable. Unknown is never shown as signed in. The sign-in page opens in a new tab, so this page and any
 * unsent draft stay loaded; the owner comes back and chooses Check again.
 */
export function SessionBarView({ snapshot, onRecheck, onSignOut, barRef }: ViewProps) {
  const { shell, lang } = useApp();
  const c = shell.live.session;
  const checkAgain = <button type="button" className="btn btn-quiet" onClick={onRecheck}>{c.checkAgain}</button>;
  const signIn = (
    <a className="btn btn-link" href={pathWithLang(SIGN_IN_PATH, lang)} target="_blank" rel="noopener noreferrer">{c.signIn}</a>
  );
  const locked = (() => {
    if (!snapshot.locked) return null;
    const note = <p className="note session-locked">{c.locked.body}</p>;
    // Focus moves here when the screen locks (SessionBar), so no role="alert" as well: one announcement, not two.
    if (snapshot.signOutFailed) {
      // The server may still hold the session: the same wording as before, the screen locked, and a way to try again.
      return (
        <div>
          <StateBlock kind="error" title={c.signOutFailed.title} body={c.signOutFailed.body}>
            <p className="note session-locked">{c.locked.signOutBody}</p>
            <p className="session-actions"><button type="button" className="btn btn-quiet" onClick={onSignOut}>{c.locked.retrySignOut}</button></p>
          </StateBlock>
        </div>
      );
    }
    const s = snapshot.status === 'ended' || snapshot.status === 'unavailable' || snapshot.status === 'error' ? c[snapshot.status] : c.error;
    return (
      <div>
        <StateBlock kind={snapshot.status === 'unavailable' || snapshot.status === 'error' ? snapshot.status : 'unknown'} title={s.title} body={s.body}>
          {note}
          <p className="session-actions">
            <a className="btn btn-link" href={pathWithLang(SIGN_IN_PATH, lang)} target="_blank" rel="noopener noreferrer">{c.locked.signIn}</a>
            {checkAgain}
          </p>
        </StateBlock>
      </div>
    );
  })();
  const body = locked ?? (() => {
    switch (snapshot.status) {
      case 'checking':
        return <div role="status" aria-busy="true"><StateBlock kind="loading" title={c.checking.title} body={c.checking.body} /></div>;
      case 'signedIn':
        return (
          <>
            <div className="session-in">
              <p className="session-who"><Text s={c.signedIn} /></p>
              <button type="button" className="btn btn-quiet" onClick={onSignOut}>{c.signOut}</button>
            </div>
            {snapshot.signOutFailed && <div role="alert"><StateBlock kind="error" title={c.signOutFailed.title} body={c.signOutFailed.body} /></div>}
          </>
        );
      case 'signedOut':
      case 'ended': {
        const s = c[snapshot.status];
        return (
          <div role={snapshot.status === 'ended' ? 'alert' : undefined}>
            <StateBlock kind="unknown" title={s.title} body={s.body}>
              <p className="session-actions">{signIn}{checkAgain}</p>
            </StateBlock>
          </div>
        );
      }
      case 'unavailable':
      case 'error': {
        const s = c[snapshot.status];
        return (
          <StateBlock kind={snapshot.status} title={s.title} body={s.body}>
            <p className="session-actions">{checkAgain}</p>
          </StateBlock>
        );
      }
    }
  })();
  return <section ref={barRef} tabIndex={-1} className="session-bar" aria-label={c.label} data-testid="session-bar" data-session={snapshot.status} data-locked={snapshot.locked ? 'true' : undefined}>{body}</section>;
}

/** The live session bar; renders nothing in the default (fixture) build. */
export function SessionBar() {
  const store = useSessionStore();
  const snapshot = useSession();
  const bar = useRef<HTMLElement>(null);
  // BACK-127: when the screen locks, keyboard focus moves to the notice (no redirect, no other change of place).
  const wasLocked = useRef(false);
  const locked = snapshot?.locked === true;
  useEffect(() => {
    if (locked && !wasLocked.current) bar.current?.focus();
    wasLocked.current = locked;
  }, [locked]);
  if (!store || !snapshot) return null;
  // The Sign out button is replaced when the state changes; keep keyboard focus in the bar instead of dropping it to the page.
  const signOut = () => { void store.signOut().then(() => bar.current?.focus()); };
  return <SessionBarView snapshot={snapshot} onRecheck={() => void store.recheck()} onSignOut={signOut} barRef={bar} />;
}
