// COG-07 live read (BACK-110, decided 2026-11-27): GET /cognition/projects/:projectId/search?q=.
// Security-negative first: no session is not found, the persona header grants nothing, every project
// the caller may not see answers the same 404 body, the DTO carries no internals, and reads are rate
// limited per user. Disposable Docker Postgres only; the read batch comes from the real GitHub mapper.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { observeRepository } from '../../src/connectors/github/github.observer';
import { COGNITION_READ_BUDGET_MS, COGNITION_READS_PER_MINUTE } from '../../src/cognition/cognition.controller';
import { happyScript, OWNER_REPO, ScriptedTransport } from '../connectors/github/github.fixture';
import { expectNotFound, expectSessionRequired, startOwnerApp, type OwnerApp } from '../db/owner-app';

let t: OwnerApp | undefined;
let projectId = '';
let sourceId = '';
let unreadProject = '';
let otherWorkspaceProject = '';

const server = () => t!.app.getHttpServer();
const get = (path: string) => request(server()).get(path).set('Cookie', t!.cookie);
/** The error body without its per-request id, which differs on every response by design. */
const stable = (body: { error: Record<string, unknown> }) => JSON.stringify({ ...body, error: { ...body.error, request_id: undefined } });
const search = (project: string, q: string) => get(`/cognition/projects/${project}/search?q=${encodeURIComponent(q)}`);

beforeAll(async () => {
  t = await startOwnerApp();
  const { evidence, ws, owner, db } = t;
  projectId = await evidence.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  sourceId = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: OWNER_REPO });
  await evidence.ingest(ws, await observeRepository(new ScriptedTransport(happyScript()), { sourceId, externalRef: OWNER_REPO }, new Date('2026-11-25T10:00:00Z')));
  unreadProject = await evidence.createProject(ws, owner, { key: 'no-sources', name: 'No sources' });
  // A project in another workspace, created by the admin: the caller can never see it.
  const otherUser = randomUUID();
  const otherWs = randomUUID();
  otherWorkspaceProject = randomUUID();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [otherUser]);
  await db.admin.query('INSERT INTO kawalys.workspaces (id, owner_user_id) VALUES ($1, $2)', [otherWs, otherUser]);
  await db.admin.query(`INSERT INTO kawalys.projects (id, workspace_id, key, name) VALUES ($1, $2, 'theirs', 'Theirs')`, [otherWorkspaceProject, otherWs]);
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

describe('access', () => {
  it('needs a session; the persona header grants nothing', async () => {
    await expectSessionRequired(t!.app, [`/cognition/projects/${projectId}/search?q=portfolio`]);
  });

  it('every project the caller may not see answers the same 404 body', async () => {
    const bodies: string[] = [];
    for (const p of ['not-a-uuid', '00000000-0000-4000-8000-000000000000', unreadProject, otherWorkspaceProject]) {
      const res = await search(p, 'portfolio');
      expectNotFound(res);
      bodies.push(stable(res.body));
    }
    expect(new Set(bodies).size).toBe(1);
  });
});

describe('work budget (DEC-1)', () => {
  it(`a read past its ${COGNITION_READ_BUDGET_MS} ms budget answers the generic error, the same for a visible and a hidden project`, async () => {
    const locker = await t!.db.admin.connect();
    try {
      await locker.query('BEGIN');
      // Holds the read past its budget deterministically: statement_timeout counts lock waits.
      await locker.query('LOCK TABLE kawalys.evidence IN ACCESS EXCLUSIVE MODE');
      const started = Date.now();
      const visible = await search(projectId, 'portfolio');
      // The failure is the budget firing, not some other error: the read waited the whole budget.
      expect(Date.now() - started).toBeGreaterThanOrEqual(COGNITION_READ_BUDGET_MS);
      const hidden = await search(otherWorkspaceProject, 'portfolio');
      for (const res of [visible, hidden]) {
        expect(res.status).toBe(500);
        expect(res.body.error.code).toBe('internal_error');
      }
      // No existence oracle: a hidden project waits and fails the same way.
      expect(stable(hidden.body)).toBe(stable(visible.body));
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
    }
    expect((await search(projectId, 'portfolio route')).status).toBe(200);
  }, 30_000);
});

describe('search', () => {
  it('finds a visible item by its words, with a trimmed body and no internals', async () => {
    const res = await search(projectId, 'portfolio route');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['hits', 'outcome', 'query', 'retrievalPolicyVersion', 'totalMatches', 'truncated']);
    expect(res.body).toMatchObject({ query: 'portfolio route', outcome: 'match', totalMatches: 1, truncated: false });
    expect(res.body.hits).toHaveLength(1);
    expect(Object.keys(res.body.hits[0]).sort()).toEqual(['kind', 'sourceRef', 'status', 'tier', 'title']);
    expect(res.body.hits[0]).toMatchObject({ title: 'Add the portfolio route', kind: 'pull_request', tier: 'title' });
    expect(JSON.stringify(res.body)).not.toMatch(/fingerprint|evidence|workspace|grant/i);
  });

  it('an identifier-shaped query is exact-only', async () => {
    const res = await search(projectId, '#12');
    expect(res.status).toBe(200);
    expect(res.body.hits.every((h: { tier: string }) => h.tier === 'identifier')).toBe(true);
  });

  it('nothing matched is said as no-match, not an empty success', async () => {
    const res = await search(projectId, 'payments outage');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ outcome: 'no-match', hits: [], totalMatches: 0 });
  });

  it('a missing, empty or oversized query is refused with 400', async () => {
    for (const path of [`/cognition/projects/${projectId}/search`, `/cognition/projects/${projectId}/search?q=`, `/cognition/projects/${projectId}/search?q=${'a'.repeat(501)}`]) {
      const res = await get(path);
      expect(res.status).toBe(400);
    }
    const twice = await get(`/cognition/projects/${projectId}/search?q=a&q=b`);
    expect(twice.status).toBe(400);
  });

  it('after the grant is revoked the project answers the same 404', async () => {
    const before = await search(unreadProject, 'portfolio');
    await t!.evidence.disconnectSource(t!.ws, t!.owner, sourceId);
    const after = await search(projectId, 'portfolio');
    expectNotFound(after);
    expect(stable(after.body)).toBe(stable(before.body));
  });
});

describe('rate limit (runs last: it exhausts the window)', () => {
  it(`refuses the read past ${COGNITION_READS_PER_MINUTE} a minute with 429`, async () => {
    const codes: number[] = [];
    for (let i = 0; i <= COGNITION_READS_PER_MINUTE; i++) codes.push((await search(unreadProject, 'x')).status);
    expect(codes.at(-1)).toBe(429);
  });
});
