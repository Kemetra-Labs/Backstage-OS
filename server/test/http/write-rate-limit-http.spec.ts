// BACK-172 G2 over HTTP on the real store: 30 writes per minute per principal and action, and a 32 kB JSON body
// cap enforced before any route handler. Disposable Docker Postgres only. The other-principal/workspace
// isolation is in write-rate-limiter.spec.ts (the key); there is only one signed-in owner here.
import { jest } from '@jest/globals';
import request from 'supertest';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { evidenceCount, startOwnerApp, type OwnerApp } from '../db/owner-app';

let t: OwnerApp | undefined;
let now = 1_000_000;
let investigationId = '';
let observationId = '';

const server = () => t!.app.getHttpServer();
const decide = (body: object = { decision: 'ok', rationale: 'r', evidenceIds: [] }) =>
  request(server()).post(`/investigations/${investigationId}/decisions`).set('Cookie', t!.cookie).send(body);
const note = () =>
  request(server()).post(`/investigations/${investigationId}/notes`).set('Cookie', t!.cookie).send({ type: 'Hypothesis', text: 't', evidenceIds: [observationId] });

beforeAll(async () => {
  t = await startOwnerApp({ writeClock: () => now });
  const { evidence, ws, owner } = t;
  const projectId = await evidence.createProject(ws, owner, { key: 'rl', name: 'Rate limit' });
  const sourceId = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/rl' });
  investigationId = await evidence.createInvestigation(ws, owner, { projectId, title: 'Limits' });
  [observationId] = (await evidence.ingest(ws, [
    { sourceId, investigationId, type: 'Observation', state: 'ok', sourceRef: 'github:kemetra-labs/rl#pull/1', observedAt: new Date(), payload: {} },
  ])) as [string];
}, 180_000);

afterAll(async () => {
  jest.restoreAllMocks();
  await t?.stop();
}, 60_000);

describe('write limit', () => {
  it('refuses the 31st decision in a window with 429 and no-store, writes nothing for it, and resets with the window', async () => {
    now += 120_000;
    const before = await evidenceCount(t!.db, t!.ws, investigationId);
    for (let i = 0; i < 30; i++) expect((await decide()).status).toBe(201);
    const refused = await decide();
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');
    expect(refused.headers['cache-control']).toBe('no-store');
    expect(await evidenceCount(t!.db, t!.ws, investigationId)).toBe(before + 30);
    now += 60_001;
    expect((await decide()).status).toBe(201);
  });

  it('counts decisions and notes separately', async () => {
    now += 120_000;
    for (let i = 0; i < 30; i++) expect((await decide()).status).toBe(201);
    expect((await decide()).status).toBe(429);
    expect((await note()).status).toBe(201);
  });
});

describe('body cap', () => {
  it('refuses a 33 kB JSON body before the repository runs, uniformly and with no-store', async () => {
    now += 120_000;
    const spy = jest.spyOn(EvidenceRepository.prototype, 'recordDecision');
    const before = await evidenceCount(t!.db, t!.ws, investigationId);
    const res = await decide({ decision: 'x'.repeat(33 * 1024), rationale: 'r', evidenceIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toBe(res.body.error.request_id);
    expect(spy).not.toHaveBeenCalled();
    expect(await evidenceCount(t!.db, t!.ws, investigationId)).toBe(before);
    spy.mockRestore();
  });

  it('still accepts a body just under the cap that the field rules allow', async () => {
    now += 120_000;
    const res = await decide({ decision: 'x'.repeat(2000), rationale: 'y'.repeat(4000), evidenceIds: [] });
    expect(res.status).toBe(201);
  });
});
