// BACK-92 R7: V1 has no restricted-evidence placeholder path. Owner and Nontechnical never receive a Technical-only record (BACK-73
// scopes the world once, in App.tsx), so the old "Restricted to Technical" rows, chips, counts and locked links could never render
// and were removed: a placeholder would itself disclose that the record exists (M05-D05-B). These guards fail if that path, or an
// unscoped read of the V1 fixtures, comes back. Persona is a display switch on synthetic demo data, not authorization.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Persona } from '../contract/types';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { WORLD } from '../fixture/world';
import { authorizedInvestigation, authorizedWorld } from './authorize';

const LAY: readonly Persona[] = ['owner', 'nontechnical'];
const SRC = join(__dirname, '..');

const WITHHELD = Object.values(WORLD.evidence).filter((e) => e.visibility === 'technical');
const WITHHELD_IDS = new Set([...WITHHELD.map((e) => e.id), ...WITHHELD.flatMap((e) => (e.observation ? [e.observation.id] : []))]);

function walk(root: unknown, visit: (value: unknown, path: string) => void): void {
  const seen = new Set<object>();
  const go = (v: unknown, path: string): void => {
    visit(v, path);
    if (v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    for (const [k, child] of Object.entries(v)) go(child, `${path}.${k}`);
  };
  go(root, '$');
}

function disclosures(root: unknown): string[] {
  const found: string[] = [];
  walk(root, (v, path) => {
    if (typeof v === 'string' && WITHHELD_IDS.has(v)) found.push(`${path} = ${v}`);
    if (v && typeof v === 'object' && (v as { visibility?: unknown }).visibility === 'technical') found.push(`${path} is Technical-only`);
  });
  return found;
}

describe('V1 render input for lay personas never holds a Technical-only record (BACK-92 R7)', () => {
  it('the fixtures do hold Technical-only records, so this guard is not vacuous', () => {
    expect(WITHHELD.map((e) => e.id).sort()).toEqual(['E-12', 'E-23', 'E-5']);
    expect(disclosures(WORLD).length).toBeGreaterThan(0);
    expect(disclosures(INV_DEMO_7).length).toBeGreaterThan(0);
  });

  it.each(LAY)('%s: the scoped world and investigation App.tsx renders from contain none of them, anywhere', (p) => {
    expect(disclosures(authorizedWorld(WORLD, p)), `${p} world`).toEqual([]);
    expect(disclosures(authorizedInvestigation(INV_DEMO_7, p)), `${p} investigation`).toEqual([]);
  });
});

function hostSources(): Array<{ readonly file: string; readonly text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(SRC, path).split(sep).join('/');
      if (statSync(path).isDirectory()) {
        if (!['lenses', 'fixture', 'i18n', 'domain'].includes(rel)) visit(path);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && rel !== 'screens/scopeGuard.ts') {
        out.push({ file: rel, text: readFileSync(path, 'utf8') });
      }
    }
  };
  visit(SRC);
  return out;
}

describe('V1 host source has no restricted-placeholder path and no unscoped fixture read (BACK-92 R7)', () => {
  const files = hostSources();

  it('reads the host sources (not vacuous)', () => {
    const names = files.map((f) => f.file);
    for (const f of ['App.tsx', 'view/evidence.ts', 'screens/home/EvidenceChips.tsx', 'components/EvidenceList.tsx']) expect(names).toContain(f);
  });

  const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
    [/\bcopy\.restricted\b|\bCOPY\[[^\]]+\]\.restricted\b/, 'the "Restricted to Technical" placeholder copy'],
    [/restrictedCount/, 'a restricted-evidence count'],
    [/\.restricted\b/, 'a restricted flag on an evidence view'],
    [/\brestricted\s*[?]?:\s*(true|boolean)\b/, 'a restricted field on a view model'],
  ];

  it.each(BANNED.map(([re, what]) => [what, re] as const))('no host file renders %s', (_what, re) => {
    expect(files.filter((f) => re.test(f.text)).map((f) => f.file)).toEqual([]);
  });

  it('only App.tsx reads the V1 world and investigation fixtures, and scopes them before any screen sees them', () => {
    const readers = files.filter((f) => /from '[./]*fixture\/(world|inv-demo-7)'/.test(f.text)).map((f) => f.file).sort();
    expect(readers).toEqual(['App.tsx', 'shell/TopBar.tsx']);
    expect(files.find((f) => f.file === 'shell/TopBar.tsx')?.text).toMatch(/import \{ SOURCES \} from '\.\.\/fixture\/inv-demo-7';/);
    const app = files.find((f) => f.file === 'App.tsx')?.text ?? '';
    expect(app).toMatch(/authorizedWorld\(WORLD, persona\)/);
    expect(app).toMatch(/authorizedInvestigation\(INV_DEMO_7, persona\)/);
    expect(app.match(/\bWORLD\b/g)?.length).toBe(2);
    expect(app.match(/\bINV_DEMO_7\b/g)?.length).toBe(2);
  });
});
