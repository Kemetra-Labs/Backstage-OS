// Unit tests: provisioning never sends a plaintext password to the server (no container).
import { provisionRoles, scramSha256Verifier } from '../../src/db/provision';

describe('provisionRoles', () => {
  it('sends SCRAM verifiers, never the plaintext password, in SQL text or parameters', async () => {
    const seen: string[] = [];
    const fake = {
      query: async (text: string, params?: unknown[]) => {
        seen.push(text, ...(params ?? []).map(String));
        return { rows: [{ sql: 'SELECT 1' }] };
      },
    };
    const passwords = { migrator: 'migrator-plain-0123456789', app: 'app-plain-0123456789' };
    await provisionRoles(fake as never, passwords);
    const all = seen.join('\n');
    expect(all).not.toContain(passwords.migrator);
    expect(all).not.toContain(passwords.app);
    expect(all).toMatch(/SCRAM-SHA-256\$4096:/);
  });
});

describe('scramSha256Verifier', () => {
  it('has the PostgreSQL format and a fresh salt each time', () => {
    const a = scramSha256Verifier('pw-0123456789abcdef');
    const b = scramSha256Verifier('pw-0123456789abcdef');
    expect(a).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
  });

  it('refuses passwords that would need SASLprep or are too short', () => {
    expect(() => scramSha256Verifier('short')).toThrow(/password/);
    expect(() => scramSha256Verifier('pässwörd-0123456789')).toThrow(/password/);
  });
});
