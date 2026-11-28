// Guard for the COG-07 live search (owner decision 2026-11-27). src/cognition is the one route consumer of the
// memory and retrieval modules, so it is pinned: it imports only Nest, the existing auth guards and limiter, the
// UUID check, the memory repository and retrieval search; it never touches reasoning or learning; it declares
// GET routes only and contains no SQL; and the composition root imports nothing from memory but the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const COGNITION = join(SRC, 'cognition');
const files = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath, e.name));
const specifiersOf = (text: string): string[] =>
  [...text.matchAll(/\bfrom\s*['"`]([^'"`]+)['"`]|^\s*import\s*['"`]([^'"`]+)['"`]|\bimport\s*\(\s*['"`]?([^'"`)]*)|\brequire\s*\(/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? 'require',
  );

const ALLOWED = new Set([
  '@nestjs/common',
  '../auth/workspace.guard',
  '../auth/workspace-resolver',
  '../auth/sign-in-rate-limiter',
  '../evidence/evidence.types',
  '../memory/memory.repository',
  '../retrieval/retrieval.policy',
  '../retrieval/retrieval.search',
  './cognition.controller',
  './read-slots',
]);

describe('cognition module is the pinned, read-only consumer', () => {
  it.each(files(COGNITION).map((f) => [f.slice(SRC.length + 1).replaceAll('\\', '/'), f]))('%s imports only its allowed set', (_name, file) => {
    expect(specifiersOf(readFileSync(file, 'utf8')).filter((s) => !ALLOWED.has(s))).toEqual([]);
  });

  it.each(files(COGNITION).map((f) => [f.slice(SRC.length + 1).replaceAll('\\', '/'), f]))('%s declares GET routes only and holds no SQL', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/@(?:Post|Put|Patch|Delete|All)\s*\(/);
    expect(text).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|SELECT)\b/);
    expect(text).not.toMatch(/reasoning|learning/);
  });

  it('the composition root imports only the repository from memory', () => {
    const fromMemory = specifiersOf(readFileSync(join(SRC, 'create-app.ts'), 'utf8')).filter((s) => s.includes('/memory/'));
    expect(fromMemory).toEqual(['./memory/memory.repository']);
  });
});
