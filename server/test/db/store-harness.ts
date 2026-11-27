// Shared setup for evidence-store DB tests (BACK-99, BACK-100): a disposable Postgres, two workspaces owned by one
// user, a stranger with no membership, and optionally one project with one connected source. Synthetic ids only.
import { randomUUID } from 'node:crypto';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { EvidenceRepository, type ObservationInput } from '../../src/evidence/evidence.repository';
import type { SourceProvider } from '../../src/evidence/evidence.types';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from './kawalys-db';
import { sqlState } from './pg-container';
import { Reauthorization } from '../../src/evidence/source-approval';
import { approveAll } from '../evidence/approve-all-policy';

export interface StoreIds {
  readonly owner: string;
  readonly stranger: string;
  readonly ws: string;
  readonly otherWs: string;
}

export interface StoreHarness extends StoreIds {
  readonly db: KawalysDb;
  readonly repo: EvidenceRepository;
  readonly projectId: string;
  readonly sourceId: string;
}

/** A workspace with `owner` as its owner member. */
export async function makeWorkspace(db: KawalysDb, id: string, owner: string): Promise<void> {
  await runWithWorkspaceContext(db.app, id, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [id, owner]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, owner]);
  });
}

export const freshIds = (): StoreIds => ({ owner: randomUUID(), stranger: randomUUID(), ws: randomUUID(), otherWs: randomUUID() });

/** Starts the database, the users and both workspaces; with `source`, also project `backstage-os` and that source. */
export async function startStore(ids: StoreIds, source?: { provider: SourceProvider; externalRef: string }): Promise<StoreHarness> {
  const db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1), ($2)', [ids.owner, ids.stranger]);
  await makeWorkspace(db, ids.ws, ids.owner);
  await makeWorkspace(db, ids.otherWs, ids.owner);
  const repo = new EvidenceRepository(db.app, approveAll());
  let projectId = '';
  let sourceId = '';
  if (source) {
    projectId = await repo.createProject(ids.ws, ids.owner, { key: 'backstage-os', name: 'Backstage OS' });
    sourceId = await repo.connectSource(ids.ws, ids.owner, { projectId, ...source });
  }
  return { ...ids, db, repo, projectId, sourceId };
}

/** Re-grants `actor` a source they revoked, with a fresh reauthorization (BACK-131: connectSource no longer reconnects). */
export const reconnect = (h: StoreHarness, actor: string, sourceId: string): Promise<string> =>
  h.repo.reconnectSource(h.ws, actor, sourceId, Reauthorization.fromSessionIssuedAt(Date.now()));

export const stopStore = (h: StoreHarness | undefined): Promise<void> => stopKawalysDb(h?.db);

/** `sourceRef state` pairs, sorted, for comparing what was observed with what was stored. */
export const pairs = (items: readonly { sourceRef: string; state: string }[]): string[] =>
  items.map((i) => `${i.sourceRef} ${i.state}`).sort((a, b) => a.localeCompare(b));

/** Stored rows of exactly these ids, as the owner reads them through the repository. */
export const storedFor = async (h: StoreHarness, ids: readonly string[]) =>
  (await h.repo.list(h.ws, h.owner, { sourceId: h.sourceId })).filter((e) => ids.includes(e.id));

/** Another workspace sees nothing of this source, not even the source row, and cannot ingest into it. */
export async function expectOtherWorkspaceSeesNothing(h: StoreHarness, batch: readonly ObservationInput[]): Promise<void> {
  expect(await h.repo.list(h.otherWs, h.owner, { sourceId: h.sourceId })).toEqual([]);
  expect(await h.repo.list(h.otherWs, h.owner, {})).toEqual([]);
  const counts = await runWithWorkspaceContext(h.db.app, h.otherWs, async (c) => ({
    evidence: (await c.query('SELECT 1 FROM evidence')).rowCount,
    sources: (await c.query('SELECT 1 FROM sources')).rowCount,
  }));
  expect(counts).toEqual({ evidence: 0, sources: 0 });
  await expect(h.repo.ingest(h.otherWs, batch)).rejects.toThrow('no active grant');
}

/** The SQLSTATE of inserting a source with this provider as the runtime role, or undefined when it succeeds. */
export async function providerInsertCode(h: StoreHarness, provider: string): Promise<string | undefined> {
  let code: string | undefined;
  await runWithWorkspaceContext(h.db.app, h.ws, (c) =>
    c.query('INSERT INTO sources (workspace_id, project_id, provider, external_ref) VALUES ($1, $2, $3, $4)', [h.ws, h.projectId, provider, `x-${randomUUID()}`]),
  ).catch((err: unknown) => {
    code = sqlState(err);
  });
  return code;
}
