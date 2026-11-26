// Guard (BACK-104): the COG-01 research port stays inert. Its core modules are pure (every import is a
// sibling module; no network, environment, process, crypto, clock, timer or randomness), and nothing in
// the server or app source imports anything under test/, so the port is never part of a build or runtime.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'test/research/cognitive-core');
const CORE = ['contract.ts', 'memory.ts', 'reasoner.ts', 'validator.ts', 'index.ts', 'fixture.ts'];

/** Every module specifier in static, side-effect, re-export and dynamic forms. */
const specifiers = (text: string): string[] =>
  [...text.matchAll(/\bfrom\s*['"`]([^'"`]+)['"`]|^\s*import\s*['"`]([^'"`]+)['"`]|\bimport\s*\(\s*['"`]([^'"`]+)['"`]|\brequire\s*\(\s*['"`]([^'"`]+)['"`]/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? m[4]!,
  );

const IMPURE = [
  /\bimport\s*\(/, // dynamic import with any argument
  /\brequire\b/,
  /\bfetch\b|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/,
  /\bprocess\b|\bglobalThis\b|\bcrypto\b|\bperformance\b/,
  /\bMath\.random\b/,
  /\bset(?:Timeout|Interval|Immediate)\b|\bqueueMicrotask\b/,
  /\bDate\b(?!\.parse\b)/, // only the pure Date.parse is allowed (the fixture's fixed timestamps)
];

const sourceFiles = (root: string): string[] =>
  existsSync(root)
    ? readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && /\.(?:[cm]?[jt]sx?)$/.test(e.name))
        .map((e) => join(e.parentPath, e.name))
    : [];

describe('COG-01 research port is inert', () => {
  it('contains exactly the reviewed files', () => {
    expect(readdirSync(DIR).sort()).toEqual(
      [...CORE, 'README.md', 'frozen-fixture.json', 'oracle-cases.json', 'oracle.json', 'restart-hooks.mjs', 'restart-worker.ts'].sort(),
    );
  });

  it.each(CORE)('%s imports only sibling modules', (name) => {
    const found = specifiers(readFileSync(join(DIR, name), 'utf8'));
    expect(found.filter((s) => !/^\.\/[a-z]+$/.test(s))).toEqual([]);
  });

  it.each(CORE)('%s uses no network, environment, process, crypto, clock, timer or randomness', (name) => {
    const text = readFileSync(join(DIR, name), 'utf8');
    for (const pattern of IMPURE) expect(text).not.toMatch(pattern);
  });

  it('the purity checks catch the forms they claim to', () => {
    const impure = (text: string) => IMPURE.some((p) => p.test(text)) || specifiers(text).some((s) => !/^\.\/[a-z]+$/.test(s));
    for (const bad of [
      "import 'node:http';",
      'const m = await import(`node:fs`);',
      "export * from 'node:net';",
      "const e = process['env'];",
      'crypto.randomUUID();',
      'const d = Date();',
      'new Date ();',
      'setTimeout(f, 1);',
      "fetch('x');",
    ]) expect([bad, impure(bad)]).toEqual([bad, true]);
    expect(impure("import {x} from './memory';\nconst t = Date.parse('2026-01-01T00:00Z');")).toBe(false);
  });

  it('no server or app source imports anything under test/ or research/', () => {
    const roots = [resolve(process.cwd(), 'src'), resolve(process.cwd(), '../app/src')];
    const files = roots.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => specifiers(readFileSync(f, 'utf8')).some((s) => /(?:^|\/)(?:test|research)(?:\/|$)|cognitive-core/.test(s)));
    expect(offenders).toEqual([]);
  });
});
