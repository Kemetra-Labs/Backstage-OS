// The owner sign-in, after Descope (D3(a), option B). Live mode only. The Descope component hands the page a session JWT; this
// module sends it once to POST /api/auth/session (the BFF verifies it and sets the Kawalys session cookie, the only session),
// then asks the Descope SDK to log out so no Descope token stays in the browser. With src/live/reads.ts, session.ts and
// decisions.ts, one of the modules allowed to import the request module (src/live/live.guard.test.ts).
//
// The token is a parameter and a header: it is never stored, put in a URL, logged or returned. A refused, rate limited or failed
// exchange gives one neutral outcome with no cause (401 and 404 are the same on purpose); only an unreachable server is told apart,
// so the page can say "try again" instead of "refused". Unknown is never signed in.
import { exchangeSessionToken, type Fetcher } from './http';

export type SignInOutcome = 'signedIn' | 'refused' | 'unavailable';

/** The part of the Descope SDK this module uses. */
export interface DescopeSdkLike {
  logout(): Promise<unknown> | unknown;
}

/**
 * A Descope project id: "P" and at least 20 letters or digits, no more than the server's own rule allows (PROJECT_ID_RE in
 * server/src/auth/identity/descope-verifier.ts: 1 to 64 letters or digits; this is the stricter "P..." shape, copied, not imported).
 * The id is public; a missing or malformed one means "sign-in not configured" and the component is never loaded.
 */
export const isProjectId = (v: unknown): v is string => typeof v === 'string' && /^P[A-Za-z0-9]{20,63}$/.test(v);

/**
 * Exchange the Descope JWT once, then log the Descope SDK out whatever the outcome (ok, refused, rate limited, network error).
 * A logout that throws or rejects never changes the outcome and never throws.
 */
export async function completeSignIn(jwt: string, sdk: DescopeSdkLike, fetcher?: Fetcher): Promise<SignInOutcome> {
  try {
    const r = await exchangeSessionToken(jwt, { fetcher });
    if (r.ok) return 'signedIn';
    return r.failure === 'unavailable' ? 'unavailable' : 'refused';
  } finally {
    try {
      await sdk.logout();
    } catch {
      // The exchange outcome stands; a failed logout is not the owner's problem and must not mask it.
    }
  }
}
