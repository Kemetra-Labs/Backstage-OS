// BACK-89: the replay's three times are kept apart, and nothing is ordered, dated or marked beyond what the evidence justifies.
// Persona is a display switch on synthetic data, not authorization.
import { describe, expect, it } from 'vitest';
import type { Persona } from '../contract/types';
import { WORLD } from '../design-lab/v2/fixtures/world';
import { authorizedWorld } from '../design-lab/v2/logic/authorize';
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
          expect(row.observedAt, `${p} ${e.id}`).toBe(authorizedWorld(WORLD, p).evidenceById[e.evidence]?.observation?.observedAt ?? null);
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
      evidenceById: {
        x: { observation: { observedAt: '2026-11-16T09:00:00Z' } },
        y: { observation: { observedAt: '2026-11-16T09:30:00Z' } },
      },
    } as unknown as Parameters<typeof replayTimeRows>[0];
    expect(replayTimeRows(w).map((r) => r.order)).toEqual(['consistent', 'consistent', 'unknown']);
  });

  it('treats evidence it cannot read as no time at all', () => {
    const w = {
      replay: [{ id: 'a', clock: '10:00', stage: 'observed', label: 'observed', evidence: 'gone', kind: 'event', key: 'k' }],
      evidenceById: {},
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
