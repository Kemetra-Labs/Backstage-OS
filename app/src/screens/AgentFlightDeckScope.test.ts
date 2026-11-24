// BACK-90: the Agent Flight Deck's inputs and scoping, for the cases the first slice did not pin down: zero inputs, partial evidence,
// evidence that is missing or unread, a mission that rests only on a withheld record, persona switches (including the memoised
// projection), counts that must not reveal a withheld record, and Unknown staying Unknown. A mission's `events` figure is not defined
// by the fixture, so nothing here reads it as a count. Persona is a display switch on synthetic data, not authorization.
import { describe, expect, it } from 'vitest';
import { leaksIn as leaks } from '../../e2e/leaks';
import type { Persona } from '../contract/types';
import { WORLD } from '../lenses/fixtures/world';
import { authorizedWorld } from '../lenses/logic/authorize';
import { deckCounts, filterMissions, STATUS_ORDER } from '../lenses/logic/deck';
import { evidenceOf } from '../lenses/logic/evidence';
import type { Mission, World } from '../lenses/types';
import { expectWorldReadOnlyThroughAuthorizedWorld } from './scopeGuard';

const LAY: readonly Persona[] = ['owner', 'nontechnical'];
const ALL: readonly Persona[] = ['technical', 'owner', 'nontechnical'];

const base: Omit<Mission, 'id' | 'evidence' | 'label'> = { agent: 'AG-2', kind: 'sensing', status: 'observing', human: 'monitoring', startedMinutesAgo: 3, events: 3, key: 'ms.fresh' };
const onlyRestricted: Mission = { ...base, id: 'MSN-X1', label: 'observed', evidence: ['E-5'] };
const missingEvidence: Mission = { ...base, id: 'MSN-X2', label: 'observed', evidence: ['E-404'] };
const alreadyUnknown: Mission = { ...base, id: 'MSN-X3', label: 'unknown', evidence: [] };
// The shipped fixture has no mission that rests only on E-5, so the rules are exercised on a constructed world as well.
const CONSTRUCTED: World = { ...WORLD, missions: [...WORLD.missions, onlyRestricted, missingEvidence, alreadyUnknown] };
const mission = (w: World, id: string): Mission => w.missions.find((m) => m.id === id)!;

/** Everything the deck renders per mission: the mission rows and the evidence behind each. */
const deckData = (w: World): string => JSON.stringify({ missions: w.missions, evidence: w.missions.map((m) => evidenceOf(w, m.evidence)), counts: deckCounts(w) });

describe('Flight Deck: zero inputs', () => {
  const empty: World = { ...WORLD, missions: [], agents: [] };

  it('no missions and no agents give zero counts, never a missing or invented number', () => {
    const c = deckCounts(empty);
    expect(c).toMatchObject({ agents: 0, active: 0, needsReview: 0, reviewing: 0, monitoring: 0 });
    expect(Object.keys(c.byStatus).sort()).toEqual([...STATUS_ORDER].sort());
    expect(Object.values(c.byStatus).every((n) => n === 0)).toBe(true);
  });

  it('filtering an empty list, or matching nothing, gives an empty list', () => {
    expect(filterMissions([], { agent: 'all', status: 'all' })).toEqual([]);
    expect(filterMissions(WORLD.missions, { agent: 'AG-1', status: 'idle' })).toEqual([]);
  });

  it('every persona still gets an (empty) world without throwing', () => {
    for (const p of ALL) expect(authorizedWorld(empty, p).missions, p).toEqual([]);
  });
});

describe('Flight Deck: counts reveal nothing', () => {
  it('the counts do not depend on a mission events figure, whose meaning is not defined', () => {
    const other: World = { ...WORLD, missions: WORLD.missions.map((m) => ({ ...m, events: m.events + 7 })) };
    expect(deckCounts(other)).toEqual(deckCounts(WORLD));
  });

  it('Owner and Nontechnical get the same counts, the same missions in the same order and the same states as Technical, on the shipped and the constructed world', () => {
    for (const world of [WORLD, CONSTRUCTED]) {
      const technical = authorizedWorld(world, 'technical');
      for (const p of LAY) {
        const w = authorizedWorld(world, p);
        expect(deckCounts(w), p).toEqual(deckCounts(technical));
        expect(w.missions.map((m) => [m.id, m.status, m.human, m.agent]), p).toEqual(technical.missions.map((m) => [m.id, m.status, m.human, m.agent]));
      }
    }
  });
});

describe('Flight Deck: partial, unread and missing evidence', () => {
  it('partial: a mission that loses only some of its evidence keeps its claim and the evidence it still has', () => {
    for (const p of LAY) {
      const m = mission(authorizedWorld(WORLD, p), 'MSN-DEMO-2'); // E-5 withheld, E-9 readable
      expect(m.evidence, p).toEqual(['E-9']);
      expect(m.label, p).toBe('observed');
    }
  });

  it('a mission that rested only on a withheld record keeps no claim: unknown, no evidence, and its state and place in the list are unchanged', () => {
    for (const p of LAY) {
      const m = mission(authorizedWorld(CONSTRUCTED, p), 'MSN-X1');
      expect(m.evidence, p).toEqual([]);
      expect(m.label, p).toBe('unknown');
      expect([m.status, m.human], p).toEqual([onlyRestricted.status, onlyRestricted.human]);
    }
    expect(mission(authorizedWorld(CONSTRUCTED, 'technical'), 'MSN-X1').label).toBe('observed');
  });

  it('missing evidence: a reference to a record that does not exist gives no evidence row, never throws, and never reads as a claim for a lay persona', () => {
    for (const p of ALL) {
      const w = authorizedWorld(CONSTRUCTED, p);
      expect(() => evidenceOf(w, mission(w, 'MSN-X2').evidence), p).not.toThrow();
      expect(evidenceOf(w, mission(w, 'MSN-X2').evidence), p).toEqual([]);
    }
    for (const p of LAY) expect(mission(authorizedWorld(CONSTRUCTED, p), 'MSN-X2').label, p).toBe('unknown');
  });

  it('Unknown stays Unknown for every persona: it is never promoted to a truth label', () => {
    for (const p of ALL) {
      const m = mission(authorizedWorld(CONSTRUCTED, p), 'MSN-X3');
      expect(m.label, p).toBe('unknown');
      expect(m.evidence, p).toEqual([]);
    }
  });
});

describe('Flight Deck: evidence scoping, with a control', () => {
  it('control: the same scan finds the restricted record in the unscoped world and for Technical, so it detects a bypass', () => {
    expect(leaks(deckData(WORLD)).length).toBeGreaterThan(0);
    expect(leaks(deckData(authorizedWorld(WORLD, 'technical'))).length).toBeGreaterThan(0);
  });

  it('Owner and Nontechnical: no restricted evidence or observation id in any mission row or the evidence behind it, on the shipped and the constructed world', () => {
    for (const world of [WORLD, CONSTRUCTED]) for (const p of LAY) expect(leaks(deckData(authorizedWorld(world, p))), p).toEqual([]);
  });

  it('switching Technical, Owner, Technical, Nontechnical, Technical, Owner leaves no stale or cached data behind in either direction', () => {
    for (const p of ['technical', 'owner', 'technical', 'nontechnical', 'technical', 'owner'] as const) {
      const w = authorizedWorld(CONSTRUCTED, p);
      expect(mission(w, 'MSN-DEMO-2').evidence.includes('E-5'), p).toBe(p === 'technical');
      expect(leaks(deckData(w)).length > 0, p).toBe(p === 'technical');
    }
  });

  it('the screen and its lens read the world only through authorizedWorld, never the unscoped fixture directly', () => {
    expectWorldReadOnlyThroughAuthorizedWorld('../lenses/screens/AgentFlightDeck.tsx', 'AgentFlightDeckLens.tsx');
  });
});
