// BACK-172 G5: KAWALYS_ALLOWED_HOSTS. Required in production, disabled when unset elsewhere, and a malformed value
// stops startup with a message that names the variable and never the value.
import { allowedHosts } from '../../src/config/allowed-hosts';
import { ConfigError } from '../../src/config/database-config';

describe('allowedHosts', () => {
  it('is disabled (null) when unset or blank outside production', () => {
    expect(allowedHosts({})).toBeNull();
    expect(allowedHosts({ NODE_ENV: 'test', KAWALYS_ALLOWED_HOSTS: '  ' })).toBeNull();
  });

  it('is required in production, blank included', () => {
    expect(() => allowedHosts({ NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(() => allowedHosts({ NODE_ENV: 'production' })).toThrow(/KAWALYS_ALLOWED_HOSTS/);
    expect(() => allowedHosts({ NODE_ENV: 'production', KAWALYS_ALLOWED_HOSTS: ' ' })).toThrow(ConfigError);
  });

  it('parses a comma-separated list, lower-cased, with an optional port', () => {
    expect(allowedHosts({ KAWALYS_ALLOWED_HOSTS: 'Kawalys.Kemetralabs.com, localhost:8787,127.0.0.1' })).toEqual([
      'kawalys.kemetralabs.com',
      'localhost:8787',
      '127.0.0.1',
    ]);
  });

  it.each(['*', '*.example.com', 'a.com,,b.com', 'a.com,', ',a.com', 'https://a.com', 'a.com/path', 'a.com?x=1', 'user@a.com', 'a b.com', 'a.com:', 'a.com:99999x', 'a.com:0', '-a.com', 'a..com', '[::1]'])(
    'refuses %j without echoing the value',
    (bad) => {
      let message = '';
      try {
        allowedHosts({ KAWALYS_ALLOWED_HOSTS: bad });
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        message = (e as Error).message;
      }
      expect(message).toContain('KAWALYS_ALLOWED_HOSTS');
      if (bad.length > 2) expect(message).not.toContain(bad);
    },
  );
});
