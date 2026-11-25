// Portfolio reads on the real evidence store, and the HTTP routes (BACK-49 slice 2). Disposable
// Docker Postgres only; read batches come from the real GitHub mapper over canned responses.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { observeRepository } from '../../src/connectors/github/github.observer';
import { GitHubTransportFailure } from '../../src/connectors/github/github.transport';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import type { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { PortfolioRepository, PROJECT_LIMIT } from '../../src/portfolio/portfolio.repository';
import { happyScript, OWNER_REPO, ScriptedTransport, type Script } from '../connectors/github/github.fixture';
import { expectNotFound, expectSessionRequired, startOwnerApp, type OwnerApp } from '../db/owner-app';

let t: OwnerApp | undefined;
let db: OwnerApp['db'];
let evidence: EvidenceRepository;
let portfolio: PortfolioRepository;
let cookie = '';
let ws = '';
let owner = '';
let projectId = '';
let sourceId = '';

const read = async (script: Script, at: string, src = sourceId, ref = OWNER_REPO) =>
  evidence.ingest(ws, await observeRepository(new ScriptedTransport(script), { sourceId: src, externalRef: ref }, new Date(at)));

beforeAll(async () => {
  t = await startOwnerApp();
  ({ db, evidence, cookie, ws, owner } = t);
  portfolio = new PortfolioRepository(db.app);
  projectId = await evidence.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  sourceId = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: OWNER_REPO });
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

const mine = () => portfolio.list(ws, owner, { withItems: true });
const project = async () => (await mine()).find((p) => p.id === projectId)!;

describe('the latest read', () => {
  it('a connected source that was never read is unknown / never_read, not ok', async () => {
    const p = await project();
    expect(p.state).toBe('unknown');
    expect(p.sources).toEqual([expect.objectContaining({ id: sourceId, state: 'unknown', reason: 'never_read', lastReadAt: null })]);
  });

  it('one ingest batch shares one database-set received_at', async () => {
    const ids = await read(happyScript(), '2026-11-25T10:00:00Z');
    const { rows } = await runWithWorkspaceContext(db!.app, ws, (c) =>
      c.query<{ n: string }>('SELECT count(DISTINCT received_at) AS n FROM evidence WHERE id = ANY($1::uuid[])', [ids]),
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('shows the items and counts of the latest successful read', async () => {
    const p = await project();
    expect(p.state).toBe('ok');
    expect(p.sources[0]).toMatchObject({
      state: 'ok',
      lastReadAt: '2026-11-25T10:00:00.000Z',
      lists: { pullRequests: { count: 1, complete: true }, issues: { count: 1, complete: true } },
    });
    expect(p.sources[0]!.items.map((i) => `${i.kind}/${i.number}`)).toEqual(['pull_request/12', 'issue/7']);
  });

  it('a later failed read replaces it: the failure shows and the old items do not', async () => {
    await read({ [`/repos/${OWNER_REPO}`]: new GitHubTransportFailure('timeout') }, '2026-11-25T11:00:00Z');
    const s = (await project()).sources[0]!;
    expect(s).toMatchObject({ state: 'unknown', reason: 'timeout', lastReadAt: '2026-11-25T11:00:00.000Z' });
    expect(s.items).toEqual([]);
  });

  it('a newer batch without a repository-level record never hides the read', async () => {
    await read(happyScript(), '2026-11-25T12:00:00Z');
    // Same type (Observation) and an item kind, so only the repository-level predicate can exclude it.
    await evidence.ingest(ws, [
      {
        sourceId,
        type: 'Observation',
        state: 'ok',
        sourceRef: `github:${OWNER_REPO}#pull/99`,
        observedAt: new Date('2026-11-25T13:00:00Z'),
        payload: { kind: 'pull_request', number: 99, title: 'Stray', state: 'open', draft: false, updatedAt: '2026-11-25T13:00:00Z', url: null },
      },
    ]);
    const s = (await project()).sources[0]!;
    expect(s).toMatchObject({ state: 'ok', lastReadAt: '2026-11-25T12:00:00.000Z' });
    expect(s.items.map((i) => `${i.kind}/${i.number}`)).toEqual(['pull_request/12', 'issue/7']);
  });

  it('a closed pull request, gone from the newest read, is not shown as open', async () => {
    const script = happyScript();
    script[`/repos/${OWNER_REPO}/pulls`] = { status: 200, body: [], headers: {} };
    await read(script, '2026-11-25T14:00:00Z');
    const s = (await project()).sources[0]!;
    expect(s.lists.pullRequests).toEqual({ state: 'ok', reason: null, count: 0, complete: true });
    expect(s.items.some((i) => i.kind === 'pull_request')).toBe(false);
  });
});

describe('non-disclosure', () => {
  it('a user with no grant sees no project and no source', async () => {
    const stranger = randomUUID();
    await db!.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [stranger]);
    expect(await portfolio.list(ws, stranger, { withItems: true })).toEqual([]);
    expect(await portfolio.list(ws, stranger, { projectId, withItems: true })).toEqual([]);
  });

  it('only granted sources are listed and counted; a revoked grant hides them', async () => {
    const extra = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/second' });
    expect((await project()).sources.map((s) => s.id).sort()).toEqual([sourceId, extra].sort());
    await evidence.disconnectSource(ws, owner, extra);
    expect((await project()).sources.map((s) => s.id)).toEqual([sourceId]);
  });

  it('a project whose only source grant is revoked disappears', async () => {
    const lone = await evidence.createProject(ws, owner, { key: 'lone', name: 'Lone' });
    const src = await evidence.connectSource(ws, owner, { projectId: lone, provider: 'github', externalRef: 'kemetra-labs/lone' });
    expect((await mine()).some((p) => p.id === lone)).toBe(true);
    await evidence.disconnectSource(ws, owner, src);
    expect((await mine()).some((p) => p.id === lone)).toBe(false);
    expect(await portfolio.list(ws, owner, { projectId: lone, withItems: true })).toEqual([]);
  });

  it('a project with no source at all is not listed', async () => {
    const empty = await evidence.createProject(ws, owner, { key: 'empty', name: 'Empty' });
    expect((await mine()).some((p) => p.id === empty)).toBe(false);
  });

  it("another workspace's projects never appear", async () => {
    const otherOwner = randomUUID();
    const otherWs = randomUUID();
    await db!.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [otherOwner]);
    await runWithWorkspaceContext(db!.app, otherWs, async (c) => {
      await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [otherWs, otherOwner]);
      await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [otherWs, otherOwner]);
    });
    const theirs = await evidence.createProject(otherWs, otherOwner, { key: 'theirs', name: 'Theirs' });
    await evidence.connectSource(otherWs, otherOwner, { projectId: theirs, provider: 'github', externalRef: 'kemetra-labs/theirs' });
    expect((await mine()).some((p) => p.id === theirs)).toBe(false);
    expect(await portfolio.list(ws, owner, { projectId: theirs, withItems: true })).toEqual([]);
  });

  it(`caps the list at ${PROJECT_LIMIT} projects`, async () => {
    for (let i = 0; i < PROJECT_LIMIT + 2; i++) {
      const p = await evidence.createProject(ws, owner, { key: `cap-${String(i).padStart(3, '0')}`, name: `Cap ${i}` });
      await evidence.connectSource(ws, owner, { projectId: p, provider: 'github', externalRef: `kemetra-labs/cap-${i}` });
      // Two sources on the first one: a LIMIT on joined source rows instead of projects would drop a project.
      if (i === 0) await evidence.connectSource(ws, owner, { projectId: p, provider: 'github', externalRef: 'kemetra-labs/cap-0-second' });
    }
    const listed = await mine();
    expect(listed.length).toBe(PROJECT_LIMIT);
    expect(listed.find((p) => p.key === 'cap-000')!.sources).toHaveLength(2);
  }, 120_000);
});

describe('GET /portfolio', () => {
  const server = () => t!.app.getHttpServer();

  it('needs a session; the persona header grants nothing', async () => {
    await expectSessionRequired(t!.app, ['/portfolio', `/portfolio/${projectId}`]);
  });

  it('lists projects with counts and no items', async () => {
    const res = await request(server()).get('/portfolio').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const p = (res.body.projects as { id: string; sources: { items: unknown[] }[] }[]).find((x) => x.id === projectId)!;
    expect(p.sources.every((s) => s.items.length === 0)).toBe(true);
  });

  it('returns one project with items, and 404 for an unknown, malformed or invisible id', async () => {
    const res = await request(server()).get(`/portfolio/${projectId}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: projectId, key: 'backstage-os' });
    expectNotFound(await request(server()).get('/portfolio/00000000-0000-4000-8000-000000000000').set('Cookie', cookie));
    expectNotFound(await request(server()).get('/portfolio/not-a-uuid').set('Cookie', cookie));
  });
});
