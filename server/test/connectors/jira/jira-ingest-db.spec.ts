// The Jira mapper's output, including every failure state, is accepted and stored by the real
// evidence repository and database constraints (BACK-99, migration 0005). Disposable Docker Postgres only.
import { observeJiraProjects, searchPath } from '../../../src/connectors/jira/jira.observer';
import { JiraTransportFailure } from '../../../src/connectors/jira/jira.transport';
import { runWithWorkspaceContext } from '../../../src/db/workspace-context';
import { EvidenceRepository, type ObservationInput } from '../../../src/evidence/evidence.repository';
import type { KawalysDb } from '../../db/kawalys-db';
import { expectOtherWorkspaceSeesNothing, freshIds, pairs, providerInsertCode, startStore, stopStore, storedFor, type StoreHarness } from '../../db/store-harness';
import { backIssues, happyScript, NOW, ok, ScriptedTransport, SITE, type Script } from './jira.fixture';

let h: StoreHarness;
let db: KawalysDb;
let repo: EvidenceRepository;
const ids = freshIds();
const { owner, stranger, ws, otherWs } = ids;
let projectId = '';
let sourceId = '';

beforeAll(async () => {
  h = await startStore(ids, { provider: 'jira', externalRef: 'kemetra-synthetic.atlassian.net' });
  ({ db, repo, projectId, sourceId } = h);
}, 180_000);

afterAll(async () => {
  await stopStore(h);
}, 60_000);

const observe = (script: Script, projectKeys: readonly string[] = ['BACK', 'OPS']) =>
  observeJiraProjects(new ScriptedTransport(script), { sourceId, site: SITE, projectKeys }, NOW);



describe('Jira observations in the evidence store', () => {
  it('the source is stored with provider jira', async () => {
    const { rows } = await runWithWorkspaceContext(db.app, ws, (c) => c.query('SELECT provider, external_ref FROM sources WHERE id = $1', [sourceId]));
    expect(rows).toEqual([{ provider: 'jira', external_ref: 'kemetra-synthetic.atlassian.net' }]);
  });

  it('stores reachable projects and reads them back through the repository, payload intact', async () => {
    const batch = await observe(happyScript());
    const ids = await repo.ingest(ws, batch);
    expect(ids).toHaveLength(3);
    const stored = await storedFor(h, ids);
    expect(pairs(stored)).toEqual(pairs(batch));
    expect(stored.every((e) => e.type === 'Observation' && e.sourceId === sourceId && e.projectId === projectId)).toBe(true);
    expect(stored.find((e) => e.sourceRef === 'jira:BACK#issue/BACK-53')!.payload).toEqual(batch[0]!.payload);
  });

  it('stores stale, denied, unknown and error records as such, never as ok', async () => {
    const stale = { date: new Date(NOW.getTime() - 16 * 60_000).toUTCString() };
    const batches = [
      await observe({ [searchPath('BACK')]: ok(backIssues, stale), [searchPath('OPS')]: { status: 401, body: {}, headers: {} } }),
      await observe({ [searchPath('BACK')]: ok('<html>'), [searchPath('OPS')]: new JiraTransportFailure('timeout') }),
      await observe(happyScript(), ['back']),
    ];
    const expected: ObservationInput[] = batches.flat();
    expect(new Set(expected.map((i) => i.state))).toEqual(new Set(['stale', 'denied', 'error', 'unknown']));
    const ids: string[] = [];
    for (const batch of batches) ids.push(...(await repo.ingest(ws, batch)));
    const stored = await storedFor(h, ids);
    expect(pairs(stored)).toEqual(pairs(expected));
    expect(stored.some((e) => e.state === 'ok')).toBe(false);
    expect(stored.filter((e) => e.sourceRef.startsWith('jira:BACK#issue/')).map((e) => e.state)).toEqual(['stale', 'stale']);
  });

  it('another workspace sees nothing, not even the source', async () => {
    await expectOtherWorkspaceSeesNothing(h, await observe(happyScript()));
  });

  it('a user without a grant on the source sees nothing', async () => {
    expect(await repo.list(ws, stranger, { sourceId })).toEqual([]);
  });
});

describe('the provider check', () => {
  it.each(['gitlab', 'Jira', 'JIRA', 'atlassian', ''])('refuses provider %p for the runtime role (check_violation)', async (provider) => {
    expect(await providerInsertCode(h, provider)).toBe('23514');
  });

  it('refuses it through connectSource too, and holds for a superuser', async () => {
    await expect(
      repo.connectSource(ws, owner, { projectId, provider: 'gitlab' as 'jira', externalRef: 'example-org/x' }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.admin.query(`INSERT INTO kawalys.sources (workspace_id, project_id, provider, external_ref) VALUES ($1, $2, 'slack', 'x')`, [ws, projectId]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('the constraint allows exactly github, jira and confluence', async () => {
    const { rows } = await db.admin.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'kawalys.sources'::regclass AND conname = 'sources_provider_check'`,
    );
    expect(rows).toEqual([{ def: "CHECK ((provider = ANY (ARRAY['github'::text, 'jira'::text, 'confluence'::text])))" }]);
  });
});
