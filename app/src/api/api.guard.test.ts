// Boundary guard (BACK-57): src/api is a pure adapter. Nothing in app/ calls the server (CLAUDE.md), so no
// source file under src/api may make a request or pull in anything that could. The owner approved wiring the
// adapters into the Portfolio screen on SYNTHETIC data only (2026-11-25, Jira BACK-57 comment 18848), and extended
// that to the Investigation Room on 2026-11-26: exactly two view modules may import src/api (one per screen), they
// and their fixtures must not make a request either, each reads only its own fixtures, and nothing else may
// reference src/api. Real calls to the server are a separate owner decision.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const API = join(SRC, 'api');

/** The only files outside src/api that may import it, and the synthetic bodies they read. */
const PORTFOLIO_VIEW = ['view/githubReadView.ts', 'view/githubReadView.test.ts'];
/** BACK-57, owner decision 2026-11-26: the Investigation Room's server-shaped evidence panel. */
const INVESTIGATION_VIEW = ['view/investigationReadView.ts', 'view/investigationReadView.test.ts'];
const ALLOWED_IMPORTERS = [...PORTFOLIO_VIEW, ...INVESTIGATION_VIEW];
/** Which files may read which synthetic fixture. src/api/parity.test.ts is the app half of the BACK-98 parity check. */
const FIXTURE_READERS: ReadonlyArray<{ readonly fixture: RegExp; readonly readers: readonly string[] }> = [
  { fixture: /portfolio(-project)?-response\.json$/, readers: PORTFOLIO_VIEW },
  { fixture: /(investigation|decisions)-response\.json$/, readers: [...INVESTIGATION_VIEW, 'api/parity.test.ts'] },
  { fixture: /evidence-response\.json$/, readers: ['api/parity.test.ts'] },
];
const FIXTURES = [
  'fixture/portfolio-response.json',
  'fixture/portfolio-project-response.json',
  // BACK-98 parity fixtures, read only by src/api/parity.test.ts.
  'fixture/evidence-response.json',
  'fixture/investigation-response.json',
  'fixture/decisions-response.json',
];
const REQUEST = /\bfetch\b|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\//;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) ? [path] : [];
  });
}

const isTest = (p: string) => /\.test\.[jt]sx?$/.test(p);
const rel = (p: string) => relative(SRC, p).split(sep).join('/');
const source = (p: string) => readFileSync(p, 'utf8');

/** Every module specifier: static, side-effect, re-export, dynamic import and require. */
export function specifiers(code: string): string[] {
  const out: string[] = [];
  const patterns = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]/g];
  for (const re of patterns) for (const m of code.matchAll(re)) out.push(m[1]!);
  return out;
}

/** A specifier that names src/api: a relative path through an `api` segment, or an alias such as `@/api`. */
const reachesApi = (spec: string) => /(^|\/)api(\/|$)/.test(spec);

describe('src/api boundary', () => {
  it('the specifier scan sees every import form', () => {
    const code = [
      "import { a } from '../api/portfolio';",
      "import '../api/portfolio';",
      "export * from '../api/evidence';",
      "const m = await import('../api/portfolio');",
      "const r = require('../api/portfolio');",
      "import { b } from '@/api';",
    ].join('\n');
    expect(specifiers(code).filter(reachesApi)).toHaveLength(6);
  });

  it('no file under src/api makes a request or names a request API', () => {
    const offenders = files(API)
      .filter((p) => !isTest(p))
      .filter((p) => /\bfetch\b|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(source(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('src/api imports only its own files and the display contract', () => {
    const offenders = files(API)
      .filter((p) => !isTest(p))
      .flatMap((p) => specifiers(source(p)).filter((s) => !/^\.\/[\w.-]+$/.test(s) && !/^\.\.\/contract\/[\w.-]+$/.test(s)).map((s) => `${rel(p)} -> ${s}`));
    expect(offenders).toEqual([]);
  });

  it('outside src/api, only the approved view modules (and their tests) reference it', () => {
    const offenders = files(SRC)
      .filter((p) => !p.startsWith(API + sep) && !ALLOWED_IMPORTERS.includes(rel(p)))
      .flatMap((p) => specifiers(source(p)).filter(reachesApi).map((s) => `${rel(p)} -> ${s}`));
    expect(offenders).toEqual([]);
  });

  it('the approved importers, their tests and the fixtures make no request either', () => {
    const offenders = [...ALLOWED_IMPORTERS, ...FIXTURES].filter((r) => REQUEST.test(source(join(SRC, r))));
    expect(offenders).toEqual([]);
  });

  it('each synthetic server fixture is read only by its own view module (and its test), or the parity test', () => {
    const offenders = files(SRC)
      .filter((p) => !p.endsWith('api.guard.test.ts'))
      .flatMap((p) => specifiers(source(p))
        .filter((s) => FIXTURE_READERS.some((f) => f.fixture.test(s) && !f.readers.includes(rel(p))))
        .map((s) => `${rel(p)} -> ${s}`));
    expect(offenders).toEqual([]);
  });

  it('the fixture rule bites: the portfolio view may not read the investigation fixtures, nor the investigation view the portfolio ones', () => {
    const misreads = (reader: string, spec: string) => FIXTURE_READERS.some((f) => f.fixture.test(spec) && !f.readers.includes(reader));
    expect(misreads('view/githubReadView.ts', '../fixture/investigation-response.json')).toBe(true);
    expect(misreads('view/githubReadView.ts', '../fixture/decisions-response.json')).toBe(true);
    expect(misreads('view/investigationReadView.ts', '../fixture/portfolio-response.json')).toBe(true);
    expect(misreads('view/investigationReadView.ts', '../fixture/evidence-response.json')).toBe(true);
    expect(misreads('screens/InvestigationRoom.tsx', '../fixture/investigation-response.json')).toBe(true);
    expect(misreads('view/investigationReadView.ts', '../fixture/investigation-response.json')).toBe(false);
  });

  it('exactly the two approved view modules (and their tests) are allowed importers', () => {
    expect([...ALLOWED_IMPORTERS].sort()).toEqual([
      'view/githubReadView.test.ts', 'view/githubReadView.ts', 'view/investigationReadView.test.ts', 'view/investigationReadView.ts',
    ]);
  });

  it('no file under src/api holds a raw bidi control character (Trojan Source); write \\u escapes instead', () => {
    const offenders = files(API).filter((p) => /[\u202A-\u202E\u2066-\u2069]/.test(source(p))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('the guard itself finds the adapter files it protects', () => {
    expect(files(API).filter((p) => !isTest(p)).map(rel).sort()).toEqual(['api/evidence.ts', 'api/portfolio.ts']);
  });
});
