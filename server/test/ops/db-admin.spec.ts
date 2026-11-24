import { roleConnectionString } from '../../src/ops/db-admin-config';

describe('roleConnectionString', () => {
  it('round-trips passwords with %, @, # and : exactly as pg decodes them', () => {
    for (const password of ['abc%41defghijklmnop', 'p@ss#word:with/odd?chars!!', '%zz-not-an-escape-0123']) {
      const url = new URL(roleConnectionString('postgres://admin:x@db.example.com/kawalys?sslmode=verify-full', 'kawalys_migrator', password));
      expect(decodeURIComponent(url.username)).toBe('kawalys_migrator');
      expect(decodeURIComponent(url.password)).toBe(password);
      expect(url.hostname).toBe('db.example.com');
      expect(url.searchParams.get('sslmode')).toBe('verify-full');
    }
  });
});
