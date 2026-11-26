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
import { DECISION_LIMIT_DEFAULT, DECISION_LIMIT_MAX, RefusedError } from '../../src/evidence/evidence.types';
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
    expect(await get({ investigationId: inv }).then((r) => r.body)).toEqual({ items: [], nextCursor: null });
    expect(ids(await get({ limit: String(DECISION_LIMIT_MAX) }))).not.toContain(d);
  });

  it('a user without any grant sees no decisions', async () => {
    const stranger = randomUUID();
    await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [stranger]);
    expect(await evidence.recentDecisions(ws, stranger, { limit: DECISION_LIMIT_MAX })).toEqual({ items: [], nextCursor: null });
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
    expect((await evidence.recentDecisions(otherWs, otherOwner, { limit: 5 })).items.map((d) => d.id)).toEqual([theirs]);
    expect(await get({ investigationId: inv }).then((r) => r.body)).toEqual({ items: [], nextCursor: null });
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
    expect((await get({ investigationId: '00000000-0000-4000-8000-000000000000' })).body).toEqual({ items: [], nextCursor: null });
    expect((await get({ investigationId: 'not-a-uuid' })).body).toEqual({ items: [], nextCursor: null });
    expect((await get({ investigationId: [investigationId, investigationId] })).body).toEqual({ items: [], nextCursor: null });
  });
});

describe('cursor pagination', () => {
  type Page = { items: { id: string; createdAt: string }[]; nextCursor: string | null };
  const page = async (query: Record<string, string | string[]>): Promise<Page> => {
    const res = await get(query);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['items', 'nextCursor']);
    return res.body as Page;
  };
  /** Every page of one query, following nextCursor until it is null. */
  const walk = async (query: Record<string, string>): Promise<{ pages: Page[]; ids: string[] }> => {
    const pages: Page[] = [];
    let cursor: string | null = null;
    do {
      const p = await page(cursor === null ? query : { ...query, cursor });
      pages.push(p);
      cursor = p.nextCursor;
      expect(pages.length).toBeLessThan(200);
    } while (cursor !== null);
    return { pages, ids: pages.flatMap((p) => p.items.map((d) => d.id)) };
  };
  const newInvestigation = (title: string) => evidence.createInvestigation(ws, owner, { projectId, title });
  const decide = (inv: string, decision: string, evidenceIds: string[] = []) =>
    evidence.recordDecision(ws, owner, { investigationId: inv, decision, rationale: 'r', evidenceIds }, null);
  /** `n` decisions in ONE transaction: they share received_at (now() is the transaction time). */
  const decideTied = (inv: string, n: number): Promise<string[]> =>
    runWithWorkspaceContext(db.app, ws, async (c) => {
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO evidence (workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, payload)
           VALUES ($1, $2, NULL, $3, 'HumanDecision', 'ok', 'kawalys:decision', now(), $4::jsonb) RETURNING id`,
          [ws, projectId, inv, JSON.stringify({ decision: `Tied ${i}`, rationale: 'r' })],
        );
        await c.query(
          `INSERT INTO audit_events (workspace_id, actor_user_id, action, target_type, target_id) VALUES ($1, $2, 'decision.recorded', 'evidence', $3)`,
          [ws, owner, rows[0]!.id],
        );
        out.push(rows[0]!.id);
      }
      return out;
    });

  it('walks every page newest first: the pages joined equal one big read, nothing repeated, the last nextCursor null', async () => {
    const inv = await newInvestigation('Paged');
    for (let i = 0; i < 15; i++) await decide(inv, `Paged ${i}`);
    const all = await page({ investigationId: inv, limit: String(DECISION_LIMIT_MAX) });
    expect(all.items).toHaveLength(15);
    expect(all.nextCursor).toBeNull();
    const { pages, ids: walked } = await walk({ investigationId: inv, limit: '4' });
    expect(pages.map((p) => p.items.length)).toEqual([4, 4, 4, 3]);
    expect(pages.slice(0, -1).every((p) => typeof p.nextCursor === 'string' && p.nextCursor.length > 0)).toBe(true);
    expect(walked).toEqual(all.items.map((d) => d.id));
    expect(new Set(walked).size).toBe(15);
  });

  it('exactly `limit` decisions answer one page with nextCursor null, and no decisions answer an empty page', async () => {
    const inv = await newInvestigation('Exact');
    for (let i = 0; i < 3; i++) await decide(inv, `Exact ${i}`);
    const p = await page({ investigationId: inv, limit: '3' });
    expect(p.items).toHaveLength(3);
    expect(p.nextCursor).toBeNull();
    expect(await page({ investigationId: await newInvestigation('None') })).toEqual({ items: [], nextCursor: null });
  });

  it('pages across decisions with the same timestamp one at a time, skipping and repeating none', async () => {
    const inv = await newInvestigation('Tied');
    const before = await decide(inv, 'Before the tie');
    const tied = await decideTied(inv, 5);
    const after = await decide(inv, 'After the tie');
    const all = await page({ investigationId: inv, limit: String(DECISION_LIMIT_MAX) });
    expect(new Set(all.items.slice(1, 6).map((d) => d.createdAt)).size).toBe(1);
    const { ids: walked } = await walk({ investigationId: inv, limit: '1' });
    expect(walked).toEqual(all.items.map((d) => d.id));
    expect(walked[0]).toBe(after);
    expect(walked.at(-1)).toBe(before);
    expect(walked.slice(1, 6).sort()).toEqual([...tied].sort());
    const { ids: byTwo } = await walk({ investigationId: inv, limit: '2' });
    expect(byTwo).toEqual(walked);
  });

  it('keeps microseconds in the cursor: decisions in the same millisecond page one at a time, none skipped', async () => {
    const inv = await newInvestigation('Same millisecond');
    // The application never sets received_at; only an operator insert can place rows microseconds apart on purpose.
    const sameMs = await runWithWorkspaceContext(db.admin, ws, async (c) => {
      const out: string[] = [];
      for (const at of ['2026-11-20T10:00:00.123100Z', '2026-11-20T10:00:00.123400Z', '2026-11-20T10:00:00.123700Z']) {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO kawalys.evidence (workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, received_at, payload)
           VALUES ($1, $2, NULL, $3, 'HumanDecision', 'ok', 'kawalys:decision', $4, $4, '{"decision":"d","rationale":"r"}') RETURNING id`,
          [ws, projectId, inv, at],
        );
        await c.query(`INSERT INTO kawalys.audit_events (workspace_id, actor_user_id, action, target_type, target_id) VALUES ($1, $2, 'decision.recorded', 'evidence', $3)`, [
          ws,
          owner,
          rows[0]!.id,
        ]);
        out.push(rows[0]!.id);
      }
      return out;
    });
    const { ids: walked } = await walk({ investigationId: inv, limit: '1' });
    expect(walked).toEqual([...sameMs].reverse());
  });

  it('walks the whole unfiltered list (decisions microseconds apart in separate transactions) exactly once', async () => {
    const expected = await runWithWorkspaceContext(db.app, ws, async (c) =>
      (await c.query<{ n: string }>(`SELECT count(*) AS n FROM evidence WHERE type = 'HumanDecision'`)).rows[0]!.n,
    );
    // Every decision in this workspace is visible to the owner here (the hidden ones above were in their own projects).
    const visible = (await page({ limit: String(DECISION_LIMIT_MAX) })).items.map((d) => d.id);
    const { ids: walked } = await walk({ limit: '7' });
    expect(new Set(walked).size).toBe(walked.length);
    expect(walked.slice(0, visible.length)).toEqual(visible);
    expect(walked.length).toBeGreaterThan(DECISION_LIMIT_MAX);
    expect(walked.length).toBeLessThanOrEqual(Number(expected));
    const { ids: byHundred } = await walk({ limit: String(DECISION_LIMIT_MAX) });
    expect(byHundred).toEqual(walked);
  }, 120_000);

  it('applies visibility on every page: a decision hidden after page 1 is absent from page 2, nothing visible is skipped', async () => {
    const project = await evidence.createProject(ws, owner, { key: 'paged-visibility', name: 'Paged visibility' });
    await evidence.connectSource(ws, owner, { projectId: project, provider: 'github', externalRef: 'kemetra-labs/paged-kept' });
    const lost = await evidence.connectSource(ws, owner, { projectId: project, provider: 'github', externalRef: 'kemetra-labs/paged-lost' });
    const inv = await evidence.createInvestigation(ws, owner, { projectId: project, title: 'Paged visibility' });
    const cited = await observe(lost, inv, 'github:kemetra-labs/paged-lost#pull/1');
    const oldest = await decide(inv, 'Oldest');
    const hidden = await decide(inv, 'Cites lost', [cited]);
    const second = await decide(inv, 'Second');
    const newest = await decide(inv, 'Newest');
    const first = await page({ investigationId: inv, limit: '1' });
    expect(first.items.map((d) => d.id)).toEqual([newest]);
    await evidence.disconnectSource(ws, owner, lost);
    const rest: string[] = [];
    let cursor = first.nextCursor;
    while (cursor !== null) {
      const p = await page({ investigationId: inv, limit: '1', cursor });
      rest.push(...p.items.map((d) => d.id));
      cursor = p.nextCursor;
    }
    expect(rest).toEqual([second, oldest]);
    expect(rest).not.toContain(hidden);
  });

  it('a malformed or repeated cursor is a 400 validation_error, never a silent first page', async () => {
    const inv = await newInvestigation('Bad cursors');
    for (let i = 0; i < 3; i++) await decide(inv, `Bad ${i}`);
    const good = (await page({ investigationId: inv, limit: '1' })).nextCursor!;
    const json = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const decoded = JSON.parse(Buffer.from(good, 'base64url').toString('utf8')) as Record<string, unknown>;
    const { v: _v, ...noVersion } = decoded;
    const bad: (string | string[])[] = [
      '',
      'abc',
      'not base64!',
      `${good}=`,
      ` ${good}`,
      [good, good],
      json('x'),
      json([]),
      json(null),
      json(noVersion),
      json({ ...decoded, v: 2 }),
      json({ ...decoded, extra: 1 }),
      json({ ...decoded, t: '2026-13-40T25:61:61.000000Z' }),
      json({ ...decoded, t: '2026-02-30T10:00:00.000000Z' }),
      json({ ...decoded, t: 'yesterday' }),
      json({ ...decoded, id: 'not-a-uuid' }),
      'A'.repeat(2000),
    ];
    for (const cursor of bad) {
      const res = await get({ investigationId: inv, limit: '1', cursor });
      expect({ cursor, status: res.status }).toEqual({ cursor, status: 400 });
      expect(res.body.error.code).toBe('validation_error');
    }
  });

  it('a foreign cursor is a 400: issued for another investigation, for no filter, or for another user', async () => {
    const a = await newInvestigation('Cursor A');
    const b = await newInvestigation('Cursor B');
    for (let i = 0; i < 2; i++) {
      await decide(a, `A ${i}`);
      await decide(b, `B ${i}`);
    }
    const fromA = (await page({ investigationId: a, limit: '1' })).nextCursor!;
    const unfiltered = (await page({ limit: '1' })).nextCursor!;
    for (const query of [
      { investigationId: b, cursor: fromA },
      { cursor: fromA },
      { investigationId: a, cursor: unfiltered },
      { investigationId: a.toUpperCase(), cursor: unfiltered },
      { investigationId: [a, a], cursor: fromA },
    ]) {
      const res = await get({ limit: '1', ...query });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    }
    // An empty filter is not "no filter": the unfiltered cursor does not fit it.
    expect((await get({ limit: '1', investigationId: '', cursor: unfiltered })).status).toBe(400);
    // The same cursor still works for the query it was issued for, whatever the case of the filter.
    expect((await page({ investigationId: a, limit: '1', cursor: fromA })).items).toHaveLength(1);
    expect((await page({ investigationId: a.toUpperCase(), limit: '1', cursor: fromA })).items).toHaveLength(1);
    // Another workspace: the owner of another workspace cannot use it, even for an investigation id of the same text.
    const otherOwner = randomUUID();
    const otherWs = randomUUID();
    await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [otherOwner]);
    await runWithWorkspaceContext(db.app, otherWs, async (c) => {
      await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [otherWs, otherOwner]);
      await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [otherWs, otherOwner]);
    });
    await expect(evidence.recentDecisions(otherWs, otherOwner, { investigationId: a, limit: 1, cursor: fromA })).rejects.toBeInstanceOf(RefusedError);
    await expect(evidence.recentDecisions(otherWs, owner, { investigationId: a, limit: 1, cursor: fromA })).rejects.toBeInstanceOf(RefusedError);
    const stranger = randomUUID();
    await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [stranger]);
    await expect(evidence.recentDecisions(ws, stranger, { investigationId: a, limit: 1, cursor: fromA })).rejects.toBeInstanceOf(RefusedError);
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
