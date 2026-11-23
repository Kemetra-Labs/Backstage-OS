import type { IdentityProviderPort } from './identity-provider.port';
import type { Principal, PrincipalResolver } from './principal-resolver';
import type { SessionStore } from './session-store';

export const AUTH_DEPS = Symbol('KAWALYS_AUTH_DEPS');

export interface AuthDeps {
  readonly verifier: IdentityProviderPort;
  readonly sessions: SessionStore;
  readonly principals: PrincipalResolver;
  /** The one browser origin allowed to call state-changing routes. */
  readonly allowedOrigin: string;
}

/** What SessionGuard attaches to an authenticated request. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  kawalys?: { principal: Principal; sessionId: string };
}
