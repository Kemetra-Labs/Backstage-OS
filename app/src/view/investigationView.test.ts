import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { COPY } from '../i18n/strings';
import {
  conflictOf, crumbTrail, decisionLabel, evidenceStatusText, evidenceTimeline, observedMinutesAgo, summaryFor,
} from './investigationView';
import { authorizedWorld } from './authorize';
import { evidenceViewFor } from './evidence';

const inv = (id: string) => {
  const i = WORLD.investigations.find((x) => x.id === id);
  if (!i) throw new Error(id);
  return i;
};
// Owner and Nontechnical read the world App.tsx gives them: scoped by authorizedWorld (BACK-73).
const OWNER_W = authorizedWorld(WORLD, 'owner');
const scopedInv = (id: string, p: 'owner' | 'technical' | 'nontechnical') => {
  const i = authorizedWorld(WORLD, p).investigations.find((x) => x.id === id);
  if (!i) throw new Error(id);
  return i;
};
const ev = (id: string) => {
  const e = WORLD.evidence[id];
  if (!e) throw new Error(id);
  return e;
};

describe('crumbTrail', () => {
  it('links every crumb with an href and leaves the current page bare', () => {
    expect(crumbTrail(['A', 'B', 'C'], ['#/a', '#/b', undefined])).toEqual([{ label: 'A', href: '#/a' }, { label: 'B', href: '#/b' }, { label: 'C' }]);
  });
});

describe('observedMinutesAgo', () => {
  it('is relative to the demo snapshot and null for unread evidence', () => {
    expect(observedMinutesAgo(ev('E-1'))).toBe(7);
    expect(observedMinutesAgo(ev('E-2'))).toBe(42);
    expect(observedMinutesAgo(ev('E-6'))).toBeNull();
  });
  it('never goes negative and ignores unparseable times', () => {
    const base = ev('E-1');
    const o = base.observation;
    if (!o) throw new Error('E-1 has an observation');
    expect(observedMinutesAgo({ ...base, observation: { ...o, observedAt: '2030-01-01T00:00:00Z' } })).toBe(0);
    expect(observedMinutesAgo({ ...base, observation: { ...o, observedAt: 'not a date' } })).toBeNull();
  });
});

describe('evidenceTimeline', () => {
  const refs = inv('INV-DEMO-7').evidence;
  it('orders read evidence newest observation first', () => {
    const { timed } = evidenceTimeline(refs, 'technical');
    const ages = timed.map((r) => r.minutesAgo ?? -1);
    expect([...ages].sort((a, b) => a - b)).toEqual(ages);
    expect(timed[0]?.id).toBe('E-1');
    expect(timed.map((r) => r.id)).toContain('E-5');
  });
  it('lists unread items apart, never with a time; withheld E-5 is in neither list (BACK-92 R7)', () => {
    const owner = evidenceTimeline(scopedInv('INV-DEMO-7', 'owner').evidence, 'owner');
    expect(owner.untimed.map((r) => r.id).sort()).toEqual(['E-6', 'E-7']);
    expect(owner.timed.map((r) => r.id)).not.toContain('E-5');
    for (const r of owner.untimed) expect(r.minutesAgo).toBeNull();
    expect(() => evidenceTimeline(refs, 'owner')).toThrow(/unscoped evidence/);
  });
  it('every item lands in exactly one list', () => {
    for (const p of ['owner', 'technical', 'nontechnical'] as const) {
      const scoped = scopedInv('INV-DEMO-7', p).evidence;
      const s = evidenceTimeline(scoped, p);
      expect(s.timed.length + s.untimed.length).toBe(scoped.length);
    }
  });
});

describe('evidenceStatusText', () => {
  it('says not read, or provider and freshness in words', () => {
    const c = COPY.en;
    expect(evidenceStatusText(evidenceViewFor('owner', ev('E-6')), c, 'en')).toBe('Not read: source not set up');
    expect(evidenceStatusText(evidenceViewFor('owner', ev('E-7')), c, 'en')).toBe('Not read: source unavailable');
    expect(evidenceStatusText(evidenceViewFor('owner', ev('E-1')), c, 'en')).toBe('{GitHub} · current');
    expect(evidenceStatusText(evidenceViewFor('technical', ev('E-5')), c, 'en')).toBe('{Sentry} · stale · 9 h ago');
  });
  it('omits the provider when there is none and still gives the freshness', () => {
    const { provider: _drop, ...rest } = evidenceViewFor('owner', ev('E-1'));
    expect(evidenceStatusText(rest, COPY.en, 'en')).toBe('current');
  });
});

describe('conflictOf and summaryFor', () => {
  it('INV-DEMO-9 has a conflict: passing checks against rising errors, both observed', () => {
    const c = conflictOf(WORLD, inv('INV-DEMO-9'), 'owner');
    expect(c?.passing.map((e) => e.id)).toEqual(['E-21']);
    expect(c?.opposing.map((e) => e.id)).toEqual(['E-22']);
    expect(c?.passing[0]?.label).toBe('observed');
    expect(c?.opposing[0]?.label).toBe('observed');
  });
  it('khepri-api health resolves to degraded, never healthy', () => {
    const c = conflictOf(WORLD, inv('INV-DEMO-9'), 'technical');
    expect(c?.component?.name).toBe('khepri-api');
    expect(c?.triad?.health).toBe('degraded');
  });
  it('INV-DEMO-7 has no passing check of its own, so no conflict is invented', () => {
    expect(conflictOf(WORLD, inv('INV-DEMO-7'), 'owner')).toBeUndefined();
  });
  it('an unknown project or empty evidence yields no conflict', () => {
    expect(conflictOf(WORLD, { ...inv('INV-DEMO-9'), evidence: [] }, 'owner')).toBeUndefined();
    expect(conflictOf({ ...WORLD, projects: [] }, inv('INV-DEMO-9'), 'owner')).toBeUndefined();
  });
  it('summaryFor builds the persona-shaped list and the linked decision and project', () => {
    const s = summaryFor(OWNER_W, 'INV-DEMO-9', 'owner');
    expect(s?.project?.id).toBe('KH');
    expect(s?.decision?.id).toBe('DEC-DEMO-5');
    expect(s?.component?.id).toBe('khepri-api');
    // E-23 is Technical-only: the scoped world never holds it, so there is no row for it, not even a placeholder.
    expect(s?.evidence.map((e) => e.id)).toEqual(['E-21', 'E-22', 'E-24']);
    expect(summaryFor(WORLD, 'INV-DEMO-9', 'technical')?.evidence.map((e) => e.id)).toEqual(['E-21', 'E-22', 'E-23', 'E-24']);
    expect(s?.evidence.find((e) => e.id === 'E-24')?.notReadReason).toBe('unavailable');
    expect(s?.conflict).toBeDefined();
  });
  it('summaryFor is undefined for an unknown case and tolerates missing links', () => {
    expect(summaryFor(OWNER_W, 'INV-NOPE', 'owner')).toBeUndefined();
    const { decisionId: _d, ...noDecision } = scopedInv('INV-DEMO-9', 'owner');
    const lone = { ...OWNER_W, investigations: [{ ...noDecision, projectId: 'SB' as const }] };
    const s = summaryFor(lone, 'INV-DEMO-9', 'owner');
    expect(s?.decision).toBeUndefined();
    expect(s?.component).toBeUndefined();
    expect(s?.conflict).toBeUndefined();
  });
});

describe('decisionLabel', () => {
  it('open proposals are Proposed; the synthetic record is Approved only with its source link', () => {
    const d = (id: string) => {
      const x = WORLD.decisions.find((y) => y.id === id);
      if (!x) throw new Error(id);
      return x;
    };
    expect(decisionLabel(d('DEC-DEMO-3'))).toBe('proposed');
    expect(decisionLabel(d('DEC-DEMO-1'))).toBe('approved');
    const { record: _r, ...noRecord } = d('DEC-DEMO-1');
    expect(decisionLabel(noRecord)).toBe('proposed');
  });
});
