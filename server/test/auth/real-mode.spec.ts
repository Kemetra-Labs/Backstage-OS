// Real-mode wiring refuses unsafe database logins before serving (BACK-56).
import { buildRealModeDeps } from '../../src/real-mode';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';

let db: KawalysDb | undefined;
const closers: Array<() => Promise<void>> = [];

beforeAll(async () => {
  db = await startKawalysDb();
}, 180_000);

afterAll(async () => {
  await Promise.all(closers.map((c) => c()));
  await stopKawalysDb(db);
}, 60_000);

const config = (app: string, auth: string) => ({
  databaseUrlApp: app,
  databaseUrlAuth: auth,
  descopeProjectId: 'P2testproject0001',
  ownerEmail: 'owner@example.test',
  allowedOrigin: 'http://127.0.0.1:5173',
});

describe('buildRealModeDeps', () => {
  it('builds the auth dependencies when both logins pass the runtime role check', async () => {
    const built = await buildRealModeDeps(config(db!.appUrl, db!.authUrl));
    closers.push(built.close);
    expect(built.auth.allowedOrigin).toBe('http://127.0.0.1:5173');
    // A dropped idle connection must not crash the process (unhandled 'error' event).
    expect(built.pools.app.listenerCount('error')).toBeGreaterThan(0);
    expect(built.pools.auth.listenerCount('error')).toBeGreaterThan(0);
  });

  it('refuses to start when the URLs are swapped or point at the wrong role', async () => {
    await expect(buildRealModeDeps(config(db!.authUrl, db!.appUrl))).rejects.toThrow(/expected role kawalys_app/);
  });
});
