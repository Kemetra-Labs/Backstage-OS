// openDatabase refuses unsafe logins before anything is served (BACK-55).
import { openDatabase, POOL_IDLE_TIMEOUT_MS } from '../../src/db/open-database';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from './kawalys-db';

let db: KawalysDb | undefined;

beforeAll(async () => {
  db = await startKawalysDb();
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

describe('openDatabase', () => {
  it('opens both pools when each login passes the runtime role check, with error listeners', async () => {
    const opened = await openDatabase({ appUrl: db!.appUrl, authUrl: db!.authUrl });
    try {
      // A dropped idle connection must not crash the process (unhandled 'error' event).
      expect(opened.appPool.listenerCount('error')).toBeGreaterThan(0);
      expect(opened.authPool.listenerCount('error')).toBeGreaterThan(0);
    } finally {
      await opened.close();
    }
  });

  it('closes idle connections so a serverless database can suspend', async () => {
    const opened = await openDatabase({ appUrl: db!.appUrl, authUrl: db!.authUrl });
    try {
      await opened.appPool.query('select 1');
      await opened.authPool.query('select 1');
      expect(opened.appPool.options.idleTimeoutMillis).toBe(POOL_IDLE_TIMEOUT_MS);
      expect(opened.authPool.options.idleTimeoutMillis).toBe(POOL_IDLE_TIMEOUT_MS);
      expect(POOL_IDLE_TIMEOUT_MS).toBe(10_000);
    } finally {
      await opened.close();
    }
  });

  it('refuses to start when the URLs are swapped', async () => {
    await expect(openDatabase({ appUrl: db!.authUrl, authUrl: db!.appUrl })).rejects.toThrow(/expected role kawalys_app/);
  });
});
