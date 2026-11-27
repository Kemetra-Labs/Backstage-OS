// Test-only (BACK-51 P4): the BFF on a disposable Docker Postgres with the fake identity verifier, for the
// live Playwright suite. Loopback only, never under src/. Run from server/ (migrations resolve from cwd).
// Writes KAWALYS_E2E_SEED_FILE with the seeded ids, including a foreign workspace the owner must never see.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { createApp } from '../../src/create-app';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { SEED, seedLocal } from '../../src/ops/local-stack';
import { FakeIdentityVerifier, OWNER } from '../auth/_helpers';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { e2eEnv } from './e2e-env';

const HOST = '127.0.0.1';
const PORT = 8787;
const FOREIGN_PROJECT = 'Foreign Project (synthetic)';

async function seedForeign(db: KawalysDb): Promise<{ investigationId: string; projectName: string }> {
  const user = randomUUID();
  const ws = randomUUID();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [user]);
  await runWithWorkspaceContext(db.app, ws, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [ws, user]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, user]);
  });
  const repo = new EvidenceRepository(db.app);
  const projectId = await repo.createProject(ws, user, { key: 'foreign-project', name: FOREIGN_PROJECT });
  const investigationId = await repo.createInvestigation(ws, user, { projectId, title: 'Foreign investigation (synthetic)' });
  return { investigationId, projectName: FOREIGN_PROJECT };
}

async function main(): Promise<void> {
  const seedFile = process.env['KAWALYS_E2E_SEED_FILE'] ?? '';
  if (seedFile === '') throw new Error('e2e server: KAWALYS_E2E_SEED_FILE is required');
  Object.assign(process.env, e2eEnv(process.env));

  const db = await startKawalysDb();
  let app: INestApplication | undefined;
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try {
      await app?.close();
      await stopKawalysDb(db);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());

  try {
    const seeded = await seedLocal({ app: db.app, auth: db.auth }, OWNER);
    const foreign = await seedForeign(db);
    writeFileSync(seedFile, JSON.stringify({ investigationId: seeded.investigationId, projectName: SEED.projectName, foreign }));
    app = await createApp([], { verifier: new FakeIdentityVerifier() }, { database: { appPool: db.app, authPool: db.auth } });
    await app.listen(PORT, HOST);
    process.stderr.write(`e2e server ready on http://${HOST}:${PORT}\n`);
  } catch (err) {
    await stopKawalysDb(db).catch(() => undefined);
    throw err;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`e2e server failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
