// The GitHub mapper's output, including every failure state, is accepted and stored by the real
// evidence repository and database constraints (BACK-52 mock slice). Disposable Docker Postgres only.
import { randomUUID } from 'node:crypto';
import { observeRepository } from '../../../src/connectors/github/github.observer';
import { GitHubTransportFailure } from '../../../src/connectors/github/github.transport';
import { EvidenceRepository } from '../../../src/evidence/evidence.repository';
import { runWithWorkspaceContext } from '../../../src/db/workspace-context';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../../db/kawalys-db';
import { happyScript, OWNER_REPO, ok, ScriptedTransport } from './github.fixture';

let db: KawalysDb | undefined;
let repo: EvidenceRepository;
const owner = randomUUID();
const ws = randomUUID();
let sourceId = '';
const now = new Date('2026-11-25T12:00:00Z');

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [owner]);
  await runWithWorkspaceContext(db.app, ws, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [ws, owner]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, owner]);
  });
  repo = new EvidenceRepository(db.app);
  const projectId = await repo.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  sourceId = await repo.connectSource(ws, owner, { projectId, provider: 'github', externalRef: OWNER_REPO });
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

const observe = (script: ReturnType<typeof happyScript>, externalRef = OWNER_REPO) =>
  observeRepository(new ScriptedTransport(script), { sourceId, externalRef }, now);

describe('GitHub observations in the evidence store', () => {
  it('stores a reachable repository and reads it back with its source reference', async () => {
    const ids = await repo.ingest(ws, await observe(happyScript()));
    expect(ids).toHaveLength(5);
    const refs = (await repo.list(ws, owner, { sourceId })).map((e) => e.sourceRef);
    expect(refs).toEqual(expect.arrayContaining([`github:${OWNER_REPO}`, `github:${OWNER_REPO}#pull/12`, `github:${OWNER_REPO}#issue/7`]));
  });

  it('stores denied, unknown and error records rather than rejecting or dropping them', async () => {
    const batches = [
      await observe({ [`/repos/${OWNER_REPO}`]: { status: 401, body: {}, headers: {} } }),
      await observe({ [`/repos/${OWNER_REPO}`]: new GitHubTransportFailure('timeout') }),
      await observe({ [`/repos/${OWNER_REPO}`]: ok('<html>') }),
      await observe(happyScript(), '../escape'),
    ];
    for (const batch of batches) expect(await repo.ingest(ws, batch)).toHaveLength(1);
    const states = (await repo.list(ws, owner, { sourceId })).filter((e) => e.payload['kind'] === 'source_status').map((e) => e.state);
    expect(states.sort()).toEqual(['denied', 'error', 'error', 'unknown']);
  });

  it('fits the payload and source_ref limits at the maximum page size and title length', async () => {
    const script = happyScript();
    const long = 'x'.repeat(5000);
    script[`/repos/${OWNER_REPO}/pulls`] = ok(
      Array.from({ length: 20 }, (_, i) => ({ number: i + 1, title: long, state: 'open', draft: false, updated_at: '2026-11-24T08:00:00Z', html_url: null })),
    );
    expect(await repo.ingest(ws, await observe(script))).toHaveLength(24);
  });

  it('stores a title with an emoji at the cut point, a NUL and an unpaired surrogate (jsonb would reject them raw)', async () => {
    const script = happyScript();
    const title = `${'x'.repeat(299)}\u{1F600}${String.fromCharCode(0)}\ud83d`;
    script[`/repos/${OWNER_REPO}/pulls`] = ok([{ number: 99, title, state: 'open', draft: false, updated_at: '2026-11-24T08:00:00Z' }]);
    expect(await repo.ingest(ws, await observe(script))).toHaveLength(5);
    const stored = (await repo.list(ws, owner, { sourceId })).find((e) => e.sourceRef === `github:${OWNER_REPO}#pull/99`)!;
    expect(Array.from(stored.payload['title'] as string)).toHaveLength(300);
  });
});
