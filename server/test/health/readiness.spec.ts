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

interface DbApp {
  db: KawalysDb;
  appPool: pg.Pool;
  authPool: pg.Pool;
  app: INestApplication;
}

/** Registers beforeAll/afterAll that start a disposable database (migrated or not) and the app on it. */
function useDbApp(options: { migrate?: boolean } = {}): DbApp {
  const ctx = {} as DbApp;
  const saved: Record<string, string | undefined> = {};
  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    ctx.db = await startKawalysDb(options);
    ctx.appPool = new pg.Pool({ connectionString: ctx.db.appUrl, max: 2 });
    ctx.authPool = new pg.Pool({ connectionString: ctx.db.authUrl, max: 2 });
    ctx.app = await createApp([], {}, { database: { appPool: ctx.appPool, authPool: ctx.authPool } });
  }, 120_000);
  afterAll(async () => {
    await ctx.app?.close().catch(() => undefined);
    await Promise.all([ctx.appPool, ctx.authPool].map((p) => p?.end().catch(() => undefined)));
    await stopKawalysDb(ctx.db);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }, 60_000);
  return ctx;
}

describe('GET /health (database)', () => {
  const t = useDbApp();

  it('answers 200 ready:true with no cookie, with exactly service and ready', async () => {
    const res = await request(t.app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ service: 'kawalys-bff', ready: true });
    expect(Object.keys(res.body).sort()).toEqual(['ready', 'service']);
  });

  it('answers 503 within 5 s once the pools cannot reach the database', async () => {
    await t.appPool.end();
    await t.authPool.end();
    const started = Date.now();
    const res = await request(t.app.getHttpServer()).get('/health');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ service: 'kawalys-bff', ready: false });
  });
});

describe('GET /health (provisioned but not migrated)', () => {
  const t = useDbApp({ migrate: false });

  it('answers 503 while the schema is missing, then 200 once migrated', async () => {
    const before = await request(t.app.getHttpServer()).get('/health');
    expect(before.status).toBe(503);
    expect(before.body).toEqual({ service: 'kawalys-bff', ready: false });
    await runMigrations(t.db.migrator, MIGRATIONS_DIR);
    const after = await request(t.app.getHttpServer()).get('/health');
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

describe('GET /health (wrong runtime password)', () => {
  const saved: Record<string, string | undefined> = {};
  let db: KawalysDb;
  let badApp: pg.Pool;
  let goodAuth: pg.Pool;
  let app: INestApplication;

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    db = await startKawalysDb();
    const wrong = new URL(db.appUrl);
    wrong.password = 'not-the-real-password';
    badApp = new pg.Pool({ connectionString: wrong.toString(), max: 2 });
    badApp.on('error', () => undefined);
    goodAuth = new pg.Pool({ connectionString: db.authUrl, max: 2 });
    goodAuth.on('error', () => undefined);
    app = await createApp([], {}, { database: { appPool: badApp, authPool: goodAuth } });
  }, 120_000);
  afterAll(async () => {
    await app?.close().catch(() => undefined);
    await Promise.all([badApp, goodAuth].map((p) => p?.end().catch(() => undefined)));
    await stopKawalysDb(db);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }, 60_000);

  it('answers 503 ready:false with only service and ready', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ service: 'kawalys-bff', ready: false });
  });

  it('openDatabase refuses to start with a wrong runtime password', async () => {
    const { openDatabase } = await import('../../src/db/open-database');
    const wrong = new URL(db.appUrl);
    wrong.password = 'not-the-real-password';
    await expect(openDatabase({ appUrl: wrong.toString(), authUrl: db.authUrl })).rejects.toThrow();
  });
});
