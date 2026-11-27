import { allowedOrigins, DEFAULT_ALLOWED_ORIGINS } from '../../src/config/allowed-origins';
import { ConfigError } from '../../src/config/database-config';

describe('allowedOrigins', () => {
  it('defaults to the loopback Vite origins when unset or blank', () => {
    expect(allowedOrigins({})).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(allowedOrigins({ KAWALYS_ALLOWED_ORIGINS: '  ' })).toEqual(['http://127.0.0.1:4178', 'http://localhost:4178']);
  });

  it('accepts exact origins, trimmed', () => {
    expect(allowedOrigins({ KAWALYS_ALLOWED_ORIGINS: 'https://pilot.example.com' })).toEqual(['https://pilot.example.com']);
    expect(allowedOrigins({ KAWALYS_ALLOWED_ORIGINS: 'https://a.example, http://localhost:18443' })).toEqual(['https://a.example', 'http://localhost:18443']);
  });

  it.each(['*', 'null', 'https://a.example/', 'https://a.example/path', 'a.example', 'ftp://a.example', 'https://a.example,', ',https://a.example', 'https://A.example', 'https://a.example:443', 'https://u:p@a.example', 'https://a.example?x=1', 'https://a.example, *', 'https://a b.example', 'https://*.example.com', 'https://a.*.example', 'http://localhost:*'])(
    'rejects %j, naming the variable and never the value',
    (value) => {
      let error: unknown;
      try {
        allowedOrigins({ KAWALYS_ALLOWED_ORIGINS: value });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain('KAWALYS_ALLOWED_ORIGINS');
      expect((error as Error).message).not.toContain(`"${value}"`);
    },
  );
});
