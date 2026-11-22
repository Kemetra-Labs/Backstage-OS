import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { triadOf } from './world';
import type { EvidenceReference, Persona } from '../contract/types';
import type { Decision, World } from '../contract/world';
import type { InvestigationData } from '../contract/types';
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
    // Ids can also appear inside prose, not just as quoted JSON values.
    const strs: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') strs.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(authorizedWorld(WORLD, p)); walk(authorizedInvestigation(INV_DEMO_7, p));
    for (const s of strs) expect(s, s).not.toMatch(/\bE-(5|12|23)\b/);
  });

  it('persona-keyed text is collapsed to the active persona', () => {
    const w = authorizedWorld(WORLD, p);
    const json = JSON.stringify(w);
    expect(json).not.toContain('DEMO-311');
    const inv = w.investigations.find((x) => x.id === 'INV-DEMO-9');
    expect(inv?.title.technical).toEqual(inv?.title[p]);
    expect(inv?.title.owner).toEqual(inv?.title[p]);
    expect(inv?.title.nontechnical).toEqual(inv?.title[p]);
    const orig = WORLD.investigations.find((x) => x.id === 'INV-DEMO-9');
    expect(inv?.title[p]).toEqual(orig?.title[p]);
  });

  it('DEC-DEMO-5 shared text does not state the withheld deploy correlation', () => {
    const d = authorizedWorld(WORLD, p).decisions.find((x) => x.id === 'DEC-DEMO-5');
    expect(d).toBeDefined();
    expect(JSON.stringify([d?.context, d?.hypotheses])).not.toMatch(/deploy/i);
  });

  it('RT health is unknown with no age', () => {
    const rt = authorizedWorld(WORLD, p).projects.find((x) => x.id === 'RT');
    const t = triadOf((rt as NonNullable<typeof rt>).health);
    expect(t.health).toBe('unknown');
    expect(t.ageMinutes).toBeNull();
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

describe('V1 projection edge cases', () => {
  it('positive control: the unprojected world contains the technical ids', () => {
    const j = JSON.stringify(WORLD);
    for (const id of ['E-5', 'E-12', 'E-23']) expect(j).toContain(`"${id}"`);
  });

  it('drops an approved decision whose record is withheld', () => {
    const tech = Object.values(WORLD.evidence).find((e) => e.visibility === 'technical') as EvidenceReference;
    const base = WORLD.decisions[0] as Decision;
    const approved: Decision = { ...base, id: 'DEC-X', classification: 'approved', record: tech };
    const w: World = { ...WORLD, decisions: [approved, base] };
    const ids = authorizedWorld(w, 'owner').decisions.map((d) => d.id);
    expect(ids).not.toContain('DEC-X');
    expect(ids).toContain(base.id);
    expect(authorizedWorld(w, 'technical').decisions.map((d) => d.id)).toContain('DEC-X');
  });

  it('throws when rawOutput cites withheld evidence', () => {
    const tech = Object.values(WORLD.evidence).find((e) => e.visibility === 'technical') as EvidenceReference;
    const inv: InvestigationData = { ...INV_DEMO_7, evidence: [...INV_DEMO_7.evidence, tech], rawOutput: { evidenceId: tech.id, text: 'x' } };
    expect(() => authorizedInvestigation(inv, 'owner')).toThrow();
    expect(authorizedInvestigation(inv, 'technical')).toBe(inv);
  });
});
