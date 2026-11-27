import { jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../../src/create-app';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';

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

describe('GET /health (hung database)', () => {
  const saved: Record<string, string | undefined> = {};
  let app: INestApplication;
  const hung = { query: jest.fn(() => new Promise<never>(() => undefined)) };

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    const pool = hung as unknown as pg.Pool;
    app = await createApp([], {}, { database: { appPool: pool, authPool: pool } });
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
    expect(hung.query).toHaveBeenCalledTimes(1);
    await request(app.getHttpServer()).get('/health');
    expect(hung.query).toHaveBeenCalledTimes(1);
  });
});
