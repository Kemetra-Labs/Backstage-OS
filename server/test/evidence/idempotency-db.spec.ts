// BACK-172 G3: optional Idempotency-Key on the two write routes, stored in the audit row's metadata (owner
// decision H(a)). Real PostgreSQL only (disposable Docker). The repository tests drive recordDecision and
// recordNote with the claim the controller would build; the HTTP tests cover the header and the 422 mapping.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { EvidenceRepository, type DecisionInput, type NoteInput } from '../../src/evidence/evidence.repository';
import { IdempotencyConflictError, NotVisibleError } from '../../src/evidence/evidence.types';
import { idempotencyClaim, parseIdempotencyKey } from '../../src/evidence/idempotency';
import { evidenceCount, expectNotFound, startOwnerApp, type OwnerApp } from '../db/owner-app';
import { approveAll } from './approve-all-policy';

let t: OwnerApp | undefined;
let evidence: EvidenceRepository;
let ws = '';
let owner = '';
let projectId = '';
let sourceId = '';
let investigationId = '';
let obs = '';

const server = () => t!.app.getHttpServer();
const key = () => `key-${randomUUID()}`;
const decision = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  investigationId,
  decision: `decide ${randomUUID()}`,
  rationale: 'because',
  evidenceIds: [obs],
  ...over,
});
const note = (over: Partial<NoteInput> = {}): NoteInput => ({ investigationId, type: 'Hypothesis', text: `note ${randomUUID()}`, evidenceIds: [obs], ...over });

const decide = (input: DecisionInput, k: string, as = owner, repo = evidence) =>
  repo.recordDecision(ws, as, input, null, { idempotency: idempotencyClaim('decision.recorded', k, input) });
const jot = (input: NoteInput, k: string, as = owner, repo = evidence) =>
  repo.recordNote(ws, as, input, null, { idempotency: idempotencyClaim('note.recorded', k, input) });

const auditRows = (id: string) =>
  runWithWorkspaceContext(t!.db.app, ws, async (c) =>
    (await c.query<{ action: string; metadata: Record<string, unknown> }>('SELECT action, metadata FROM audit_events WHERE target_id = $1', [id])).rows,
  );
const auditCountForKey = (k: string, action: string) =>
  runWithWorkspaceContext(t!.db.app, ws, async (c) =>
    Number(
      (
        await c.query<{ n: string }>(`SELECT count(*) AS n FROM audit_events WHERE action = $1 AND metadata->>'idempotency_key_hash' = $2`, [
          action,
          idempotencyClaim(action as 'decision.recorded', k, decision()).keyHash,
        ])
      ).rows[0]!.n,
    ),
  );

/** A fresh project, source, investigation and one observation, so a test can revoke or count in isolation. */
async function world(tag: string) {
  const p = await evidence.createProject(ws, owner, { key: tag, name: tag });
  const s = await evidence.connectSource(ws, owner, { projectId: p, provider: 'github', externalRef: `kemetra-labs/${tag}` });
  const inv = await evidence.createInvestigation(ws, owner, { projectId: p, title: tag });
  const [o] = (await evidence.ingest(ws, [
    { sourceId: s, investigationId: inv, type: 'Observation', state: 'ok', sourceRef: `github:kemetra-labs/${tag}#pull/1`, observedAt: new Date(), payload: {} },
  ])) as [string];
  return { projectId: p, sourceId: s, investigationId: inv, obs: o };
}

beforeAll(async () => {
  t = await startOwnerApp();
  ({ evidence, ws, owner } = t);
  ({ projectId, sourceId, investigationId, obs } = await world('idem'));
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

describe('helpers', () => {
  it('parses the header: absent is fine, 8-64 of [A-Za-z0-9-] passes, anything else is a 400', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
    expect(parseIdempotencyKey('abcdefgh')).toBe('abcdefgh');
    expect(parseIdempotencyKey('a'.repeat(64))).toBe('a'.repeat(64));
    for (const bad of ['', 'short', 'a'.repeat(65), 'has space here', 'under_score1', 'semi;colon1', ['abcdefgh', 'abcdefgh']]) {
      expect(() => parseIdempotencyKey(bad as string)).toThrow();
    }
  });

  it('hashes the key with its action and the request canonically (stable, order-insensitive for citations)', () => {
    const a = idempotencyClaim('decision.recorded', 'abcdefgh', decision({ decision: 'x', evidenceIds: [obs, investigationId] }));
    const b = idempotencyClaim('decision.recorded', 'abcdefgh', decision({ decision: 'x', evidenceIds: [investigationId.toUpperCase(), obs] }));
    expect(a).toEqual(b);
    expect(a.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(idempotencyClaim('note.recorded', 'abcdefgh', note()).keyHash).not.toBe(a.keyHash);
    expect(idempotencyClaim('decision.recorded', 'abcdefgh', decision({ decision: 'y' })).requestHash).not.toBe(idempotencyClaim('decision.recorded', 'abcdefgh', decision({ decision: 'x' })).requestHash);
  });
});

describe('decisions', () => {
  it('the same key and body twice: one decision, one audit row, the same id, hashes only in metadata', async () => {
    const k = key();
    const input = decision();
    const first = await decide(input, k);
    const second = await decide(input, k);
    expect(second).toBe(first);
    const rows = await auditRows(first);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toEqual({ idempotency_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/), request_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.stringify(rows[0]!.metadata)).not.toContain(k);
    expect(await auditCountForKey(k, 'decision.recorded')).toBe(1);
  });

  it('the same key with a different body is a conflict and writes nothing', async () => {
    const k = key();
    await decide(decision(), k);
    const before = await evidenceCount(t!.db, ws, investigationId);
    await expect(decide(decision(), k)).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(await evidenceCount(t!.db, ws, investigationId)).toBe(before);
    expect(await auditCountForKey(k, 'decision.recorded')).toBe(1);
  });

  it('without a key it behaves as before: two identical bodies are two decisions', async () => {
    const input = decision();
    const a = await evidence.recordDecision(ws, owner, input, null);
    const b = await evidence.recordDecision(ws, owner, input, null);
    expect(b).not.toBe(a);
    expect((await auditRows(a))[0]!.metadata).toEqual({});
  });

  it('concurrent requests with one key (two connections, start barrier, 10 rounds) write exactly one decision', async () => {
    for (let round = 0; round < 10; round++) {
      const k = key();
      const input = decision();
      let release!: () => void;
      const barrier = new Promise<void>((r) => (release = r));
      const run = async () => {
        await barrier;
        return decide(input, k);
      };
      const both = Promise.all([run(), run()]);
      release();
      const [a, b] = await both;
      expect(a).toBe(b);
      expect(await auditCountForKey(k, 'decision.recorded')).toBe(1);
      expect(await auditRows(a)).toHaveLength(1);
    }
  });

  it('a replay after the cited source was revoked answers NotVisible (no id), and writes nothing', async () => {
    const w = await world('idem-revoke');
    const k = key();
    const input = decision({ investigationId: w.investigationId, evidenceIds: [w.obs] });
    const first = await decide(input, k);
    await evidence.disconnectSource(ws, owner, w.sourceId);
    const before = await evidenceCount(t!.db, ws, w.investigationId);
    await expect(decide(input, k)).rejects.toBeInstanceOf(NotVisibleError);
    expect(await evidenceCount(t!.db, ws, w.investigationId)).toBe(before);
    expect(await auditRows(first)).toHaveLength(1);
  });

  it("another principal's key never matches: same key and body by another user is its own decision", async () => {
    const other = randomUUID();
    await t!.db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [other]);
    await t!.db.admin.query('INSERT INTO kawalys.source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [ws, sourceId, other]);
    const k = key();
    const input = decision();
    const mine = await decide(input, k);
    const theirs = await decide(input, k, other);
    expect(theirs).not.toBe(mine);
    expect(await decide(input, k, other)).toBe(theirs);
    expect(await auditCountForKey(k, 'decision.recorded')).toBe(2);
  });

  it('a key older than the window does not match (window injected as 1 s; audit rows cannot be backdated)', async () => {
    const short = new EvidenceRepository(t!.db.app, approveAll(), undefined, 1);
    const k = key();
    const input = decision();
    const first = await decide(input, k, owner, short);
    expect(await decide(input, k, owner, short)).toBe(first);
    await new Promise((r) => setTimeout(r, 1500));
    const later = await decide(input, k, owner, short);
    expect(later).not.toBe(first);
  });

  it('the same key string on a note and on a decision are independent (the key hash carries the action)', async () => {
    const k = key();
    const d = await decide(decision(), k);
    const n = await jot(note(), k);
    expect(n).not.toBe(d);
  });
});

describe('workspace isolation and ordering (BACK-172 review)', () => {
  /** A second workspace with its own owner, project, source, investigation and one observation (created by the admin and the app role). */
  async function otherWorkspace(tag: string, alsoGrant: string | null) {
    const user = randomUUID();
    const w2 = randomUUID();
    await t!.db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [user]);
    await runWithWorkspaceContext(t!.db.app, w2, async (c) => {
      await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [w2, user]);
      await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [w2, user]);
    });
    const p = await evidence.createProject(w2, user, { key: tag, name: tag });
    const s = await evidence.connectSource(w2, user, { projectId: p, provider: 'github', externalRef: `kemetra-labs/${tag}` });
    const inv = await evidence.createInvestigation(w2, user, { projectId: p, title: tag });
    const [o] = (await evidence.ingest(w2, [
      { sourceId: s, investigationId: inv, type: 'Observation', state: 'ok', sourceRef: `github:kemetra-labs/${tag}#pull/1`, observedAt: new Date(), payload: {} },
    ])) as [string];
    if (alsoGrant) await t!.db.admin.query('INSERT INTO kawalys.source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [w2, s, alsoGrant]);
    return { user, ws: w2, investigationId: inv, obs: o };
  }

  it("the same key from another workspace's owner never replays or conflicts with the first workspace's decision", async () => {
    const k = key();
    const mine = await decide(decision({ decision: 'shared text' }), k);
    const w2 = await otherWorkspace('idem-ws2', null);
    const input = decision({ investigationId: w2.investigationId, evidenceIds: [w2.obs], decision: 'shared text' });
    const theirs = await evidence.recordDecision(w2.ws, w2.user, input, null, { idempotency: idempotencyClaim('decision.recorded', k, input) });
    expect(theirs).not.toBe(mine);
    // And the same key replays inside the second workspace only.
    expect(await evidence.recordDecision(w2.ws, w2.user, input, null, { idempotency: idempotencyClaim('decision.recorded', k, input) })).toBe(theirs);
    expect(await auditRows(mine)).toHaveLength(1);
  });

  it('the same ACTOR and key in another workspace is still isolated by row-level security alone (no conflict, no replay)', async () => {
    const k = key();
    const mine = await decide(decision(), k);
    const w2 = await otherWorkspace('idem-ws2-actor', owner); // the owner holds a grant there, so the write itself is allowed
    const input = decision({ investigationId: w2.investigationId, evidenceIds: [w2.obs] });
    const theirs = await evidence.recordDecision(w2.ws, owner, input, null, { idempotency: idempotencyClaim('decision.recorded', k, input) });
    expect(theirs).not.toBe(mine);
  });

  it('a different body gets the 422 conflict first, even after a revocation (it only reveals the caller\'s own write); the same body is re-authorized and answers NotVisible', async () => {
    const w = await world('idem-order');
    const k = key();
    const input = decision({ investigationId: w.investigationId, evidenceIds: [w.obs] });
    const first = await decide(input, k);
    await expect(decide(decision({ investigationId: w.investigationId, evidenceIds: [w.obs] }), k)).rejects.toBeInstanceOf(IdempotencyConflictError);
    await evidence.disconnectSource(ws, owner, w.sourceId);
    await expect(decide(decision({ investigationId: w.investigationId, evidenceIds: [w.obs] }), k)).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(decide(input, k)).rejects.toBeInstanceOf(NotVisibleError);
    expect(await auditRows(first)).toHaveLength(1);
    expect(await auditCountForKey(k, 'decision.recorded')).toBe(1);
  });

  it('a conflict check does not weaken a later replay: the same body still answers the first id while it stays visible', async () => {
    const k = key();
    const input = decision();
    const first = await decide(input, k);
    await expect(decide(decision(), k)).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(await decide(input, k)).toBe(first);
  });
});

describe('notes', () => {
  it('the same key and body twice: one note, one audit row, the same id; a different body conflicts', async () => {
    const k = key();
    const input = note();
    const first = await jot(input, k);
    expect(await jot(input, k)).toBe(first);
    expect(await auditRows(first)).toHaveLength(1);
    await expect(jot(note(), k)).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('a replay after the cited source was revoked answers NotVisible', async () => {
    const w = await world('idem-note-revoke');
    const k = key();
    const input = note({ investigationId: w.investigationId, evidenceIds: [w.obs] });
    await jot(input, k);
    await evidence.disconnectSource(ws, owner, w.sourceId);
    await expect(jot(input, k)).rejects.toBeInstanceOf(NotVisibleError);
  });

  it('concurrent requests with one key write exactly one note', async () => {
    const k = key();
    const input = note();
    const [a, b] = await Promise.all([jot(input, k), jot(input, k)]);
    expect(a).toBe(b);
    expect(await auditCountForKey(k, 'note.recorded')).toBe(1);
  });
});

describe('over HTTP', () => {
  const post = (path: string, body: object, k?: string | string[]) => {
    const r = request(server()).post(path).set('Cookie', t!.cookie);
    if (k !== undefined) r.set('Idempotency-Key', k as string);
    return r.send(body);
  };
  const dPath = () => `/investigations/${investigationId}/decisions`;

  it('the same key and body twice is 201 with the same id; a different body is 422 idempotency_conflict with no-store', async () => {
    const k = key();
    const body = { decision: `http ${randomUUID()}`, rationale: 'r', evidenceIds: [obs] };
    const first = await post(dPath(), body, k);
    const second = await post(dPath(), body, k);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.id).toBe(first.body.id);
    expect(await auditRows(first.body.id)).toHaveLength(1);
    const conflict = await post(dPath(), { ...body, decision: 'other' }, k);
    expect(conflict.status).toBe(422);
    expect(conflict.body.error.code).toBe('idempotency_conflict');
    expect(conflict.body.error.request_id).toBe(conflict.headers['x-request-id']);
    expect(conflict.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(conflict.body)).not.toContain(first.body.id);
  });

  it('a malformed key is a 400 and writes nothing', async () => {
    const before = await evidenceCount(t!.db, ws, investigationId);
    for (const bad of ['short', 'a'.repeat(65), 'has space here', 'under_score1']) {
      const res = await post(dPath(), { decision: 'x', rationale: 'r', evidenceIds: [] }, bad);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    }
    expect(await evidenceCount(t!.db, ws, investigationId)).toBe(before);
  });

  it('notes take the key too', async () => {
    const k = key();
    const body = { type: 'Correlation', text: `http note ${randomUUID()}`, evidenceIds: [obs] };
    const path = `/investigations/${investigationId}/notes`;
    const first = await post(path, body, k);
    const second = await post(path, body, k);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.id).toBe(first.body.id);
    expect((await post(path, { ...body, text: 'different' }, k)).status).toBe(422);
  });

  it('a replay after revocation is the uniform 404 and never returns the id', async () => {
    const w = await world('idem-http-revoke');
    const k = key();
    const body = { decision: 'http revoke', rationale: 'r', evidenceIds: [w.obs] };
    const path = `/investigations/${w.investigationId}/decisions`;
    const first = await post(path, body, k);
    expect(first.status).toBe(201);
    await evidence.disconnectSource(ws, owner, w.sourceId);
    const replay = await post(path, body, k);
    expectNotFound(replay);
    expect(replay.text).not.toContain(first.body.id);
  });

});
