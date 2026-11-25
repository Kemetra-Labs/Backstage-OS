// BACK-66 / BACK-92 R4: the host's one search box (src/shell/DemoSearch.tsx) offers only what the persona may read. These cases moved
// here from the retired standalone lens shell search (lenses/navigation/hits.ts and its block in logic/authorize.test.ts): the host search
// is built from the persona-projected world, so a withheld record is never offered, labelled, counted or linked. Persona is a display
// switch on synthetic data, not authorization.
import { describe, expect, it } from 'vitest';
import type { EvidenceReference } from '../contract/types';
import type { World } from '../contract/world';
import { DOMAIN } from '../domain/fixture';
import { WORLD } from '../fixture/world';
import { authorizedWorld } from '../view/authorize';
import { buildIndex, search, type SearchItem } from './search';

const LAY = ['owner', 'nontechnical'] as const;
const PERSONAS = ['technical', ...LAY] as const;
/** Every Technical-only record the host world or the canonical fixture holds (E-5 lives in the canonical fixture). */
const WITHHELD = [...new Set([
  ...Object.values(WORLD.evidence).filter((e) => e.visibility === 'technical').map((e) => e.id),
  ...Object.values(DOMAIN.evidence).filter((e) => e.visibility === 'technical').map((e) => e.id),
])];

// The shipped fixture may not hold a record that only search would reveal, so the rule is also checked on a constructed world with an
// extra Technical-only record outside the canonical overlap, as the standalone lens test did with its constructed replay row and mission.
const e12 = WORLD.evidence['E-12'] as EvidenceReference;
const CONSTRUCTED: World = { ...WORLD, evidence: { ...WORLD.evidence, 'E-X': { ...e12, id: 'E-X' } } };

const carries = (i: SearchItem, id: string): boolean =>
  i.id === id || i.label === id || i.href.includes(`/evidence/${id}`) || i.text.en.includes(id) || i.text.ar.includes(id);

describe('host search, scoped by persona (moved from the standalone lens shell search, BACK-92 R4)', () => {
  it('the fixtures hold the Technical-only records these cases depend on (guards against passing vacuously)', () => {
    expect(WITHHELD).toEqual(expect.arrayContaining(['E-5', 'E-12']));
    expect(buildIndex(CONSTRUCTED).some((i) => i.id === 'E-X')).toBe(true);
  });

  it('built from the scoped world, search offers no record the viewer may not read; Technical still finds it', () => {
    for (const p of LAY) {
      const index = buildIndex(authorizedWorld(CONSTRUCTED, p));
      expect(index.some((i) => carries(i, 'E-X')), p).toBe(false);
      expect(search(index, 'E-X', p, 'en'), p).toEqual([]);
    }
    const technical = buildIndex(authorizedWorld(CONSTRUCTED, 'technical'));
    expect(search(technical, 'E-X', 'technical', 'en').map((i) => i.id)).toEqual(['E-X']);
  });

  it('even on an unscoped index, a lay persona never gets a Technical-only hit (second line of defence)', () => {
    const raw = buildIndex(CONSTRUCTED);
    for (const p of LAY) for (const id of [...WITHHELD, 'E-X']) expect(search(raw, id, p, 'en').filter((i) => i.id === id), `${p}/${id}`).toEqual([]);
  });

  it('keeps independently authorized targets: the inventory component, the INV-DEMO-7 story and authorized evidence stay searchable', () => {
    for (const p of PERSONAS) {
      const index = buildIndex(authorizedWorld(WORLD, p));
      expect(search(index, 'inventory', p, 'en').some((i) => i.href === '#/project/RT/inventory'), `${p} inventory`).toBe(true);
      expect(search(index, 'INV-DEMO-7', p, 'en').map((i) => i.kind), `${p} story`).toContain('investigation');
      expect(search(index, 'E-1', p, 'en').map((i) => i.id), `${p} E-1`).toContain('E-1');
    }
  });

  // C-16: the Flight Deck never shows mission ids to Nontechnical. The host search does not index missions at all, so no persona can
  // find a mission id through it (the standalone lens shell search did, with ids for Owner and Technical, titles only for Nontechnical).
  it('offers no mission id to any persona: missions are not in the host index', () => {
    for (const p of PERSONAS) {
      const index = buildIndex(authorizedWorld(WORLD, p));
      expect(index.some((i) => /MSN-/.test(`${i.id} ${i.label} ${i.text.en} ${i.text.ar} ${i.href}`)), p).toBe(false);
      expect(search(index, 'MSN', p, 'en'), p).toEqual([]);
    }
  });

  it('no item id, label, text or link carries a withheld record id for a lay persona', () => {
    for (const p of LAY) {
      for (const i of buildIndex(authorizedWorld(CONSTRUCTED, p))) {
        for (const id of [...WITHHELD, 'E-X']) expect(carries(i, id), `${p}: ${i.kind} ${i.id}`).toBe(false);
      }
    }
  });
});
