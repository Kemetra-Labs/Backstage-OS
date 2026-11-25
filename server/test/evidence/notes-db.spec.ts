// User-written notes (BACK-50, owner decision option a) on the real store and over HTTP. A note is a
// Correlation or Hypothesis that cites evidence of ONE source and inherits that source. Disposable
// Docker Postgres only.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { EvidenceRepository, type NoteInput, type ObservationInput } from '../../src/evidence/evidence.repository';
import { NotVisibleError, RefusedError } from '../../src/evidence/evidence.types';
import { PortfolioRepository } from '../../src/portfolio/portfolio.repository';
import { evidenceCount, expectNotFound, startOwnerApp, type OwnerApp } from '../db/owner-app';

let t: OwnerApp | undefined;
let db: OwnerApp['db'];
let evidence: EvidenceRepository;
let cookie = '';
let ws = '';
let owner = '';
let projectId = '';
let sourceId = '';
let investigationId = '';
let okObs = '';
let unknownObs = '';

const obs = (src: string, state: ObservationInput['state'], ref: string, inv?: string): ObservationInput => ({
  sourceId: src,
  investigationId: inv,
  type: 'Observation',
  state,
  sourceRef: ref,
  observedAt: new Date('2026-11-25T10:00:00Z'),
  payload: { kind: 'pull_request', number: 1 },
});

const note = (over: Partial<NoteInput> = {}): NoteInput => ({
  investigationId,
  type: 'Hypothesis',
  text: 'The timeout follows the token rotation',
  evidenceIds: [okObs],
  ...over,
});

const rowsIn = (inv: string) => evidenceCount(db!, ws, inv);

const newUser = async () => {
  const id = randomUUID();
  await db!.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [id]);
  return id;
};

/** Test-only: there is no route that grants another user a source yet (single owner). */
const grant = (src: string, user: string) =>
  db!.admin.query('INSERT INTO kawalys.source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [ws, src, user]);

beforeAll(async () => {
  t = await startOwnerApp();
  ({ db, evidence, cookie, ws, owner } = t);
  projectId = await evidence.createProject(ws, owner, { key: 'notes', name: 'Notes' });
  sourceId = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/notes' });
  investigationId = await evidence.createInvestigation(ws, owner, { projectId, title: 'Build failures' });
  [okObs, unknownObs] = (await evidence.ingest(ws, [
    obs(sourceId, 'ok', 'github:kemetra-labs/notes#pull/1', investigationId),
    obs(sourceId, 'unknown', 'github:kemetra-labs/notes#pull/2'),
  ])) as [string, string];
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

describe('recording a note', () => {
  it('inherits the source of what it cites, keeps its type and text, and is audited', async () => {
    const id = await evidence.recordNote(ws, owner, note({ type: 'Correlation' }), null);
    expect(await evidence.get(ws, owner, id)).toMatchObject({
      type: 'Correlation',
      state: 'ok',
      sourceId,
      projectId,
      investigationId,
      sourceRef: 'kawalys:note',
      payload: { text: 'The timeout follows the token rotation' },
      citations: [okObs],
    });
    const audit = await runWithWorkspaceContext(db!.app, ws, async (c) =>
      (await c.query(`SELECT actor_user_id, action FROM audit_events WHERE target_id = $1`, [id])).rows,
    );
    expect(audit).toEqual([{ actor_user_id: owner, action: 'note.recorded' }]);
  });

  it('takes the worst state of what it cites: a note built on unknown evidence is never ok', async () => {
    const id = await evidence.recordNote(ws, owner, note({ evidenceIds: [okObs, unknownObs] }), null);
    expect(await evidence.get(ws, owner, id)).toMatchObject({ state: 'unknown', citations: [okObs, unknownObs].sort() });
  });

  it('may cite another note of the same source', async () => {
    const first = await evidence.recordNote(ws, owner, note(), null);
    const second = await evidence.recordNote(ws, owner, note({ evidenceIds: [first] }), null);
    expect((await evidence.get(ws, owner, second))!.citations).toEqual([first]);
  });

  it('rolls the note back when the audit row cannot be written', async () => {
    const failing = new EvidenceRepository(db!.app, async () => {
      throw new Error('audit unavailable');
    });
    const before = await rowsIn(investigationId);
    await expect(failing.recordNote(ws, owner, note(), null)).rejects.toThrow('audit unavailable');
    expect(await rowsIn(investigationId)).toBe(before);
  });
});

describe('refusals write nothing', () => {
  it('a note that cites nothing, or of a non-note type, is refused (400)', async () => {
    const before = await rowsIn(investigationId);
    await expect(evidence.recordNote(ws, owner, note({ evidenceIds: [] }), null)).rejects.toBeInstanceOf(RefusedError);
    await expect(evidence.recordNote(ws, owner, note({ type: 'Observation' as NoteInput['type'] }), null)).rejects.toBeInstanceOf(RefusedError);
    expect(await rowsIn(investigationId)).toBe(before);
  });

  it('evidence of two sources is refused: a note has exactly one source (400)', async () => {
    const second = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/notes-second' });
    const [other] = await evidence.ingest(ws, [obs(second, 'ok', 'github:kemetra-labs/notes-second#pull/3')]);
    const before = await rowsIn(investigationId);
    await expect(evidence.recordNote(ws, owner, note({ evidenceIds: [okObs, other!] }), null)).rejects.toBeInstanceOf(RefusedError);
    expect(await rowsIn(investigationId)).toBe(before);
  });

  it('absent, invisible, other-project and decision citations look the same (404)', async () => {
    const hiddenSrc = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/notes-hidden' });
    const [hidden] = await evidence.ingest(ws, [obs(hiddenSrc, 'ok', 'github:kemetra-labs/notes-hidden#pull/4')]);
    await evidence.disconnectSource(ws, owner, hiddenSrc);
    const elsewhere = await evidence.createProject(ws, owner, { key: 'notes-elsewhere', name: 'Elsewhere' });
    const elsewhereSrc = await evidence.connectSource(ws, owner, { projectId: elsewhere, provider: 'github', externalRef: 'kemetra-labs/notes-elsewhere' });
    const [foreign] = await evidence.ingest(ws, [obs(elsewhereSrc, 'ok', 'github:kemetra-labs/notes-elsewhere#pull/5')]);
    const decision = await evidence.recordDecision(ws, owner, { investigationId, decision: 'x', rationale: 'y', evidenceIds: [okObs] }, null);
    const before = await rowsIn(investigationId);
    // Each pair also spans two sources, so a 400 here would reveal the hidden row: 404 must come first.
    for (const id of ['00000000-0000-4000-8000-000000000001', hidden!, foreign!, decision, 'not-a-uuid']) {
      await expect(evidence.recordNote(ws, owner, note({ evidenceIds: [okObs, id] }), null)).rejects.toBeInstanceOf(NotVisibleError);
    }
    expect(await rowsIn(investigationId)).toBe(before);
  });

  it('a note on an investigation the writer cannot see is refused (404)', async () => {
    const lone = await evidence.createProject(ws, owner, { key: 'notes-lone', name: 'Lone' });
    const src = await evidence.connectSource(ws, owner, { projectId: lone, provider: 'github', externalRef: 'kemetra-labs/notes-lone' });
    const inv = await evidence.createInvestigation(ws, owner, { projectId: lone, title: 'Lone' });
    await evidence.disconnectSource(ws, owner, src);
    // The cited row stays visible, so only the investigation check can refuse.
    await expect(evidence.recordNote(ws, owner, note({ investigationId: inv, evidenceIds: [okObs] }), null)).rejects.toBeInstanceOf(NotVisibleError);
    expect(await rowsIn(inv)).toBe(0);
  });
});

describe('who sees a note', () => {
  it('a member granted the source sees it; a member without the grant does not', async () => {
    const id = await evidence.recordNote(ws, owner, note(), null);
    const granted = await newUser();
    await grant(sourceId, granted);
    expect(await evidence.get(ws, granted, id)).toMatchObject({ id, citations: [okObs] });
    const stranger = await newUser();
    expect(await evidence.get(ws, stranger, id)).toBeNull();
    expect((await evidence.list(ws, stranger, { investigationId })).map((e) => e.id)).not.toContain(id);
  });

  it('the writer loses sight of it once the source grant is revoked', async () => {
    const p = await evidence.createProject(ws, owner, { key: 'notes-revoke', name: 'Revoke' });
    const src = await evidence.connectSource(ws, owner, { projectId: p, provider: 'github', externalRef: 'kemetra-labs/notes-revoke' });
    const inv = await evidence.createInvestigation(ws, owner, { projectId: p, title: 'Revoke' });
    const [cited] = await evidence.ingest(ws, [obs(src, 'ok', 'github:kemetra-labs/notes-revoke#pull/7')]);
    const id = await evidence.recordNote(ws, owner, note({ investigationId: inv, evidenceIds: [cited!] }), null);
    await evidence.disconnectSource(ws, owner, src);
    expect(await evidence.get(ws, owner, id)).toBeNull();
  });

  it('a note does not change the portfolio (it reads connector observations only)', async () => {
    const portfolio = new PortfolioRepository(db!.app);
    const before = await portfolio.list(ws, owner, { projectId, withItems: true });
    await evidence.recordNote(ws, owner, note(), null);
    expect(await portfolio.list(ws, owner, { projectId, withItems: true })).toEqual(before);
  });
});

describe('POST /investigations/:id/notes', () => {
  const server = () => t!.app.getHttpServer();
  const post = (body: unknown, id = investigationId) =>
    request(server()).post(`/investigations/${id}/notes`).set('Cookie', cookie).send(body as object);
  const body = { type: 'Hypothesis', text: 'Token rotation broke the build', evidenceIds: [] as string[] };

  it('needs a session', async () => {
    expectNotFound(await request(server()).post(`/investigations/${investigationId}/notes`).send({ ...body, evidenceIds: [okObs] }));
  });

  it('records a note and shows it in the investigation with its type badge', async () => {
    const res = await post({ ...body, evidenceIds: [okObs] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String) });
    const room = await request(server()).get(`/investigations/${investigationId}`).set('Cookie', cookie);
    expect(room.body.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ id: res.body.id, type: 'Hypothesis', state: 'ok' })]));
  });

  it('400 without an explicit note type, without citations, or across two sources', async () => {
    const second = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/notes-http' });
    const [other] = await evidence.ingest(ws, [obs(second, 'ok', 'github:kemetra-labs/notes-http#pull/8')]);
    const before = await rowsIn(investigationId);
    for (const bad of [
      { text: body.text, evidenceIds: [okObs] },
      { ...body, type: 'Observation', evidenceIds: [okObs] },
      { ...body, type: 'HumanDecision', evidenceIds: [okObs] },
      { ...body, evidenceIds: [] },
      { ...body, evidenceIds: [okObs, other] },
    ]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    }
    expect(await rowsIn(investigationId)).toBe(before);
  });

  it('404 for an unknown investigation or invisible evidence', async () => {
    expectNotFound(await post({ ...body, evidenceIds: [okObs] }, '00000000-0000-4000-8000-000000000000'));
    expectNotFound(await post({ ...body, evidenceIds: ['00000000-0000-4000-8000-000000000001'] }));
  });
});
