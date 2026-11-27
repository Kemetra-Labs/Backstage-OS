import { bindHost } from '../../src/config/bind-host';
import { ConfigError } from '../../src/config/database-config';

describe('bindHost', () => {
  it('defaults to loopback when unset or empty', () => {
    expect(bindHost({})).toBe('127.0.0.1');
    expect(bindHost({ KAWALYS_BFF_HOST: '' })).toBe('127.0.0.1');
  });

  it.each(['127.0.0.1', '::1', '0.0.0.0'])('accepts %s', (host) => {
    expect(bindHost({ KAWALYS_BFF_HOST: host })).toBe(host);
  });

  it('rejects any other host, naming the variable and never the value', () => {
    let error: unknown;
    try {
      bindHost({ KAWALYS_BFF_HOST: '10.0.0.5' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain('KAWALYS_BFF_HOST');
    expect((error as Error).message).not.toContain('10.0.0.5');
  });
});
