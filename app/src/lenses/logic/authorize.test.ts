// BACK-30 (M05-D05-B): a viewer not authorized for a Technical-only record must not be able to tell it exists.
// Persona is a display switch, not authorization: this scopes the demo world only and claims no server-side enforcement.
import { describe, expect, it } from 'vitest';
import { WORLD } from '../../fixture/world';
import { TABLE } from '../../i18n';
import type { Mission, ReplayEvent, World } from '../../contract/world';
import { caseEvidence } from '../../view/world';
import { authorizedWorld } from './authorize';
import { nodeStatus } from './status';
import { gapsAt, indexAt, milestonesAt, msOfIndex, stageAt, totalMs } from './replay';

const UNAUTHORIZED = ['owner', 'nontechnical'] as const;
// The mission's case evidence (E-1..E-9). Technical-only records outside it are covered by src/view/authorize.test.ts.
const technicalRecords = caseEvidence(WORLD).filter((r) => r.visibility === 'technical');

describe('authorizedWorld', () => {
  it('returns the same world for Technical', () => {
    expect(authorizedWorld(WORLD, 'technical')).toBe(WORLD);
  });

  it('leaves every node description to Technical', () => {
    expect(authorizedWorld(WORLD, 'technical').graph.nodes.some((n) => n.descKey)).toBe(false);
  });

  it('the fixture has a Technical-only record to hide (guards the tests below against passing vacuously)', () => {
    expect(technicalRecords.map((r) => r.id)).toContain('E-5');
  });

  for (const p of UNAUTHORIZED) {
    describe(p, () => {
      const w = authorizedWorld(WORLD, p);

      it('contains no Technical-only record id, target label or external id anywhere in the world', () => {
        const json = JSON.stringify(w);
        expect(json).not.toContain('E-5');
        // A node's own title is its catalogue name, independent of any evidence, so it is not a leak of the record's target.
        const noTitles = JSON.stringify({ ...w, graph: { ...w.graph, nodes: w.graph.nodes.map((n) => ({ ...n, title: '' })) } });
        for (const r of technicalRecords) {
          expect(json).not.toContain(r.id);
          const t = r.observation?.target;
          if (t?.label) expect(noTitles).not.toContain(t.label);
          if (t?.externalId) expect(json).not.toContain(t.externalId);
        }
      });

      it('removes the link built only on Technical-only evidence', () => {
        expect(w.graph.edges.find((e) => e.id === 'd4')).toBeUndefined();
        expect(w.graph.edges.length).toBe(WORLD.graph.edges.length - 1);
      });

      it('turns a node whose only basis was removed into unknown, never healthy and never stale', () => {
        const inv = w.graph.nodes.find((n) => n.id === 'inventory')!;
        const st = nodeStatus(inv);
        expect(st.health).not.toBe('healthy');
        expect(st.health).toBe('unknown');
        expect(st.freshness).not.toBe('stale');
        expect(inv.state.freshness).toBe('unknown');
        expect(inv.state.basis).toEqual([]);
      });

      it('swaps the Inventory overview description, whose only basis was the restricted record, for the generic no-evidence one', () => {
        const inv = w.graph.nodes.find((n) => n.id === 'inventory')!;
        expect(inv.descKey).toBe('map.nl.inventory.none');
        expect(TABLE['map.nl.inventory.none']).toEqual(['The inventory service. No evidence has been read for it.', 'خدمة المخزون. لم تُقرأ أدلة لها.']);
        // Only that node: others keep the description their authorized evidence supports, and the declaration itself is not exposed.
        expect(w.graph.nodes.filter((n) => n.descKey).map((n) => n.id)).toEqual(['inventory']);
        expect(w.graph.nodes.some((n) => 'descWithoutEvidence' in n)).toBe(false);
      });

      it('keeps the Sentry node, with no evidence, and every source authority unchanged', () => {
        const sentry = w.graph.nodes.find((n) => n.id === 'sentry')!;
        expect(sentry).toBeDefined();
        expect(sentry.evidence).toEqual([]);
        // Source reachability, age and TTL are authorized for everyone. Only the Technical-only record leaves a source's health basis
        // (and the claim that rested only on it is reset, checked below).
        expect(w.sources.map((s) => s.source)).toEqual(WORLD.sources.map((s) => s.source));
        const blank = (list: typeof w.sources) => list.map((s) => ({ ...s, health: { ...s.health, basis: [], health: 'x' } }));
        expect(blank(w.sources.filter((s) => s.provider !== 'sentry'))).toEqual(blank(WORLD.sources.filter((s) => s.provider !== 'sentry')));
        expect(w.sources.filter((s) => s.provider !== 'sentry')).toEqual(WORLD.sources.filter((s) => s.provider !== 'sentry'));
        const sentrySource = w.sources.find((s) => s.provider === 'sentry')!;
        expect(sentrySource.health.basis).toEqual([]);
        // A claim whose only basis was removed is unknown, never healthy; freshness stays what the source authority says
        expect(sentrySource.health.health).toBe('unknown');
        expect(sentrySource.health.freshness).toBe('stale');
        expect(w.sources.find((s) => s.provider === 'github')!.health.health).toBe('healthy');
      });

      it('keeps a record independently supported by authorized evidence', () => {
        expect(w.missions.find((m) => m.id === 'MSN-DEMO-2')!.evidence).toEqual(['E-9']);
        expect(w.evidence['E-9']).toBeDefined();
      });

      it('is memoized per persona', () => {
        expect(authorizedWorld(WORLD, p)).toBe(authorizedWorld(WORLD, p));
        expect(authorizedWorld(WORLD, 'owner')).not.toBe(authorizedWorld(WORLD, 'nontechnical'));
      });

      it('does not mutate the source world', () => {
        expect(WORLD.evidence['E-5']).toBeDefined();
        expect(WORLD.graph.edges.find((e) => e.id === 'd4')).toBeDefined();
      });
    });
  }
});

// BACK-66: the replay, mission and search projections. The shipped fixture has no replay row or mission that rests ONLY on E-5,
// so these use a constructed world: the rule has to hold for data the fixture does not happen to contain.
const restrictedRow: ReplayEvent = { id: 'R-X', clock: '14:10', stage: 'correlated', label: 'observed', evidence: 'E-5', kind: 'event', key: 'rp.checkFailed' };
const restrictedOnly: Mission = { id: 'MSN-X', agent: 'AG-2', kind: 'sensing', status: 'observing', human: 'monitoring', startedMinutesAgo: 3, label: 'observed', evidence: ['E-5'], key: 'ms.fresh' };
const CONSTRUCTED: World = { ...WORLD, replay: [...WORLD.replay, restrictedRow], missions: [...WORLD.missions, restrictedOnly] };

describe('authorizedWorld, replay rows and missions (BACK-66)', () => {
  it('Technical keeps every replay row and mission', () => {
    const t = authorizedWorld(CONSTRUCTED, 'technical');
    expect(t.replay.map((r) => r.id)).toContain('R-X');
    expect(t.missions.map((m) => m.id)).toContain('MSN-X');
  });

  it('no mission has an events figure for any persona: the field is gone, so nothing can differ by persona (BACK-90, BACK-96)', () => {
    for (const p of ['technical', ...UNAUTHORIZED] as const) {
      for (const m of authorizedWorld(CONSTRUCTED, p).missions) expect('events' in m, `${p} ${m.id}`).toBe(false);
    }
  });

  for (const p of UNAUTHORIZED) {
    describe(p, () => {
      const w = authorizedWorld(CONSTRUCTED, p);

      it('drops a replay row that rests on a withheld record: no row, id, clock or evidence slot survives', () => {
        expect(w.replay.map((r) => r.id)).not.toContain('R-X');
        expect(w.replay.map((r) => r.id)).toEqual(WORLD.replay.map((r) => r.id));
        const json = JSON.stringify(w.replay);
        expect(json).not.toContain('R-X');
        expect(json).not.toContain('14:10');
      });

      it('keeps replay rows that never had evidence, and rows resting on authorized evidence, untouched', () => {
        expect(w.replay.find((r) => r.id === 'R-3')).toEqual(WORLD.replay.find((r) => r.id === 'R-3'));
        expect(w.replay.find((r) => r.id === 'R-5')).toEqual(WORLD.replay.find((r) => r.id === 'R-5'));
      });

      it('a mission that loses part of its evidence keeps the rest and its claim', () => {
        const m = w.missions.find((x) => x.id === 'MSN-DEMO-2')!;
        expect(m.evidence).toEqual(['E-9']);
        expect(m.label).toBe('observed');
      });

      it('a mission that rested only on a withheld record keeps no claim: unknown label, no evidence', () => {
        const m = w.missions.find((x) => x.id === 'MSN-X')!;
        expect(m.evidence).toEqual([]);
        expect(m.label).toBe('unknown');
      });

      it('leaves missions that never touched the withheld record exactly as they were', () => {
        for (const id of ['MSN-DEMO-1', 'MSN-DEMO-3', 'MSN-DEMO-4', 'MSN-DEMO-5']) {
          expect(w.missions.find((x) => x.id === id)).toEqual(WORLD.missions.find((x) => x.id === id));
        }
      });

      it('the whole constructed projection still contains no trace of the record', () => {
        expect(JSON.stringify(w)).not.toContain('E-5');
      });
    });
  }
});

// The lab shell's search (navigation/hits.ts) retired with the lab entry (BACK-92 R4). The host's one search box is src/nav/search.ts;
// its persona scoping, including the cases that used to live here, is tested in src/nav/search.test.ts.

// BACK-66 audit (2026-11-25): the ticket feared that scopeReplay nulls a row's evidence and keeps the row. It does not: keepReplay
// removes the row (above). What the trailing-row case above cannot show is ordering and timing. Here a withheld row sits in the middle
// of the script, at a stage boundary, so a kept-but-blanked row, or anything derived before filtering (cursor length, stage reached,
// milestone clocks, announced gaps), would differ from a world that never had the row. A lay projection must be indistinguishable from
// that world in every derived replay figure.
describe('authorizedWorld, a withheld replay row in the middle of the script (BACK-66 audit)', () => {
  const midRow: ReplayEvent = { id: 'R-M', clock: '14:05', stage: 'hypothesis', label: 'hypothesis', evidence: 'E-5', kind: 'gap', key: 'rp.hypothesis' };
  const at = WORLD.replay.findIndex((r) => r.id === 'R-4');
  const WITH_MID: World = { ...WORLD, replay: [...WORLD.replay.slice(0, at), midRow, ...WORLD.replay.slice(at)] };

  it('Technical sees the row where it was placed (guards against passing vacuously)', () => {
    expect(authorizedWorld(WITH_MID, 'technical').replay[at]!.id).toBe('R-M');
  });

  for (const p of UNAUTHORIZED) {
    it(`${p}: the replay script, cursor, stage, milestones and gaps equal those of a world that never had the row`, () => {
      const got = authorizedWorld(WITH_MID, p).replay;
      const base = authorizedWorld(WORLD, p).replay;
      expect(got).toEqual(base);
      expect(totalMs(got)).toBe(totalMs(base));
      for (let i = -1; i <= base.length; i += 1) {
        expect(stageAt(i, got), `stage ${i}`).toBe(stageAt(i, base));
        expect(milestonesAt(i, got), `milestones ${i}`).toEqual(milestonesAt(i, base));
        expect(gapsAt(i, got), `gaps ${i}`).toEqual(gapsAt(i, base));
        expect(indexAt(msOfIndex(i), got), `index ${i}`).toBe(indexAt(msOfIndex(i), base));
      }
      expect(JSON.stringify(got)).not.toMatch(/R-M|E-5/);
    });
  }
});

// BACK-66 audit, BLOCKED ON AN OWNER DECISION: record ids are sequential and shown to lay personas as-is, so the hole a withheld record
// leaves in the numbering is itself a cue that it exists (INV-DEMO-7 shows Owner E-4 then E-6). Closing it needs a product decision
// (opaque or per-persona display ids, or renumbering, and what links and search then key on), which this audit does not make.
// Expected to fail until that decision lands; when it passes, vitest reports it and the marker must be removed.
describe('sequential record ids leave no hole for a lay persona (blocked: display-id decision, BACK-66)', () => {
  const holes = (ids: readonly string[]): string[] => {
    const byPrefix = new Map<string, number[]>();
    for (const id of ids) {
      const m = /^([A-Z]+-)(\d+)$/.exec(id);
      if (m) byPrefix.set(m[1]!, [...(byPrefix.get(m[1]!) ?? []), Number(m[2])]);
    }
    return [...byPrefix].flatMap(([pre, ns]) => {
      const set = new Set(ns);
      const max = Math.max(...ns);
      return Array.from({ length: max }, (_, i) => i + 1).filter((n) => !set.has(n)).map((n) => `${pre}${n}`);
    });
  };

  it('the full fixture numbers its INV-DEMO-7 evidence without holes (control)', () => {
    expect(holes(caseEvidence(WORLD).map((e) => e.id))).toEqual([]);
  });

  for (const p of UNAUTHORIZED) {
    it.fails(`${p}: the evidence ids received leave no hole in the numbering`, () => {
      expect(holes(caseEvidence(authorizedWorld(WORLD, p)).map((e) => e.id))).toEqual([]);
    });
  }
});
