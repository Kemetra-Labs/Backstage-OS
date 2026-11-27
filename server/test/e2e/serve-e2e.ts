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
import { effectiveE2eEnv } from './e2e-env';
import { approveAll } from '../evidence/approve-all-policy';

const HOST = '127.0.0.1';
const PORT = 8787;
const FOREIGN_PROJECT = 'Foreign Project (synthetic)';

// The signed-in owner holds an active grant on a synthetic source in the foreign workspace and the foreign investigation has
// linked evidence. A grant is the only thing that would let the owner read a source's evidence, so the workspace boundary
// (RLS plus the workspace filter), not a missing grant, is what hides this project, investigation and evidence.
async function seedForeign(db: KawalysDb, ownerUserId: string): Promise<{ investigationId: string; projectName: string; projectId: string }> {
  const user = randomUUID();
  const ws = randomUUID();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [user]);
  await runWithWorkspaceContext(db.app, ws, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [ws, user]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, user]);
  });
  const repo = new EvidenceRepository(db.app, approveAll());
  const projectId = await repo.createProject(ws, user, { key: 'foreign-project', name: FOREIGN_PROJECT });
  const investigationId = await repo.createInvestigation(ws, user, { projectId, title: 'Foreign investigation (synthetic)' });
  const sourceId = await repo.connectSource(ws, user, { projectId, provider: 'github', externalRef: 'foreign-org/foreign-repo' });
  await repo.ingest(ws, [
    {
      sourceId,
      type: 'Observation',
      state: 'ok',
      investigationId,
      sourceRef: 'github:foreign-org/foreign-repo#actions/runs/9001',
      observedAt: new Date(),
      payload: { synthetic: true, kind: 'workflow_run', workflow: 'foreign-ci', branch: 'main', conclusion: 'success' },
    },
  ]);
  // The owner needs a user row and an active grant in the foreign workspace (no membership: grants alone gate evidence reads).
  await runWithWorkspaceContext(db.app, ws, (c) =>
    c.query('INSERT INTO source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [ws, sourceId, ownerUserId]),
  );
  return { investigationId, projectName: FOREIGN_PROJECT, projectId };
}

async function main(): Promise<void> {
  const seedFile = process.env['KAWALYS_E2E_SEED_FILE'] ?? '';
  if (seedFile === '') throw new Error('e2e server: KAWALYS_E2E_SEED_FILE is required');
  // Replace the whole environment with the effective one: inherited auth settings are dropped, the fixed ones applied.
  const effective = effectiveE2eEnv(process.env);
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, effective);

  let db: KawalysDb | undefined;
  let app: INestApplication | undefined;
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    let code = 0;
    try {
      await app?.close();
      await stopKawalysDb(db);
    } catch (err) {
      process.stderr.write(`e2e server shutdown failed: ${err instanceof Error ? err.message : String(err)}
`);
      code = 1;
    } finally {
      process.exit(code);
    }
  };
  // Installed before the container starts, so a signal during the (slow) start still stops it.
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());

  db = await startKawalysDb();
  const pools = db;
  try {
    const seeded = await seedLocal({ app: pools.app, auth: pools.auth }, OWNER);
    const foreign = await seedForeign(pools, seeded.userId);
    writeFileSync(seedFile, JSON.stringify({ investigationId: seeded.investigationId, projectId: seeded.projectId, projectName: SEED.projectName, foreign }));
    app = await createApp([], { verifier: new FakeIdentityVerifier() }, { database: { appPool: pools.app, authPool: pools.auth } });
    await app.listen(PORT, HOST);
    process.stderr.write(`e2e server ready on http://${HOST}:${PORT}\n`);
  } catch (err) {
    await stopKawalysDb(pools).catch(() => undefined);
    throw err;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`e2e server failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
