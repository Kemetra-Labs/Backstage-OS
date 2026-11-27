// BACK-113: the owner-approved baseline is PostgreSQL 18.7. Fail loudly if the test image
// ever resolves to another server version (no silent substitution).
import { PG_IMAGE, startPgContainer, stopPgContainer, type PgContainer } from './pg-container';

describe('PostgreSQL baseline (BACK-113)', () => {
  let env: PgContainer | undefined;

  beforeAll(async () => {
    env = await startPgContainer();
  }, 120_000);

  afterAll(async () => {
    await stopPgContainer(env);
  });

  it('pins the exact 18.7 image tag', () => {
    expect(PG_IMAGE).toBe('postgres:18.7-alpine');
  });

  it('the running server reports 18.7', async () => {
    const { rows } = await env!.admin.query<{ v: string; n: string }>(
      "SELECT current_setting('server_version') AS v, current_setting('server_version_num') AS n",
    );
    expect(rows[0]!.v).toMatch(/^18\.7(\s|$)/);
    expect(Number(rows[0]!.n)).toBe(180007);
  });
});
