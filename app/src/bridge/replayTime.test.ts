// BACK-89: the replay's three times are kept apart, and nothing is ordered, dated or marked beyond what the evidence justifies.
// Persona is a display switch on synthetic data, not authorization.
import { describe, expect, it } from 'vitest';
import type { Persona } from '../contract/types';
import { WORLD } from '../fixture/world';
import { authorizedWorld } from '../lenses/logic/authorize';
import { replayTimeRows } from './replayTime';

const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];
const rows = (p: Persona) => replayTimeRows(authorizedWorld(WORLD, p));
const by = (p: Persona, id: string) => rows(p).find((r) => r.id === id);

describe('replay time semantics', () => {
  it('gives every event its processing step and clock, in processing order', () => {
    for (const p of PERSONAS) {
      const r = rows(p);
      expect(r.map((x) => x.step)).toEqual(r.map((_, i) => i + 1));
      expect(r.map((x) => x.processedAt)).toEqual(authorizedWorld(WORLD, p).replay.map((e) => e.clock));
    }
  });

  it('shows a read time only where the event rests on evidence, and never invents one for an event without', () => {
    for (const p of PERSONAS) {
      for (const e of authorizedWorld(WORLD, p).replay) {
        const row = by(p, e.id)!;
        if (e.evidence === null) {
          expect(row.observedAt, `${p} ${e.id}`).toBeNull();
          expect(row.order, `${p} ${e.id}`).toBe('unknown');
        } else {
          // Evidence may be readable yet carry no observation (a gap record): then there is still no time.
          expect(row.observedAt, `${p} ${e.id}`).toBe(authorizedWorld(WORLD, p).evidence[e.evidence]?.observation?.observedAt ?? null);
        }
      }
    }
  });

  it('flags the order as uncertain where a read time disagrees with the processing order (the PR record is read before the failure it is processed after)', () => {
    for (const p of PERSONAS) {
      const r1 = by(p, 'R-1')!; // CI failure, read 14:02, processed first
      const r2 = by(p, 'R-2')!; // PR merged, read 13:27, processed second
      expect(r1.observedAt! > r2.observedAt!).toBe(true);
      expect(r1.step).toBeLessThan(r2.step);
      expect(r1.order).toBe('uncertain');
      expect(r2.order).toBe('uncertain');
    }
  });

  it('is consistent only when every read time agrees with the processing order', () => {
    const w = {
      replay: [
        { id: 'a', clock: '10:00', stage: 'observed', label: 'observed', evidence: 'x', kind: 'event', key: 'k' },
        { id: 'b', clock: '10:01', stage: 'observed', label: 'observed', evidence: 'y', kind: 'event', key: 'k' },
        { id: 'c', clock: '10:02', stage: 'ingested', label: 'observed', evidence: null, kind: 'event', key: 'k' },
      ],
      evidence: {
        x: { observation: { observedAt: '2026-11-16T09:00:00Z' } },
        y: { observation: { observedAt: '2026-11-16T09:30:00Z' } },
      },
    } as unknown as Parameters<typeof replayTimeRows>[0];
    expect(replayTimeRows(w).map((r) => r.order)).toEqual(['consistent', 'consistent', 'unknown']);
  });

  it('treats evidence it cannot read as no time at all', () => {
    const w = {
      replay: [{ id: 'a', clock: '10:00', stage: 'observed', label: 'observed', evidence: 'gone', kind: 'event', key: 'k' }],
      evidence: {},
    } as unknown as Parameters<typeof replayTimeRows>[0];
    expect(replayTimeRows(w)).toEqual([{ id: 'a', step: 1, processedAt: '10:00', observedAt: null, order: 'unknown' }]);
  });

  it('a withheld record leaves no row, no time and no gap for a lay persona: the rows are those of the authorized replay only', () => {
    const technical = rows('technical').map((r) => r.id);
    for (const p of ['owner', 'nontechnical'] as const) {
      const lay = rows(p).map((r) => r.id);
      expect(lay.every((id) => technical.includes(id))).toBe(true);
      expect(JSON.stringify(rows(p))).not.toMatch(/"E-5"|"O-5"/);
      // Steps are renumbered over what remains: a missing step number would itself show that something was removed.
      expect(rows(p).map((r) => r.step)).toEqual(rows(p).map((_, i) => i + 1));
    }
  });
});

// BACK-89 (owner decision: processing order stays the replay order; source read time is shown beside it, never used to sort, and no
// occurrence time is inferred). These cover the inputs the first slice did not: an empty replay, a replay with only some read times
// (partial), and evidence that exists but was never read (unread: no observation, with or without a reason).
type TimeWorld = Parameters<typeof replayTimeRows>[0];
type Obs = { observation: { observedAt: string } | null; notReadReason?: string };
const ev = (id: string, evidence: string | null, clock: string, kind: 'event' | 'gap' = 'event') =>
  ({ id, clock, stage: 'observed', label: 'observed', evidence, kind, key: 'k' });
const world = (replay: readonly ReturnType<typeof ev>[], evidence: Record<string, Obs>): TimeWorld =>
  ({ replay, evidence }) as unknown as TimeWorld;
const read = (iso: string): Obs => ({ observation: { observedAt: iso } });
const orders = (w: TimeWorld) => replayTimeRows(w).map((r) => r.order);

describe('replay time: zero, partial and unread inputs', () => {
  it('zero: an empty replay has no rows, even when evidence exists', () => {
    expect(replayTimeRows(world([], {}))).toEqual([]);
    expect(replayTimeRows(world([], { x: read('2026-11-16T09:00:00Z') }))).toEqual([]);
  });

  it('partial: a lone read time has nothing to disagree with, and the events without one stay unknown', () => {
    const w = world([ev('a', null, '10:00'), ev('b', 'x', '10:01'), ev('c', null, '10:02')], { x: read('2026-11-16T09:00:00Z') });
    expect(orders(w)).toEqual(['unknown', 'consistent', 'unknown']);
    expect(replayTimeRows(w).map((r) => r.observedAt)).toEqual([null, '2026-11-16T09:00:00Z', null]);
  });

  it('partial: equal read times are a tie, not a disagreement', () => {
    const w = world([ev('a', 'x', '10:00'), ev('b', 'y', '10:01')], { x: read('2026-11-16T09:00:00Z'), y: read('2026-11-16T09:00:00Z') });
    expect(orders(w)).toEqual(['consistent', 'consistent']);
  });

  it('partial: events without a read time are skipped when comparing, and never mark their neighbours', () => {
    const agree = world([ev('a', 'x', '10:00'), ev('g', null, '10:01'), ev('b', 'y', '10:02')], { x: read('2026-11-16T09:00:00Z'), y: read('2026-11-16T09:30:00Z') });
    expect(orders(agree)).toEqual(['consistent', 'unknown', 'consistent']);
    const clash = world([ev('a', 'x', '10:00'), ev('g', null, '10:01'), ev('b', 'y', '10:02')], { x: read('2026-11-16T09:30:00Z'), y: read('2026-11-16T09:00:00Z') });
    expect(orders(clash)).toEqual(['uncertain', 'unknown', 'uncertain']);
  });

  it('partial: only the events that take part in a disagreement are uncertain; the processing order is never changed', () => {
    const w = world([ev('a', 'x', '10:00'), ev('b', 'y', '10:01'), ev('c', 'z', '10:02')], {
      x: read('2026-11-16T09:00:00Z'), y: read('2026-11-16T09:30:00Z'), z: read('2026-11-16T09:10:00Z'),
    });
    expect(orders(w)).toEqual(['consistent', 'uncertain', 'uncertain']);
    expect(replayTimeRows(w).map((r) => [r.id, r.step, r.processedAt])).toEqual([['a', 1, '10:00'], ['b', 2, '10:01'], ['c', 3, '10:02']]);
  });

  it('unread: evidence that was never read (no observation, whatever the reason) gives no time and does not make its neighbours uncertain', () => {
    for (const reason of [undefined, 'unavailable', 'not_configured', 'restricted']) {
      const unread: Obs = reason === undefined ? { observation: null } : { observation: null, notReadReason: reason };
      const w = world([ev('a', 'x', '10:00'), ev('u', 'n', '10:01', 'gap'), ev('b', 'y', '10:02')], {
        x: read('2026-11-16T09:00:00Z'), n: unread, y: read('2026-11-16T09:30:00Z'),
      });
      expect(replayTimeRows(w).map((r) => [r.observedAt, r.order]), String(reason)).toEqual([
        ['2026-11-16T09:00:00Z', 'consistent'], [null, 'unknown'], ['2026-11-16T09:30:00Z', 'consistent'],
      ]);
    }
  });

  it('unread: when nothing was read, every event is unknown and the processing steps and clocks are untouched', () => {
    const w = world([ev('a', 'x', '10:00'), ev('b', 'y', '10:01'), ev('c', null, '10:02')], { x: { observation: null }, y: { observation: null, notReadReason: 'unavailable' } });
    expect(replayTimeRows(w)).toEqual([
      { id: 'a', step: 1, processedAt: '10:00', observedAt: null, order: 'unknown' },
      { id: 'b', step: 2, processedAt: '10:01', observedAt: null, order: 'unknown' },
      { id: 'c', step: 3, processedAt: '10:02', observedAt: null, order: 'unknown' },
    ]);
  });

  it('a row carries only the three times and the order status: no evidence id, reason or classification can leak through it', () => {
    const w = world([ev('a', 'x', '10:00'), ev('b', 'n', '10:01', 'gap')], { x: read('2026-11-16T09:00:00Z'), n: { observation: null, notReadReason: 'restricted' } });
    for (const r of replayTimeRows(w)) expect(Object.keys(r).sort()).toEqual(['id', 'observedAt', 'order', 'processedAt', 'step']);
    expect(JSON.stringify(replayTimeRows(w))).not.toMatch(/restricted|"x"|"n"/);
  });

  it('the demo replay: its unread gap (R-5) has a row, no time and an unknown order for every persona', () => {
    for (const p of PERSONAS) {
      const r5 = by(p, 'R-5');
      if (r5 === undefined) continue; // a persona whose authorized replay leaves it out has no row at all (checked above)
      expect(r5.observedAt, p).toBeNull();
      expect(r5.order, p).toBe('unknown');
    }
    expect(by('technical', 'R-5')).toBeDefined();
  });
});
