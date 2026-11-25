// Recent decisions with creator and time, and append-only decisions (BACK-59), on the real store and over
// HTTP. Disposable Docker Postgres only.
import { randomUUID } from 'node:crypto';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { WorkspaceGuard, type WorkspaceRequest } from '../../src/auth/workspace.guard';
import type { WorkspacePrincipal, WorkspaceResolver } from '../../src/auth/workspace-resolver';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { EvidenceController } from '../../src/evidence/evidence.controller';
import type { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { DECISION_LIMIT_DEFAULT, DECISION_LIMIT_MAX } from '../../src/evidence/evidence.types';
import { sqlState } from '../db/pg-container';
import { expectNotFound, expectSessionRequired, startOwnerApp, type OwnerApp } from '../db/owner-app';

let t: OwnerApp | undefined;
let db: OwnerApp['db'];
let evidence: EvidenceRepository;
let cookie = '';
let ws = '';
let owner = '';
let projectId = '';
let sourceId = '';
let investigationId = '';
let observationId = '';
let firstDecision = '';

const server = () => t!.app.getHttpServer();
const get = (query: Record<string, string | string[]> = {}) => request(server()).get('/decisions').query(query).set('Cookie', cookie);
const ids = (res: request.Response) => (res.body.items as { id: string }[]).map((d) => d.id);

const observe = async (src: string, investigation: string, ref: string): Promise<string> =>
  ((await evidence.ingest(ws, [
    { sourceId: src, investigationId: investigation, type: 'Observation', state: 'ok', sourceRef: ref, observedAt: new Date('2026-11-25T09:00:00Z'), payload: {} },
  ])) as [string])[0];

beforeAll(async () => {
  t = await startOwnerApp();
  ({ db, evidence, cookie, ws, owner } = t);
  projectId = await evidence.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  sourceId = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/backstage-os' });
  investigationId = await evidence.createInvestigation(ws, owner, { projectId, title: 'Build failures' });
  observationId = await observe(sourceId, investigationId, 'github:kemetra-labs/backstage-os#pull/9');
  firstDecision = (
    await request(server())
      .post(`/investigations/${investigationId}/decisions`)
      .set('Cookie', cookie)
      .send({ decision: 'Retry the build', rationale: 'Runner timeout', evidenceIds: [observationId] })
  ).body.id as string;
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

describe('creator and time', () => {
  it('a decision recorded over HTTP is listed with its creator, time, text and citations', async () => {
    const res = await get({ investigationId });
    expect(res.status).toBe(200);
    const [d] = res.body.items;
    expect(d).toEqual({
      id: firstDecision,
      investigationId,
      decision: 'Retry the build',
      rationale: 'Runner timeout',
      citations: [observationId],
      createdBy: owner,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    expect(Math.abs(Date.parse(d.createdAt) - Date.now())).toBeLessThan(120_000);
  });

  it('the creator is the actor of the decision.recorded audit row, with the request id', async () => {
    const audit = await runWithWorkspaceContext(db.app, ws, async (c) =>
      (await c.query(`SELECT actor_user_id, request_id FROM audit_events WHERE action = 'decision.recorded' AND target_id = $1`, [firstDecision])).rows,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_user_id).toBe(owner);
    expect(audit[0].request_id).toEqual(expect.any(String));
  });

  it('lists the same decisions as GET /evidence for an investigation (one visibility rule)', async () => {
    const all = await request(server()).get('/evidence').query({ investigationId }).set('Cookie', cookie);
    const fromEvidence = (all.body.items as { id: string; type: string }[]).filter((e) => e.type === 'HumanDecision').map((e) => e.id);
    expect(ids(await get({ investigationId })).sort()).toEqual(fromEvidence.sort());
  });
});

describe('visibility: invisible is absent', () => {
  it('hides a decision citing evidence of a disconnected source, in /decisions and /evidence alike; an uncited one in the same investigation stays', async () => {
    const project = await evidence.createProject(ws, owner, { key: 'two-sources', name: 'Two sources' });
    // The kept source keeps the project (and so the uncited decision) visible after the other is disconnected.
    await evidence.connectSource(ws, owner, { projectId: project, provider: 'github', externalRef: 'kemetra-labs/kept' });
    const lost = await evidence.connectSource(ws, owner, { projectId: project, provider: 'github', externalRef: 'kemetra-labs/lost' });
    const inv = await evidence.createInvestigation(ws, owner, { projectId: project, title: 'Two sources' });
    const cited = await observe(lost, inv, 'github:kemetra-labs/lost#pull/1');
    const citing = await evidence.recordDecision(ws, owner, { investigationId: inv, decision: 'Cites lost', rationale: 'r', evidenceIds: [cited] }, null);
    const uncited = await evidence.recordDecision(ws, owner, { investigationId: inv, decision: 'Cites nothing', rationale: 'r', evidenceIds: [] }, null);
    expect(ids(await get({ investigationId: inv })).sort()).toEqual([citing, uncited].sort());
    await evidence.disconnectSource(ws, owner, lost);
    expect(ids(await get({ investigationId: inv }))).toEqual([uncited]);
    expect(ids(await get({ limit: String(DECISION_LIMIT_MAX) }))).not.toContain(citing);
    expectNotFound(await request(server()).get(`/evidence/${citing}`).set('Cookie', cookie));
  });

  it("hides an uncited decision once its project is no longer visible (its investigation's rule)", async () => {
    const project = await evidence.createProject(ws, owner, { key: 'revoked', name: 'Revoked' });
    const src = await evidence.connectSource(ws, owner, { projectId: project, provider: 'github', externalRef: 'kemetra-labs/revoked' });
    const inv = await evidence.createInvestigation(ws, owner, { projectId: project, title: 'Revoked' });
    const d = await evidence.recordDecision(ws, owner, { investigationId: inv, decision: 'x', rationale: 'y', evidenceIds: [] }, null);
    expect(ids(await get({ investigationId: inv }))).toEqual([d]);
    await evidence.disconnectSource(ws, owner, src);
    expect(await get({ investigationId: inv }).then((r) => r.body)).toEqual({ items: [] });
    expect(ids(await get({ limit: String(DECISION_LIMIT_MAX) }))).not.toContain(d);
  });

  it('a user without any grant sees no decisions', async () => {
    const stranger = randomUUID();
    await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [stranger]);
    expect(await evidence.recentDecisions(ws, stranger, { limit: DECISION_LIMIT_MAX })).toEqual([]);
  });

  it("another workspace's decisions never appear, even filtered by their investigation id", async () => {
    const otherOwner = randomUUID();
    const otherWs = randomUUID();
    await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [otherOwner]);
    await runWithWorkspaceContext(db.app, otherWs, async (c) => {
      await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [otherWs, otherOwner]);
      await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [otherWs, otherOwner]);
    });
    const p = await evidence.createProject(otherWs, otherOwner, { key: 'theirs', name: 'Theirs' });
    await evidence.connectSource(otherWs, otherOwner, { projectId: p, provider: 'github', externalRef: 'kemetra-labs/theirs' });
    const inv = await evidence.createInvestigation(otherWs, otherOwner, { projectId: p, title: 'Theirs' });
    const theirs = await evidence.recordDecision(otherWs, otherOwner, { investigationId: inv, decision: 'x', rationale: 'y', evidenceIds: [] }, null);
    expect((await evidence.recentDecisions(otherWs, otherOwner, { limit: 5 })).map((d) => d.id)).toEqual([theirs]);
    expect(await get({ investigationId: inv }).then((r) => r.body)).toEqual({ items: [] });
    expect(ids(await get({ limit: String(DECISION_LIMIT_MAX) }))).not.toContain(theirs);
  });
});

describe('query parameters', () => {
  it(`defaults to ${DECISION_LIMIT_DEFAULT}, newest first, and honours limit up to ${DECISION_LIMIT_MAX}`, async () => {
    for (let i = 0; i < DECISION_LIMIT_MAX + 2; i++) {
      await evidence.recordDecision(ws, owner, { investigationId, decision: `Decision ${i}`, rationale: 'r', evidenceIds: [] }, null);
    }
    const byDefault = await get();
    expect(byDefault.status).toBe(200);
    expect(byDefault.body.items).toHaveLength(DECISION_LIMIT_DEFAULT);
    const times = (byDefault.body.items as { createdAt: string }[]).map((d) => Date.parse(d.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect((byDefault.body.items as { decision: string }[])[0]!.decision).toBe(`Decision ${DECISION_LIMIT_MAX + 1}`);
    expect((await get({ limit: '1' })).body.items).toHaveLength(1);
    expect((await get({ limit: String(DECISION_LIMIT_MAX) })).body.items).toHaveLength(DECISION_LIMIT_MAX);
  }, 120_000);

  it('a limit outside 1..100, not an integer, or repeated is a 400 validation_error', async () => {
    for (const limit of ['0', String(DECISION_LIMIT_MAX + 1), '-1', '1.5', 'abc', '', '1e2', ' 5', '0x10', ['5', '5']]) {
      const res = await get({ limit });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    }
  });

  it('an unknown, malformed or repeated investigationId matches nothing', async () => {
    expect((await get({ investigationId: '00000000-0000-4000-8000-000000000000' })).body).toEqual({ items: [] });
    expect((await get({ investigationId: 'not-a-uuid' })).body).toEqual({ items: [] });
    expect((await get({ investigationId: [investigationId, investigationId] })).body).toEqual({ items: [] });
  });
});

describe('access', () => {
  it('needs a session; the persona header grants nothing', async () => {
    await expectSessionRequired(t!.app, ['/decisions', `/decisions?investigationId=${investigationId}`, '/decisions?limit=abc']);
  });

  it('requires evidence.read: a workspace without it is refused with 404', async () => {
    const handler = EvidenceController.prototype.decisions;
    const principal = (capabilities: WorkspacePrincipal['capabilities']): WorkspacePrincipal => ({ userId: owner, workspaceId: ws, role: 'owner', capabilities });
    const guard = (p: WorkspacePrincipal) => new WorkspaceGuard(new Reflector(), { forUser: async () => p } as unknown as WorkspaceResolver);
    const ctx = (): ExecutionContext =>
      ({
        getHandler: () => handler,
        getClass: () => EvidenceController,
        switchToHttp: () => ({ getRequest: () => ({ headers: {}, principal: { userId: owner, role: 'owner' } }) as WorkspaceRequest }),
      }) as unknown as ExecutionContext;
    await expect(guard(principal(['decision.create', 'note.create', 'audit.read'])).canActivate(ctx())).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard(principal(['evidence.read'])).canActivate(ctx())).resolves.toBe(true);
  });

  it('is read-only: no other method answers on /decisions', async () => {
    for (const res of [
      await request(server()).post('/decisions').set('Cookie', cookie).send({}),
      await request(server()).delete(`/decisions/${firstDecision}`).set('Cookie', cookie),
      await request(server()).delete('/decisions').set('Cookie', cookie),
    ]) expectNotFound(res);
  });
});

describe('append-only decisions', () => {
  it('the runtime role can neither update nor delete a decision, and it stays listed', async () => {
    for (const sql of [
      `UPDATE evidence SET payload = '{"decision":"changed","rationale":"r"}' WHERE id = $1`,
      'DELETE FROM evidence WHERE id = $1',
      'DELETE FROM evidence_citations WHERE decision_id = $1',
      'DELETE FROM audit_events WHERE target_id = $1',
    ]) {
      const err = await runWithWorkspaceContext(db.app, ws, (c) => c.query(sql, [firstDecision])).catch((e: unknown) => e);
      expect(sqlState(err)).toBe('42501');
    }
    // The cap test above pushed it off the first page, so read it back by id.
    expect(await evidence.get(ws, owner, firstDecision)).toMatchObject({
      type: 'HumanDecision',
      payload: { decision: 'Retry the build', rationale: 'Runner timeout' },
      citations: [observationId],
    });
  });
});
