// The pure parts of the sign-in page (D3(a), option B): which view to show, the once-guarded handler for the Descope `success` event,
// a bounded SDK logout, and the live-only path test. No DOM and no request here (src/live/signInPage.tsx is the thin shell over
// these; src/live/signIn.ts does the exchange), so every rule is testable in vitest's node environment.
//
// The JWT is a parameter only: never stored, put in a URL, logged or included in an error. Unknown is never signed in.
import { SIGN_IN_PATH } from './session';
import { isProjectId, type DescopeSdkLike, type SignInOutcome } from './signIn';

export type SignInViewKind = { readonly kind: 'unconfigured' } | { readonly kind: 'flow'; readonly projectId: string };

/** The flow for a valid Descope project id; a missing or malformed one is "not configured" and the component is never loaded. */
export function signInView(projectId: string | undefined): SignInViewKind {
  return isProjectId(projectId) ? { kind: 'flow', projectId } : { kind: 'unconfigured' };
}

/** The sign-in page is a path of the app, and only in live mode: in the fixture build `/sign-in` is the normal app. */
export function isSignInRoute(pathname: string, live: boolean): boolean {
  return live && (pathname === SIGN_IN_PATH || pathname === `${SIGN_IN_PATH}/`);
}

export interface SuccessDeps {
  /** The one exchange (completeSignIn with the SDK of the component). Never gets a second call. */
  readonly exchange: (jwt: string) => Promise<SignInOutcome>;
  /** Told the outcome, once, so the page can show the neutral message or "signing in". */
  readonly onOutcome: (outcome: SignInOutcome) => void;
  /** Called only when the outcome is signedIn. */
  readonly goHome: () => void;
}

/** The session JWT of a Descope `success` event, or null: only a non-empty string `detail.sessionJwt` counts. */
function sessionJwtOf(event: { readonly detail?: unknown }): string | null {
  const d = event.detail;
  if (typeof d !== 'object' || d === null) return null;
  const jwt = (d as { readonly sessionJwt?: unknown }).sessionJwt;
  return typeof jwt === 'string' && jwt !== '' ? jwt : null;
}

/**
 * The listener for the component's `success` event. The event can fire twice (a re-render, a double event), so the JWT is exchanged
 * exactly once, whatever the outcome: the first valid event latches (synchronously, before any await), later events do nothing.
 * An event without a usable JWT is ignored and does not latch. An exchange that throws reads as refused, never as signed in.
 */
export function makeSuccessHandler(deps: SuccessDeps): (event: { readonly detail?: unknown }) => Promise<void> {
  let taken = false;
  return async (event) => {
    const jwt = sessionJwtOf(event);
    if (jwt === null || taken) return;
    taken = true;
    let outcome: SignInOutcome;
    try {
      outcome = await deps.exchange(jwt);
    } catch {
      outcome = 'refused';
    }
    deps.onOutcome(outcome);
    if (outcome === 'signedIn') deps.goHome();
  };
}

/** How long the page waits for the Descope SDK logout before it shows its result anyway. */
export const SIGN_IN_LOGOUT_MS = 5000;

/**
 * The SDK with a logout that always settles: when the SDK's own logout never does, it resolves after `ms`, so the page never stays on
 * "signing in" because of a stuck promise. The exchange outcome is untouched (completeSignIn awaits this in its `finally`). A logout
 * that throws or rejects resolves too. The timer is cleared as soon as the logout settles.
 */
export function boundedLogout(sdk: DescopeSdkLike, ms: number = SIGN_IN_LOGOUT_MS): { readonly logout: () => Promise<void> } {
  return {
    logout: () =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        try {
          Promise.resolve(sdk.logout()).then(done, done);
        } catch {
          done();
        }
      }),
  };
}
