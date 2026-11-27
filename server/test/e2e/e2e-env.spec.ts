import { loadAuthConfig } from '../../src/auth/auth.config';
import { OWNER } from '../auth/_helpers';
import { e2eEnv } from './e2e-env';

describe('e2eEnv', () => {
  it('returns the fixed test configuration', () => {
    const env = e2eEnv({});
    expect(env).toEqual({
      KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001',
      KAWALYS_OWNER_SUBJECT: OWNER.subject,
      KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE: '100',
    });
    expect(env).not.toHaveProperty('KAWALYS_AUTH_LAB');
  });

  it('refuses NODE_ENV=production', () => {
    expect(() => e2eEnv({ NODE_ENV: 'production' })).toThrow(/production/);
  });

  it('refuses a configured database', () => {
    expect(() => e2eEnv({ KAWALYS_DATABASE_URL_APP: 'x' })).toThrow();
    expect(() => e2eEnv({ KAWALYS_DATABASE_URL_AUTH: 'x' })).toThrow();
  });

  it('configures the same owner the fake verifier signs in', () => {
    const config = loadAuthConfig({ ...e2eEnv({}) });
    expect(config.owner).toEqual({ providerKey: 'descope', issuer: OWNER.issuer, subject: OWNER.subject });
    expect(config.signInLimitPerMinute).toBe(100);
  });
});
