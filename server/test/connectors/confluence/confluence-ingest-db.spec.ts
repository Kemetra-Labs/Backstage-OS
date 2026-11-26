// The Confluence mapper's output, including every failure state, is accepted and stored by the real
// evidence repository and database constraints (BACK-99, migration 0005). Disposable Docker Postgres only.
import { randomUUID } from 'node:crypto';
import { observeConfluenceSpaces, pagesPath, spacePath } from '../../../src/connectors/confluence/confluence.observer';
import { ConfluenceTransportFailure, type ConfluenceResponse } from '../../../src/connectors/confluence/confluence.transport';
import { runWithWorkspaceContext } from '../../../src/db/workspace-context';
import { EvidenceRepository, type ObservationInput } from '../../../src/evidence/evidence.repository';
import { sqlState } from '../../db/pg-container';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../../db/kawalys-db';
import { ENG_ID, happyScript, NOW, ok, OPS_ID, ScriptedTransport, SITE, type Script } from './confluence.fixture';

let db: KawalysDb | undefined;
let repo: EvidenceRepository;
const owner = randomUUID();
const stranger = randomUUID();
const ws = randomUUID();
const otherWs = randomUUID();
let projectId = '';
let sourceId = '';

async function makeWorkspace(id: string): Promise<void> {
  await runWithWorkspaceContext(db!.app, id, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [id, owner]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, owner]);
  });
}

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1), ($2)', [owner, stranger]);
  await makeWorkspace(ws);
  await makeWorkspace(otherWs);
  repo = new EvidenceRepository(db.app);
  projectId = await repo.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  sourceId = await repo.connectSource(ws, owner, { projectId, provider: 'confluence', externalRef: 'kemetra-synthetic.atlassian.net' });
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

const observe = (script: Script, spaceKeys: readonly string[] = ['ENG', 'OPS']) =>
  observeConfluenceSpaces(new ScriptedTransport(script), { sourceId, site: SITE, spaceKeys }, NOW);

const pairs = (items: readonly { sourceRef: string; state: string }[]) => items.map((i) => `${i.sourceRef} ${i.state}`).sort();

const storedFor = async (ids: readonly string[]) => (await repo.list(ws, owner, { sourceId })).filter((e) => ids.includes(e.id));

describe('Confluence observations in the evidence store', () => {
  it('the source is stored with provider confluence, beside a jira source of the same site', async () => {
    const jira = await repo.connectSource(ws, owner, { projectId, provider: 'jira', externalRef: 'kemetra-synthetic.atlassian.net' });
    expect(jira).not.toBe(sourceId);
    const { rows } = await runWithWorkspaceContext(db!.app, ws, (c) => c.query('SELECT provider FROM sources ORDER BY provider'));
    expect(rows.map((r) => r.provider)).toEqual(['confluence', 'jira']);
  });

  it('stores reachable spaces and reads them back through the repository, payload intact', async () => {
    const batch = await observe(happyScript());
    const ids = await repo.ingest(ws, batch);
    expect(ids).toHaveLength(3);
    const stored = await storedFor(ids);
    expect(pairs(stored)).toEqual(pairs(batch));
    expect(stored.every((e) => e.type === 'Observation' && e.sourceId === sourceId && e.projectId === projectId && e.state === 'ok')).toBe(true);
    expect(stored.find((e) => e.sourceRef === 'confluence:ENG#page/1001')!.payload).toEqual(batch[0]!.payload);
  });

  it('stores stale, denied, unknown and error records as such, never as ok', async () => {
    const engPages = (happyScript()[pagesPath(ENG_ID)] as ConfluenceResponse).body;
    const stale = { date: new Date(NOW.getTime() - 60 * 60_000).toUTCString() };
    const batches = [
      await observe({ ...happyScript(), [pagesPath(ENG_ID)]: ok(engPages, stale), [spacePath('OPS')]: { status: 401, body: {}, headers: {} } }),
      await observe({ ...happyScript(), [pagesPath(ENG_ID)]: ok('<html>'), [pagesPath(OPS_ID)]: new ConfluenceTransportFailure('network') }),
      await observe(happyScript(), ['eng!']),
    ];
    const expected: ObservationInput[] = batches.flat();
    expect(new Set(expected.filter((i) => i.state !== 'ok').map((i) => i.state))).toEqual(new Set(['stale', 'denied', 'error', 'unknown']));
    const perBatch: string[][] = [];
    for (const batch of batches) perBatch.push(await repo.ingest(ws, batch));
    const ids = perBatch.flat();
    const stored = await storedFor(ids);
    expect(pairs(stored)).toEqual(pairs(expected));
    expect(stored.filter((e) => e.payload['kind'] === 'source_status').some((e) => e.state === 'ok')).toBe(false);
    // Only the reachable OPS pages of the first two reads are ok; the stale ENG pages stay stale.
    expect((await storedFor(perBatch[0]!)).filter((e) => e.sourceRef.startsWith('confluence:ENG#page/')).map((e) => e.state)).toEqual(['stale', 'stale']);
  });

  it('another workspace sees nothing, not even the source', async () => {
    expect(await repo.list(otherWs, owner, { sourceId })).toEqual([]);
    expect(await repo.list(otherWs, owner, {})).toEqual([]);
    const counts = await runWithWorkspaceContext(db!.app, otherWs, async (c) => ({
      evidence: (await c.query('SELECT 1 FROM evidence')).rowCount,
      sources: (await c.query('SELECT 1 FROM sources')).rowCount,
    }));
    expect(counts).toEqual({ evidence: 0, sources: 0 });
    await expect(repo.ingest(otherWs, await observe(happyScript()))).rejects.toThrow('no active grant');
  });

  it('a user without a grant on the source sees nothing', async () => {
    expect(await repo.list(ws, stranger, { sourceId })).toEqual([]);
  });

  it.each(['wiki', 'Confluence', 'github '])('refuses provider %p (check_violation)', async (provider) => {
    let code: string | undefined;
    await runWithWorkspaceContext(db!.app, ws, (c) =>
      c.query('INSERT INTO sources (workspace_id, project_id, provider, external_ref) VALUES ($1, $2, $3, $4)', [ws, projectId, provider, `x-${randomUUID()}`]),
    ).catch((err: unknown) => {
      code = sqlState(err);
    });
    expect(code).toBe('23514');
  });
});
