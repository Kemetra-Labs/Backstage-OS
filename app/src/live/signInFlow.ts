// The pure parts of the sign-in page (D3(a), option B): which view to show, the once-guarded handler for the Descope `success` event,
// a bounded SDK logout, and the live-only path test. No DOM and no request here (src/live/signInPage.tsx is the thin shell over
// these; src/live/signIn.ts does the exchange), so every rule is testable in vitest's node environment.
//
// The JWT is a parameter only: never stored, put in a URL, logged or included in an error. Unknown is never signed in.
import type { Lang } from '../contract/types';
import { SIGN_IN_PATH } from './session';
import { completeSignIn, isProjectId, type DescopeSdkLike, type SignInOutcome } from './signIn';

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

export interface SignInEvents {
  readonly onSuccess: (event: { readonly detail?: unknown }) => Promise<void>;
  readonly onError: (event: { readonly detail?: unknown }) => Promise<void>;
  /** The component's `ready` event: the first screen is shown, so the readiness timer is cancelled. */
  readonly onReady: () => void;
  /** Start (or restart) the readiness timer; the returned function cancels it (call it on unmount). */
  readonly arm: () => () => void;
}

/**
 * How long the page waits for the component to show its first screen (`ready`) or finish (`success`) before it shows the neutral
 * 'unavailable' state. 15 s is three times the component's own SDK_SCRIPTS_LOAD_TIMEOUT (5000 ms, app/node_modules/@descope/web-component/
 * dist/esm/constants/index.js), which covers its config load, the UI bundle from Descope's CDN and the flow start with its
 * retries (withRetry(start, 1000, 3) in BaseDescopeWc.js), and is still short enough that a blank form is not left for long.
 */
export const SIGN_IN_READY_MS = 15000;

/**
 * The listeners for the component's `success` and `error` events, sharing one latch. The event can fire twice (a re-render, a double
 * event), so the JWT is exchanged exactly once, whatever the outcome: the first `success` latches (synchronously, before any await),
 * later ones do nothing. A `success` without a usable JWT (for example the project returns tokens by cookie) latches too and is the
 * neutral 'refused': it is terminal for this page (Start again), so a later event cannot turn a shown refusal into a sign-in.
 * An `error` event is the neutral 'unavailable' (no cause, no detail), but only before any success: once an exchange has started or
 * finished, it never overrides that outcome. An exchange that throws reads as refused, never as signed in.
 * Readiness: the component can log and stay blank without emitting `error` (wrong project id, missing flow: BaseDescopeWc.js init()
 * returns after loggerWrapper.error). So `arm()` starts a one-shot timer that ends in the same 'unavailable'; `ready`, `success` and
 * `error` cancel it, and so does the function `arm()` returns (unmount).
 */
export function makeSignInEvents(deps: SuccessDeps, readyMs: number = SIGN_IN_READY_MS): SignInEvents {
  let taken = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    arm: () => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        // Same rule as the `error` event: never overrides an exchange that has started or finished.
        if (!taken) deps.onOutcome('unavailable');
      }, readyMs);
      return cancel;
    },
    onReady: cancel,
    onSuccess: async (event) => {
      cancel();
      if (taken) return;
      taken = true;
      const jwt = sessionJwtOf(event);
      if (jwt === null) {
        deps.onOutcome('refused');
        return;
      }
      let outcome: SignInOutcome;
      try {
        outcome = await deps.exchange(jwt);
      } catch {
        outcome = 'refused';
      }
      deps.onOutcome(outcome);
      if (outcome === 'signedIn') deps.goHome();
    },
    onError: async () => {
      cancel();
      if (taken) return;
      deps.onOutcome('unavailable');
    },
  };
}

/** A fixed same-origin path with the language in the app's `?lang=ar` convention (English is the default and adds nothing). Only the typed Lang is read: never a caller string. */
export function pathWithLang(path: '/' | typeof SIGN_IN_PATH, lang: Lang): string {
  return lang === 'ar' ? `${path}?lang=ar` : path;
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

/**
 * The keys the Descope web component and its SDK persist in the browser, read from the vendored 4.6.3 packages (not from memory):
 *   app/node_modules/@descope/web-js-sdk/dist/index.esm.js: DS (session JWT), DSR (refresh JWT), DSI (ID token), DSRCN (refresh cookie
 *     name), DTD (trusted device token), DKD (known device token), DSLI (session expiry), DSLI_DISABLED, dls_last_user_login_id,
 *     dls_last_user_display_name. Each is stored as `${storagePrefix}${key}`; the prefix is the component's `storage-prefix` attribute,
 *     which this page never sets, so it is "".
 *   app/node_modules/@descope/web-component/dist/esm/constants/index.js: dls_last_auth (DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY, localStorage), dls_last_submitted_login_id.
 * Deliberately not listed (not credentials or identity): dls_ab_testing_id, the fingerprint ids (fp, vsid, vrid), flow nonces and
 * dls_last_auth_in_flight / dls_sso_query_params (transient flow state that a magic-link return may still need).
 */
export const DESCOPE_STORAGE_KEYS: readonly string[] = [
  'DS', 'DSR', 'DSI', 'DSRCN', 'DTD', 'DKD', 'DSLI', 'DSLI_DISABLED',
  'dls_last_user_login_id', 'dls_last_user_display_name', 'dls_last_auth', 'dls_last_submitted_login_id',
];

/** The part of Storage this module uses. */
export interface StorageLike {
  removeItem(key: string): void;
}

/**
 * Remove Descope's own persisted keys (DESCOPE_STORAGE_KEYS, exact names only) from every storage given, and nothing else. It never
 * throws: a missing storage, one that throws on access (blocked site data) or on a single key is skipped, and the rest are still cleared.
 */
export function clearDescopeStorage(storages: readonly (StorageLike | null | undefined)[]): void {
  for (const storage of storages) {
    if (!storage) continue;
    for (const key of DESCOPE_STORAGE_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // Blocked or broken storage: nothing more to do for this key.
      }
    }
  }
}

export interface ExchangeOptions {
  /** The component's SDK, read when the exchange starts (the element holds it). */
  readonly getSdk: () => DescopeSdkLike;
  readonly storages: readonly (StorageLike | null | undefined)[];
  /** The exchange (completeSignIn); injected in tests. */
  readonly complete?: (jwt: string, sdk: DescopeSdkLike) => Promise<SignInOutcome>;
  readonly logoutMs?: number;
}

/**
 * The page's one exchange: completeSignIn with a bounded SDK logout, then Descope's persisted keys are removed in every outcome (ok,
 * refused, unreachable, and a logout that never settled and was cut off), whatever the SDK did or did not clear itself. The outcome is
 * never changed by the clearing.
 */
export function makeExchange(options: ExchangeOptions): (jwt: string) => Promise<SignInOutcome> {
  const complete = options.complete ?? ((jwt, sdk) => completeSignIn(jwt, sdk));
  return async (jwt) => {
    try {
      return await complete(jwt, boundedLogout(options.getSdk(), options.logoutMs));
    } finally {
      clearDescopeStorage(options.storages);
    }
  };
}

/** The component's `locale` attribute for a page language: 'en' or 'ar' only (never a caller string, never a region tag). */
export function descopeLocale(lang: Lang): 'en' | 'ar' {
  return lang === 'ar' ? 'ar' : 'en';
}

/** The part of the component class this module touches: the static accessor `sdkConfigOverrides` of DescopeWc. */
interface DescopeClassLike {
  sdkConfigOverrides: Record<string, unknown>;
}

/**
 * Import the Descope component (the importer is the page's dynamic import) and, before the page may create any element, make its SDK
 * keep tokens in memory only. Read from the vendored 4.6.3 packages, not from memory:
 *   app/node_modules/@descope/web-component/dist/esm/descope-wc/DescopeWc.js: `static set/get sdkConfigOverrides` (delegating to the base
 *     class; typed in dist/index.d.ts as `static sdkConfigOverrides: Partial<SdkConfig>`), and the module's default export is that class.
 *   app/node_modules/@descope/web-component/dist/esm/descope-wc/BaseDescopeWc.js: the SDK is created per element when it connects, as
 *     createSdk(Object.assign({persistTokens: true, ...}, sdkConfigOverrides, {projectId, baseUrl})), so the override wins over the
 *     hard-coded persistTokens: true and applies to every element created after it is set.
 *   app/node_modules/@descope/web-js-sdk/dist/index.esm.js: `if (!persistTokens || !<browser check>) return next(config)` skips the layer that
 *     writes the session and refresh JWTs to storage (the afterRequest hook); the flow `success` event still carries `sessionJwt`.
 * The existing key clearing stays as a backstop. Fails closed: when the class cannot take the override (a different package version)
 * or it does not stick, this rejects, and the page shows the neutral unavailable state instead of a component that persists tokens.
 */
export async function loadDescopeComponent(importer: () => Promise<unknown>): Promise<void> {
  const mod = (await importer()) as { readonly default?: Partial<DescopeClassLike> | null } | null;
  const cls = mod?.default;
  const current = cls?.sdkConfigOverrides;
  if (!cls || typeof current !== 'object' || current === null) throw new Error('descope component: no sdkConfigOverrides');
  cls.sdkConfigOverrides = { ...current, persistTokens: false };
  if (cls.sdkConfigOverrides?.persistTokens !== false) throw new Error('descope component: persistTokens override not applied');
}
