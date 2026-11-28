// GitHub App and refresh-interval configuration (BACK-52 slice A). Names only in errors, never values.
import { ConfigError } from '../../src/config/database-config';
import { loadGithubAppConfig, loadRefreshMinutes } from '../../src/config/github-app';
import { makeTestKey, type TestKey } from '../connectors/github/test-key';

let key: TestKey;
beforeAll(async () => {
  key = await makeTestKey();
});

const full = (over: Record<string, string> = {}) => ({
  KAWALYS_GITHUB_APP_ID: '123',
  KAWALYS_GITHUB_INSTALLATION_ID: '456',
  KAWALYS_GITHUB_APP_PRIVATE_KEY: key.pem,
  ...over,
});

describe('loadGithubAppConfig', () => {
  it('is disabled (null) when none of the three variables is set, or all are blank', () => {
    expect(loadGithubAppConfig({})).toBeNull();
    expect(loadGithubAppConfig({ KAWALYS_GITHUB_APP_ID: ' ', KAWALYS_GITHUB_INSTALLATION_ID: '', KAWALYS_GITHUB_APP_PRIVATE_KEY: '  ' })).toBeNull();
  });

  it('parses a complete configuration', () => {
    expect(loadGithubAppConfig(full())).toEqual({ appId: 123, installationId: 456, privateKeyPem: key.pem.trim() });
  });

  it('accepts the PEM in single-line form with escaped newlines, and a PKCS#1 key', () => {
    const oneLine = key.pem.trim().replaceAll('\n', '\\n');
    expect(oneLine).not.toContain('\n');
    expect(loadGithubAppConfig(full({ KAWALYS_GITHUB_APP_PRIVATE_KEY: oneLine }))?.privateKeyPem.trim()).toBe(key.pem.trim());
    expect(loadGithubAppConfig(full({ KAWALYS_GITHUB_APP_PRIVATE_KEY: key.pkcs1 }))?.appId).toBe(123);
  });

  it.each([
    ['only the app id', () => ({ KAWALYS_GITHUB_APP_ID: '1' }), ['KAWALYS_GITHUB_INSTALLATION_ID', 'KAWALYS_GITHUB_APP_PRIVATE_KEY']],
    ['no installation id', () => full({ KAWALYS_GITHUB_INSTALLATION_ID: '' }), ['KAWALYS_GITHUB_INSTALLATION_ID']],
    ['no key', () => full({ KAWALYS_GITHUB_APP_PRIVATE_KEY: '' }), ['KAWALYS_GITHUB_APP_PRIVATE_KEY']],
  ])('refuses a partial configuration (%s) and names the missing variables only', (_l, env, names) => {
    let message = '';
    try {
      loadGithubAppConfig(env());
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      message = (e as Error).message;
    }
    for (const n of names) expect(message).toContain(n);
    expect(message).not.toContain('BEGIN');
    expect(message).not.toContain('456');
  });

  it.each([
    ['KAWALYS_GITHUB_APP_ID', '0'],
    ['KAWALYS_GITHUB_APP_ID', '-1'],
    ['KAWALYS_GITHUB_APP_ID', '1.5'],
    ['KAWALYS_GITHUB_APP_ID', 'abc'],
    ['KAWALYS_GITHUB_APP_ID', '12345678901234567890'],
    ['KAWALYS_GITHUB_INSTALLATION_ID', '0'],
    ['KAWALYS_GITHUB_INSTALLATION_ID', '1e3'],
    ['KAWALYS_GITHUB_INSTALLATION_ID', 'x'],
  ])('refuses %s=%s (a positive integer is required)', (name, value) => {
    expect(() => loadGithubAppConfig(full({ [name]: value }))).toThrow(ConfigError);
    try {
      loadGithubAppConfig(full({ [name]: value }));
    } catch (e) {
      expect((e as Error).message).toContain(name);
      expect((e as Error).message).not.toContain(`=${value}`);
    }
  });

  it('refuses a private key that is not a readable RSA key, never echoing it', () => {
    for (const bad of ['not a pem SECRETBYTES', '-----BEGIN PRIVATE KEY-----\nSECRETBYTES\n-----END PRIVATE KEY-----']) {
      let message = '';
      try {
        loadGithubAppConfig(full({ KAWALYS_GITHUB_APP_PRIVATE_KEY: bad }));
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        message = (e as Error).message;
      }
      expect(message).toContain('KAWALYS_GITHUB_APP_PRIVATE_KEY');
      expect(message).not.toContain('SECRETBYTES');
    }
  });
});

describe('loadRefreshMinutes', () => {
  it('is null when unset or blank', () => {
    expect(loadRefreshMinutes({})).toBeNull();
    expect(loadRefreshMinutes({ KAWALYS_GITHUB_REFRESH_MINUTES: '  ' })).toBeNull();
  });

  it('accepts an integer from 15 up to one week', () => {
    expect(loadRefreshMinutes({ KAWALYS_GITHUB_REFRESH_MINUTES: '10080' })).toBe(10080);
    expect(loadRefreshMinutes({ KAWALYS_GITHUB_REFRESH_MINUTES: '15' })).toBe(15);
    expect(loadRefreshMinutes({ KAWALYS_GITHUB_REFRESH_MINUTES: ' 60 ' })).toBe(60);
  });

  it.each(['14', '0', '-15', '15.5', 'abc', '1e2', '15m', '99999999999', '10081', '35792', '999999999'])('refuses %s with a ConfigError naming the variable', (value) => {
    expect(() => loadRefreshMinutes({ KAWALYS_GITHUB_REFRESH_MINUTES: value })).toThrow(ConfigError);
    try {
      loadRefreshMinutes({ KAWALYS_GITHUB_REFRESH_MINUTES: value });
    } catch (e) {
      expect((e as Error).message).toContain('KAWALYS_GITHUB_REFRESH_MINUTES');
    }
  });
});
