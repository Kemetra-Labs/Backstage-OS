// Builds the auth collaborators from the environment. main.ts calls this with nothing else, so production can
// only ever get the Descope verifier. The overrides exist for tests (the fake verifier lives under test/ only)
// and are refused in production, so no environment value or caller can swap in a fake there.
import { AuthConfigError, loadAuthConfig, type Env } from "./auth.config";
import { createDescopeVerifier } from "./identity/descope-verifier";
import { ConfiguredOwnerDirectory, type IdentityDirectory, type OwnerIdentity } from "./identity/identity-directory";
import { UnconfiguredVerifier, type IdentityVerificationPort } from "./identity/identity-verification.port";
import { InMemorySessionStore } from "./session/in-memory-session-store";
import { SessionService } from "./session/session.service";
import type { SessionStore } from "./session/session.types";

export interface AuthOverrides {
  readonly verifier?: IdentityVerificationPort;
  readonly directory?: IdentityDirectory;
  readonly store?: SessionStore;
  readonly clock?: () => number;
}

export interface AuthDeps {
  readonly verifier: IdentityVerificationPort;
  readonly directory: IdentityDirectory;
  readonly sessions: SessionService;
}

/**
 * Durable persistence (BACK-55): a Postgres session store and a database-backed directory for the same
 * configured owner. This is production wiring, not a test override, so it is allowed in production.
 */
export interface AuthPersistence {
  readonly store: SessionStore;
  directoryFor(owner: OwnerIdentity | null): IdentityDirectory;
}

export function buildAuth(env: Env, overrides: AuthOverrides = {}, persistence?: AuthPersistence): AuthDeps {
  const config = loadAuthConfig(env);
  if (config.production && Object.keys(overrides).length > 0) {
    throw new AuthConfigError("auth overrides are not allowed in production");
  }
  // The real verifier exists only when both the project and the owner are configured, so an unconfigured
  // deployment never builds a JWKS client and never reaches the network.
  const verifier =
    overrides.verifier ??
    (config.descope !== null && config.owner !== null
      ? createDescopeVerifier(config.descope.projectId, config.descope.issuer, config.descope.maxTokenAgeSeconds)
      : new UnconfiguredVerifier());
  const directory =
    overrides.directory ?? persistence?.directoryFor(config.owner) ?? new ConfiguredOwnerDirectory(config.owner);
  const store = overrides.store ?? persistence?.store ?? new InMemorySessionStore();
  const sessions = new SessionService(store, overrides.clock ?? Date.now, {
    absoluteTtlMs: config.session.absoluteTtlSeconds * 1000,
    idleTtlMs: config.session.idleTtlSeconds * 1000,
  });
  return { verifier, directory, sessions };
}
