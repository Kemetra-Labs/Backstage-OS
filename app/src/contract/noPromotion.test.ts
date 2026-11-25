// BACK-54: type badges everywhere, and no path that promotes an inference to an Observation or a Decision.
// The server-record adapter half lives in src/api/noPromotion.test.ts (the src/api boundary guard).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { authorizedInvestigation } from '../view/authorize';
import { viewFor } from '../view/viewFor';
import { resolveLabel } from './rules';
import type { DisplayLabel, EvidenceReference, Persona, SourceAuthority, TruthLabel } from './types';

const LABELS: readonly TruthLabel[] = ['observed', 'correlated', 'hypothesis', 'proposed', 'approved'];
const DISPLAY: readonly DisplayLabel[] = [...LABELS, 'unknown'];
const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];

const SOURCE: SourceAuthority = {
  provider: 'github', connectivity: 'reachable', lastSuccessAt: '2026-11-25T10:00:00Z', ageMinutes: 5, ttlSeconds: 3600, synthetic: true,
};

function ref(classification: TruthLabel, opts: { read: boolean; rule?: string; url?: string }): EvidenceReference {
  return {
    id: 'E-X',
    classification,
    freshness: 'current',
    visibility: 'all',
    ...(opts.rule !== undefined ? { rule: opts.rule } : {}),
    observation: opts.read
      ? {
          id: 'O-X', target: { kind: 'workItem', id: 'W', label: 'W' }, source: SOURCE,
          observedAt: '2026-11-25T10:00:00Z', ingestedAt: '2026-11-25T10:00:00Z', environment: 'ci',
          ...(opts.url ? { sourceUrl: opts.url } : {}),
        }
      : null,
  };
}

/** What a label may legitimately display as. Anything not listed would be a promotion. */
const ALLOWED: Readonly<Record<TruthLabel, readonly DisplayLabel[]>> = {
  observed: ['observed', 'unknown'],
  correlated: ['correlated', 'hypothesis', 'unknown'],
  hypothesis: ['hypothesis', 'unknown'],
  proposed: ['proposed', 'unknown'],
  approved: ['approved', 'proposed', 'unknown'],
};

describe('resolveLabel never promotes (BACK-54)', () => {
  const cases = LABELS.flatMap((c) =>
    [true, false].flatMap((read) =>
      [undefined, '', '  ', 'same-commit rule'].flatMap((rule) =>
        [undefined, 'https://github.com/o/r/pull/1'].map((url) => ({ c, read, rule, url })),
      ),
    ),
  );

  it.each(cases)('$c read=$read rule=$rule url=$url stays within its allowed labels', ({ c, read, rule, url }) => {
    const out = resolveLabel(ref(c, { read, ...(rule !== undefined ? { rule } : {}), ...(url ? { url } : {}) }));
    expect(ALLOWED[c]).toContain(out);
  });

  it('an inference never displays as observed or approved, whatever else is set', () => {
    for (const c of ['correlated', 'hypothesis', 'proposed'] as const) {
      for (const read of [true, false]) {
        const out = resolveLabel(ref(c, { read, rule: 'r', url: 'https://github.com/o/r/pull/1' }));
        expect(out).not.toBe('observed');
        expect(out).not.toBe('approved');
      }
    }
  });
});

describe('every Investigation Room evidence item carries a type badge (BACK-54)', () => {
  for (const p of PERSONAS) {
    it(`gives every evidence item a display label (${p})`, () => {
      const items = viewFor(p, authorizedInvestigation(INV_DEMO_7, p)).evidence;
      expect(items.length).toBeGreaterThan(0);
      for (const e of items) expect(DISPLAY).toContain(e.label);
    });
  }

  /** Every component that renders an evidence row must render a TruthChip in it. */
  it('every file that renders an evidence row also renders a TruthChip', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) files.push(p);
      }
    };
    walk(root);
    const rows = files.filter((f) => /evidenceRowClass\(|className=\{?["'`]evidence-item/.test(readFileSync(f, 'utf8')));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const f of rows) expect(readFileSync(f, 'utf8'), f).toMatch(/<TruthChip\b/);
  });
});
