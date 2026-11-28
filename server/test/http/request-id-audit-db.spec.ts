// BACK-172 G1 on the real store: a client x-request-id never becomes audit_events.request_id; it is kept only
// as metadata.client_request_id of the audit rows written for that request. Disposable Docker Postgres only.
import request from 'supertest';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { startOwnerApp, type OwnerApp } from '../db/owner-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let t: OwnerApp | undefined;
let investigationId = '';
let observationId = '';

const server = () => t!.app.getHttpServer();
const auditOf = (id: string) =>
  runWithWorkspaceContext(t!.db.app, t!.ws, async (c) =>
    (await c.query<{ request_id: string; metadata: Record<string, unknown> }>('SELECT request_id, metadata FROM audit_events WHERE target_id = $1', [id])).rows,
  );

beforeAll(async () => {
  t = await startOwnerApp();
  const { evidence, ws, owner } = t;
  const projectId = await evidence.createProject(ws, owner, { key: 'rid', name: 'Request id' });
  const sourceId = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/rid' });
  investigationId = await evidence.createInvestigation(ws, owner, { projectId, title: 'Correlation' });
  [observationId] = (await evidence.ingest(ws, [
    { sourceId, investigationId, type: 'Observation', state: 'ok', sourceRef: 'github:kemetra-labs/rid#pull/1', observedAt: new Date(), payload: {} },
  ])) as [string];
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

const decide = (clientId?: string) => {
  const r = request(server()).post(`/investigations/${investigationId}/decisions`).set('Cookie', t!.cookie);
  if (clientId !== undefined) r.set('x-request-id', clientId);
  return r.send({ decision: `d ${Math.random()}`, rationale: 'r', evidenceIds: [observationId] });
};

describe('audit correlation', () => {
  it('stores the server id as request_id and the client id only in metadata.client_request_id', async () => {
    const res = await decide('client-req-12345');
    expect(res.status).toBe(201);
    const serverId = res.headers['x-request-id'] as string;
    expect(serverId).toMatch(UUID);
    const [row, ...rest] = await auditOf(res.body.id);
    expect(rest).toHaveLength(0);
    expect(row!.request_id).toBe(serverId);
    expect(row!.request_id).not.toBe('client-req-12345');
    expect(row!.metadata['client_request_id']).toBe('client-req-12345');
  });

  it('drops a malformed client id and stores nothing for a missing one', async () => {
    for (const bad of ['short', 'a'.repeat(100)]) {
      const res = await decide(bad);
      const [row] = await auditOf(res.body.id);
      expect(row!.request_id).toMatch(UUID);
      expect(row!.metadata).not.toHaveProperty('client_request_id');
    }
    const [row] = await auditOf((await decide()).body.id);
    expect(row!.metadata).not.toHaveProperty('client_request_id');
  });

  it('a note audit row carries the client id the same way', async () => {
    const res = await request(server())
      .post(`/investigations/${investigationId}/notes`)
      .set('Cookie', t!.cookie)
      .set('x-request-id', 'client-note-12345')
      .send({ type: 'Hypothesis', text: 'because', evidenceIds: [observationId] });
    expect(res.status).toBe(201);
    const [row] = await auditOf(res.body.id);
    expect(row!.request_id).toBe(res.headers['x-request-id']);
    expect(row!.metadata['client_request_id']).toBe('client-note-12345');
  });

  it('error envelopes and the header carry the server id, never the client one', async () => {
    const res = await request(server()).get('/no-such-route').set('x-request-id', 'client-req-12345');
    expect(res.status).toBe(404);
    expect(res.body.error.request_id).toBe(res.headers['x-request-id']);
    expect(res.body.error.request_id).toMatch(UUID);
  });
});
