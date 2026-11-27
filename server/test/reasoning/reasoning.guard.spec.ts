// Guard (BACK-107 T6, T7): the COG-04 reasoning module stays pure, model-free and unexposed, and the
// validator stays independent of the evaluator (it never imports it).
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const REASONING = join(SRC, 'reasoning');
const files = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath, e.name));
const specifiersOf = (text: string): string[] =>
  [...text.matchAll(/\bfrom\s*['"`]([^'"`]+)['"`]|^\s*import\s*['"`]([^'"`]+)['"`]|\bimport\s*\(\s*['"`]?([^'"`)]*)|\brequire\s*\(/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? 'require',
  );

const ALLOWED = /^(?:\.\/reasoning\.[a-z]+|\.\.\/memory\/memory\.(?:types|canonical)|\.\.\/retrieval\/retrieval\.types)$/;
const IMPURE = /\bfetch\b|\bprocess\b|\bglobalThis\b|\bMath\.random\b|\bDate\b|\bset(?:Timeout|Interval|Immediate)\b|\bcrypto\b|anthropic|openai|\bllm\b/i;

describe('reasoning module is pure, independent and not exposed', () => {
  it('contains exactly the reviewed files', () => {
    expect(readdirSync(REASONING).sort()).toEqual(['reasoning.evaluator.ts', 'reasoning.rules.ts', 'reasoning.types.ts', 'reasoning.validator.ts']);
  });

  it.each(files(REASONING).map((f) => [f.slice(SRC.length + 1).replaceAll('\\', '/'), f]))('%s imports only the contract, memory types and canonical JSON', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(specifiersOf(text).filter((s) => !ALLOWED.test(s))).toEqual([]);
    expect(text).not.toMatch(IMPURE);
  });

  it('the validator never imports the evaluator', () => {
    expect(specifiersOf(readFileSync(join(REASONING, 'reasoning.validator.ts'), 'utf8'))).not.toContain('./reasoning.evaluator');
  });

  it('nothing else in src imports the reasoning module (no route, controller or module wiring)', () => {
    const outside = files(SRC).filter((f) => !f.startsWith(REASONING));
    const offenders = outside.filter((f) => /(?:from\s*|import\s*\(\s*|^\s*import\s*)['"`][^'"`]*\/reasoning\//m.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
