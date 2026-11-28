// BACK-108 (COG-05) D7: the episode and lesson tables. Security-negative tests as `kawalys_app`
// (NOSUPERUSER, NOBYPASSRLS): forced workspace RLS, composite keys that cannot point into another
// workspace or project, append-only rows, and the lesson version chain shape. Needs Docker.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { sqlState } from '../db/pg-container';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { approve, fromStored, MIN_EPISODES, readLesson, rollback, type LessonRow, type StoredLesson } from '../../src/learning/learning.core';
import { basisOf, cands, failures, rowsOrThrow } from './learning.fixture';

let db: KawalysDb | undefined;
const userA = randomUUID();
const userB = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const HASH = 'a'.repeat(64);

interface Seeded {
  project: string;
  otherProject: string;
  evidence: string;
  otherProjectEvidence: string;
}
const seeded: Record<string, Seeded> = {};

const inWs = <T>(ws: string, work: (c: pg.PoolClient) => Promise<T>) => runWithWorkspaceContext(db!.app, ws, work);
const errOf = (p: Promise<unknown>) => p.then(() => undefined).catch((e: unknown) => sqlState(e));

async function seed(ws: string, user: string): Promise<Seeded> {
  return inWs(ws, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [ws, user]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, user]);
    const project = (await c.query(`INSERT INTO projects (workspace_id, key, name) VALUES ($1, 'p1', 'P1') RETURNING id`, [ws])).rows[0].id as string;
    const otherProject = (await c.query(`INSERT INTO projects (workspace_id, key, name) VALUES ($1, 'p2', 'P2') RETURNING id`, [ws])).rows[0].id as string;
    const evidenceIn = async (projectId: string, ref: string) => {
      const source = (await c.query(`INSERT INTO sources (workspace_id, project_id, provider, external_ref) VALUES ($1, $2, 'github', $3) RETURNING id`, [ws, projectId, ref])).rows[0].id;
      return (
        await c.query(
          `INSERT INTO evidence (workspace_id, project_id, source_id, type, state, source_ref, observed_at, payload)
           VALUES ($1, $2, $3, 'Observation', 'ok', 'github:o/r#pull/1', now(), '{}') RETURNING id`,
          [ws, projectId, source],
        )
      ).rows[0].id as string;
    };
    return { project, otherProject, evidence: await evidenceIn(project, `o/${ws.slice(0, 8)}-a`), otherProjectEvidence: await evidenceIn(otherProject, `o/${ws.slice(0, 8)}-b`) };
  });
}

const episode = (c: pg.PoolClient, ws: string, project: string) =>
  c.query(
    `INSERT INTO learning_episodes (workspace_id, project_id, applicability_key, outcome, label)
     VALUES ($1, $2, 'jira_issue|reasoning-v3', 'failure', 'observation') RETURNING id`,
    [ws, project],
  );
const lesson = (c: pg.PoolClient, ws: string, project: string, version: number, previous: string | null, extra: { content?: string; hash?: string } = {}) =>
  c.query(
    `INSERT INTO learning_lessons (workspace_id, project_id, applicability_key, version, previous_hash, kind, reviewer_user_id, content, hash)
     VALUES ($1, $2, 'jira_issue|reasoning-v3', $3, $4, 'approved', $5, $6::jsonb, $7) RETURNING id`,
    [ws, project, version, previous, ws === wsA ? userA : userB, extra.content ?? '{"outcome":"failure"}', extra.hash ?? HASH],
  );

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1), ($2)', [userA, userB]);
  seeded[wsA] = await seed(wsA, userA);
  seeded[wsB] = await seed(wsB, userB);
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

describe('learning tables: workspace isolation as kawalys_app', () => {
  it('an episode and its citations are visible in their workspace only', async () => {
    const a = seeded[wsA]!;
    await inWs(wsA, async (c) => {
      const id = (await episode(c, wsA, a.project)).rows[0].id;
      await c.query(`INSERT INTO learning_episode_citations (workspace_id, project_id, episode_id, evidence_id, role) VALUES ($1, $2, $3, $4, 'outcome')`, [wsA, a.project, id, a.evidence]);
    });
    const counts = async (ws: string) =>
      inWs(ws, async (c) => (await c.query('SELECT (SELECT count(*) FROM learning_episodes) AS e, (SELECT count(*) FROM learning_episode_citations) AS c')).rows[0]);
    expect(await counts(wsA)).toEqual({ e: '1', c: '1' });
    expect(await counts(wsB)).toEqual({ e: '0', c: '0' });
  });

  it('sees nothing without a workspace context (fail closed)', async () => {
    const { rows } = await db!.app.query('SELECT (SELECT count(*) FROM learning_episodes) AS e, (SELECT count(*) FROM learning_lessons) AS l');
    expect(rows[0]).toEqual({ e: '0', l: '0' });
  });

  it('refuses an episode or lesson written into another workspace', async () => {
    const b = seeded[wsB]!;
    expect(await errOf(inWs(wsA, (c) => episode(c, wsB, b.project)))).toBe('42501');
    expect(await errOf(inWs(wsA, (c) => lesson(c, wsB, b.project, 1, null)))).toBe('42501');
  });

  it('refuses a citation of evidence in another project or another workspace', async () => {
    const a = seeded[wsA]!;
    const b = seeded[wsB]!;
    const cite = (evidenceId: string) =>
      inWs(wsA, async (c) => {
        const id = (await episode(c, wsA, a.project)).rows[0].id;
        await c.query(`INSERT INTO learning_episode_citations (workspace_id, project_id, episode_id, evidence_id, role) VALUES ($1, $2, $3, $4, 'decision')`, [wsA, a.project, id, evidenceId]);
      });
    expect(await errOf(cite(a.otherProjectEvidence))).toBe('23503');
    expect(await errOf(cite(b.evidence))).toBe('23503');
    const citeLesson = (evidenceId: string) =>
      inWs(wsA, async (c) => {
        const id = (await lesson(c, wsA, a.project, 1, null, { hash: 'b'.repeat(64) })).rows[0].id;
        await c.query(`INSERT INTO learning_lesson_citations (workspace_id, project_id, lesson_id, evidence_id) VALUES ($1, $2, $3, $4)`, [wsA, a.project, id, evidenceId]);
      });
    expect(await errOf(citeLesson(a.otherProjectEvidence))).toBe('23503');
    expect(await errOf(citeLesson(b.evidence))).toBe('23503');
  });
});

describe('references the independent migration review asked for', () => {
  it('a citation cannot point at an episode of another workspace', async () => {
    const b = seeded[wsB]!;
    const otherEpisode = await inWs(wsB, async (c) => (await episode(c, wsB, b.project)).rows[0].id as string);
    const a = seeded[wsA]!;
    const attempt = inWs(wsA, (c) =>
      c.query(`INSERT INTO learning_episode_citations (workspace_id, project_id, episode_id, evidence_id, role) VALUES ($1, $2, $3, $4, 'outcome')`, [wsA, a.project, otherEpisode, a.evidence]),
    );
    expect(await errOf(attempt)).toBe('23503');
  });

  it('a lesson reviewer must be a member of the lesson workspace', async () => {
    // userB exists, but is not a member of wsA.
    const attempt = inWs(wsA, (c) =>
      c.query(
        `INSERT INTO learning_lessons (workspace_id, project_id, applicability_key, version, previous_hash, kind, reviewer_user_id, content, hash)
         VALUES ($1, $2, 'member|reasoning-v3', 1, NULL, 'approved', $3, '{}', $4)`,
        [wsA, seeded[wsA]!.project, userB, 'd'.repeat(64)],
      ),
    );
    expect(await errOf(attempt)).toBe('23503');
  });
});

describe('learning tables are append-only', () => {
  it.each(['learning_episodes', 'learning_episode_citations', 'learning_lessons', 'learning_lesson_citations'])('%s refuses UPDATE and DELETE', async (table) => {
    for (const sql of [`UPDATE ${table} SET workspace_id = workspace_id`, `DELETE FROM ${table}`]) {
      expect(await errOf(inWs(wsA, (c) => c.query(sql)))).toBe('42501');
    }
  });

  it('a superuser cannot change a lesson either', async () => {
    const err = await db!.admin.query('UPDATE kawalys.learning_lessons SET kind = kind').catch((e: unknown) => sqlState(e));
    expect(err).toBe('42501');
  });
});

describe('lesson version chain shape', () => {
  const key = (n: number) => `k${n}|reasoning-v3`;
  const insert = (version: number, previous: string | null, k: string, extra: { content?: string; hash?: string } = {}) =>
    inWs(wsA, (c) =>
      c.query(
        `INSERT INTO learning_lessons (workspace_id, project_id, applicability_key, version, previous_hash, kind, reviewer_user_id, content, hash)
         VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7::jsonb, $8)`,
        [wsA, seeded[wsA]!.project, k, version, previous, userA, extra.content ?? '{}', extra.hash ?? 'c'.repeat(64)],
      ),
    );

  it('version 1 has no previous hash; a later version must cite one', async () => {
    expect(await errOf(insert(1, HASH, key(1)))).toBe('23514');
    expect(await errOf(insert(2, null, key(2)))).toBe('23514');
  });

  it('one row per version of a lesson', async () => {
    await insert(1, null, key(3));
    expect(await errOf(insert(1, null, key(3)))).toBe('23505');
  });

  it('content must be a JSON object and the hash a sha-256 hex digest', async () => {
    expect(await errOf(insert(1, null, key(4), { content: '[]' }))).toBe('23514');
    expect(await errOf(insert(1, null, key(5), { hash: 'not-a-hash' }))).toBe('23514');
  });
});

// Read and write path requirements (cog-05-decisions.md): the chain is verified in src, so a chain the
// pure core wrote must read back from the database and verify, and a tampered stored row must not.
describe('a stored lesson chain re-verifies in src', () => {
  const eps = failures(MIN_EPISODES).map((e) => ({ ...e, applicabilityKey: 'stored|reasoning-v3' }));

  const write = (rows: readonly LessonRow[], content = (r: LessonRow) => JSON.stringify(r.content)) =>
    inWs(wsA, async (c) => {
      for (const r of rows) {
        await c.query(
          `INSERT INTO learning_lessons (workspace_id, project_id, applicability_key, version, previous_hash, kind, reviewer_user_id, content, hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
          [wsA, seeded[wsA]!.project, r.content.applicabilityKey, r.version, r.previous, r.kind, r.reviewer, content(r), r.hash],
        );
      }
    });
  const scope = () => ({ workspaceId: wsA, projectId: seeded[wsA]!.project });
  const readBack = (key: string) =>
    inWs(wsA, async (c) =>
      (
        await c.query(
          `SELECT workspace_id, project_id, version, previous_hash, kind, reviewer_user_id, applicability_key, content, hash
           FROM learning_lessons WHERE applicability_key = $1 AND project_id = $2 ORDER BY version DESC`,
          [key, seeded[wsA]!.project],
        )
      ).rows as StoredLesson[],
    );

  it('approve, approve and rollback, written as kawalys_app, read back as the same verified lesson', async () => {
    const owner = { reviewer: userA, owner: userA };
    const cand = cands(eps)[0]!;
    const v1 = rowsOrThrow(approve([], cand, { ...owner, at: '2026-11-27T12:00:00Z', expiresAt: '2027-01-01T00:00:00Z' }, basisOf(eps)));
    const v2 = rowsOrThrow(approve(v1, cand, { ...owner, at: '2026-11-28T12:00:00Z', expiresAt: '2027-02-01T00:00:00Z' }, basisOf(eps)));
    const v3 = rowsOrThrow(rollback(v2, { ...owner, toVersion: 1 }));
    await write(v3);
    const rows = fromStored(await readBack('stored|reasoning-v3'), scope());
    expect(rows).toEqual(v3);
    expect(readLesson(rows!, basisOf(eps), '2026-12-01T00:00:00Z')).toMatchObject({ state: 'approved', version: 3, outcome: 'failure' });
  });

  it('a stored row whose content no longer matches its hash reads as an invalid chain', async () => {
    const key = 'tampered|reasoning-v3';
    const tampered = eps.map((e) => ({ ...e, applicabilityKey: key }));
    const v1 = rowsOrThrow(approve([], cands(tampered)[0]!, { reviewer: userA, owner: userA, at: '2026-11-27T12:00:00Z', expiresAt: '2027-01-01T00:00:00Z' }, basisOf(tampered)));
    await write(v1, (r) => JSON.stringify({ ...r.content, outcome: 'success' }));
    const rows = fromStored(await readBack(key), scope());
    expect(readLesson(rows!, basisOf(tampered), '2026-12-01T00:00:00Z')).toEqual({ state: 'invalid-chain' });
  });
});

describe('owner-only review (O5) rests on the owner-only membership role', () => {
  // A lesson reviewer must be a member (foreign key), and today every member is the owner. If the
  // membership role is ever widened, this fails, and the write path must then check the reviewer
  // against workspaces.owner_user_id itself before COG-05 can be activated.
  it('a membership other than owner is refused', async () => {
    const attempt = inWs(wsA, (c) => c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [wsA, userB]));
    expect(await errOf(attempt)).toBe('23514');
  });
});
