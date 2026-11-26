// The Confluence mapper's output, including every failure state, is accepted and stored by the real
// evidence repository and database constraints (BACK-99, migration 0005). Disposable Docker Postgres only.
import { observeConfluenceSpaces, pagesPath, spacePath } from '../../../src/connectors/confluence/confluence.observer';
import { ConfluenceTransportFailure, type ConfluenceResponse } from '../../../src/connectors/confluence/confluence.transport';
import { runWithWorkspaceContext } from '../../../src/db/workspace-context';
import { EvidenceRepository, type ObservationInput } from '../../../src/evidence/evidence.repository';
import type { KawalysDb } from '../../db/kawalys-db';
import { expectOtherWorkspaceSeesNothing, freshIds, pairs, providerInsertCode, startStore, stopStore, storedFor, type StoreHarness } from '../../db/store-harness';
import { ENG_ID, happyScript, NOW, ok, OPS_ID, ScriptedTransport, SITE, type Script } from './confluence.fixture';

let h: StoreHarness;
let db: KawalysDb;
let repo: EvidenceRepository;
const ids = freshIds();
const { owner, stranger, ws, otherWs } = ids;
let projectId = '';
let sourceId = '';

beforeAll(async () => {
  h = await startStore(ids, { provider: 'confluence', externalRef: 'kemetra-synthetic.atlassian.net' });
  ({ db, repo, projectId, sourceId } = h);
}, 180_000);

afterAll(async () => {
  await stopStore(h);
}, 60_000);

const observe = (script: Script, spaceKeys: readonly string[] = ['ENG', 'OPS']) =>
  observeConfluenceSpaces(new ScriptedTransport(script), { sourceId, site: SITE, spaceKeys }, NOW);



describe('Confluence observations in the evidence store', () => {
  it('the source is stored with provider confluence, beside a jira source of the same site', async () => {
    const jira = await repo.connectSource(ws, owner, { projectId, provider: 'jira', externalRef: 'kemetra-synthetic.atlassian.net' });
    expect(jira).not.toBe(sourceId);
    const { rows } = await runWithWorkspaceContext(db.app, ws, (c) => c.query('SELECT provider FROM sources ORDER BY provider'));
    expect(rows.map((r) => r.provider)).toEqual(['confluence', 'jira']);
  });

  it('stores reachable spaces and reads them back through the repository, payload intact', async () => {
    const batch = await observe(happyScript());
    const ids = await repo.ingest(ws, batch);
    expect(ids).toHaveLength(3);
    const stored = await storedFor(h, ids);
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
    const stored = await storedFor(h, ids);
    expect(pairs(stored)).toEqual(pairs(expected));
    expect(stored.filter((e) => e.payload['kind'] === 'source_status').some((e) => e.state === 'ok')).toBe(false);
    // Only the reachable OPS pages of the first two reads are ok; the stale ENG pages stay stale.
    expect((await storedFor(h, perBatch[0]!)).filter((e) => e.sourceRef.startsWith('confluence:ENG#page/')).map((e) => e.state)).toEqual(['stale', 'stale']);
  });

  it('another workspace sees nothing, not even the source', async () => {
    await expectOtherWorkspaceSeesNothing(h, await observe(happyScript()));
  });

  it('a user without a grant on the source sees nothing', async () => {
    expect(await repo.list(ws, stranger, { sourceId })).toEqual([]);
  });

  it.each(['wiki', 'Confluence', 'github '])('refuses provider %p (check_violation)', async (provider) => {
    expect(await providerInsertCode(h, provider)).toBe('23514');
  });
});
