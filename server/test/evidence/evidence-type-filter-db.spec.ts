// BACK-148 decision L2 (owner approval 28 Nov 2026): an optional, read-only `type` filter on GET /evidence, so the room can list
// a case project's Observations without notes and decisions sharing the 500-row cap. Same VISIBLE rule and same cap as every
// other filter; a malformed, unknown or repeated value matches nothing. Decision L: citing such an observation (investigation_id
// NULL) from a case is the association, and a grant revoked before the write refuses it with nothing written.
// Disposable Docker Postgres only.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ObservationInput } from '../../src/evidence/evidence.repository';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { NotVisibleError } from '../../src/evidence/evidence.types';
import { evidenceCount, startOwnerApp, type OwnerApp } from '../db/owner-app';

let t: OwnerApp | undefined;
let db: OwnerApp['db'];
let evidence: EvidenceRepository;
let cookie = '';
let ws = '';
let owner = '';
let projectId = '';
let otherProjectId = '';
let sourceId = '';
let investigationId = '';
let caseObs = '';
let projectObs = '';
let otherProjectObs = '';

const obs = (src: string, ref: string, observedAt: string, inv?: string): ObservationInput => ({
  sourceId: src,
  investigationId: inv,
  type: 'Observation',
  state: 'ok',
  sourceRef: ref,
  observedAt: new Date(observedAt),
  payload: { kind: 'workflow_run' },
});

const server = () => t!.app.getHttpServer();
const getEvidence = (query: string) => request(server()).get(`/evidence?${query}`).set('Cookie', cookie);
const ids = (res: request.Response): string[] => (res.body as { items: { id: string }[] }).items.map((r) => r.id);

beforeAll(async () => {
  t = await startOwnerApp();
  ({ db, evidence, cookie, ws, owner } = t);
  projectId = await evidence.createProject(ws, owner, { key: 'filter', name: 'Filter' });
  otherProjectId = await evidence.createProject(ws, owner, { key: 'filter-other', name: 'Filter other' });
  sourceId = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/filter' });
  const otherSource = await evidence.connectSource(ws, owner, { projectId: otherProjectId, provider: 'github', externalRef: 'kemetra-labs/filter-other' });
  investigationId = await evidence.createInvestigation(ws, owner, { projectId, title: 'Checkout failures' });
  [caseObs, projectObs] = (await evidence.ingest(ws, [
    obs(sourceId, 'github:kemetra-labs/filter#actions/runs/1', '2026-11-25T09:00:00Z', investigationId),
    obs(sourceId, 'github:kemetra-labs/filter#actions/runs/2', '2026-11-25T09:30:00Z'),
  ])) as [string, string];
  [otherProjectObs] = (await evidence.ingest(ws, [obs(otherSource, 'github:kemetra-labs/filter-other#actions/runs/9', '2026-11-25T09:45:00Z')])) as [string];
  // A newer note in the case: without the filter it shares (and here leads) the project list.
  await evidence.recordNote(ws, owner, { investigationId, type: 'Hypothesis', text: 'Run 2 follows the token rotation', evidenceIds: [projectObs] }, null);
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

describe('GET /evidence?type= (BACK-148, decision L2)', () => {
  it('lists only Observations of the project, with and without a case, newest first; other projects stay out', async () => {
    const res = await getEvidence(`projectId=${projectId}&type=Observation`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([projectObs, caseObs]);
    expect((res.body as { items: { type: string; investigationId: string | null }[] }).items.map((r) => [r.type, r.investigationId])).toEqual([
      ['Observation', null],
      ['Observation', investigationId],
    ]);
    expect(ids(await getEvidence(`projectId=${projectId}`))).toHaveLength(3); // the note is there without the filter
  });

  it('narrows to the other types the same way', async () => {
    const res = await getEvidence(`projectId=${projectId}&type=Hypothesis`);
    expect((res.body as { items: { type: string }[] }).items.map((r) => r.type)).toEqual(['Hypothesis']);
  });

  it('a malformed, unknown, misspelt, empty or repeated type matches nothing, like the other filters', async () => {
    for (const q of ['type=Rumour', 'type=observation', 'type=OBSERVATION', 'type=', 'type=Observation%20', "type=Observation'--", 'type=Observation&type=Hypothesis', 'type=Observation&type=Observation']) {
      const res = await getEvidence(`projectId=${projectId}&${q}`);
      expect({ q, status: res.status, body: res.body as unknown }).toEqual({ q, status: 200, body: { items: [] } });
    }
  });

  it('needs a session (404 otherwise), like every evidence read', async () => {
    const res = await request(server()).get(`/evidence?projectId=${projectId}&type=Observation`);
    expect(res.status).toBe(404);
  });
});

describe('the type filter keeps the visibility rule (repository)', () => {
  it('another project\'s observation never appears under this project, and appears under its own', async () => {
    expect((await evidence.list(ws, owner, { projectId, type: 'Observation' })).map((r) => r.id)).not.toContain(otherProjectObs);
    expect((await evidence.list(ws, owner, { projectId: otherProjectId, type: 'Observation' })).map((r) => r.id)).toEqual([otherProjectObs]);
  });

  it('a member with no grant on the source sees nothing, filtered or not', async () => {
    const stranger = randomUUID();
    await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [stranger]);
    await db.admin.query(`INSERT INTO kawalys.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [ws, stranger]).catch(() => undefined);
    expect(await evidence.list(ws, stranger, { projectId, type: 'Observation' })).toEqual([]);
  });

  it('another workspace sees nothing of this project', async () => {
    expect(await evidence.list(randomUUID(), owner, { projectId, type: 'Observation' })).toEqual([]);
  });

  it('newer notes and decisions do not push observations out: the cap applies after the type', async () => {
    const before = (await evidence.list(ws, owner, { projectId, type: 'Observation' })).map((r) => r.id);
    for (let i = 0; i < 5; i += 1)
      await evidence.recordDecision(ws, owner, { investigationId, decision: `Decision ${i}`, rationale: 'r', evidenceIds: [projectObs] }, null);
    expect((await evidence.list(ws, owner, { projectId, type: 'Observation' })).map((r) => r.id)).toEqual(before);
  });
});

describe('citing a project observation from a case (BACK-148, decision L)', () => {
  it('a decision may cite a visible observation of the case project that has no case, and the citation reads back', async () => {
    const id = await evidence.recordDecision(ws, owner, { investigationId, decision: 'Watch run 2', rationale: 'r', evidenceIds: [projectObs] }, null);
    expect((await evidence.get(ws, owner, id))?.citations).toEqual([projectObs]);
    const room = await request(server()).get(`/investigations/${investigationId}`).set('Cookie', cookie);
    expect((room.body as { evidence: { id: string }[] }).evidence.map((r) => r.id)).not.toContain(projectObs); // cited, not moved
    expect((await request(server()).get(`/evidence/${projectObs}`).set('Cookie', cookie)).status).toBe(200);
  });

  it('another project\'s observation, an absent id and a malformed id are refused alike (404), and nothing is written', async () => {
    const before = await evidenceCount(db, ws, investigationId);
    for (const cited of [otherProjectObs, randomUUID()])
      await expect(evidence.recordDecision(ws, owner, { investigationId, decision: 'x', rationale: 'r', evidenceIds: [cited] }, null)).rejects.toBeInstanceOf(NotVisibleError);
    for (const cited of [otherProjectObs, randomUUID(), 'not-a-uuid']) {
      const res = await request(server()).post(`/investigations/${investigationId}/decisions`).set('Cookie', cookie).send({ decision: 'x', rationale: 'r', evidenceIds: [cited] });
      expect({ cited, status: res.status }).toEqual({ cited, status: 404 });
    }
    expect(await evidenceCount(db, ws, investigationId)).toBe(before);
  });

  it('a grant revoked between the list and the write refuses the citation, writes nothing, and hides the observation', async () => {
    const lostSource = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/filter-lost' });
    const [lostObs] = (await evidence.ingest(ws, [obs(lostSource, 'github:kemetra-labs/filter-lost#actions/runs/3', '2026-11-25T10:00:00Z')])) as [string];
    expect((await evidence.list(ws, owner, { projectId, type: 'Observation' })).map((r) => r.id)).toContain(lostObs);
    await evidence.disconnectSource(ws, owner, lostSource);
    const before = await evidenceCount(db, ws, investigationId);
    await expect(evidence.recordDecision(ws, owner, { investigationId, decision: 'x', rationale: 'r', evidenceIds: [lostObs] }, null)).rejects.toBeInstanceOf(NotVisibleError);
    expect(await evidenceCount(db, ws, investigationId)).toBe(before);
    expect((await evidence.list(ws, owner, { projectId, type: 'Observation' })).map((r) => r.id)).not.toContain(lostObs);
    expect((await request(server()).get(`/evidence/${lostObs}`).set('Cookie', cookie)).status).toBe(404);
  });
});
