// Caller inventory guard (BACK-131, G9). Source connect, reconnect, disconnect and ingest are server-internal write
// paths with no HTTP route, and a Reauthorization can only be minted by `fromSessionIssuedAt`. This test fails if a
// new production caller appears in src/, if src/ imports test code, or if the GitHub transport port gains anything
// besides a read-only `get`. It reads the syntax tree (TypeScript compiler API, already a devDependency), so comments
// and string contents are ignored by construction and whitespace or layout cannot hide a call.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const SRC = resolve(process.cwd(), 'src');
const WRITE_PATH_FILES = new Set(['evidence/evidence.repository.ts', 'ops/local-stack.ts']);
// Sanctioned narrow callers (BACK-52 slice A): each may use ONLY the names listed, nothing else of the write paths.
// The GitHub refresh runner is the one production caller of ingest; the operator connect command is the one caller
// of connectSource outside the repository and the local seed. The scheduler goes through the runner and has no entry.
const NARROW_CALLERS = new Map<string, ReadonlySet<string>>([
  ['connectors/github/github.runner.ts', new Set(['ingest'])],
  ['ops/source-connect.ts', new Set(['connectSource'])],
]);
const MINT_FILES = new Set(['evidence/source-approval.ts']);
const WRITE_NAMES = new Set(['connectSource', 'reconnectSource', 'disconnectSource']);
const MINT_NAME = 'fromSessionIssuedAt';
const TEST_SPECIFIER = /(^|\/)test(\/|$)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

const parse = (name: string, text: string) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** The specifier of an import, export-from, `import x = require()`, dynamic `import()` or `require()`, if this node is one. */
function moduleSpecifier(node: ts.Node): string | undefined {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (ts.isExternalModuleReference(node) && ts.isStringLiteralLike(node.expression)) return node.expression.text;
  if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
    const callee = node.expression;
    if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require')) return node.arguments[0].text;
  }
  return undefined;
}

/** Names this node uses as code: an identifier, a property name, or a string key of `x['name']`. */
function usedName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
  return undefined;
}

export interface Findings {
  readonly writePaths: string[];
  readonly mints: string[];
  readonly testImports: string[];
}

export function scan(name: string, text: string): Findings {
  const found: Findings = { writePaths: [], mints: [], testImports: [] };
  const visit = (node: ts.Node): void => {
    const used = usedName(node);
    const isIngestMember = ts.isPropertyAccessExpression(node) && node.name.text === 'ingest';
    if (used !== undefined && WRITE_NAMES.has(used)) found.writePaths.push(used);
    if (isIngestMember) found.writePaths.push('ingest');
    if (used === MINT_NAME) found.mints.push(used);
    const spec = moduleSpecifier(node);
    if (spec !== undefined && TEST_SPECIFIER.test(spec)) found.testImports.push(spec);
    ts.forEachChild(node, visit);
  };
  visit(parse(name, text));
  return found;
}

/** Files that break a rule: write paths outside the repository and local stack, mints outside their definition, test imports anywhere. */
export function offendingFiles(files: ReadonlyMap<string, string>): string[] {
  return [...files]
    .filter(([name, text]) => {
      const f = scan(name, text);
      const narrow = NARROW_CALLERS.get(name);
      const stray = f.writePaths.filter((w) => !narrow?.has(w));
      return (stray.length > 0 && !WRITE_PATH_FILES.has(name)) || (f.mints.length > 0 && !MINT_FILES.has(name)) || f.testImports.length > 0;
    })
    .map(([name]) => name);
}

const files = new Map(sourceFiles(SRC).map((f) => [relative(SRC, f).split(sep).join('/'), readFileSync(f, 'utf8')] as const));

describe('source write-path callers', () => {
  it('scans a real tree', () => {
    expect(files.size).toBeGreaterThan(40);
    for (const name of [...WRITE_PATH_FILES, ...MINT_FILES, ...NARROW_CALLERS.keys()]) expect(files.has(name)).toBe(true);
  });

  it('only the repository, the local stack and the two narrow BACK-52 callers use connect, reconnect, disconnect or ingest; only the definition mints a Reauthorization; src never imports test code', () => {
    expect(offendingFiles(files)).toEqual([]);
  });

  it('lets the runner ingest and the connect command connect, and nothing more (self-test)', () => {
    const ok = new Map([
      ['connectors/github/github.runner.ts', 'await repo.ingest(ws, items);'],
      ['ops/source-connect.ts', 'await repo.connectSource(ws, u, i);'],
    ]);
    expect(offendingFiles(ok)).toEqual([]);
    const bad = new Map([
      ['connectors/github/github.runner.ts', 'await repo.connectSource(ws, u, i);'],
      ['ops/source-connect.ts', 'await repo.ingest(ws, items);'],
      ['connectors/github/github.scheduler.ts', 'await repo.ingest(ws, items);'],
      ['connectors/github/github.wiring.ts', 'await repo.connectSource(ws, u, i);'],
      ['ops/source-connect.ts ', 'await repo.reconnectSource(ws, u, i, r);'],
    ]);
    expect(offendingFiles(bad)).toEqual([
      'connectors/github/github.runner.ts',
      'ops/source-connect.ts',
      'connectors/github/github.scheduler.ts',
      'connectors/github/github.wiring.ts',
      'ops/source-connect.ts ',
    ]);
  });

  it('flags synthetic offenders however they are laid out (self-test)', () => {
    const synthetic = new Map([
      ['http/rogue1.ts', 'await this.evidence.connectSource(ws, user, input);'],
      ['http/rogue2.ts', 'await repo.reconnectSource(ws, user, id, reauth);'],
      ['http/rogue3.ts', 'await repo.ingest(ws, items);'],
      ['http/rogue4.ts', 'await repo.ingest (ws, items);'],
      ['http/rogue5.ts', 'const u = "https://x.test"; repo.disconnectSource(ws, user, id);'],
      ['http/rogue6.ts', "const a = '*/*'; repo.connectSource(ws, u, i); /** x */"],
      ['http/rogue7.ts', '/* x */ repo.connectSource(ws, u, i);'],
      ['http/rogue8.ts', '/* a comment\n spanning lines\n */ repo.reconnectSource(ws, u, id, r);'],
      ['http/rogue9.ts', 'const r = Reauthorization.fromSessionIssuedAt(Date.now());'],
      ['http/rogue10.ts', 'const r = /"/; const u = "https://x.test"; repo.connectSource(ws, user, input);'],
      ['http/rogue11.ts', "import '../../test/evidence/approve-all-policy';"],
      ['http/rogue12.ts', "import { approveAll } from '../../test/evidence/approve-all-policy';"],
      ['http/rogue13.ts', "const m = await import('../test/db/store-harness');"],
      ['http/rogue14.ts', "const m = require('test/db/store-harness');"],
      ['http/rogue15.ts', "repo['connectSource'](ws, u, i);"],
      ['http/rogue16.ts', 'const go = repo.ingest;'],
    ]);
    expect(offendingFiles(synthetic)).toEqual([...synthetic.keys()]);
  });

  it('does not flag names that appear only in comments or string contents (self-test)', () => {
    const quiet = new Map([
      ['connectors/doc.ts', '// typed Observations for EvidenceRepository.ingest().\n/**\n * and connectSource\n * disconnectSource\n */\nexport const a = 1;'],
      ['connectors/doc2.ts', 'export const a = 1; /* repo.connectSource(x)\n fromSessionIssuedAt\n */ export const b = 2; // repo.ingest(x)'],
      ['connectors/strings.ts', 'export const s = "call repo.connectSource(x) and ingest(y)"; export const t = `fromSessionIssuedAt ${1}`; export const u = \'/test/\';'],
    ]);
    expect(offendingFiles(quiet)).toEqual([]);
  });
});

/** The member names of `interface GitHubReadTransport` (call or construct signatures count as members too). */
export function transportMembers(source: string): string[] {
  const names: string[] = [];
  parse('transport.ts', source).forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'GitHubReadTransport') {
      node.members.forEach((m) => names.push(m.name ? m.name.getText() : m.getText()));
    }
  });
  return names;
}

describe('GitHub transport port', () => {
  it('declares exactly one member, a read-only get', () => {
    expect(transportMembers(readFileSync(join(SRC, 'connectors/github/github.transport.ts'), 'utf8'))).toEqual(['get']);
  });

  it('flags a synthetic extra member such as a generic post (self-test)', () => {
    const synthetic = 'export interface GitHubReadTransport {\n  get(path: string): Promise<R>;\n  post<T>(path: string, body: T): Promise<R>;\n}\n';
    expect(transportMembers(synthetic)).toEqual(['get', 'post']);
  });
});
