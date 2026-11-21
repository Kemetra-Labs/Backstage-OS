// SPEC section 2 "figure to derivation" table, asserted against WORLD so the derivation cannot drift, plus the pilot's
// orbit geometry and its honesty rules (unknown is never healthy, stale links are flagged, restricted evidence is hidden).
import { describe, expect, it } from 'vitest';
import { HUB_ID, ORBIT_ANGLE, nodePoint, nodePoints } from '../fixtures/orbit-layout';
import { WORLD } from '../fixtures/world';
import { authorizedWorld } from './authorize';
import { ageGeometry, bcFigures, curve, edgeRestricted, edgeStale, formatAt, parseSeed, pipTone, ringShare } from './bc';
import { nodeChip } from './evidence';
import { nextByDirection } from './graph';
import { BC_CANVAS, ORBIT_RADII, orbitOf, orbitPosition } from './orbit';
import { minutesSince, sourceStatus } from './status';

const w = WORLD;
const src = (p: string) => sourceStatus(w.sources.find((s) => s.provider === p)!, w.now);
const chipOf = (id: string) => nodeChip(w.nodes.find((n) => n.id === id)!, w.sources).kind;

describe('B+C derivation table (SPEC section 2)', () => {
  const f = bcFigures(w);

  it('counts products, projects and services by kind: 2 / 3 / 5', () => {
    expect([f.products, f.projects, f.services]).toEqual([2, 3, 5]);
  });

  it('counts active risks: a failing check, or a provider source with an issue (3)', () => {
    expect(f.risks).toBe(3);
    expect(w.nodes.filter((n) => n.check === 'failing').map((n) => n.id)).toEqual(['stock-sync']);
  });

  it('counts service issues as unavailable or stale sources, never "not set up" (2)', () => {
    expect(f.sourceIssues).toBe(2);
    expect(['sentry', 'port'].every((p) => src(p).issue)).toBe(true);
    expect(['datadog', 'confluence'].some((p) => src(p).issue)).toBe(false);
  });

  it('reads three independent counts over six sources: 3 reachable, 2 within target, 1 confirmed healthy', () => {
    expect(f.reachable).toEqual({ n: 3, of: 6 });
    expect(f.current).toEqual({ n: 2, of: 6 });
    expect(f.healthy).toEqual({ n: 1, of: 6 });
    expect(f.sourceTotal).toBe(6);
    expect([f.stale, f.unavailable, f.notSet]).toEqual([2, 1, 2]);
  });

  it('confirms exactly one source healthy (GitHub): Jira has no basis, Sentry basis is stale', () => {
    expect(w.sources.map((s) => sourceStatus(s, w.now)).filter((s) => s.health === 'healthy').map((s) => s.provider)).toEqual(['github']);
  });

  it('derives ring and age bar from age over target: GitHub 6/30, Jira 12/120, Sentry 540/15, Port 1500/1440', () => {
    expect([src('github'), src('jira'), src('sentry'), src('port')].map((s) => [s.ageMinutes, s.ttlMinutes])).toEqual([[6, 30], [12, 120], [540, 15], [1500, 1440]]);
    expect(ringShare(src('github'))).toBeCloseTo(0.2);
    expect(ringShare(src('sentry'))).toBe(1);
    expect(ringShare(src('datadog'))).toBeNull(); // never read: a dashed neutral ring, not an empty one
  });

  it('shows "36x target" only from a ratio of 1.5, and cuts the track beyond 3x', () => {
    expect(ageGeometry(src('sentry')).multiple).toBe(Math.round(540 / 15));
    expect(ageGeometry(src('sentry')).multiple).toBe(36);
    expect(ageGeometry(src('sentry')).cut).toBe(true);
    expect(ageGeometry(src('port')).multiple).toBeNull(); // 1.04x: over target, but not worth a multiple
    expect(ageGeometry(src('port')).state).toBe('stale');
    expect(ageGeometry(src('github'))).toMatchObject({ state: 'ok', overWidth: 0, cut: false });
    expect(ageGeometry(src('datadog')).state).toBe('none');
  });

  it('draws an unavailable source as stale even when its last read is inside the target (freshnessOf says stale)', () => {
    const fresh = { ageMinutes: 5, used: 5 / 30, ttlMinutes: 30 };
    expect(ageGeometry({ ...fresh, freshness: 'current' }).state).toBe('ok');
    expect(ageGeometry({ ...fresh, freshness: 'stale' })).toMatchObject({ state: 'stale', overWidth: 0, multiple: null });
    expect(ageGeometry(fresh).state).toBe('ok'); // freshness is optional: age alone decides when it is not given
  });

  it('keeps the target tick at one third on every row', () => {
    for (const s of w.sources) expect(ageGeometry(sourceStatus(s, w.now)).targetAt).toBeCloseTo(100 / 3);
  });

  it('counts dependency links by truth: 2 observed, 1 correlated, 1 hypothesis, 4 unknown, plus 3 structure', () => {
    expect(f.links).toEqual({ observed: 2, correlated: 1, hypothesis: 1, unknown: 4 });
    expect(f.structureLinks).toBe(3);
    expect(w.edges).toHaveLength(11);
  });

  it('flags only d4 as a stale link: classified, has evidence, and every read is not current', () => {
    expect(w.edges.filter((e) => edgeStale(e, w)).map((e) => e.id)).toEqual(['d4']);
  });

  it('resolves the node chip by the contract: one healthy node, claims without evidence stay unknown', () => {
    expect(chipOf('stock-sync')).toBe('check');
    expect(chipOf('github')).toBe('healthy');
    expect(w.nodes.filter((n) => chipOf(n.id) === 'healthy').map((n) => n.id)).toEqual(['github']);
    for (const id of ['khepri', 'jira', 'seshat-bi', 'pos', 'retail-tower']) expect(chipOf(id)).toBe('unknown');
    for (const id of ['sentry', 'inventory']) expect(chipOf(id)).toBe('stale');
    expect(chipOf('port')).toBe('unavailable');
  });

  it('prints evidence age from the fixed now: E-1 is 7 min old', () => {
    expect(minutesSince(w.evidenceById['E-1']!.observation!.observedAt, w.now)).toBe(7);
  });

  it('counts distinct observed reads in 24 h (5), derived but not displayed', () => {
    expect(f.observedReads24h).toBe(5);
  });
});

describe('pip tones: only a confirmed state is filled', () => {
  const tones = (axis: 'connectivity' | 'freshness' | 'health') => w.sources.map((s) => pipTone(axis, sourceStatus(s, w.now)));
  // order: github, jira, sentry, datadog, confluence, port
  it('connectivity', () => expect(tones('connectivity')).toEqual(['ok', 'ok', 'ok', 'unk', 'unk', 'bad']));
  it('freshness', () => expect(tones('freshness')).toEqual(['ok', 'ok', 'warn', 'unk', 'unk', 'warn']));
  it('health', () => expect(tones('health')).toEqual(['ok', 'unk', 'unk', 'unk', 'unk', 'unk']));
});

describe('restricted evidence (BACK-27: no silent restricted-record disclosure)', () => {
  const d4 = w.edges.find((e) => e.id === 'd4')!;
  it('hides the basis of a link built on Technical-only evidence from Owner and Nontechnical', () => {
    expect(edgeRestricted(d4, 'owner', w)).toBe(true);
    expect(edgeRestricted(d4, 'nontechnical', w)).toBe(true);
    expect(edgeRestricted(d4, 'technical', w)).toBe(false);
  });
  it('restricts nothing else', () => {
    expect(w.edges.filter((e) => e.id !== 'd4').some((e) => edgeRestricted(e, 'owner', w))).toBe(false);
  });
  it('is defence in depth only: the world screens pass Owner and Nontechnical has no such link left to restrict (BACK-30)', () => {
    for (const p of ['owner', 'nontechnical'] as const) {
      const scoped = authorizedWorld(w, p);
      expect(scoped.edges.some((e) => edgeRestricted(e, p, scoped))).toBe(false);
      expect(scoped.edges.find((e) => e.id === 'd4')).toBeUndefined();
    }
  });
});

describe('orbit geometry', () => {
  it('maps kind to orbit: products inner, projects middle, services outer', () => {
    expect(w.nodes.map((n) => [n.id, orbitOf(n)]).filter(([id]) => id === 'khepri' || id === 'pos' || id === 'github')).toEqual([['khepri', 'inner'], ['pos', 'middle'], ['github', 'outer']]);
  });

  it('puts a point on its ellipse: 0 degrees is the right-hand vertex, 90 degrees the top', () => {
    expect(orbitPosition('inner', 0)).toEqual({ x: 700, y: 500 });
    expect(orbitPosition('outer', 90)).toEqual({ x: 500, y: 100 });
    expect(orbitPosition('middle', 180)).toEqual({ x: 200, y: 500 });
  });

  it('is deterministic and rounded to one decimal', () => {
    expect(orbitPosition('middle', 38)).toEqual(orbitPosition('middle', 38));
    for (const p of Object.values(nodePoints(w))) expect(p.x * 10).toBeCloseTo(Math.round(p.x * 10));
  });

  it('gives every node a placement (an angle, or the hub at the centre) inside the canvas and on its own orbit', () => {
    for (const n of w.nodes) {
      const p = nodePoint(n);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(BC_CANVAS.w);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(BC_CANVAS.h);
      if (n.id === HUB_ID) { expect(p).toEqual({ x: BC_CANVAS.cx, y: BC_CANVAS.cy }); continue; }
      expect(ORBIT_ANGLE[n.id], `${n.id} has no angle`).toBeDefined();
      const { rx, ry } = ORBIT_RADII[orbitOf(n)];
      expect(((p.x - BC_CANVAS.cx) / rx) ** 2 + ((p.y - BC_CANVAS.cy) / ry) ** 2).toBeCloseTo(1, 1);
    }
  });

  it('keeps every pair of nodes apart so no two orbs collide', () => {
    const pts = w.nodes.map((n) => nodePoint(n));
    for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThan(90);
  });

  it('leaves the arrow keys a way to every node: each node can reach another in some direction', () => {
    const placed = w.nodes.map((n) => ({ ...n, ...nodePoint(n) }));
    for (const n of placed) {
      const reach = (['left', 'right', 'up', 'down'] as const).map((d) => nextByDirection(n.id, d, placed)).filter(Boolean);
      expect(reach.length, n.id).toBeGreaterThan(0);
    }
    // from the hub, up reaches the project on the inner side of the canvas
    expect(nextByDirection(HUB_ID, 'up', placed)).toBe('stock-sync');
  });

  it('draws a link curve with a midpoint between its ends', () => {
    const c = curve({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    expect(c.d).toBe('M0 0 Q50 0 100 0');
    expect(c.mx).toBe(50);
  });
});

describe('screen seed and time format', () => {
  it('reads view, tab and filter from the URL and ignores anything else', () => {
    expect(parseSeed('?concept=bc&view=list&tab=evidence&f=risks')).toEqual({ mode: 'list', tab: 'evidence', filter: 'risks' });
    expect(parseSeed('?view=<script>&tab=nope&f=all%27')).toEqual({});
    expect(parseSeed('')).toEqual({});
  });

  it('formats event times with Latin digits: time only on the world day, date and time otherwise', () => {
    expect(formatAt('2026-11-16T14:03:00Z', w.now, 'en')).toBe('14:03');
    expect(formatAt('2026-11-15T13:09:00Z', w.now, 'en')).toBe('15 Nov 13:09');
    expect(formatAt('2026-11-15T13:09:00Z', w.now, 'ar')).toBe('15 نوفمبر 13:09');
  });
});
