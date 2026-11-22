import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { COPY } from '../i18n/strings';
import {
  conflictOf, crumbTrail, decisionLabel, evidenceStatusText, evidenceTimeline, observedMinutesAgo, summaryFor,
} from './investigationView';
import { evidenceViewFor } from './evidence';

const inv = (id: string) => {
  const i = WORLD.investigations.find((x) => x.id === id);
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
  it('lists unread and restricted items apart, never with a time (raw, unprojected input: defence in depth)', () => {
    const owner = evidenceTimeline(refs, 'owner');
    expect(owner.untimed.map((r) => r.id).sort()).toEqual(['E-5', 'E-6', 'E-7']);
    expect(owner.timed.map((r) => r.id)).not.toContain('E-5');
    for (const r of owner.untimed) expect(r.minutesAgo).toBeNull();
    expect(owner.untimed.find((r) => r.id === 'E-5')?.view.restricted).toBe(true);
  });
  it('every item lands in exactly one list', () => {
    for (const p of ['owner', 'technical', 'nontechnical'] as const) {
      const s = evidenceTimeline(refs, p);
      expect(s.timed.length + s.untimed.length).toBe(refs.length);
    }
  });
});

describe('evidenceStatusText', () => {
  it('says restricted, not read, or provider and freshness in words (raw, unprojected input: defence in depth)', () => {
    const c = COPY.en;
    expect(evidenceStatusText(evidenceViewFor('owner', ev('E-5')), c, 'en')).toBe('Restricted to Technical');
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
    const s = summaryFor(WORLD, 'INV-DEMO-9', 'owner');
    expect(s?.project?.id).toBe('KH');
    expect(s?.decision?.id).toBe('DEC-DEMO-5');
    expect(s?.component?.id).toBe('khepri-api');
    expect(s?.evidence.map((e) => e.id)).toEqual(['E-21', 'E-22', 'E-23', 'E-24']);
    expect(s?.evidence.find((e) => e.id === 'E-23')?.restricted).toBe(true);
    expect(s?.evidence.find((e) => e.id === 'E-24')?.notReadReason).toBe('unavailable');
    expect(s?.conflict).toBeDefined();
  });
  it('summaryFor is undefined for an unknown case and tolerates missing links', () => {
    expect(summaryFor(WORLD, 'INV-NOPE', 'owner')).toBeUndefined();
    const { decisionId: _d, ...noDecision } = inv('INV-DEMO-9');
    const lone = { ...WORLD, investigations: [{ ...noDecision, projectId: 'SB' as const }] };
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
