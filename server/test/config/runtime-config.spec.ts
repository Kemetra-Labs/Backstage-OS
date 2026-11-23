import { ConfigError, loadRuntimeConfig } from '../../src/config/runtime-config';

const FULL = {
  KAWALYS_DATABASE_URL_APP: 'postgres://kawalys_app:s3cret-app@db.internal:5432/kawalys',
  KAWALYS_DATABASE_URL_AUTH: 'postgresql://kawalys_auth:s3cret-auth@db.internal:5432/kawalys',
  KAWALYS_DESCOPE_PROJECT_ID: 'P2abc123',
  KAWALYS_OWNER_EMAIL: 'Owner@Example.test',
  KAWALYS_ALLOWED_ORIGIN: 'http://127.0.0.1:5173',
};

describe('loadRuntimeConfig', () => {
  it('returns null when no real-mode variable is set (synthetic routes only)', () => {
    expect(loadRuntimeConfig({ KAWALYS_BFF_PORT: '8787' })).toBeNull();
  });

  it('parses a complete configuration', () => {
    expect(loadRuntimeConfig(FULL)).toEqual({
      databaseUrlApp: FULL.KAWALYS_DATABASE_URL_APP,
      databaseUrlAuth: FULL.KAWALYS_DATABASE_URL_AUTH,
      descopeProjectId: 'P2abc123',
      ownerEmail: 'owner@example.test',
      allowedOrigin: 'http://127.0.0.1:5173',
    });
  });

  it('fails fast on a partial configuration, naming only the missing variables', () => {
    const { KAWALYS_DESCOPE_PROJECT_ID: _p, KAWALYS_OWNER_EMAIL: _o, ...partial } = FULL;
    const err = (() => {
      try {
        loadRuntimeConfig(partial);
      } catch (e) {
        return e as Error;
      }
      return null;
    })();
    expect(err).toBeInstanceOf(ConfigError);
    expect(err!.message).toBe('missing required configuration: KAWALYS_DESCOPE_PROJECT_ID, KAWALYS_OWNER_EMAIL');
  });

  it('rejects malformed values without echoing them', () => {
    const cases: Array<[Record<string, string>, RegExp]> = [
      [{ ...FULL, KAWALYS_DATABASE_URL_APP: 'mysql://x:hunter2@h/db' }, /KAWALYS_DATABASE_URL_APP/],
      [{ ...FULL, KAWALYS_DATABASE_URL_AUTH: FULL.KAWALYS_DATABASE_URL_APP }, /must use different roles/],
      [{ ...FULL, KAWALYS_DESCOPE_PROJECT_ID: 'bad/id' }, /KAWALYS_DESCOPE_PROJECT_ID/],
      [{ ...FULL, KAWALYS_OWNER_EMAIL: 'nobody' }, /KAWALYS_OWNER_EMAIL/],
      [{ ...FULL, KAWALYS_ALLOWED_ORIGIN: 'http://127.0.0.1:5173/app' }, /KAWALYS_ALLOWED_ORIGIN/],
      [{ ...FULL, KAWALYS_ALLOWED_ORIGIN: 'http://evil.example' }, /KAWALYS_ALLOWED_ORIGIN/],
      [{ ...FULL, KAWALYS_ALLOWED_ORIGIN: '*' }, /KAWALYS_ALLOWED_ORIGIN/],
    ];
    for (const [env, pattern] of cases) {
      expect(() => loadRuntimeConfig(env)).toThrow(pattern);
      try {
        loadRuntimeConfig(env);
      } catch (e) {
        expect(String((e as Error).message)).not.toMatch(/hunter2|s3cret/);
      }
    }
  });

  it('reads an optional owner subject pin and refuses a non-ASCII owner email', () => {
    expect(loadRuntimeConfig({ ...FULL, KAWALYS_OWNER_SUBJECT: 'U2abc' })!.ownerSubject).toBe('U2abc');
    expect(loadRuntimeConfig(FULL)!.ownerSubject).toBeUndefined();
    expect(() => loadRuntimeConfig({ ...FULL, KAWALYS_OWNER_EMAIL: 'Kate@example.test' })).toThrow(/KAWALYS_OWNER_EMAIL/);
  });

  it('accepts an https origin', () => {
    expect(loadRuntimeConfig({ ...FULL, KAWALYS_ALLOWED_ORIGIN: 'https://kawalys.example' })!.allowedOrigin).toBe('https://kawalys.example');
  });
});
