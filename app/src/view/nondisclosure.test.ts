// BACK-73: what Owner and Nontechnical receive once the persona projection has run (App.tsx projects once; screens read the
// projected world). The other view tests call the views with the raw world, which is the Technical-equivalent input.
import { describe, expect, it } from 'vitest';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { WORLD } from '../fixture/world';
import { buildIndex, search } from '../nav/search';
import { authorizedWorld } from './authorize';
import { explorerFor } from './explorerView';
import { homeView } from './homeView';
import { portfolioView } from './portfolioView';
import { linkedEvidence } from './projectView';
import { componentById, projectById } from './world';

const LAY = ['owner', 'nontechnical'] as const;
const WITHHELD = ['E-5', 'E-12', 'E-23'] as const;

describe('persona-projected views (Owner, Nontechnical)', () => {
  it('home: evidence counts exclude E-5 and E-23', () => {
    const raw = homeView(WORLD, 'technical').investigations;
    for (const p of LAY) {
      const v = homeView(authorizedWorld(WORLD, p), p).investigations;
      expect(v.find((i) => i.id === 'INV-DEMO-7')?.evidenceCount).toBe(raw.find((i) => i.id === 'INV-DEMO-7')!.evidenceCount - 1);
      expect(v.find((i) => i.id === 'INV-DEMO-9')?.evidenceCount).toBe(raw.find((i) => i.id === 'INV-DEMO-9')!.evidenceCount - 1);
    }
  });

  it('portfolio: RT attention count is 1 for Owner and Nontechnical, 2 for Technical', () => {
    for (const p of LAY) {
      const rt = portfolioView(authorizedWorld(WORLD, p), p, 'en').products.find((x) => x.id === 'RT');
      expect(rt?.attentionCount, p).toBe(1);
    }
    expect(portfolioView(WORLD, 'technical', 'en').products.find((x) => x.id === 'RT')?.attentionCount).toBe(2);
  });

  it('portfolio: no attention row carries a withheld evidence row', () => {
    for (const p of LAY) {
      const v = portfolioView(authorizedWorld(WORLD, p), p, 'en');
      for (const a of v.attention) {
        expect(a.id).not.toBe('ATT-RT-2');
        for (const r of a.evidence) expect(WITHHELD, `${p}/${a.id}`).not.toContain(r.view.id);
      }
    }
  });

  it('project: linked evidence for RT inventory and payments has no withheld rows', () => {
    for (const p of LAY) {
      const w = authorizedWorld(WORLD, p);
      const rt = projectById(w, 'RT')!;
      for (const id of ['inventory', 'payments']) {
        const rows = linkedEvidence(w, rt, componentById(rt, id)!, p, 'en');
        expect(rows.map((r) => r.id), `${p}/${id}`).toEqual([]);
      }
    }
    const raw = projectById(WORLD, 'RT')!;
    expect(linkedEvidence(WORLD, raw, componentById(raw, 'inventory')!, 'technical', 'en').map((r) => r.id)).toContain('E-5');
    expect(linkedEvidence(WORLD, raw, componentById(raw, 'payments')!, 'technical', 'en').map((r) => r.id)).toContain('E-12');
  });

  it('explorer: E-5, E-12 and E-23 do not exist on the projected world, exactly like an unknown id', () => {
    for (const p of LAY) {
      const w = authorizedWorld(WORLD, p);
      for (const id of [...WITHHELD, 'E-999']) {
        expect(explorerFor(w, id, p, undefined, INV_DEMO_7.rawOutput), `${p}/${id}`).toBeUndefined();
      }
      expect(explorerFor(w, 'E-1', p, 'INV-DEMO-7', INV_DEMO_7.rawOutput)).toBeDefined();
    }
    expect(explorerFor(WORLD, 'E-12', 'technical', undefined, INV_DEMO_7.rawOutput)).toBeDefined();
  });

  it('explorer: sibling list for E-1 has no E-5', () => {
    for (const p of LAY) {
      const t = explorerFor(authorizedWorld(WORLD, p), 'E-1', p, 'INV-DEMO-7', INV_DEMO_7.rawOutput);
      expect(t?.siblings.map((s) => s.id)).toEqual(['E-2', 'E-3', 'E-4', 'E-6', 'E-7']);
    }
  });

  it('search: the index built from the projected world has no withheld id, and E-12 matches nothing', () => {
    for (const p of LAY) {
      const index = buildIndex(authorizedWorld(WORLD, p));
      for (const id of WITHHELD) {
        expect(index.some((i) => i.id === id || i.label === id || i.href.includes(`/evidence/${id}`)), `${p}/${id}`).toBe(false);
        expect(search(index, id, p, 'en')).toEqual(search(index, 'E-999', p, 'en'));
      }
    }
    expect(buildIndex(WORLD).some((i) => i.id === 'E-12')).toBe(true);
  });
});
