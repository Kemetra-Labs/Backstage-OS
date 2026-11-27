import { ConfigError } from '../../src/config/database-config';
import { trustProxy } from '../../src/config/trust-proxy';

describe('trustProxy', () => {
  it('is off when unset or blank', () => {
    expect(trustProxy({})).toBeNull();
    expect(trustProxy({ KAWALYS_TRUST_PROXY: '' })).toBeNull();
    expect(trustProxy({ KAWALYS_TRUST_PROXY: '   ' })).toBeNull();
  });

  it('accepts IPs and CIDR ranges, trimmed', () => {
    expect(trustProxy({ KAWALYS_TRUST_PROXY: '172.30.42.0/24' })).toEqual(['172.30.42.0/24']);
    expect(trustProxy({ KAWALYS_TRUST_PROXY: '10.0.0.5, ::1 ,fd00::/8' })).toEqual(['10.0.0.5', '::1', 'fd00::/8']);
  });

  it.each(['true', '*', '1', 'loopback', '0.0.0.0/0', '::/0', '10.0.0.0/33', '10.0.0.0/', '10.0.0.0/8/8', 'a.b.c.d', '10.0.0.1,', ',10.0.0.1', '10.0.0.1;10.0.0.2'])(
    'rejects %j, naming the variable and never the value',
    (value) => {
      let error: unknown;
      try {
        trustProxy({ KAWALYS_TRUST_PROXY: value });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain('KAWALYS_TRUST_PROXY');
      expect((error as Error).message).not.toContain(`"${value}"`);
    },
  );
});
