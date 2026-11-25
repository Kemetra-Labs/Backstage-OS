// Boundary guard (BACK-57 slice 3): src/api is a pure adapter. Nothing in app/ calls the server
// (CLAUDE.md), so no source file under src/api may make a request or pull in anything that could,
// and nothing outside src/api may reference it until the owner approves wiring it (BACK-57).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const API = join(SRC, 'api');

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

  it('nothing outside src/api references it yet', () => {
    const offenders = files(SRC)
      .filter((p) => !p.startsWith(API + sep))
      .flatMap((p) => specifiers(source(p)).filter(reachesApi).map((s) => `${rel(p)} -> ${s}`));
    expect(offenders).toEqual([]);
  });

  it('the guard itself finds the adapter files it protects', () => {
    expect(files(API).filter((p) => !isTest(p)).map(rel).sort()).toEqual(['api/evidence.ts', 'api/portfolio.ts']);
  });
});
