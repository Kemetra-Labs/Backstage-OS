// BACK-148 decision M = (i), owner approval 28 Nov 2026: owner-only POST /investigations, reusing createInvestigation()'s insert
// and `investigation.created` audit row, for a project the caller can see now, behind the BACK-172 shared controls (write limit,
// 32 kB body, Idempotency-Key in audit metadata, server request id on the audit row). Disposable Docker Postgres only.
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { ROLE_CAPABILITIES } from '../../src/auth/capabilities';
import { WorkspaceGuard, type WorkspaceRequest } from '../../src/auth/workspace.guard';
import type { WorkspacePrincipal, WorkspaceResolver } from '../../src/auth/workspace-resolver';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { idempotencyClaim } from '../../src/evidence/idempotency';
import { NotVisibleError } from '../../src/evidence/evidence.types';
import { InvestigationController } from '../../src/investigations/investigation.controller';
import { startOwnerApp, type OwnerApp } from '../db/owner-app';

let t: OwnerApp | undefined;
let now = 1_000_000;
let projectId = '';
let sourceId = '';

const server = () => t!.app.getHttpServer();
const create = (body: unknown, headers: Record<string, string> = {}) => {
  const r = request(server()).post('/investigations').set('Cookie', t!.cookie);
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return r.send(body as object);
};
const investigationsIn = async (project: string) =>
  Number((await t!.db.admin.query<{ n: string }>('SELECT count(*) AS n FROM kawalys.investigations WHERE project_id = $1', [project])).rows[0]!.n);
const createdAudits = async () =>
  Number((await t!.db.admin.query<{ n: string }>(`SELECT count(*) AS n FROM kawalys.audit_events WHERE action = 'investigation.created'`)).rows[0]!.n);
const auditOf = (id: string) =>
  runWithWorkspaceContext(t!.db.app, t!.ws, async (c) =>
    (await c.query<{ action: string; actor_user_id: string; request_id: string | null; metadata: Record<string, unknown> }>(
      'SELECT action, actor_user_id, request_id, metadata FROM audit_events WHERE target_id = $1',
      [id],
    )).rows,
  );

/** A fresh project with a granted source, so a test can revoke or count in isolation. */
async function project(tag: string): Promise<{ project: string; source: string }> {
  const p = await t!.evidence.createProject(t!.ws, t!.owner, { key: tag, name: tag });
  const s = await t!.evidence.connectSource(t!.ws, t!.owner, { projectId: p, provider: 'github', externalRef: `kemetra-labs/${tag}` });
  return { project: p, source: s };
}

beforeAll(async () => {
  t = await startOwnerApp({ writeClock: () => now });
  ({ project: projectId, source: sourceId } = await project('create-case'));
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

describe('POST /investigations (BACK-148 decision M)', () => {
  it('creates a case in a visible project: 201 { id }, readable at once, audited with the server request id', async () => {
    now += 120_000;
    const res = await create({ projectId, title: 'Checkout failures on main' }, { 'x-request-id': 'client-corr-1234' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(['id']);
    const id = res.body.id as string;
    const room = await request(server()).get(`/investigations/${id}`).set('Cookie', t!.cookie);
    expect(room.status).toBe(200);
    expect(room.body).toMatchObject({ id, projectId, title: 'Checkout failures on main', status: 'open', evidence: [] });
    const [row] = await auditOf(id);
    expect(row).toMatchObject({ action: 'investigation.created', actor_user_id: t!.owner, request_id: res.headers['x-request-id'] });
    expect(row!.request_id).not.toBe('client-corr-1234');
    expect(row!.metadata).toEqual({ client_request_id: 'client-corr-1234' });
  });

  it('accepts a 300-character and an Arabic title, stored as typed', async () => {
    now += 120_000;
    for (const title of ['x'.repeat(300), 'أعطال الدفع على الفرع الرئيسي']) {
      const res = await create({ projectId, title });
      expect(res.status).toBe(201);
      expect((await request(server()).get(`/investigations/${res.body.id}`).set('Cookie', t!.cookie)).body.title).toBe(title);
    }
  });

  it('a bad body is 400 before any database work and writes nothing', async () => {
    now += 120_000;
    const before = await investigationsIn(projectId);
    const audits = await createdAudits();
    for (const body of [
      {},
      { title: 'no project' },
      { projectId: 7, title: 't' },
      { projectId: [projectId], title: 't' },
      { projectId },
      { projectId, title: '' },
      { projectId, title: '   ' },
      { projectId, title: 'x'.repeat(301) },
      { projectId, title: 7 },
      { projectId, title: `nul${String.fromCharCode(0)}` },
      { projectId, title: 'lone \ud800 surrogate' },
      [projectId, 't'],
    ]) {
      const res = await create(body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
    expect(await investigationsIn(projectId)).toBe(before);
    expect(await createdAudits()).toBe(audits);
  });

  it('absent, malformed, revoked, other-workspace projects all answer the same 404 and write nothing', async () => {
    now += 120_000;
    const { project: revoked, source } = await project('create-revoked');
    await t!.evidence.disconnectSource(t!.ws, t!.owner, source);
    const otherOwner = randomUUID();
    const otherWs = randomUUID();
    await t!.db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [otherOwner]);
    await runWithWorkspaceContext(t!.db.app, otherWs, async (c) => {
      await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [otherWs, otherOwner]);
      await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [otherWs, otherOwner]);
    });
    const theirs = await t!.evidence.createProject(otherWs, otherOwner, { key: 'theirs', name: 'Theirs' });
    await t!.evidence.connectSource(otherWs, otherOwner, { projectId: theirs, provider: 'github', externalRef: 'kemetra-labs/theirs' });
    const noSource = await t!.evidence.createProject(t!.ws, t!.owner, { key: 'create-nosource', name: 'No source' });

    const audits = await createdAudits();
    const answers = [];
    for (const target of [randomUUID(), 'not-a-uuid', '../auth/me', revoked, theirs, noSource]) {
      const res = await create({ projectId: target, title: 'Should not exist' });
      answers.push({ status: res.status, code: res.body?.error?.code });
    }
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0]!.status).toBe(404);
    for (const p of [revoked, theirs, noSource]) expect(await investigationsIn(p)).toBe(0);
    expect(await createdAudits()).toBe(audits);
  });

  it('needs a session (404, nothing written), and the persona header grants nothing', async () => {
    const audits = await createdAudits();
    expect((await request(server()).post('/investigations').send({ projectId, title: 't' })).status).toBe(404);
    expect((await request(server()).post('/investigations').set('x-kawalys-demo-persona', 'owner').send({ projectId, title: 't' })).status).toBe(404);
    expect(await createdAudits()).toBe(audits);
  });

  it('requires investigation.create, which only the owner role holds', async () => {
    expect(ROLE_CAPABILITIES.owner).toContain('investigation.create');
    const principal = (capabilities: WorkspacePrincipal['capabilities']): WorkspacePrincipal => ({ userId: t!.owner, workspaceId: t!.ws, role: 'owner', capabilities });
    const guard = (p: WorkspacePrincipal) => new WorkspaceGuard(new Reflector(), { forUser: async () => p } as unknown as WorkspaceResolver);
    const ctx = (): ExecutionContext =>
      ({
        getHandler: () => InvestigationController.prototype.create,
        getClass: () => InvestigationController,
        switchToHttp: () => ({ getRequest: () => ({ headers: {}, principal: { userId: t!.owner, role: 'owner' } }) as WorkspaceRequest }),
      }) as unknown as ExecutionContext;
    await expect(guard(principal(['evidence.read', 'decision.create', 'note.create', 'source.connect', 'audit.read'])).canActivate(ctx())).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard(principal(['investigation.create'])).canActivate(ctx())).resolves.toBe(true);
  });
});

describe('BACK-172 shared controls on POST /investigations', () => {
  it('Idempotency-Key: the same key and body twice is one case and one audit row; a different body is 422 and writes nothing', async () => {
    now += 120_000;
    const key = `case-${randomUUID()}`;
    const body = { projectId, title: 'Retry me' };
    const before = await investigationsIn(projectId);
    const first = await create(body, { 'Idempotency-Key': key });
    const again = await create({ title: 'Retry me', projectId: projectId.toUpperCase() }, { 'Idempotency-Key': key });
    expect([first.status, again.status]).toEqual([201, 201]);
    expect(again.body.id).toBe(first.body.id);
    expect(await investigationsIn(projectId)).toBe(before + 1);
    const [row] = await auditOf(first.body.id);
    const claim = idempotencyClaim('investigation.created', key, body);
    expect(row!.metadata).toMatchObject({ idempotency_key_hash: claim.keyHash, request_hash: claim.requestHash });
    expect(JSON.stringify(row!.metadata)).not.toContain(key);
    expect(await auditOf(first.body.id)).toHaveLength(1);

    const audits = await createdAudits();
    const conflict = await create({ projectId, title: 'Something else' }, { 'Idempotency-Key': key });
    expect(conflict.status).toBe(422);
    expect(conflict.body.error.code).toBe('idempotency_conflict');
    expect(await investigationsIn(projectId)).toBe(before + 1);
    expect(await createdAudits()).toBe(audits);
  });

  it('a malformed or repeated Idempotency-Key is 400 and writes nothing', async () => {
    now += 120_000;
    const before = await investigationsIn(projectId);
    for (const k of ['short', 'has space in it', 'x'.repeat(65)]) expect((await create({ projectId, title: 't' }, { 'Idempotency-Key': k })).status).toBe(400);
    expect(await investigationsIn(projectId)).toBe(before);
  });

  it('a replay after the project became invisible is 404, not the old id', async () => {
    now += 120_000;
    const { project: p, source } = await project('create-replay');
    const key = `case-${randomUUID()}`;
    const first = await create({ projectId: p, title: 'Before revoke' }, { 'Idempotency-Key': key });
    expect(first.status).toBe(201);
    await t!.evidence.disconnectSource(t!.ws, t!.owner, source);
    const replay = await create({ projectId: p, title: 'Before revoke' }, { 'Idempotency-Key': key });
    expect(replay.status).toBe(404);
    expect(JSON.stringify(replay.body)).not.toContain(first.body.id);
    expect(await investigationsIn(p)).toBe(1);
  });

  it('the write limit: the 31st case in a minute is 429 with nothing written, and the window resets', async () => {
    now += 120_000;
    const { project: p } = await project('create-limit');
    for (let i = 0; i < 30; i++) expect((await create({ projectId: p, title: `Case ${i}` })).status).toBe(201);
    const refused = await create({ projectId: p, title: 'One too many' });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');
    expect(await investigationsIn(p)).toBe(30);
    now += 60_001;
    expect((await create({ projectId: p, title: 'Next window' })).status).toBe(201);
  });

  it('a body over 32 kB is refused before the repository runs (400 validation_error, no-store), like the evidence writes', async () => {
    now += 120_000;
    const spy = jest.spyOn(EvidenceRepository.prototype, 'createVisibleInvestigation');
    const before = await investigationsIn(projectId);
    const res = await create({ projectId, title: 't', pad: 'x'.repeat(33 * 1024) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(spy).not.toHaveBeenCalled();
    expect(await investigationsIn(projectId)).toBe(before);
    spy.mockRestore();
  });
});

describe('revocation race (repository)', () => {
  it('a revocation committed while the create waits on the grant lock wins: NotVisible, nothing written', async () => {
    const { project: p, source } = await project('create-race');
    const admin = await t!.db.admin.connect();
    try {
      await admin.query('BEGIN');
      await admin.query('UPDATE kawalys.source_grants SET revoked_at = now() WHERE source_id = $1 AND revoked_at IS NULL', [source]);
      const pending = t!.evidence.createVisibleInvestigation(t!.ws, t!.owner, { projectId: p, title: 'Racing' }, null).then(
        () => 'created',
        (e: unknown) => (e instanceof NotVisibleError ? 'not-visible' : e),
      );
      await new Promise((r) => setTimeout(r, 300));
      await admin.query('COMMIT');
      expect(await pending).toBe('not-visible');
    } finally {
      admin.release();
    }
    expect(await investigationsIn(p)).toBe(0);
    void sourceId;
  });
});
