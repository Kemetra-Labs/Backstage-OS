// BACK-108 D6 guard: the learning machinery is pure and not activated. It imports only canonical
// hashing, reads no clock, randomness, network or environment, and nothing else in src imports it
// (no route, controller, module or reasoning wiring). Activation needs BACK-45 evidence and real outcomes.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const LEARNING = join(SRC, 'learning');
const files = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath, e.name));
const specifiersOf = (text: string): string[] =>
  [...text.matchAll(/\bfrom\s*['"`]([^'"`]+)['"`]|^\s*import\s*['"`]([^'"`]+)['"`]|\bimport\s*\(\s*['"`]?([^'"`)]*)|\brequire\s*\(/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? 'require',
  );

describe('learning module is pure and not activated (D6)', () => {
  it.each(files(LEARNING).map((f) => [f.slice(SRC.length + 1), f]))('%s imports only canonical hashing and stays pure', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(specifiersOf(text).filter((s) => s !== '../memory/memory.canonical')).toEqual([]);
    expect(text).not.toMatch(/Date\.now|Math\.random|\bfetch\(|process\.env|new Date\(\)/);
  });

  it('nothing else in src imports the learning module', () => {
    const outside = files(SRC).filter((f) => !f.startsWith(LEARNING));
    expect(outside.filter((f) => /['"`][^'"`]*\/learning\//.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
