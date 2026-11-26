// Request guard (BACK-51 P1, owner decisions D1 (a) and D2 (a), 2026-11-26). The app calls the server only in live mode
// (VITE_KAWALYS_LIVE=1, off by default), same origin, through src/live/http.ts. So, across all of src/:
//   - only src/live/http.ts names a request API (fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon);
//   - it holds no absolute URL (no scheme, no protocol-relative `//host`), and every `/api/` path literal lives in src/live;
//   - only src/live/reads.ts and src/live/session.ts (BACK-51 P2) import it, so screens and view modules never reach the network
//     directly.
// src/api keeps its own guard (src/api/api.guard.test.ts): a pure adapter folder with no request code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const LIVE_DIR = join(SRC, 'live');

/** The one file allowed to name a request API. */
const REQUEST_MODULE = 'live/http.ts';
/** The modules (with their tests and the request module's own test) allowed to import the request module: the reads and the session. */
const HTTP_IMPORTERS = ['live/reads.ts', 'live/reads.test.ts', 'live/session.ts', 'live/session.test.ts', 'live/http.test.ts'];
const REQUEST_API = /\bfetch\b|XMLHttpRequest|WebSocket|EventSource|sendBeacon/;
const ABSOLUTE_URL = /\b(?:https?|wss?):\/\/|['"`]\/\/[^/'"`\s]/;
const API_PATH_LITERAL = /['"`]\/api\//;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) ? [path] : [];
  });
}

const isTest = (p: string) => /\.test\.[jt]sx?$/.test(p);
const rel = (p: string) => relative(SRC, p).split(sep).join('/');
const source = (p: string) => readFileSync(p, 'utf8');
type Entry = readonly [string, string];
const entries = (keep: (p: string) => boolean): Entry[] => files(SRC).filter(keep).map((p) => [rel(p), source(p)] as const);

/** Every module specifier: static, side-effect, re-export, dynamic import and require. */
function specifiers(code: string): string[] {
  const patterns = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]/g];
  return patterns.flatMap((re) => [...code.matchAll(re)].map((m) => m[1]!));
}

/**
 * Whether a specifier, resolved against the importing file, names the request module. Resolving (not pattern-matching) catches
 * `../live/./http`, `../live//http` and `../x/../live/http`; an alias such as `@/live/http` is matched by its tail.
 */
const reachesHttp = (from: string, spec: string) => {
  const target = spec.startsWith('.') ? posix.normalize(posix.join(posix.dirname(from), spec)) : spec;
  return /(^|\/)live\/http(\.[jt]s)?$/.test(target.replace(/\/+/g, '/'));
};

/** Files that name a request API but are not the request module. */
export const requestOffenders = (es: readonly Entry[]) => es.filter(([r, code]) => r !== REQUEST_MODULE && REQUEST_API.test(code)).map(([r]) => r);
/** Importers of the request module other than its loader. */
export const httpImportOffenders = (es: readonly Entry[]) =>
  es.flatMap(([r, code]) => (HTTP_IMPORTERS.includes(r) ? [] : specifiers(code).filter((s) => reachesHttp(r, s)).map((s) => `${r} -> ${s}`)));
/** Non-test files outside src/live that hold a `/api/` path literal: building a request path is src/live's job. */
export const apiPathOffenders = (es: readonly Entry[]) => es.filter(([r, code]) => !r.startsWith('live/') && API_PATH_LITERAL.test(code)).map(([r]) => r);

describe('src/live request guard (BACK-51 P1)', () => {
  it('in all of src/, only src/live/http.ts names a request API', () => {
    expect(requestOffenders(entries((p) => !isTest(p)))).toEqual([]);
    expect(REQUEST_API.test(source(join(SRC, REQUEST_MODULE)))).toBe(true);
  });

  it('the request rule bites: fetch, XHR, sendBeacon or an absolute-URL fetch anywhere else is refused', () => {
    expect(requestOffenders([
      ['screens/X.tsx', "const r = await fetch('/api/portfolio');"],
      ['view/githubReadView.ts', "fetch('https://evil.test/x')"],
      ['app/Boot.tsx', 'new XMLHttpRequest()'],
      ['api/portfolio.ts', "navigator.sendBeacon('/api/x')"],
      ['live/reads.ts', "window.fetch('/api/x')"],
      ['live/http.ts', "fetch('/api/x')"],
    ])).toEqual(['screens/X.tsx', 'view/githubReadView.ts', 'app/Boot.tsx', 'api/portfolio.ts', 'live/reads.ts']);
  });

  it('src/live builds no absolute URL: no scheme and no protocol-relative host in its source', () => {
    const offenders = files(LIVE_DIR).filter((p) => !isTest(p)).filter((p) => ABSOLUTE_URL.test(source(p))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('the absolute-URL rule bites', () => {
    for (const code of ["fetch('https://evil.test/api/x')", 'const u = `http://127.0.0.1:8787/portfolio`;', "apiRequest('//evil.test/api/x')", "new WebSocket('wss://x')"])
      expect(ABSOLUTE_URL.test(code), code).toBe(true);
    for (const code of ["apiRequest('/api/portfolio')", '// a comment // with slashes', "const r = /^\\/api\\//;"])
      expect(ABSOLUTE_URL.test(code), code).toBe(false);
  });

  it('every non-test /api/ path literal lives in src/live, and each one there is relative', () => {
    expect(apiPathOffenders(entries((p) => !isTest(p)))).toEqual([]);
    expect(apiPathOffenders([['screens/X.tsx', "const p = '/api/portfolio';"], ['live/reads.ts', "'/api/portfolio'"]])).toEqual(['screens/X.tsx']);
  });

  it('outside its loader (and the tests), nothing imports src/live/http', () => {
    expect(httpImportOffenders(entries((p) => !p.endsWith('live.guard.test.ts')))).toEqual([]);
  });

  it('the import rule bites: a view module, a screen or a sibling importing the request module is refused', () => {
    expect(httpImportOffenders([
      ['view/githubReadView.ts', "import { apiRequest } from '../live/http';"],
      ['screens/portfolio/GitHubReads.tsx', "const m = await import('../../live/http.ts');"],
      ['live/other.ts', "export * from './http';"],
      ['api/portfolio.ts', "const h = require('../live/http');"],
      ['view/projectView.ts', "import { apiRequest } from '../live/./http';"],
      ['view/sourceView.ts', "import { apiRequest } from '../live//http';"],
      ['view/homeView.ts', "import { apiRequest } from '../app/../live/http.ts';"],
      ['screens/Home.tsx', "import { apiRequest } from '@/live/http';"],
      ['live/reads.ts', "import { apiRequest } from './http';"],
    ])).toEqual([
      'view/githubReadView.ts -> ../live/http',
      'screens/portfolio/GitHubReads.tsx -> ../../live/http.ts',
      'live/other.ts -> ./http',
      'api/portfolio.ts -> ../live/http',
      'view/projectView.ts -> ../live/./http',
      'view/sourceView.ts -> ../live//http',
      'view/homeView.ts -> ../app/../live/http.ts',
      'screens/Home.tsx -> @/live/http',
    ]);
    // A module that merely ends in http elsewhere is not the request module.
    expect(httpImportOffenders([['view/x.ts', "import h from '../lib/http';"]])).toEqual([]);
  });

  it('the loader and the session import the request module; the view modules and screens never do', () => {
    expect(specifiers(source(join(SRC, 'live/reads.ts'))).filter((s) => reachesHttp('live/reads.ts', s))).toEqual(['./http']);
    expect(specifiers(source(join(SRC, 'live/session.ts'))).filter((s) => reachesHttp('live/session.ts', s))).toEqual(['./http']);
  });

  it('the guard finds the files it protects', () => {
    expect(files(LIVE_DIR).filter((p) => !isTest(p)).map(rel).sort()).toEqual(['live/http.ts', 'live/reads.ts', 'live/session.ts']);
  });
});
