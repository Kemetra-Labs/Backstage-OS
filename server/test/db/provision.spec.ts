// Unit tests: provisioning never sends a plaintext password to the server (no container).
import { provisionDatabase, provisionRoles, scramSha256Verifier } from '../../src/db/provision';

describe('provisionRoles', () => {
  it('sends SCRAM verifiers, never the plaintext password, in SQL text or parameters', async () => {
    const seen: string[] = [];
    const fake = {
      query: async (text: string, params?: unknown[]) => {
        seen.push(text, ...(params ?? []).map(String));
        return { rows: [{ sql: 'SELECT 1' }] };
      },
    };
    const passwords = { migrator: 'migrator-plain-0123456789', app: 'app-plain-0123456789', auth: 'auth-plain-0123456789' };
    await provisionRoles(fake as never, passwords);
    const all = seen.join('\n');
    expect(all).not.toContain(passwords.migrator);
    expect(all).not.toContain(passwords.app);
    expect(all).not.toContain(passwords.auth);
    expect(all).toMatch(/SCRAM-SHA-256\$4096:/);
  });
});

describe('provisionRoles on a host that only accepts plaintext passwords (Neon)', () => {
  it('sends the password itself, quoted server-side with %L, and no SCRAM verifier, when passwordFormat is plaintext', async () => {
    const templates: string[] = [];
    const args: string[] = [];
    const fake = {
      query: async (text: string, params?: unknown[]) => {
        if (/^SELECT format/.test(text)) {
          templates.push(String(params![0]));
          args.push(...params!.slice(1).map(String));
        }
        return { rows: [{ sql: 'SELECT 1' }] };
      },
    };
    const passwords = { migrator: 'migrator-plain-0123456789', app: 'app-plain-0123456789', auth: 'auth-plain-0123456789' };
    await provisionRoles(fake as never, passwords, { passwordFormat: 'plaintext' });
    expect(templates.filter((t) => t.startsWith('CREATE ROLE'))).toHaveLength(3);
    expect(templates.join(' ')).toMatch(/PASSWORD %L/);
    expect(args.join(' ')).not.toContain('SCRAM-SHA-256');
    expect(args).toEqual(expect.arrayContaining([passwords.migrator, passwords.app, passwords.auth]));
  });

  it('defaults to SCRAM verifiers', async () => {
    const args: string[] = [];
    const fake = {
      query: async (text: string, params?: unknown[]) => {
        if (/^SELECT format/.test(text)) args.push(...params!.slice(1).map(String));
        return { rows: [{ sql: 'SELECT 1' }] };
      },
    };
    await provisionRoles(fake as never, { migrator: 'migrator-plain-0123456789', app: 'app-plain-0123456789', auth: 'auth-plain-0123456789' });
    expect(args.some((a) => a.startsWith('SCRAM-SHA-256$'))).toBe(true);
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

describe('provisionDatabase', () => {
  it('lets a non-superuser admin act as the migrator before it creates the schema or default privileges', async () => {
    // On PostgreSQL 16+ the role that ran CREATE ROLE holds ADMIN OPTION on it but may not SET ROLE to it,
    // so CREATE SCHEMA ... AUTHORIZATION and ALTER DEFAULT PRIVILEGES FOR ROLE fail for Neon's owner role.
    const templates: string[] = [];
    const fake = {
      query: async (text: string, params?: unknown[]) => {
        if (params && typeof params[0] === 'string') templates.push(params[0]);
        else templates.push(text);
        return { rows: [{ sql: 'SELECT 1' }] };
      },
    };
    await provisionDatabase(fake as never, 'kawalys');
    const grant = templates.findIndex((t) => /^GRANT %I TO CURRENT_USER WITH SET TRUE/.test(t));
    const schema = templates.findIndex((t) => t.startsWith('CREATE SCHEMA'));
    const defaults = templates.findIndex((t) => t.startsWith('ALTER DEFAULT PRIVILEGES'));
    expect(grant).toBeGreaterThanOrEqual(0);
    expect(grant).toBeLessThan(schema);
    expect(grant).toBeLessThan(defaults);
  });
});
