import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import type { Persona } from '../contract/types';
import { authorizedInvestigation, authorizedWorld } from './authorize';

const technicalIds = Object.values(WORLD.evidence).filter((e) => e.visibility === 'technical').map((e) => e.id);

describe.each<Persona>(['owner', 'nontechnical'])('V1 projection for %s', (p) => {
  it('no technical evidence id survives anywhere', () => {
    expect(technicalIds.length).toBeGreaterThan(0);
    const w = JSON.stringify(authorizedWorld(WORLD, p));
    const i = JSON.stringify(authorizedInvestigation(INV_DEMO_7, p));
    for (const id of technicalIds) {
      expect(w).not.toContain(`"${id}"`);
      expect(i).not.toContain(`"${id}"`);
    }
  });

  it('inventory and payments become unknown with no age basis', () => {
    const rt = authorizedWorld(WORLD, p).projects.find((x) => x.id === 'RT');
    for (const id of ['inventory', 'payments']) {
      const c = rt?.components.find((x) => x.id === id);
      expect(c?.state.health).toBe('unknown');
      expect(c?.state.freshness).toBe('unknown');
      expect(c?.state.basis.length).toBe(0);
    }
  });

  it('ATT-RT-2 is removed; ATT-RT-1 stays', () => {
    const ids = authorizedWorld(WORLD, p).projects.flatMap((x) => x.attention.map((a) => a.id));
    expect(ids).not.toContain('ATT-RT-2');
    expect(ids).toContain('ATT-RT-1');
  });

  it('INV-DEMO-9 keeps E-21, E-22, E-24 only', () => {
    const inv = authorizedWorld(WORLD, p).investigations.find((x) => x.id === 'INV-DEMO-9');
    expect(inv?.evidence.map((e) => e.id).sort()).toEqual(['E-21', 'E-22', 'E-24']);
  });
});

describe('V1 projection identity and purity', () => {
  it('technical gets the same world object', () => {
    expect(authorizedWorld(WORLD, 'technical')).toBe(WORLD);
    expect(authorizedInvestigation(INV_DEMO_7, 'technical')).toBe(INV_DEMO_7);
  });
  it('memoized', () => {
    expect(authorizedWorld(WORLD, 'owner')).toBe(authorizedWorld(WORLD, 'owner'));
    expect(authorizedInvestigation(INV_DEMO_7, 'owner')).toBe(authorizedInvestigation(INV_DEMO_7, 'owner'));
  });
  it('does not mutate WORLD', () => {
    const before = structuredClone(WORLD);
    authorizedWorld(WORLD, 'owner');
    authorizedWorld(WORLD, 'nontechnical');
    expect(WORLD).toEqual(before);
  });
});
