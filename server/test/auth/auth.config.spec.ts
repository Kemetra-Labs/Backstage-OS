import {
  AuthConfigError,
  DEFAULT_MAX_TOKEN_AGE_SECONDS,
  DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS,
  DEFAULT_SESSION_IDLE_TTL_SECONDS,
  loadAuthConfig,
} from '../../src/auth/auth.config';

const VALID = {
  KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001',
  KAWALYS_OWNER_SUBJECT: 'UkawalysOwner0001',
};

describe('loadAuthConfig', () => {
  it('builds the owner triple from the project issuer and the configured subject', () => {
    const c = loadAuthConfig(VALID);
    expect(c.owner).toEqual({
      providerKey: 'descope',
      issuer: 'https://api.descope.com/v1/apps/PkawalysTest0001',
      subject: 'UkawalysOwner0001',
    });
    expect(c.descope).toEqual({
      projectId: 'PkawalysTest0001',
      issuer: 'https://api.descope.com/v1/apps/PkawalysTest0001',
      maxTokenAgeSeconds: DEFAULT_MAX_TOKEN_AGE_SECONDS,
    });
    expect(c.session).toEqual({
      absoluteTtlSeconds: DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS,
      idleTtlSeconds: DEFAULT_SESSION_IDLE_TTL_SECONDS,
    });
  });

  it('defaults the sign-in limit to 10 per minute and accepts an in-range override', () => {
    expect(loadAuthConfig(VALID).signInLimitPerMinute).toBe(10);
    expect(loadAuthConfig({ ...VALID, KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE: '100' }).signInLimitPerMinute).toBe(100);
  });

  it('outside production, missing config means unconfigured, not an error', () => {
    const c = loadAuthConfig({});
    expect(c.owner).toBeNull();
    expect(c.descope).toBeNull();
    expect(c.production).toBe(false);
  });

  it('a subject without a project (or the reverse) leaves no owner identity', () => {
    expect(loadAuthConfig({ KAWALYS_OWNER_SUBJECT: 'UkawalysOwner0001' }).owner).toBeNull();
    expect(loadAuthConfig({ KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001' }).owner).toBeNull();
  });

  it.each([
    [{}],
    [{ KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001' }],
    [{ KAWALYS_OWNER_SUBJECT: 'UkawalysOwner0001' }],
  ])('production without both values throws at boot %#', (partial) => {
    expect(() => loadAuthConfig({ NODE_ENV: 'production', ...partial })).toThrow(AuthConfigError);
  });

  it('production with both values boots', () => {
    expect(loadAuthConfig({ NODE_ENV: 'production', ...VALID }).production).toBe(true);
  });

  it('never reads the Retail Tower DESCOPE_* variables', () => {
    const c = loadAuthConfig({
      DESCOPE_PROJECT_ID: 'P2rtProject0001',
      DESCOPE_JWT_ISSUER: 'https://rt.example',
      DESCOPE_JWT_AUDIENCE: 'rt',
    });
    expect(c.descope).toBeNull();
    expect(c.owner).toBeNull();
  });

  it.each([
    ['KAWALYS_DESCOPE_PROJECT_ID', 'P2/../evil'],
    ['KAWALYS_DESCOPE_PROJECT_ID', 'https://evil.example'],
    ['KAWALYS_OWNER_SUBJECT', 'U bad subject'],
    ['KAWALYS_OWNER_SUBJECT', 'U'.repeat(200)],
    ['KAWALYS_DESCOPE_ISSUER', 'http://insecure.example'],
    ['KAWALYS_DESCOPE_ISSUER', 'https://has space'],
    ['KAWALYS_DESCOPE_MAX_TOKEN_AGE_SECONDS', '59'],
    ['KAWALYS_DESCOPE_MAX_TOKEN_AGE_SECONDS', '3601'],
    ['KAWALYS_DESCOPE_MAX_TOKEN_AGE_SECONDS', '1h'],
    ['KAWALYS_SESSION_ABSOLUTE_TTL_SECONDS', '299'],
    ['KAWALYS_SESSION_ABSOLUTE_TTL_SECONDS', '86401'],
    ['KAWALYS_SESSION_IDLE_TTL_SECONDS', '59'],
    ['KAWALYS_SESSION_IDLE_TTL_SECONDS', '28801'], // longer than the default absolute TTL
    ['KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE', '0'],
    ['KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE', '101'],
    ['KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE', 'ten'],
  ])('a malformed %s=%p throws even outside production, and the error never echoes the value', (name, value) => {
    let error: unknown;
    try {
      loadAuthConfig({ ...VALID, [name]: value });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AuthConfigError);
    expect((error as Error).message).toContain(name);
    // The message legitimately states the allowed range ("from 1 to 100"), which can contain a short value such as '0'.
    expect((error as Error).message.replace(/from \d+ to \d+/, '')).not.toContain(value);
  });

  it('an issuer override needs the project id', () => {
    expect(() => loadAuthConfig({ KAWALYS_DESCOPE_ISSUER: 'https://issuer.example' })).toThrow(AuthConfigError);
  });

  it('an https issuer override replaces the derived issuer, in the owner triple too', () => {
    const c = loadAuthConfig({ ...VALID, KAWALYS_DESCOPE_ISSUER: 'https://auth.kawalys.example' });
    expect(c.descope?.issuer).toBe('https://auth.kawalys.example');
    expect(c.owner?.issuer).toBe('https://auth.kawalys.example');
  });

  it('accepts in-range overrides', () => {
    const c = loadAuthConfig({
      ...VALID,
      KAWALYS_DESCOPE_MAX_TOKEN_AGE_SECONDS: '600',
      KAWALYS_SESSION_ABSOLUTE_TTL_SECONDS: '7200',
      KAWALYS_SESSION_IDLE_TTL_SECONDS: '600',
    });
    expect(c.descope?.maxTokenAgeSeconds).toBe(600);
    expect(c.session).toEqual({ absoluteTtlSeconds: 7200, idleTtlSeconds: 600 });
  });
});
