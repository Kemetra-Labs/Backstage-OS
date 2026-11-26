// COG-02 S3 (BACK-105): measures the S2 memory read at pilot scale and at 180 days of 15-minute polls.
// NOT a spec and NOT a CI gate: it is named *.measure.ts so the default `testMatch` (**/*.spec.ts) never
// picks it up. Run it with `npm run measure:memory` (needs Docker; synthetic data in a disposable local
// PostgreSQL, nothing else). It records numbers; it asserts only that the read returns something.
//
// What is measured, per scenario, on the reader's own path (kawalys_app, forced RLS, one statement):
//   sql      MemoryRepository.readCollapsed(): round trip + execution + parsing of the returned rows
//   project  projectCollapsed() over that result (pure, in memory)
//   total    sql + project, i.e. MemoryRepository.read()
// plus EXPLAIN (ANALYZE, BUFFERS) of the same statement once (server-side time, buffers, temp spill),
// the number and size of the returned rows, and the table size. Seeded through the superuser pool with
// generate_series (the app role cannot set received_at); rows satisfy every constraint and trigger.
import { writeFileSync } from 'node:fs';
import type pg from 'pg';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { HISTORY_CAP } from '../../src/memory/memory.policy';
import { projectCollapsed } from '../../src/memory/memory.projector';
import { MemoryRepository } from '../../src/memory/memory.repository';
import { ITEM_KIND_LIST, MEMORY_READ_SQL } from '../../src/memory/memory.sql';
import { freshIds, startStore, stopStore, type StoreHarness } from '../db/store-harness';

const POLL_MINUTES = 15;
const POLLS_PER_DAY = (24 * 60) / POLL_MINUTES;

interface Scenario {
  readonly name: string;
  readonly description: string;
  readonly days: number;
  /** A polled item is edited once every `editEveryPolls` polls (96 = daily, 16 = every 4 h). */
  readonly editEveryPolls: number;
  /** A second workspace with the same volume, so the reader's rows are a fraction of the table. */
  readonly noiseWorkspace: boolean;
  readonly counts: { readonly prs: number; readonly issues: number; readonly jira: number; readonly confluence: number };
}

const PILOT = { prs: 30, issues: 50, jira: 20, confluence: 20 } as const;
const ALL_SCENARIOS: readonly Scenario[] = [
  { name: 'pilot-7d', description: '1 repo + 1 Jira project + 1 space, 7 days, items edited daily', days: 7, editEveryPolls: 96, noiseWorkspace: false, counts: PILOT },
  { name: 'retention-180d', description: 'same sources, 180 days, items edited daily, plus a noise workspace of equal volume', days: 180, editEveryPolls: 96, noiseWorkspace: true, counts: PILOT },
  { name: 'retention-180d-hot', description: 'same, but every item is edited every 4 hours (many runs per item)', days: 180, editEveryPolls: 16, noiseWorkspace: true, counts: PILOT },
];

const ITERATIONS = Number(process.env.MEASURE_ITERATIONS ?? 20);
const WARMUP = 2;
const CHUNK_POLLS = 500;
const ISO = (r: string) => `to_char(timestamp '2026-01-01' + ${r} * interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"')`;

const GH_ROOT = 'github:kemetra-labs/backstage-os';
const ATLASSIAN_HOST = 'kemetra-synthetic.atlassian.net';

interface Series {
  readonly source: 'github' | 'jira' | 'confluence';
  readonly items: number;
  readonly ref: string;
  readonly payload: string;
}

/** SQL expressions over `i` (item number) and `r` (revision number of that item at that poll). */
function seriesFor(c: Scenario['counts']): Series[] {
  return [
    { source: 'github', items: 1, ref: `'${GH_ROOT}'`, payload: `jsonb_build_object('kind','repository','fullName','Kemetra-Labs/Backstage-OS','defaultBranch','main','archived',false,'private',true,'pushedAt','2026-11-24T09:00:00.000Z')` },
    { source: 'github', items: c.prs, ref: `'${GH_ROOT}#pull/' || i`, payload: `jsonb_build_object('kind','pull_request','number',i,'title','PR ' || i,'state','open','draft',false,'updatedAt',${ISO('r')},'url','https://github.com/x/' || i)` },
    { source: 'github', items: c.issues, ref: `'${GH_ROOT}#issue/' || (1000 + i)`, payload: `jsonb_build_object('kind','issue','number',1000 + i,'title','Issue ' || i,'state','open','updatedAt',${ISO('r')},'url','https://github.com/x/' || i)` },
    { source: 'github', items: 1, ref: `'${GH_ROOT}#pulls'`, payload: `jsonb_build_object('kind','list_page','endpoint','pull_requests','returned',${c.prs},'pageSize',30)` },
    { source: 'github', items: 1, ref: `'${GH_ROOT}#issues'`, payload: `jsonb_build_object('kind','list_page','endpoint','issues','returned',${c.issues},'pageSize',30)` },
    { source: 'jira', items: c.jira, ref: `'jira:BACK#issue/BACK-' || i`, payload: `jsonb_build_object('kind','jira_issue','key','BACK-' || i,'summary','Synthetic BACK-' || i,'statusCategory','indeterminate','updatedAt',${ISO('r')},'url','https://${ATLASSIAN_HOST}/browse/BACK-' || i)` },
    { source: 'confluence', items: c.confluence, ref: `'confluence:ENG#page/' || (100 + i)`, payload: `jsonb_build_object('kind','confluence_page','pageId',(100 + i)::text,'title','Page ' || i,'spaceKey','ENG','lastModified',${ISO('r')},'version',r + 1,'url',null)` },
  ];
}

interface Seeded {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly sourceIds: Readonly<Record<'github' | 'jira' | 'confluence', string>>;
  readonly rows: number;
}

/** One anchor for every series of every workspace: the newest poll, 2 minutes before the seed started. A per-statement now() would shift the series against each other. */
async function seedAnchor(h: StoreHarness): Promise<Date> {
  const { rows } = await h.db.admin.query<{ a: Date }>(`SELECT date_trunc('second', now()) - interval '2 minutes' AS a`);
  return rows[0]!.a;
}

async function seedWorkspace(h: StoreHarness, s: Scenario, anchor: Date, workspaceId: string, projectId: string, sourceIds: Seeded['sourceIds']): Promise<Seeded> {
  const polls = s.days * POLLS_PER_DAY;
  let rows = 0;
  for (const series of seriesFor(s.counts)) {
    for (let from = 0; from < polls; from += CHUNK_POLLS) {
      const to = Math.min(polls, from + CHUNK_POLLS) - 1;
      const res = await h.db.admin.query(
        `INSERT INTO kawalys.evidence (workspace_id, project_id, source_id, type, state, source_ref, observed_at, received_at, payload)
         SELECT $1::uuid, $2::uuid, $3::uuid, 'Observation', 'ok', ${series.ref}, t.ts, t.ts + interval '1 second', ${series.payload}
           FROM generate_series($4::int, $5::int) AS p,
                generate_series(1, $6::int) AS i,
                LATERAL (SELECT $9::timestamptz - (($7::int - 1 - p) * interval '${POLL_MINUTES} minutes') AS ts) t,
                LATERAL (SELECT (p + (i * 7) % $8::int) / $8::int AS r) rv`,
        [workspaceId, projectId, sourceIds[series.source], from, to, series.items, polls, s.editEveryPolls, anchor],
      );
      rows += res.rowCount ?? 0;
    }
  }
  return { workspaceId, projectId, sourceIds, rows };
}

async function connectAll(h: StoreHarness, workspaceId: string, projectId: string): Promise<Seeded['sourceIds']> {
  const connect = (provider: 'github' | 'jira' | 'confluence', externalRef: string) => h.repo.connectSource(workspaceId, h.owner, { projectId, provider, externalRef });
  return {
    github: await connect('github', 'kemetra-labs/backstage-os'),
    jira: await connect('jira', ATLASSIAN_HOST),
    confluence: await connect('confluence', ATLASSIAN_HOST),
  };
}

const pct = (sorted: readonly number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
const stats = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { p50: round(pct(s, 0.5)), p95: round(pct(s, 0.95)), max: round(s[s.length - 1]!), min: round(s[0]!) };
};
const round = (n: number): number => Math.round(n * 10) / 10;

interface PlanSummary {
  readonly executionMs: number;
  readonly planningMs: number;
  readonly sharedHitBlocks: number;
  readonly sharedReadBlocks: number;
  readonly tempWrittenBlocks: number;
  readonly sortSpilledToDisk: boolean;
}

async function explain(h: StoreHarness, s: Seeded, userId: string, workMem?: string): Promise<PlanSummary> {
  const [row] = await runWithWorkspaceContext(h.db.app, s.workspaceId, async (c) => {
    // Diagnostic only: the transaction-local setting is not applied by the production read.
    if (workMem) await c.query(`SET LOCAL work_mem = '${workMem}'`);
    const res = await c.query<{ 'QUERY PLAN': Record<string, unknown>[] }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${MEMORY_READ_SQL}`, [userId, s.projectId, null, ITEM_KIND_LIST, [], []]);
    return res.rows;
  });
  const top = row!['QUERY PLAN'][0] as { Plan: Record<string, number>; 'Execution Time': number; 'Planning Time': number };
  const text = JSON.stringify(row);
  return {
    executionMs: round(top['Execution Time']),
    planningMs: round(top['Planning Time']),
    sharedHitBlocks: top.Plan['Shared Hit Blocks'] ?? 0,
    sharedReadBlocks: top.Plan['Shared Read Blocks'] ?? 0,
    tempWrittenBlocks: top.Plan['Temp Written Blocks'] ?? 0,
    sortSpilledToDisk: text.includes('"Sort Space Type":"Disk"') || text.includes('external merge'),
  };
}

async function sizes(admin: pg.Pool): Promise<{ evidenceRows: number; tableMb: number; indexesMb: number }> {
  const { rows } = await admin.query<{ n: string; t: string; i: string }>(
    `SELECT (SELECT count(*) FROM kawalys.evidence)::text AS n, pg_table_size('kawalys.evidence')::text AS t, pg_indexes_size('kawalys.evidence')::text AS i`,
  );
  return { evidenceRows: Number(rows[0]!.n), tableMb: Math.round(Number(rows[0]!.t) / 1048576), indexesMb: Math.round(Number(rows[0]!.i) / 1048576) };
}

async function runScenario(s: Scenario): Promise<Record<string, unknown>> {
  const ids = freshIds();
  const h = await startStore(ids, { provider: 'github', externalRef: 'kemetra-labs/backstage-os' });
  try {
    const t0 = Date.now();
    const projectSources = { ...(await connectAll(h, ids.ws, h.projectId)) };
    // startStore already connected the GitHub source: connectSource is idempotent per (provider, ref).
    const anchor = await seedAnchor(h);
    const reader = await seedWorkspace(h, s, anchor, ids.ws, h.projectId, projectSources);
    let noiseRows = 0;
    if (s.noiseWorkspace) {
      const noiseProject = await h.repo.createProject(ids.otherWs, ids.owner, { key: 'noise', name: 'Noise' });
      const noiseSources = await connectAll(h, ids.otherWs, noiseProject);
      noiseRows = (await seedWorkspace(h, s, anchor, ids.otherWs, noiseProject, noiseSources)).rows;
    }
    await h.db.admin.query('ANALYZE kawalys.evidence');
    const seedSeconds = round((Date.now() - t0) / 1000);
    const table = await sizes(h.db.admin);

    const memory = new MemoryRepository(h.db.app);
    const q = { workspaceId: ids.ws, userId: ids.owner, projectId: h.projectId };
    for (let i = 0; i < WARMUP; i += 1) await memory.read(q);

    const sql: number[] = [];
    const project: number[] = [];
    const total: number[] = [];
    let shape: Record<string, unknown> = {};
    for (let i = 0; i < ITERATIONS; i += 1) {
      const a = performance.now();
      const read = await memory.readCollapsed(q);
      const b = performance.now();
      const projection = projectCollapsed(read.input, {
        effectiveAt: read.now,
        knownAt: read.knownAt,
        evaluationAt: read.now,
        now: read.now,
        activeGrantIds: read.activeGrantIds,
        sources: read.sources,
      });
      const c = performance.now();
      sql.push(b - a);
      project.push(c - b);
      total.push(c - a);
      if (i === 0) {
        const byStatus: Record<string, number> = {};
        const byReason: Record<string, number> = {};
        for (const item of projection.items) {
          byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
          const key = `${item.kind}:${item.status}:${item.reason ?? '-'}`;
          byReason[key] = (byReason[key] ?? 0) + 1;
        }
        shape = {
          items: projection.items.length,
          byStatus,
          byReason,
          runRowsReturned: read.input.runs.length,
          markerRowsReturned: read.input.markers.length,
          resultJsonKb: Math.round(JSON.stringify(read.input).length / 1024),
          historyReturned: projection.items.reduce((n, item) => n + item.history.length, 0),
          historyCap: HISTORY_CAP,
        };
      }
    }
    const plan = await explain(h, reader, ids.owner);
    const planWorkMem256 = await explain(h, reader, ids.owner, '256MB');
    if (Number(shape.items ?? 0) === 0) throw new Error(`${s.name}: the read returned no items; the seed is wrong`);
    return { scenario: s.name, description: s.description, readerRows: reader.rows, noiseRows, seedSeconds, table, shape, iterations: ITERATIONS, ms: { sql: stats(sql), project: stats(project), total: stats(total) }, plan, planWorkMem256 };
  } finally {
    await stopStore(h);
  }
}

function markdown(results: readonly Record<string, unknown>[]): string {
  const lines = ['| scenario | reader rows | table rows | table+index MB | runs returned | JSON KB | total p50 ms | total p95 ms | sql p95 ms | project p95 ms | server exec ms | temp blocks written |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const r of results) {
    const ms = r.ms as Record<string, { p50: number; p95: number }>;
    const shape = r.shape as { runRowsReturned: number; resultJsonKb: number };
    const table = r.table as { evidenceRows: number; tableMb: number; indexesMb: number };
    const plan = r.plan as PlanSummary;
    lines.push(`| ${String(r.scenario)} | ${String(r.readerRows)} | ${table.evidenceRows} | ${table.tableMb + table.indexesMb} | ${shape.runRowsReturned} | ${shape.resultJsonKb} | ${ms.total!.p50} | ${ms.total!.p95} | ${ms.sql!.p95} | ${ms.project!.p95} | ${plan.executionMs} | ${plan.tempWrittenBlocks} |`);
  }
  return lines.join('\n');
}

describe('COG-02 S3 memory read measurement (not a CI gate)', () => {
  const wanted = (process.env.MEASURE_SCENARIOS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const scenarios = ALL_SCENARIOS.filter((s) => wanted.length === 0 || wanted.includes(s.name));

  it('records p50/p95 of the S2 statement per scenario', async () => {
    expect(scenarios.length).toBeGreaterThan(0);
    const results: Record<string, unknown>[] = [];
    for (const s of scenarios) {
      process.stdout.write(`\n[measure] ${s.name}: seeding and measuring...\n`);
      results.push(await runScenario(s));
    }
    const out = { measuredAt: new Date().toISOString(), node: process.version, iterations: ITERATIONS, results };
    process.stdout.write(`\n${markdown(results)}\n\n${JSON.stringify(out, null, 2)}\n`);
    if (process.env.MEASURE_OUT) writeFileSync(process.env.MEASURE_OUT, JSON.stringify(out, null, 2));
  }, 3_600_000);
});
