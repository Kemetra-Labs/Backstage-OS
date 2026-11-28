// BACK-155 AC2: the SQL timing experiment. NOT a spec and NOT a CI gate (named *.measure.ts); run it with
// `npm run measure:timing` (needs Docker; synthetic data in a disposable local PostgreSQL). It records numbers and
// asserts only that every case answered "not found".
//
// Threat model: a signed-in reader probes project ids and times the answers, to learn whether a project they
// cannot see exists, holds data, or once granted them access. All four cases below answer the same 404 body; the
// question is whether their timing differs. The route's only data-dependent step for these cases is the memory
// read (readVisible returns null), so that read is what is timed, without the HTTP layer's noise. The route's
// 30 reads per minute per user caps how many samples a real prober gets; that budget is reported, not used here.
//
// Cases, each project holding a large history the reader may not see:
//   missing      a project id that does not exist
//   other-ws     a project in another workspace
//   revoked      a project in the reader's workspace whose grant was revoked
//   no-grant     a project in the reader's workspace, read by a user who holds no grant on it
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { MemoryRepository } from '../../src/memory/memory.repository';
import { freshIds, startStore, stopStore, type StoreHarness } from '../db/store-harness';

const WARMUP = Number(process.env.TIMING_WARMUP ?? 50);
const PER_CASE = Number(process.env.TIMING_SAMPLES ?? 400);
const HISTORY_ROWS = Number(process.env.TIMING_HISTORY_ROWS ?? 200_000);
const READS_PER_MINUTE = 30;

/** Seeded PRNG (mulberry32), so the interleaving is reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedHistory(h: StoreHarness, workspaceId: string, projectId: string, sourceId: string, rows: number): Promise<void> {
  await h.db.admin.query(
    `INSERT INTO kawalys.evidence (workspace_id, project_id, source_id, type, state, source_ref, observed_at, received_at, payload)
     SELECT $1::uuid, $2::uuid, $3::uuid, 'Observation', 'ok', 'github:timing/repo#pull/' || (i % 500), now() - i * interval '1 minute',
            now() - i * interval '1 minute' + interval '1 second',
            jsonb_build_object('kind','pull_request','number',i % 500,'title','PR ' || i,'state','open','draft',false,'updatedAt','2026-11-01T00:00:00.000Z','url','https://github.com/x/' || i)
       FROM generate_series(1, $4::int) AS i`,
    [workspaceId, projectId, sourceId, rows],
  );
}

const pct = (sorted: readonly number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** P(a sample of A exceeds a sample of B), ties counted half: 0.5 means indistinguishable by rank. */
function exceedProbability(a: readonly number[], b: readonly number[]): number {
  let wins = 0;
  for (const x of a) for (const y of b) wins += x > y ? 1 : x === y ? 0.5 : 0;
  return wins / (a.length * b.length);
}

describe('BACK-155 SQL timing experiment (not a CI gate)', () => {
  it('times the not-found read for each hidden-project case', async () => {
    const ids = freshIds();
    const h = await startStore(ids, { provider: 'github', externalRef: 'timing/repo' });
    try {
      const memory = new MemoryRepository(h.db.app);
      // revoked: the harness project, whose only source is disconnected after seeding.
      await seedHistory(h, ids.ws, h.projectId, h.sourceId, HISTORY_ROWS);
      await h.repo.disconnectSource(ids.ws, ids.owner, h.sourceId);
      // no-grant: a project in the reader's workspace with a granted source, read by a user without a grant.
      const noGrantProject = await h.repo.createProject(ids.ws, ids.owner, { key: 'nogrant', name: 'No grant' });
      const noGrantSource = await h.repo.connectSource(ids.ws, ids.owner, { projectId: noGrantProject, provider: 'github', externalRef: 'timing/nogrant' });
      await seedHistory(h, ids.ws, noGrantProject, noGrantSource, HISTORY_ROWS);
      // other-ws: a project in another workspace with a granted source and the same history.
      const otherProject = await h.repo.createProject(ids.otherWs, ids.owner, { key: 'other', name: 'Other' });
      const otherSource = await h.repo.connectSource(ids.otherWs, ids.owner, { projectId: otherProject, provider: 'github', externalRef: 'timing/other' });
      await seedHistory(h, ids.otherWs, otherProject, otherSource, HISTORY_ROWS);
      await h.db.admin.query('ANALYZE kawalys.evidence');

      const cases: Record<string, { userId: string; projectId: string }> = {
        missing: { userId: ids.owner, projectId: randomUUID() },
        'other-ws': { userId: ids.owner, projectId: otherProject },
        revoked: { userId: ids.owner, projectId: h.projectId },
        'no-grant': { userId: ids.stranger, projectId: noGrantProject },
      };
      const names = Object.keys(cases);
      const read = async (name: string): Promise<number> => {
        const c = cases[name]!;
        const a = performance.now();
        const r = await memory.readVisible({ workspaceId: ids.ws, ...c });
        const ms = performance.now() - a;
        if (r !== null) throw new Error(`${name}: expected not found`);
        return ms;
      };

      const rnd = prng(20261128);
      for (let i = 0; i < WARMUP; i += 1) await read(names[Math.floor(rnd() * names.length)]!);
      const order = names.flatMap((n) => Array.from({ length: PER_CASE }, () => n));
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rnd() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const samples: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
      for (const n of order) samples[n]!.push(await read(n));

      const perCase = Object.fromEntries(
        names.map((n) => {
          const s = [...samples[n]!].sort((x, y) => x - y);
          return [n, { n: s.length, p50: r3(pct(s, 0.5)), p95: r3(pct(s, 0.95)), p99: r3(pct(s, 0.99)), min: r3(s[0]!), max: r3(s[s.length - 1]!) }];
        }),
      );
      const pairs: Record<string, number> = {};
      for (let i = 0; i < names.length; i += 1) for (let j = i + 1; j < names.length; j += 1) pairs[`${names[i]} > ${names[j]}`] = r3(exceedProbability(samples[names[i]!]!, samples[names[j]!]!));
      const out = {
        measuredAt: new Date().toISOString(),
        node: process.version,
        historyRowsPerHiddenProject: HISTORY_ROWS,
        warmup: WARMUP,
        samplesPerCase: PER_CASE,
        attackerSamplesPerHourAtRateLimit: READS_PER_MINUTE * 60,
        perCase,
        exceedProbability: pairs,
      };
      process.stdout.write(`\n${JSON.stringify(out, null, 2)}\n`);
      if (process.env.MEASURE_OUT) writeFileSync(process.env.MEASURE_OUT, JSON.stringify(out, null, 2));
    } finally {
      await stopStore(h);
    }
  }, 3_600_000);
});
