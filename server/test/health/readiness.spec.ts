import { jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../../src/create-app';
import { runMigrations } from '../../src/db/migrate';
import { MIGRATIONS_DIR, startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';

const ENV = { KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001', KAWALYS_OWNER_SUBJECT: 'owner-subject' };

describe('GET /health (no database)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('answers 503 ready:false, with only service and ready', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ service: 'kawalys-bff', ready: false });
  });
});

describe('GET /health (database)', () => {
  let db: KawalysDb;
  let appPool: pg.Pool;
  let authPool: pg.Pool;
  let app: INestApplication;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    db = await startKawalysDb();
    appPool = new pg.Pool({ connectionString: db.appUrl, max: 2 });
    authPool = new pg.Pool({ connectionString: db.authUrl, max: 2 });
    app = await createApp([], {}, { database: { appPool, authPool } });
  }, 120_000);

  afterAll(async () => {
    await app?.close().catch(() => undefined);
    await Promise.all([appPool, authPool].map((p) => p?.end().catch(() => undefined)));
    await stopKawalysDb(db);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }, 60_000);

  it('answers 200 ready:true with no cookie, with exactly service and ready', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ service: 'kawalys-bff', ready: true });
    expect(Object.keys(res.body).sort()).toEqual(['ready', 'service']);
  });

  it('answers 503 within 5 s once the pools cannot reach the database', async () => {
    await appPool.end();
    await authPool.end();
    const started = Date.now();
    const res = await request(app.getHttpServer()).get('/health');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ service: 'kawalys-bff', ready: false });
  });
});

describe('GET /health (provisioned but not migrated)', () => {
  let db: KawalysDb;
  let appPool: pg.Pool;
  let authPool: pg.Pool;
  let app: INestApplication;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    db = await startKawalysDb({ migrate: false });
    appPool = new pg.Pool({ connectionString: db.appUrl, max: 2 });
    authPool = new pg.Pool({ connectionString: db.authUrl, max: 2 });
    app = await createApp([], {}, { database: { appPool, authPool } });
  }, 120_000);

  afterAll(async () => {
    await app?.close().catch(() => undefined);
    await Promise.all([appPool, authPool].map((p) => p?.end().catch(() => undefined)));
    await stopKawalysDb(db);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }, 60_000);

  it('answers 503 while the schema is missing, then 200 once migrated', async () => {
    const before = await request(app.getHttpServer()).get('/health');
    expect(before.status).toBe(503);
    expect(before.body).toEqual({ service: 'kawalys-bff', ready: false });
    await runMigrations(db.migrator, MIGRATIONS_DIR);
    const after = await request(app.getHttpServer()).get('/health');
    expect(after.status).toBe(200);
    expect(after.body).toEqual({ service: 'kawalys-bff', ready: true });
  });
});

describe('GET /health (hung database)', () => {
  const saved: Record<string, string | undefined> = {};
  let app: INestApplication;
  const hungApp = { query: jest.fn(() => new Promise<never>(() => undefined)) };
  const hungAuth = { query: jest.fn(() => new Promise<never>(() => undefined)) };

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    app = await createApp([], {}, { database: { appPool: hungApp as unknown as pg.Pool, authPool: hungAuth as unknown as pg.Pool } });
  });
  afterAll(async () => {
    await app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('answers 503 in about 2 s and issues no second query while one is outstanding', async () => {
    const started = Date.now();
    const [a, b] = await Promise.all([request(app.getHttpServer()).get('/health'), request(app.getHttpServer()).get('/health')]);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(1500);
    expect(elapsed).toBeLessThan(3000);
    for (const res of [a, b]) {
      expect(res.status).toBe(503);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({ service: 'kawalys-bff', ready: false });
    }
    expect(hungApp.query).toHaveBeenCalledTimes(1);
    expect(hungAuth.query).toHaveBeenCalledTimes(1);
    // Many later calls over more than another 2 s: still no new query (the first one never settled).
    await new Promise((r) => setTimeout(r, 2200));
    for (let i = 0; i < 4; i++) {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(503);
    }
    expect(hungApp.query).toHaveBeenCalledTimes(1);
    expect(hungAuth.query).toHaveBeenCalledTimes(1);
  }, 20_000);
});
