// Global RLS coverage invariant for schema `kawalys` (BACK-55).
// Adapted from Retail Tower services/backend-core/packages/db/__tests__/rls-coverage.invariant.spec.ts
// at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c (Apache-2.0); see server/THIRD_PARTY.md.
// Kawalys changes: scope key `workspace_id` (not tenant_id); every table must be either
// workspace-scoped, the self-keyed `workspaces` table, or on an explicit global list, so a
// new table cannot escape RLS by omitting the column; EVERY expression of EVERY policy must
// be exactly the canonical scope predicate (no `OR true`, no open USING beside a scoped
// WITH CHECK); views, materialized views and foreign tables are refused; no exemption list;
// no Docker-skip switch.
import type pg from 'pg';
import { inRolledBackTx } from './pg-container';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from './kawalys-db';

/** Tables with no workspace scope. Each needs a reason. Accessed only by dedicated roles. */
const GLOBAL_TABLES: Readonly<Record<string, string>> = {
  schema_migrations: 'migration bookkeeping, migrator role only',
  users: 'principal identity exists before any workspace',
  external_identity_links: 'provider identity lookup happens before a workspace is known',
  sessions: 'session lookup happens before a workspace is known',
  owner_binding: 'single-owner binding is resolved at sign-in, before a workspace is known',
};

/** Tables whose own primary key is the workspace id. */
const SELF_KEYED = new Set(['workspaces']);

const canonicalFor = (table: string) =>
  SELF_KEYED.has(table) ? '(id = current_workspace_id())' : '(workspace_id = current_workspace_id())';

interface PolicyRow {
  readonly name: string;
  readonly cmd: string; // '*' all, 'r' select, 'a' insert, 'w' update, 'd' delete
  readonly qual: string | null;
  readonly check: string | null;
}

interface TableRow {
  readonly table: string;
  readonly kind: string;
  readonly hasWorkspaceId: boolean;
  readonly rlsEnabled: boolean;
  readonly rlsForced: boolean;
  readonly policies: PolicyRow[];
}

const TABLES_SQL = `
  SELECT c.relname AS "table", c.relkind::text AS kind,
         EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'workspace_id'
                    AND a.attnum > 0 AND NOT a.attisdropped) AS "hasWorkspaceId",
         c.relrowsecurity AS "rlsEnabled",
         c.relforcerowsecurity AS "rlsForced",
         COALESCE((SELECT json_agg(json_build_object(
                     'name', p.polname, 'cmd', p.polcmd::text,
                     'qual', pg_get_expr(p.polqual, p.polrelid),
                     'check', pg_get_expr(p.polwithcheck, p.polrelid)) ORDER BY p.polname)
                    FROM pg_policy p WHERE p.polrelid = c.oid), '[]'::json) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'kawalys' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
   ORDER BY c.relname`;

async function readTables(client: Pick<pg.PoolClient, 'query'>): Promise<TableRow[]> {
  return (await client.query<TableRow>(TABLES_SQL)).rows;
}

/** The deparsed text depends on the reader's search_path; compare without the schema prefix. */
const normalize = (expr: string) => expr.replace(/\bkawalys\./g, '');

function policyProblems(row: TableRow): string[] {
  const canonical = canonicalFor(row.table);
  const problems: string[] = [];
  for (const p of row.policies) {
    for (const [label, expr] of [
      ['USING', p.qual],
      ['WITH CHECK', p.check],
    ] as const) {
      if (expr !== null && normalize(expr) !== canonical) {
        problems.push(`${row.table}: policy ${p.name} ${label} is not exactly ${canonical}`);
      }
    }
    if (p.cmd !== 'a' && p.qual === null) problems.push(`${row.table}: policy ${p.name} has no USING`);
  }
  return problems;
}

function evaluate(rows: readonly TableRow[]): string[] {
  const problems: string[] = [];
  const names = new Set(rows.map((r) => r.table));
  for (const table of Object.keys(GLOBAL_TABLES)) {
    if (!names.has(table)) problems.push(`stale global entry: ${table} does not exist`);
  }
  for (const row of rows) {
    if (!['r', 'p'].includes(row.kind)) {
      problems.push(`not allowed: ${row.table} is relkind ${row.kind} (views and foreign tables bypass table RLS)`);
      continue;
    }
    if (row.table in GLOBAL_TABLES) {
      if (row.hasWorkspaceId) problems.push(`${row.table}: on the global list but has workspace_id`);
      continue;
    }
    if (!row.hasWorkspaceId && !SELF_KEYED.has(row.table)) {
      problems.push(`unscoped table: ${row.table} has no workspace_id and is not on the global list`);
      continue;
    }
    const gaps = [
      row.rlsEnabled ? null : 'RLS not enabled',
      row.rlsForced ? null : 'RLS not FORCED',
      row.policies.length > 0 ? null : 'no policy',
    ].filter((g): g is string => g !== null);
    if (gaps.length > 0) problems.push(`uncovered table: ${row.table}: ${gaps.join(', ')}`);
    problems.push(...policyProblems(row));
  }
  return problems;
}

let db: KawalysDb | undefined;

beforeAll(async () => {
  db = await startKawalysDb();
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

const evaluateAfter = (ddl: string) =>
  inRolledBackTx(db!.admin, async (c) => {
    await c.query('SET LOCAL search_path TO kawalys, pg_catalog');
    await c.query(ddl);
    return evaluate(await readTables(c));
  });

const SCOPED = 'workspace_id = current_workspace_id()';
const table = (name: string) => `CREATE TABLE ${name} (id uuid PRIMARY KEY, workspace_id uuid NOT NULL);
  ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`;

describe('RLS coverage invariant (schema kawalys)', () => {
  it('holds for the migrated schema', async () => {
    const rows = await readTables(db!.admin);
    // A broken catalog query that matches nothing must not pass.
    expect(rows.map((r) => r.table)).toEqual(expect.arrayContaining(['workspaces', 'memberships', 'audit_events']));
    expect(rows.find((r) => r.table === 'memberships')!.policies.length).toBeGreaterThan(0);
    expect(evaluate(rows)).toEqual([]);
  });

  it('fails for a workspace table created without RLS', async () => {
    expect(await evaluateAfter('CREATE TABLE fx_plain (id uuid PRIMARY KEY, workspace_id uuid NOT NULL)')).toEqual([
      'uncovered table: fx_plain: RLS not enabled, RLS not FORCED, no policy',
    ]);
  });

  it('fails for RLS enabled but not FORCED', async () => {
    expect(
      await evaluateAfter(`CREATE TABLE fx_unforced (id uuid PRIMARY KEY, workspace_id uuid NOT NULL);
        ALTER TABLE fx_unforced ENABLE ROW LEVEL SECURITY;
        CREATE POLICY p ON fx_unforced USING (${SCOPED})`),
    ).toEqual(['uncovered table: fx_unforced: RLS not FORCED']);
  });

  it('fails for RLS forced with no policy', async () => {
    expect(await evaluateAfter(table('fx_nopolicy'))).toEqual(['uncovered table: fx_nopolicy: no policy']);
  });

  it('fails for a policy that does not scope at all', async () => {
    expect(await evaluateAfter(`${table('fx_open')} CREATE POLICY anyone ON fx_open USING (true)`)).toEqual([
      'fx_open: policy anyone USING is not exactly (workspace_id = current_workspace_id())',
    ]);
  });

  it('fails for an open USING beside a scoped WITH CHECK', async () => {
    expect(await evaluateAfter(`${table('fx_half')} CREATE POLICY p ON fx_half USING (true) WITH CHECK (${SCOPED})`)).toEqual([
      'fx_half: policy p USING is not exactly (workspace_id = current_workspace_id())',
    ]);
  });

  it('fails for a scoped predicate widened with OR', async () => {
    expect(await evaluateAfter(`${table('fx_or')} CREATE POLICY p ON fx_or USING (${SCOPED} OR true)`)).toEqual([
      'fx_or: policy p USING is not exactly (workspace_id = current_workspace_id())',
    ]);
  });

  it('fails for an extra permissive policy next to a correct one', async () => {
    expect(
      await evaluateAfter(`${table('fx_extra')} CREATE POLICY p ON fx_extra USING (${SCOPED});
        CREATE POLICY peek ON fx_extra FOR SELECT USING (current_workspace_id() IS NULL OR true)`),
    ).toEqual(['fx_extra: policy peek USING is not exactly (workspace_id = current_workspace_id())']);
  });

  it('fails for a view or materialized view in the schema', async () => {
    expect(await evaluateAfter('CREATE VIEW fx_view AS SELECT id FROM workspaces')).toEqual([
      'not allowed: fx_view is relkind v (views and foreign tables bypass table RLS)',
    ]);
    expect(await evaluateAfter('CREATE MATERIALIZED VIEW fx_mat AS SELECT id FROM workspaces')).toEqual([
      'not allowed: fx_mat is relkind m (views and foreign tables bypass table RLS)',
    ]);
  });

  it('fails for a new table that omits workspace_id and is not on the global list', async () => {
    expect(await evaluateAfter('CREATE TABLE fx_loose (id uuid PRIMARY KEY)')).toEqual([
      'unscoped table: fx_loose has no workspace_id and is not on the global list',
    ]);
  });

  it('fails when the self-keyed workspaces table is scoped by the wrong column', async () => {
    expect(
      await evaluateAfter(`DROP POLICY workspaces_scope ON workspaces;
        CREATE POLICY workspaces_scope ON workspaces USING (owner_user_id IS NOT NULL OR id = current_workspace_id())`),
    ).toEqual(['workspaces: policy workspaces_scope USING is not exactly (id = current_workspace_id())']);
  });

  it('passes for a new table that is scoped, enabled, forced and has a scoped policy', async () => {
    expect(await evaluateAfter(`${table('fx_ok')} CREATE POLICY p ON fx_ok USING (${SCOPED}) WITH CHECK (${SCOPED})`)).toEqual([]);
  });

  it('flags a stale global entry and a global table that gains workspace_id', async () => {
    expect(await evaluateAfter('DROP TABLE sessions')).toEqual(['stale global entry: sessions does not exist']);
    expect(await evaluateAfter('ALTER TABLE sessions ADD COLUMN workspace_id uuid')).toEqual([
      'sessions: on the global list but has workspace_id',
    ]);
  });
});
