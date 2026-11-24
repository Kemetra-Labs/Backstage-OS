import { ConfigError } from '../../src/config/database-config';
import { loadOperatorConfig } from '../../src/ops/db-admin-config';

const ADMIN = 'postgres://neondb_owner:adminpw@ep-square-dew-bgjbfuyv.eu-central-1.aws.neon.tech/kawalys?sslmode=verify-full';
const PW = {
  KAWALYS_ROLE_PASSWORD_MIGRATOR: 'migrator-pw-0123456789',
  KAWALYS_ROLE_PASSWORD_APP: 'app-pw-0123456789abcd',
  KAWALYS_ROLE_PASSWORD_AUTH: 'auth-pw-0123456789abc',
};

describe('loadOperatorConfig', () => {
  it('reads the admin URL, the database name and the three role passwords', () => {
    const cfg = loadOperatorConfig({ KAWALYS_ADMIN_DATABASE_URL: ADMIN, ...PW });
    expect(cfg.adminUrl).toBe(ADMIN);
    expect(cfg.database).toBe('kawalys');
    expect(cfg.passwords).toEqual({ migrator: PW.KAWALYS_ROLE_PASSWORD_MIGRATOR, app: PW.KAWALYS_ROLE_PASSWORD_APP, auth: PW.KAWALYS_ROLE_PASSWORD_AUTH });
  });

  it('refuses the pooled endpoint: provisioning and migrations take a session advisory lock', () => {
    const pooled = ADMIN.replace('ep-square-dew-bgjbfuyv', 'ep-square-dew-bgjbfuyv-pooler');
    expect(() => loadOperatorConfig({ KAWALYS_ADMIN_DATABASE_URL: pooled, ...PW })).toThrow(
      new ConfigError('KAWALYS_ADMIN_DATABASE_URL must use the direct endpoint, not a pooler'),
    );
  });

  it('applies the TLS policy to the admin URL', () => {
    expect(() => loadOperatorConfig({ KAWALYS_ADMIN_DATABASE_URL: ADMIN.replace('?sslmode=verify-full', ''), ...PW })).toThrow(/sslmode=verify-full/);
  });

  it('names every missing variable and never echoes a value', () => {
    let message = '';
    try {
      loadOperatorConfig({ KAWALYS_ADMIN_DATABASE_URL: ADMIN, KAWALYS_ROLE_PASSWORD_APP: PW.KAWALYS_ROLE_PASSWORD_APP });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('KAWALYS_ROLE_PASSWORD_MIGRATOR');
    expect(message).toContain('KAWALYS_ROLE_PASSWORD_AUTH');
    expect(message).not.toMatch(/adminpw|0123456789/);
  });

  it('requires three different passwords', () => {
    expect(() => loadOperatorConfig({ KAWALYS_ADMIN_DATABASE_URL: ADMIN, ...PW, KAWALYS_ROLE_PASSWORD_AUTH: PW.KAWALYS_ROLE_PASSWORD_APP })).toThrow(
      /must differ/,
    );
  });
});
