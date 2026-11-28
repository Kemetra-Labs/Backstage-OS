// The portfolio list cap is visible (BACK-49 X): `capped` is true exactly when more visible projects exist than
// PROJECT_LIMIT, computed only over the projects the reader holds a grant on. Real PostgreSQL, disposable.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PortfolioRepository, PROJECT_LIMIT } from '../../src/portfolio/portfolio.repository';
import { startOwnerApp, type OwnerApp } from '../db/owner-app';

let t: OwnerApp | undefined;
let portfolio: PortfolioRepository;
const visibleSources: string[] = []; // sources of cap-000 .. cap-100 (101 projects), in key order
const readers: Record<string, string> = {};
let ws = '';
let owner = '';
let cookie = '';
let cap100Id = '';

const key = (prefix: string, i: number) => `${prefix}-${String(i).padStart(3, '0')}`;
const expectedKeys = Array.from({ length: PROJECT_LIMIT }, (_, i) => key('cap', i));

const grant = (user: string, sourceIds: readonly string[]) =>
  Promise.all(
    sourceIds.map((s) => t!.db.admin.query('INSERT INTO kawalys.source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [ws, s, user])),
  );

async function reader(name: string, sourceIds: readonly string[]): Promise<void> {
  const id = randomUUID();
  await t!.db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [id]);
  await grant(id, sourceIds);
  readers[name] = id;
}

beforeAll(async () => {
  t = await startOwnerApp();
  ({ ws, owner, cookie } = t);
  portfolio = new PortfolioRepository(t.db.app);
  // Hidden keys ("cap-hid-...") sort among the visible ones, so a cap applied before visibility would show.
  for (let i = 0; i <= PROJECT_LIMIT; i++) {
    const p = await t.evidence.createProject(ws, owner, { key: key('cap', i), name: `Cap ${i}` });
    visibleSources.push(await t.evidence.connectSource(ws, owner, { projectId: p, provider: 'github', externalRef: `kemetra-labs/cap-${i}` }));
    if (i === PROJECT_LIMIT) cap100Id = p;
    if (i < 50) {
      const h = await t.evidence.createProject(ws, owner, { key: key('cap-hid', i), name: `Hidden ${i}` });
      await t.evidence.connectSource(ws, owner, { projectId: h, provider: 'github', externalRef: `kemetra-labs/hid-${i}` });
    }
  }
  await reader('exactly100', visibleSources.slice(0, PROJECT_LIMIT));
  await reader('over', visibleSources);
  await reader('few', visibleSources.slice(0, 3));
}, 240_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

describe('capped is computed over the projects the reader can see', () => {
  it('is false at exactly the limit, with the hidden projects never shown or counted', async () => {
    const page = await portfolio.listPortfolio(ws, readers['exactly100']!);
    expect(page.capped).toBe(false);
    expect(page.projects.map((p) => p.key)).toEqual(expectedKeys);
    expect(page.projects.some((p) => p.key.startsWith('cap-hid'))).toBe(false);
  });

  it('is true one past the limit: the limit many are returned, ordered by key', async () => {
    const page = await portfolio.listPortfolio(ws, readers['over']!);
    expect(page.capped).toBe(true);
    expect(page.projects.map((p) => p.key)).toEqual(expectedKeys);
    expect(page.projects.every((p) => p.sources.length === 1)).toBe(true);
  });

  it('is false below the limit', async () => {
    const page = await portfolio.listPortfolio(ws, readers['few']!);
    expect(page.capped).toBe(false);
    expect(page.projects).toHaveLength(3);
  });

  it('a user with no grant gets an empty, uncapped page', async () => {
    const id = randomUUID();
    await t!.db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [id]);
    expect(await portfolio.listPortfolio(ws, id)).toEqual({ projects: [], capped: false });
  });

  it('list() keeps returning the projects alone, capped at the limit', async () => {
    expect(await portfolio.list(ws, readers['over']!, { withItems: false })).toHaveLength(PROJECT_LIMIT);
  });

  it('GET /portfolio returns { projects, limit, capped } for the owner, who sees 151 projects', async () => {
    const res = await request(t!.app.getHttpServer()).get('/portfolio').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(PROJECT_LIMIT);
    expect(res.body.capped).toBe(true);
    expect(res.body.projects).toHaveLength(PROJECT_LIMIT);
    expect(Object.keys(res.body).sort()).toEqual(['capped', 'limit', 'projects']);
  });

  it('the detail route is never capped: a project past the cap still opens, with no cap fields', async () => {
    const res = await request(t!.app.getHttpServer()).get(`/portfolio/${cap100Id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: cap100Id, key: key('cap', PROJECT_LIMIT) });
    expect(res.body).not.toHaveProperty('capped');
    expect(res.body).not.toHaveProperty('limit');
  });

  it('revoking one grant brings a capped reader to exactly the limit: capped turns false', async () => {
    await t!.db.admin.query('UPDATE kawalys.source_grants SET revoked_at = now() WHERE source_id = $1 AND user_id = $2', [visibleSources[PROJECT_LIMIT], readers['over']]);
    const page = await portfolio.listPortfolio(ws, readers['over']!);
    expect(page.capped).toBe(false);
    expect(page.projects).toHaveLength(PROJECT_LIMIT);
  });
});
