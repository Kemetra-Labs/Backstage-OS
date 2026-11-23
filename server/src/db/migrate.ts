// Minimal SQL migration runner (BACK-55). Kawalys-owned BUILD: no migration library.
// - Files named NNNN_name.sql in one directory, applied in name order into schema `kawalys`.
// - Each file runs in its own transaction with its record; a failure rolls the whole file back.
// - A session advisory lock serialises concurrent runners.
// - An applied file whose content changed (sha256) stops the run: migrations are append-only.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';

const NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const LOCK_KEY = 'kawalys.schema_migrations';

export async function runMigrations(pool: pg.Pool, dir: string): Promise<string[]> {
  const files = listMigrationFiles(dir);
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
    try {
      await client.query(
        `CREATE TABLE IF NOT EXISTS kawalys.schema_migrations (
           name text PRIMARY KEY,
           checksum text NOT NULL,
           applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      const applied = await readApplied(client);
      const done: string[] = [];
      for (const file of files) {
        // Normalise line endings: a Windows (CRLF) and a Linux (LF) checkout are the same file.
        const sql = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const previous = applied.get(file);
        if (previous !== undefined) {
          if (previous !== checksum) throw new Error(`migration ${file}: checksum differs from the applied version`);
          continue;
        }
        await applyOne(client, file, sql, checksum);
        done.push(file);
      }
      return done;
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

function listMigrationFiles(dir: string): string[] {
  const sqlFiles = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const bad = sqlFiles.filter((f) => !NAME.test(f));
  if (bad.length > 0) throw new Error(`migration file name must match NNNN_name.sql: ${bad.join(', ')}`);
  return sqlFiles;
}

async function readApplied(client: pg.PoolClient): Promise<Map<string, string>> {
  const { rows } = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM kawalys.schema_migrations',
  );
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

async function applyOne(client: pg.PoolClient, file: string, sql: string, checksum: string): Promise<void> {
  await client.query('BEGIN');
  try {
    // New objects go to the first schema that exists in the path; pg_catalog is never a target.
    // Run through a DIRECT connection: the session advisory lock is meaningless behind a
    // transaction-mode pooler (for example Neon's pooled endpoint).
    await client.query('SET LOCAL search_path TO kawalys, pg_catalog');
    await client.query(sql);
    await client.query('INSERT INTO kawalys.schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // The file name only: never echo SQL text or connection details.
    throw new Error(`migration ${file} failed`, { cause: err });
  }
}
