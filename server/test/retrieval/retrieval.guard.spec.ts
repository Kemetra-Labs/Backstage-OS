// Guard (BACK-106 R7): the COG-03 retrieval module stays pure and unexposed (COG-07 owns any route).
// It reads only the COG-02 projection types and policy helpers: no database, network, clock, randomness,
// dependency or test import, and nothing else in src imports it.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const RETRIEVAL = join(SRC, 'retrieval');
const files = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath, e.name));

const specifiersOf = (text: string): string[] =>
  [...text.matchAll(/\bfrom\s*['"`]([^'"`]+)['"`]|^\s*import\s*['"`]([^'"`]+)['"`]|\bimport\s*\(\s*['"`]?([^'"`)]*)|\brequire\s*\(/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? 'require',
  );

const ALLOWED = /^(?:\.\/retrieval\.[a-z]+|\.\.\/memory\/memory\.(?:types|policy))$/;
const IMPURE = /\bfetch\b|\bprocess\b|\bglobalThis\b|\bMath\.random\b|\bDate\b|\bset(?:Timeout|Interval|Immediate)\b|\bcrypto\b/;

describe('retrieval module is pure and not exposed', () => {
  it('contains exactly the reviewed files', () => {
    expect(readdirSync(RETRIEVAL).sort()).toEqual(
      ['retrieval.documents.ts', 'retrieval.normalize.ts', 'retrieval.policy.ts', 'retrieval.relations.ts', 'retrieval.search.ts', 'retrieval.types.ts'].sort(),
    );
  });

  it.each(files(RETRIEVAL).map((f) => [f.slice(SRC.length + 1).replaceAll('\\', '/'), f]))('%s imports only retrieval siblings and memory types/policy', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(specifiersOf(text).filter((s) => !ALLOWED.test(s))).toEqual([]);
    expect(text).not.toMatch(IMPURE);
  });

  it('the checks catch the forms they claim to', () => {
    const bad = (t: string) => IMPURE.test(t) || specifiersOf(t).some((s) => !ALLOWED.test(s));
    for (const t of ["import pg from 'pg';", "import { x } from '../db/workspace-context';", "import { y } from '../memory/memory.repository';", 'const d = new Date();', "fetch('x')", "require('fs')", "import 'node:http';"])
      expect([t, bad(t)]).toEqual([t, true]);
    expect(bad("import { scopeRoot } from '../memory/memory.policy';")).toBe(false);
  });

  it('nothing else in src imports the retrieval module (no route, controller or module wiring)', () => {
    // COG-04 reasoning (BACK-107) may use the identity type only; its own guard pins that.
    const REASONING = join(SRC, 'reasoning');
    const outside = files(SRC).filter((f) => !f.startsWith(RETRIEVAL) && !f.startsWith(REASONING));
    const offenders = outside.filter((f) => /(?:from\s*|import\s*\(\s*|^\s*import\s*)['"`][^'"`]*\/retrieval\//m.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
