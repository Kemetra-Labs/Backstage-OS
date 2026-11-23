// Real-mode wiring (BACK-56): two database logins, each checked before anything is served.
import pg from 'pg';
import type { AuthDeps } from './auth/auth-deps';
import { DescopeVerifier, remoteDescopeJwks } from './auth/descope-verifier';
import { PrincipalResolver } from './auth/principal-resolver';
import { SessionStore } from './auth/session-store';
import type { RuntimeConfig } from './config/runtime-config';
import { ROLE_APP, ROLE_AUTH } from './db/provision';
import { verifyRuntimeRole } from './db/runtime-role';
import { EvidenceRepository } from './evidence/evidence.repository';

export interface RealModeDeps {
  readonly auth: AuthDeps;
  readonly evidence: EvidenceRepository;
  readonly pools: { readonly app: pg.Pool; readonly auth: pg.Pool };
  close(): Promise<void>;
}

function pool(connectionString: string, max: number): pg.Pool {
  const p = new pg.Pool({ connectionString, max });
  // node-postgres emits 'error' when an idle client's backend goes away (for example a
  // serverless database scaling to zero). Without a listener Node crashes and prints the raw
  // error. The pool already discards that client; a fixed line is enough.
  p.on('error', () => {
    console.error('kawalys-bff: an idle database connection was closed');
  });
  return p;
}

export async function buildRealModeDeps(config: RuntimeConfig): Promise<RealModeDeps> {
  const appPool = pool(config.databaseUrlApp, 10);
  const authPool = pool(config.databaseUrlAuth, 5);
  const close = async () => {
    await Promise.allSettled([appPool.end(), authPool.end()]);
  };
  try {
    await verifyRuntimeRole(appPool, ROLE_APP);
    await verifyRuntimeRole(authPool, ROLE_AUTH);
  } catch (err) {
    await close();
    throw err;
  }
  return {
    auth: {
      verifier: new DescopeVerifier({ projectId: config.descopeProjectId, jwks: remoteDescopeJwks(config.descopeProjectId) }),
      sessions: new SessionStore(authPool),
      principals: new PrincipalResolver({ authPool, appPool, ownerEmail: config.ownerEmail, ownerSubject: config.ownerSubject }),
      allowedOrigin: config.allowedOrigin,
    },
    evidence: new EvidenceRepository(appPool),
    pools: { app: appPool, auth: authPool },
    close,
  };
}
