// BACK-61: local stack passwords are generated per machine, stored owner-only, reused, never hard-coded.
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateLocalCredentials, loadOrCreateLocalCredentials } from '../../src/ops/local-credentials';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kawalys-creds-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('local credentials (BACK-61)', () => {
  it('generates four distinct 32-character random passwords', () => {
    const a = generateLocalCredentials();
    const b = generateLocalCredentials();
    const values = Object.values(a);
    expect(values).toHaveLength(4);
    for (const v of values) expect(v).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(new Set(values).size).toBe(4);
    expect(a.admin).not.toBe(b.admin);
  });

  it('creates the file owner-only on first use and returns the same values afterwards', () => {
    const file = join(dir, 'nested', 'credentials.json');
    const first = loadOrCreateLocalCredentials(file);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(loadOrCreateLocalCredentials(file)).toEqual(first);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(first);
  });

  it.each([['not json'], ['{}'], [JSON.stringify({ admin: 'short', migrator: 'x', app: 'y', auth: 'z' })]])(
    'refuses a damaged file instead of silently regenerating (%s)',
    (content) => {
      const file = join(dir, 'credentials.json');
      writeFileSync(file, content);
      expect(() => loadOrCreateLocalCredentials(file)).toThrow(/local:down/);
      expect(readFileSync(file, 'utf8')).toBe(content);
    },
  );

  it('no committed local-stack file carries a literal password', () => {
    const root = process.cwd();
    for (const f of ['docker-compose.local.yml', 'src/ops/local-up.ts', 'src/ops/local-stack.ts', 'package.json']) {
      const text = readFileSync(join(root, f), 'utf8');
      expect(text).not.toMatch(/kawalys-local-only/);
      expect(text).not.toMatch(/POSTGRES_PASSWORD:\s*[^$\s]/);
    }
  });
});
