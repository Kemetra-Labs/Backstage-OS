import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../src/db/migrate';
import { startPgContainer, stopPgContainer, type PgContainer } from './pg-container';

let env: PgContainer | undefined;
let dir = '';

beforeAll(async () => {
  env = await startPgContainer();
  await env.admin.query('CREATE SCHEMA kawalys');
}, 180_000);

afterAll(async () => {
  await stopPgContainer(env);
}, 60_000);

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kw-mig-'));
  await env!.admin.query('DROP SCHEMA kawalys CASCADE; CREATE SCHEMA kawalys');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, sql: string) => writeFileSync(join(dir, name), sql);
const tableExists = async (name: string) =>
  (await env!.admin.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`kawalys.${name}`])).rows[0].ok as boolean;

describe('runMigrations', () => {
  it('applies files in name order into the kawalys schema and records them', async () => {
    write('0002_b.sql', 'CREATE TABLE b (id int REFERENCES a(id));');
    write('0001_a.sql', 'CREATE TABLE a (id int PRIMARY KEY);');
    write('README.md', 'not a migration');

    expect(await runMigrations(env!.admin, dir)).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(await tableExists('a')).toBe(true);
    expect(await tableExists('b')).toBe(true);
    const { rows } = await env!.admin.query('SELECT name FROM kawalys.schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(['0001_a.sql', '0002_b.sql']);
  });

  it('is idempotent: a second run applies nothing', async () => {
    write('0001_a.sql', 'CREATE TABLE a (id int PRIMARY KEY);');
    await runMigrations(env!.admin, dir);
    expect(await runMigrations(env!.admin, dir)).toEqual([]);
  });

  it('rolls a failing migration back completely and does not record it', async () => {
    write('0001_a.sql', 'CREATE TABLE a (id int PRIMARY KEY);');
    write('0002_bad.sql', 'CREATE TABLE half (id int); SELECT * FROM no_such_table;');

    await expect(runMigrations(env!.admin, dir)).rejects.toThrow(/0002_bad\.sql/);
    expect(await tableExists('a')).toBe(true);
    expect(await tableExists('half')).toBe(false);
    const { rows } = await env!.admin.query('SELECT name FROM kawalys.schema_migrations');
    expect(rows.map((r) => r.name)).toEqual(['0001_a.sql']);
  });

  it('refuses to run when an applied migration was edited afterwards', async () => {
    write('0001_a.sql', 'CREATE TABLE a (id int PRIMARY KEY);');
    await runMigrations(env!.admin, dir);
    write('0001_a.sql', 'CREATE TABLE a (id bigint PRIMARY KEY);');

    await expect(runMigrations(env!.admin, dir)).rejects.toThrow(/0001_a\.sql.*checksum/);
  });

  it('treats CRLF and LF line endings as the same migration (Windows vs Linux checkouts)', async () => {
    write('0001_a.sql', 'CREATE TABLE a (id int PRIMARY KEY);\r\nCREATE TABLE c (id int);\r\n');
    await runMigrations(env!.admin, dir);
    write('0001_a.sql', 'CREATE TABLE a (id int PRIMARY KEY);\nCREATE TABLE c (id int);\n');
    expect(await runMigrations(env!.admin, dir)).toEqual([]);
  });

  it('refuses a .sql file whose name does not follow NNNN_name.sql', async () => {
    write('add-table.sql', 'CREATE TABLE x (id int);');
    await expect(runMigrations(env!.admin, dir)).rejects.toThrow(/add-table\.sql/);
    expect(await tableExists('x')).toBe(false);
  });
});
