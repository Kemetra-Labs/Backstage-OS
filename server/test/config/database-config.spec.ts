import { ConfigError, loadDatabaseConfig } from '../../src/config/database-config';

const APP = 'postgres://kawalys_app:s3cret-app@db.internal:5432/kawalys?sslmode=verify-full';
const AUTH = 'postgresql://kawalys_auth:s3cret-auth@db.internal:5432/kawalys?sslmode=verify-full';

describe('loadDatabaseConfig', () => {
  it('returns null when neither URL is set (in-memory sessions, no evidence routes)', () => {
    expect(loadDatabaseConfig({ KAWALYS_BFF_PORT: '8787' })).toBeNull();
  });

  it('parses both URLs', () => {
    expect(loadDatabaseConfig({ KAWALYS_DATABASE_URL_APP: APP, KAWALYS_DATABASE_URL_AUTH: AUTH })).toEqual({ appUrl: APP, authUrl: AUTH });
  });

  it('fails fast when only one is set, naming only the missing variable', () => {
    expect(() => loadDatabaseConfig({ KAWALYS_DATABASE_URL_APP: APP })).toThrow(
      new ConfigError('missing required configuration: KAWALYS_DATABASE_URL_AUTH'),
    );
  });

  it('rejects malformed or shared-role URLs without echoing values', () => {
    for (const env of [
      { KAWALYS_DATABASE_URL_APP: 'mysql://x:hunter2@h/db', KAWALYS_DATABASE_URL_AUTH: AUTH },
      { KAWALYS_DATABASE_URL_APP: APP, KAWALYS_DATABASE_URL_AUTH: APP },
      { KAWALYS_DATABASE_URL_APP: 'not a url', KAWALYS_DATABASE_URL_AUTH: AUTH },
    ]) {
      let message = '';
      try {
        loadDatabaseConfig(env);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/KAWALYS_DATABASE_URL_/);
      expect(message).not.toMatch(/hunter2|s3cret/);
    }
  });

  describe('TLS policy', () => {
    const auth = AUTH;
    const load = (appUrl: string) => () => loadDatabaseConfig({ KAWALYS_DATABASE_URL_APP: appUrl, KAWALYS_DATABASE_URL_AUTH: auth });

    it('refuses a remote host without sslmode=verify-full, naming only the variable', () => {
      for (const url of [
        'postgres://kawalys_app:s3cret-app@db.internal:5432/kawalys',
        'postgres://kawalys_app:s3cret-app@db.internal:5432/kawalys?sslmode=disable',
        'postgres://kawalys_app:s3cret-app@db.internal:5432/kawalys?sslmode=require',
        'postgres://kawalys_app:s3cret-app@db.internal:5432/kawalys?sslmode=prefer',
      ]) {
        expect(load(url)).toThrow(new ConfigError('KAWALYS_DATABASE_URL_APP must use sslmode=verify-full for a non-loopback host'));
      }
    });

    it('accepts loopback hosts without TLS (local development and tests)', () => {
      for (const host of ['localhost', '127.0.0.1', '[::1]']) {
        expect(load(`postgres://kawalys_app:s3cret-app@${host}:5432/kawalys`)).not.toThrow();
      }
    });

    it('accepts a pooled hostname for runtime logins (the workspace setting is transaction-local)', () => {
      const pooled = 'postgres://kawalys_app:s3cret-app@ep-square-dew-bgjbfuyv-pooler.eu-central-1.aws.neon.tech/kawalys?sslmode=verify-full';
      expect(load(pooled)).not.toThrow();
    });
  });
});
