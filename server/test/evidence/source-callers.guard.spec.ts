// Caller inventory guard (BACK-131, G9). Source connect, reconnect, disconnect and ingest are server-internal write
// paths with no HTTP route, and a Reauthorization can only be minted by `fromSessionIssuedAt`. This test fails if a
// new production caller appears in src/, if src/ imports test code, or if the GitHub transport port gains anything
// besides a read-only `get`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SRC = resolve(process.cwd(), 'src');

interface Rule {
  readonly pattern: RegExp;
  readonly allowed: ReadonlySet<string>;
}

const RULES: readonly Rule[] = [
  {
    pattern: /\b(?:connectSource|reconnectSource|disconnectSource)\b|\.ingest\(/,
    allowed: new Set(['evidence/evidence.repository.ts', 'ops/local-stack.ts']),
  },
  // Only the definition may mint a Reauthorization: a route would have to be given a session issue time by the server.
  { pattern: /\bfromSessionIssuedAt\b/, allowed: new Set(['evidence/source-approval.ts']) },
];
const TEST_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:[^'"]*\/)?test\//;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

/** Copies a string or template literal verbatim (a name inside one still counts as a mention) and returns the next index. */
function copyLiteral(text: string, start: number, out: string[]): number {
  const quote = text[start]!;
  out.push(quote);
  let i = start + 1;
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\' && i + 1 < text.length) out.push(text[i++]!);
    out.push(text[i++]!);
  }
  if (i < text.length) out.push(text[i++]!);
  return i;
}

/**
 * Code with every comment removed: `//` tails, block comments anywhere on a line and across lines. String and template
 * literals are copied whole, so a `/*` or `//` inside one never starts a comment. Any misreading (a regex literal with a
 * quote) keeps text rather than drops it, so the scanner can over-report but cannot be blinded.
 */
export function stripComments(text: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
      out.push(' ');
    } else if (c === "'" || c === '"' || c === '`') {
      i = copyLiteral(text, i, out);
    } else {
      out.push(c);
      i++;
    }
  }
  return out.join('');
}

export function offendingFiles(files: ReadonlyMap<string, string>, rules: readonly Rule[] = RULES): string[] {
  return [...files]
    .filter(([name, text]) => {
      const code = stripComments(text);
      return rules.some((r) => !r.allowed.has(name) && r.pattern.test(code));
    })
    .map(([name]) => name);
}

const files = new Map(sourceFiles(SRC).map((f) => [relative(SRC, f).split(sep).join('/'), readFileSync(f, 'utf8')] as const));

describe('source write-path callers', () => {
  it('scans a real tree', () => {
    expect(files.size).toBeGreaterThan(40);
    for (const rule of RULES) for (const name of rule.allowed) expect(files.has(name)).toBe(true);
  });

  it('only the repository and the local stack seeder use connect, reconnect, disconnect or ingest; only the definition mints a Reauthorization', () => {
    expect(offendingFiles(files)).toEqual([]);
  });

  it('flags synthetic offending callers, including ones next to comments and strings (self-test)', () => {
    const synthetic = new Map([
      ['http/rogue.controller.ts', 'await this.evidence.connectSource(ws, user, input);'],
      ['http/rogue2.ts', 'await repo.reconnectSource(ws, user, id, reauth);'],
      ['http/rogue3.ts', 'await repo.ingest(ws, items);'],
      ['http/rogue4.ts', 'const u = "https://x.test"; repo.disconnectSource(ws, user, id);'],
      ['http/rogue5.ts', "const a = '*/*'; repo.connectSource(ws, u, i); /** x */"],
      ['http/rogue6.ts', 'const s = "a // b"; repo.ingest(ws, items);'],
      ['http/rogue7.ts', '/* x */ repo.connectSource(ws, u, i);'],
      ['http/rogue8.ts', '/* a comment\n that hides nothing below\n */ repo.reconnectSource(ws, u, id, r);'],
      ['http/rogue9.ts', 'const r = Reauthorization.fromSessionIssuedAt(Date.now());'],
      ['http/rogue10.ts', 'const a = 1; // trailing\nrepo.ingest(ws, items);'],
    ]);
    expect(offendingFiles(synthetic)).toEqual([...synthetic.keys()]);
  });

  it('does not flag comment-only mentions, single or multi-line (self-test)', () => {
    const quiet = new Map([
      ['connectors/doc.ts', '// typed Observations for EvidenceRepository.ingest().\n/**\n * and connectSource\n * disconnectSource\n */\nexport const a = 1;'],
      ['connectors/doc2.ts', 'export const a = 1; /* repo.connectSource(x)\n still a comment fromSessionIssuedAt\n */ export const b = 2; // repo.ingest(x)'],
    ]);
    expect(offendingFiles(quiet)).toEqual([]);
  });

  it('no file under src/ imports from test/', () => {
    const importing = [...files].filter(([, text]) => TEST_IMPORT.test(text)).map(([name]) => name);
    expect(importing).toEqual([]);
    expect(TEST_IMPORT.test(`import { approveAll } from '../../test/evidence/approve-all-policy';`)).toBe(true);
  });
});

/** The members of `interface GitHubReadTransport`: every non-blank code line of its body. */
export function transportMembers(source: string): string[] {
  const body = /export interface GitHubReadTransport\s*\{([\s\S]*?)\r?\n\}/.exec(source)?.[1] ?? '';
  return stripComments(body)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

describe('GitHub transport port', () => {
  it('declares exactly one member, a read-only get', () => {
    const members = transportMembers(readFileSync(join(SRC, 'connectors/github/github.transport.ts'), 'utf8'));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatch(/^get\(/);
  });

  it('flags a synthetic extra member such as a generic post (self-test)', () => {
    const synthetic = 'export interface GitHubReadTransport {\n  get(path: string): Promise<R>;\n  post<T>(path: string, body: T): Promise<R>;\n}\n';
    expect(transportMembers(synthetic)).toHaveLength(2);
  });
});
