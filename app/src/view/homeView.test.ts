import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { authorizedWorld } from './authorize';
import { homeView } from './homeView';

describe('homeView', () => {
  // Owner reads the world App.tsx gives it: scoped by authorizedWorld (BACK-73).
  const v = homeView(authorizedWorld(WORLD, 'owner'), 'owner');

  it('derives every signal from the world', () => {
    expect(v.signals.products).toBe(3);
    expect(v.signals.productsNeedingAttention).toBe(2);
    expect(v.signals.openInvestigations).toBe(WORLD.investigations.filter((i) => i.status === 'open').length);
    // DEC-DEMO-1 is approved and must not be counted as a waiting proposal.
    expect(v.signals.proposedDecisions).toBe(2);
    const total = WORLD.projects.reduce((n, p) => n + p.sources.length, 0);
    expect(v.signals.sourcesNotCurrent.total).toBe(total);
    expect(v.signals.sourcesNotCurrent.notCurrent).toBeGreaterThan(0);
    expect(v.signals.sourcesNotCurrent.notCurrent).toBeLessThanOrEqual(total);
  });

  it('leads attention with the Retail Tower CI failure', () => {
    expect(v.attention[0]).toMatchObject({ id: 'ATT-RT-1', severity: 'high', projectId: 'RT', investigationId: 'INV-DEMO-7', decisionId: 'DEC-DEMO-3' });
    // ATT-RT-2 rests only on Technical-only E-12, so the scoped Owner world has no such row at all.
    expect(v.attention.map((a) => a.severity)).toEqual(['high', 'medium']);
    expect(homeView(WORLD, 'technical').attention.map((a) => a.severity)).toEqual(['high', 'medium', 'medium']);
  });

  it('previews only proposed decisions', () => {
    expect(v.decisions.map((d) => d.id)).toEqual(['DEC-DEMO-3', 'DEC-DEMO-5']);
  });

  it('counts every evidence item Technical may read, and refuses unscoped Technical-only input for Owner (BACK-92 R7, defence in depth)', () => {
    const tech = homeView(WORLD, 'technical').investigations.find((i) => i.id === 'INV-DEMO-7');
    expect(tech?.evidenceCount).toBe(WORLD.investigations[0]?.evidence.length);
    expect(() => homeView(WORLD, 'owner')).toThrow(/unscoped evidence/);
  });

  it('never resolves any product health to healthy', () => {
    expect(v.sourceHealth.map((s) => s.triad.health)).toEqual(['unknown', 'degraded', 'unknown']);
    for (const s of v.sourceHealth) {
      const b = s.buckets;
      expect(b.current + b.stale + b.unavailable + b.notConfigured + b.unknown).toBe(b.total);
    }
  });

  it('orders activity newest first and keeps agent events labelled by their own truth', () => {
    const ages = v.activity.map((a) => a.minutesAgo);
    expect(ages).toEqual([...ages].sort((a, b) => a - b));
    const agent = v.activity.find((a) => a.id === 'ACT-3');
    expect(agent?.actor).toBe('agent');
    expect(agent?.truth).toBe('proposed');
    expect(agent?.text.en).toMatch(/^Simulated/);
  });

  it('takes an event label from its evidence; an event on withheld evidence is not in the scoped world at all', () => {
    const w = authorizedWorld(WORLD, 'nontechnical');
    const nt = homeView(w, 'nontechnical').activity;
    const withEvidence = WORLD.activity.filter((e) => e.evidenceId);
    expect(withEvidence.length).toBeGreaterThan(0);
    for (const e of withEvidence) {
      const ref = WORLD.evidence[e.evidenceId ?? ''];
      const got = nt.find((a) => a.id === e.id)?.truth;
      if (ref?.visibility === 'technical') expect(got, e.id).toBeUndefined();
      else expect(got, e.id).toBeDefined();
    }
    // An event whose evidence was never read must not read as observed.
    expect(nt.find((a) => a.id === 'ACT-7')?.truth).toBe('unknown');
  });
});
