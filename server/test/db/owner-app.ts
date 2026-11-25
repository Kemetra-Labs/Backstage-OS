// Test-only: the real Nest app on a disposable Kawalys database, with the configured owner signed in.
// Shared by the route specs (portfolio, investigations) so each spec holds only its own cases.
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { WorkspaceResolver } from '../../src/auth/workspace-resolver';
import { createApp } from '../../src/create-app';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { FakeIdentityVerifier, OWNER, TOKENS } from '../auth/_helpers';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from './kawalys-db';

const ENV = { KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001', KAWALYS_OWNER_SUBJECT: OWNER.subject };

export interface OwnerApp {
  readonly db: KawalysDb;
  readonly app: INestApplication;
  /** The owner's session cookie, `name=value`. */
  readonly cookie: string;
  readonly ws: string;
  readonly owner: string;
  readonly evidence: EvidenceRepository;
  stop(): Promise<void>;
}

/** Starts the database and the app, signs the owner in, and resolves their workspace. */
export async function startOwnerApp(): Promise<OwnerApp> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  const db = await startKawalysDb();
  const appPool = new pg.Pool({ connectionString: db.appUrl, max: 4 });
  const authPool = new pg.Pool({ connectionString: db.authUrl, max: 4 });
  const app = await createApp([], { verifier: new FakeIdentityVerifier() }, { database: { appPool, authPool } });
  const res = await request(app.getHttpServer()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`);
  expect(res.status).toBe(200);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
  const me = (await new WorkspaceResolver(db.app, db.auth).forUser(res.body.user.id as string))!;
  return {
    db,
    app,
    cookie,
    ws: me.workspaceId,
    owner: me.userId,
    evidence: new EvidenceRepository(db.app),
    async stop() {
      await app.close().catch(() => undefined);
      await Promise.all([appPool, authPool].map((p) => p.end().catch(() => undefined)));
      await stopKawalysDb(db);
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

export function expectNotFound(res: request.Response): void {
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('not_found');
}

/** Every path answers 404 without a session, and the persona header grants nothing. */
export async function expectSessionRequired(app: INestApplication, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    expectNotFound(await request(app.getHttpServer()).get(path));
    expectNotFound(await request(app.getHttpServer()).get(path).set('x-kawalys-demo-persona', 'technical'));
  }
}
