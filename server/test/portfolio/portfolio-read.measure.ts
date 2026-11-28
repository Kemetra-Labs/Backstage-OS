// BACK-49 (c): measures the portfolio read at the list cap. NOT a spec and NOT a CI gate: it is named *.measure.ts so
// the default `testMatch` (**/*.spec.ts) never picks it up. Run it with `npm run measure:portfolio` (needs Docker;
// synthetic data in a disposable local PostgreSQL, nothing else). It records numbers; it asserts only the shape of what
// the read returns (100 projects, not capped, none of the ungranted ones).
//
// Seed (superuser pool, multi-row INSERT ... SELECT): 100 visible projects with one GitHub source each, every source with
// 50 historical reads of 1 repository + 20 pull requests + 20 issues observations (205,000 evidence rows), plus 20
// projects whose source the reader holds no active grant on (they must never be listed or counted).
// Reads under test: the real PortfolioRepository as `kawalys_app` (forced RLS), 30 runs each of the list read
// (listPortfolio) and one detail read (list with a projectId). The pool is wrapped only to count SQL statements.
import { writeFileSync } from 'node:fs';
import type pg from 'pg';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { LATEST_READ, PortfolioRepository, PROJECT_LIMIT } from '../../src/portfolio/portfolio.repository';
import { freshIds, startStore, stopStore, type StoreHarness } from '../db/store-harness';

const VISIBLE = PROJECT_LIMIT;
const UNGRANTED = 20;
const READS_PER_SOURCE = 50;
const PRS = 20;
const ISSUES = 20;
const RUNS = 30;
const WARMUP = 2;
const READ_MINUTES = 15;

const round = (n: number): number => Math.round(n * 10) / 10;
const pct = (sorted: readonly number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
const stats = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { p50: round(pct(s, 0.5)), p95: round(pct(s, 0.95)), min: round(s[0]!), max: round(s[s.length - 1]!) };
};

/** Counts every statement sent on a pooled client; `data` leaves out the transaction and workspace-context ones. */
class CountingPool {
  all = 0;
  data = 0;
  constructor(private readonly real: pg.Pool) {}
  asPool(): pg.Pool {
    return this as unknown as pg.Pool;
  }
  async connect(): Promise<pg.PoolClient> {
    const client = await this.real.connect();
    return new Proxy(client, {
      get: (target, prop, receiver) => {
        if (prop !== 'query') {
          const v = Reflect.get(target, prop, receiver);
          return typeof v === 'function' ? v.bind(target) : v;
        }
        return (...args: unknown[]) => {
          const text = typeof args[0] === 'string' ? args[0] : '';
          this.all += 1;
          if (!/^\s*(BEGIN|COMMIT|ROLLBACK|RESET\b|SELECT set_config)/i.test(text)) this.data += 1;
          return (target.query as (...a: unknown[]) => unknown)(...args);
        };
      },
    });
  }
  reset(): void {
    this.all = 0;
    this.data = 0;
  }
}

async function seed(h: StoreHarness): Promise<{ granted: string[]; ungranted: string[]; rows: number }> {
  const sources: { projectId: string; sourceId: string; granted: boolean }[] = [];
  for (let i = 0; i < VISIBLE + UNGRANTED; i++) {
    const granted = i < VISIBLE;
    const tag = `${granted ? 'bench' : 'nogrant'}-${String(granted ? i : i - VISIBLE).padStart(3, '0')}`;
    const projectId = await h.repo.createProject(h.ws, h.owner, { key: tag, name: `Bench ${tag}` });
    const sourceId = await h.repo.connectSource(h.ws, h.owner, { projectId, provider: 'github', externalRef: `kemetra-labs/${tag}` });
    sources.push({ projectId, sourceId, granted });
  }
  // The owner holds a grant on every source after connect; revoke it on the ungranted ones (a one-way revocation).
  await h.db.admin.query('UPDATE kawalys.source_grants SET revoked_at = now() WHERE user_id = $1 AND source_id = ANY($2::uuid[])', [
    h.owner,
    sources.filter((s) => !s.granted).map((s) => s.sourceId),
  ]);
  const { rows: anchorRows } = await h.db.admin.query<{ a: Date }>(`SELECT date_trunc('second', now()) - interval '2 minutes' AS a`);
  const anchor = anchorRows[0]!.a;
  const perRead = 1 + PRS + ISSUES;
  let rows = 0;
  // One statement per historical read, across every source: about 4,100 rows each (the ungranted ones included, 120 sources).
  for (let r = 0; r < READS_PER_SOURCE; r++) {
    const res = await h.db.admin.query(
      `INSERT INTO kawalys.evidence (workspace_id, project_id, source_id, type, state, source_ref, observed_at, received_at, payload)
       SELECT $1::uuid, s.project_id, s.id, 'Observation', 'ok',
              CASE WHEN k = 0 THEN 'github:' || s.external_ref
                   WHEN k <= $2 THEN 'github:' || s.external_ref || '#pull_request/' || k
                   ELSE 'github:' || s.external_ref || '#issue/' || (k - $2) END,
              t.ts, t.ts,
              CASE WHEN k = 0 THEN jsonb_build_object('kind','repository','fullName',s.external_ref,'defaultBranch','main','archived',false,'private',true,'pushedAt',to_char(t.ts,'YYYY-MM-DD"T"HH24:MI:SS".000Z"'))
                   WHEN k <= $2 THEN jsonb_build_object('kind','pull_request','number',k,'title','Pull request ' || k,'state','open','draft',false,'updatedAt',to_char(t.ts,'YYYY-MM-DD"T"HH24:MI:SS".000Z"'),'url','https://github.com/kemetra-labs/x/pull/' || k)
                   ELSE jsonb_build_object('kind','issue','number',k - $2,'title','Issue ' || (k - $2),'state','open','updatedAt',to_char(t.ts,'YYYY-MM-DD"T"HH24:MI:SS".000Z"'),'url','https://github.com/kemetra-labs/x/issues/' || (k - $2)) END
         FROM kawalys.sources s
         CROSS JOIN generate_series(0, $3::int - 1) AS k
         CROSS JOIN LATERAL (SELECT $4::timestamptz - (($5::int - 1 - $6::int) * interval '${READ_MINUTES} minutes') AS ts) t
        WHERE s.workspace_id = $1::uuid AND s.provider = 'github'`,
      [h.ws, PRS, perRead, anchor, READS_PER_SOURCE, r],
    );
    rows += res.rowCount ?? 0;
  }
  await h.db.admin.query('ANALYZE kawalys.evidence');
  return { granted: sources.filter((s) => s.granted).map((s) => s.sourceId), ungranted: sources.filter((s) => !s.granted).map((s) => s.sourceId), rows };
}

interface Measured {
  readonly ms: ReturnType<typeof stats>;
  readonly statements: number;
  readonly dataStatements: number;
  readonly projects: number;
  readonly capped: boolean | null;
}

async function measure(name: string, counting: CountingPool, run: () => Promise<{ projects: number; capped: boolean | null }>): Promise<Measured> {
  for (let i = 0; i < WARMUP; i++) await run();
  const times: number[] = [];
  let last = { projects: 0, capped: null as boolean | null };
  counting.reset();
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    last = await run();
    times.push(performance.now() - t0);
  }
  process.stdout.write(`[measure] ${name}: ${RUNS} runs done\n`);
  return { ms: stats(times), statements: counting.all / RUNS, dataStatements: counting.data / RUNS, projects: last.projects, capped: last.capped };
}

async function explainLatestRead(h: StoreHarness, userId: string, sourceIds: readonly string[]): Promise<string[]> {
  const rows = await runWithWorkspaceContext(h.db.app, h.ws, async (c) => {
    const res = await c.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS) ${LATEST_READ}`, [userId, sourceIds]);
    return res.rows.map((r) => r['QUERY PLAN']);
  });
  return rows;
}

describe('BACK-49 portfolio read measurement at the cap (not a CI gate)', () => {
  let h: StoreHarness | undefined;
  afterAll(async () => {
    await stopStore(h);
  }, 120_000);

  it('records p50/p95 of the list and one detail read, the statement count, and the latest-read plan', async () => {
    h = await startStore(freshIds());
    const t0 = Date.now();
    const seeded = await seed(h);
    const seedSeconds = round((Date.now() - t0) / 1000);
    const { rows: size } = await h.db.admin.query<{ n: string; t: string; i: string }>(
      `SELECT (SELECT count(*) FROM kawalys.evidence)::text AS n, pg_table_size('kawalys.evidence')::text AS t, pg_indexes_size('kawalys.evidence')::text AS i`,
    );
    const { rows: ver } = await h.db.admin.query<{ v: string }>('SHOW server_version');

    const counting = new CountingPool(h.db.app);
    const repo = new PortfolioRepository(counting.asPool());
    const owner = h.owner;
    const ws = h.ws;
    const detailId = (await h.db.admin.query<{ project_id: string }>('SELECT project_id FROM kawalys.sources WHERE id = $1', [seeded.granted[0]])).rows[0]!.project_id;

    const list = await measure('list', counting, async () => {
      const page = await repo.listPortfolio(ws, owner);
      return { projects: page.projects.length, capped: page.capped };
    });
    const detail = await measure('detail', counting, async () => {
      const projects = await repo.list(ws, owner, { projectId: detailId, withItems: true });
      return { projects: projects.length, capped: null };
    });
    const plan = await explainLatestRead(h, owner, seeded.granted);

    // Shape only: the page is the 100 granted projects, not capped, and never one of the ungranted ones.
    const page = await repo.listPortfolio(ws, owner);
    expect(page.projects).toHaveLength(VISIBLE);
    expect(page.capped).toBe(false);
    expect(page.projects.some((p) => p.key.startsWith('nogrant'))).toBe(false);
    expect(detail.projects).toBe(1);

    const out = {
      measuredAt: new Date().toISOString(),
      node: process.version,
      postgres: ver[0]!.v,
      seed: { visibleProjects: VISIBLE, ungrantedProjects: UNGRANTED, evidenceRows: Number(size[0]!.n), insertedRows: seeded.rows, tableMb: Math.round(Number(size[0]!.t) / 1048576), indexesMb: Math.round(Number(size[0]!.i) / 1048576), seedSeconds },
      runs: RUNS,
      list,
      detail,
      latestReadPlan: plan,
    };
    const md = [
      '| Read | p50 ms | p95 ms | min ms | max ms | SQL statements / request | of which data queries | projects returned | capped |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      `| GET /portfolio (list) | ${list.ms.p50} | ${list.ms.p95} | ${list.ms.min} | ${list.ms.max} | ${list.statements} | ${list.dataStatements} | ${list.projects} | ${list.capped} |`,
      `| GET /portfolio/:id (detail) | ${detail.ms.p50} | ${detail.ms.p95} | ${detail.ms.min} | ${detail.ms.max} | ${detail.statements} | ${detail.dataStatements} | ${detail.projects} | n/a |`,
    ].join('\n');
    process.stdout.write(`\n${md}\n\nEXPLAIN (ANALYZE, BUFFERS) of the latest-read statement (${VISIBLE} sources):\n${plan.join('\n')}\n\n${JSON.stringify(out, null, 2)}\n`);
    if (process.env.MEASURE_OUT) writeFileSync(process.env.MEASURE_OUT, JSON.stringify(out, null, 2));
  }, 3_600_000);
});
