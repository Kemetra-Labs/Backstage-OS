// BACK-88: the Source Observatory's evidence scoping, proven by a control. Everything the screen derives (cards, counts, timeline,
// each source's evidence basis) comes from the persona's authorized world. This scans that data for the restricted evidence and
// observation ids for the two lay personas, and runs the same scan on the unscoped world to show the scan does fail when scoping is
// bypassed, so a pass is not vacuous. Pairs with the browser matrix in e2e/source-observatory.spec.ts. Persona is a display switch
// on synthetic data, not authorization.
import { describe, expect, it } from 'vitest';
import { leaks } from '../../e2e/lens-helpers';
import type { Persona } from '../contract/types';
import { WORLD } from '../lenses/fixtures/world';
import { authorizedWorld } from '../lenses/logic/authorize';
import { sourceCounts, sourceStatus } from '../lenses/logic/status';
import type { World } from '../lenses/types';
import { expectWorldReadOnlyThroughAuthorizedWorld } from './scopeGuard';

const LAY: readonly Persona[] = ['owner', 'nontechnical'];

/** What the Observatory renders from: its sources and their evidence basis, the derived statuses and counts, and the timeline events. */
const observatoryData = (w: World): string => {
  const statuses = w.sources.map((m) => sourceStatus(m, w.now));
  return JSON.stringify({ sources: w.sources, statuses, counts: sourceCounts(statuses), events: w.sourceEvents });
};

describe('Source Observatory evidence scoping', () => {
  it('control: the same scan finds the restricted record in the unscoped world, so it detects a scoping bypass', () => {
    expect(leaks(observatoryData(WORLD)).length).toBeGreaterThan(0);
  });

  it('control: Technical keeps the record, so the lay result below is not an empty world', () => {
    expect(leaks(observatoryData(authorizedWorld(WORLD, 'technical'))).length).toBeGreaterThan(0);
  });

  it('Owner and Nontechnical: no restricted evidence or observation id anywhere in the data the Observatory renders', () => {
    for (const p of LAY) expect(leaks(observatoryData(authorizedWorld(WORLD, p))), p).toEqual([]);
  });

  it('lay personas still get every source and every timeline event, so withholding leaves no count or gap that differs by persona', () => {
    const technical = authorizedWorld(WORLD, 'technical');
    for (const p of LAY) {
      const w = authorizedWorld(WORLD, p);
      expect(w.sources.map((s) => s.provider), p).toEqual(technical.sources.map((s) => s.provider));
      expect(w.sourceEvents.map((e) => e.id), p).toEqual(technical.sourceEvents.map((e) => e.id));
      expect(sourceCounts(w.sources.map((m) => sourceStatus(m, w.now))), p).toEqual(sourceCounts(technical.sources.map((m) => sourceStatus(m, technical.now))));
    }
  });

  it('the screen reads its world only through authorizedWorld, never the unscoped fixture directly', () => {
    expectWorldReadOnlyThroughAuthorizedWorld('../lenses/screens/SourceObservatory.tsx', 'SourceObservatoryLens.tsx');
  });
});
