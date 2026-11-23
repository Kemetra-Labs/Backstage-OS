import { ConfigError, loadDatabaseConfig } from '../../src/config/database-config';

const APP = 'postgres://kawalys_app:s3cret-app@db.internal:5432/kawalys';
const AUTH = 'postgresql://kawalys_auth:s3cret-auth@db.internal:5432/kawalys';

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
});
