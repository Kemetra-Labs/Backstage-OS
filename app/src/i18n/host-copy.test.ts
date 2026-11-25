// BACK-92 R7: host copy has one lookup, hostCopy(name, lang). No source outside src/i18n imports a host copy tree as a value or
// indexes one by language, so every host string goes through the same entry point as the keyed lens copy (translate()).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOST_COPY, hostCopy, type HostCopyName } from './index';

const SRC = join(__dirname, '..');
const NAMES = Object.keys(HOST_COPY) as HostCopyName[];
const TREE = NAMES.join('|');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const HOSTS = sources(SRC).filter((p) => !relative(SRC, p).startsWith('i18n'));

/** Violations in one source text: a tree indexed by language, or a tree imported as a value from i18n. */
export function violations(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(new RegExp(`\\b(${TREE})\\[`, 'g'))) found.push(`${m[1]}[…]`);
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[./]*i18n[^']*'/g)) {
    for (const item of m[1].split(',').map((s) => s.trim())) {
      if (new RegExp(`^(${TREE})$`).test(item)) found.push(`import ${item}`);
    }
  }
  return found;
}

describe('host copy goes through hostCopy()', () => {
  it('scans the host sources', () => {
    expect(HOSTS.length).toBeGreaterThan(50);
  });

  it('no host source reads a copy tree directly', () => {
    const bad = HOSTS.flatMap((p) => violations(readFileSync(p, 'utf8')).map((v) => `${relative(SRC, p)}: ${v}`));
    expect(bad).toEqual([]);
  });

  it('flags a direct read, so the guard cannot pass vacuously', () => {
    expect(violations("import { PROJECT_COPY } from '../i18n/screens/project';\nconst t = PROJECT_COPY[lang];")).toEqual([
      'PROJECT_COPY[…]', 'import PROJECT_COPY',
    ]);
    expect(violations("import { COPY, translate } from '../i18n';")).toEqual(['import COPY']);
    expect(violations("import { hostCopy, type Copy } from '../i18n';\nconst c = hostCopy('COPY', lang);")).toEqual([]);
  });

  it('returns the same tree object as the direct read, in both languages', () => {
    for (const name of NAMES) {
      for (const lang of ['en', 'ar'] as const) expect(hostCopy(name, lang)).toBe(HOST_COPY[name][lang]);
    }
  });
});
