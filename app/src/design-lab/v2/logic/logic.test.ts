import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixtures/world';
import { authorizedWorld } from './authorize';
import { buildHash, DEFAULT_ROUTE, parseRoute } from '../navigation/route';
import { deckCounts, filterMissions } from './deck';
import { CANVAS, HOME_VIEW, ZOOM_MAX, ZOOM_MIN, clampZoom, filterSet, focusView, kindCounts, linkCounts, neighbours, nextByDirection, scopeSet, zoomAt } from './graph';
import { SPEEDS, STEP_MS, advance, clampMs, gapsAt, indexAt, milestonesAt, msOfIndex, stageAt, totalMs } from './replay';

describe('route', () => {
  it('falls back to defaults for anything invalid', () => {
    const r = parseRoute('#/nope?persona=hacker&lang=fr&scope=%3Cscript%3E&node=a b&src=evil', '');
    expect(r.screen).toBe(DEFAULT_ROUTE.screen);
    expect(r.persona).toBe('owner');
    expect(r.lang).toBe('en');
    expect(r.scope).toBe(DEFAULT_ROUTE.scope);
    expect(r.node).toBeNull();
    expect(r.src).toBe(DEFAULT_ROUTE.src);
  });

  it('round-trips a full route and omits defaults', () => {
    const r = parseRoute('#/mission-replay?persona=technical&lang=ar&evt=R-4&node=stock-sync&src=sentry&msn=MSN-DEMO-2&scope=khepri');
    expect(r).toMatchObject({ screen: 'mission-replay', persona: 'technical', lang: 'ar', evt: 'R-4', node: 'stock-sync', src: 'sentry', msn: 'MSN-DEMO-2', scope: 'khepri' });
    expect(parseRoute(buildHash(r))).toEqual(r);
    expect(buildHash(DEFAULT_ROUTE)).toBe('#/mission-map?persona=owner&lang=en');
  });

  it('lets the hash win over the query string, and seeds persona and lang from the query', () => {
    expect(parseRoute('#/mission-map?lang=en', '?lang=ar&persona=nontechnical')).toMatchObject({ lang: 'en', persona: 'nontechnical' });
  });

  it('does not let a query seed override a later switch back to the default language', () => {
    const seeded = parseRoute('#/mission-map', '?lang=ar');
    expect(seeded.lang).toBe('ar');
    const switched = parseRoute(buildHash({ ...seeded, lang: 'en' }), '?lang=ar');
    expect(switched.lang).toBe('en');
  });
});

describe('graph', () => {
  const w = WORLD;
  it('scopes to two links and dims, never removes, everything else', () => {
    const s = scopeSet('retail-tower', w);
    for (const id of ['stock-sync', 'pos', 'inventory', 'khepri', 'seshat-bi', 'port', 'github', 'jira', 'sentry']) expect(s.has(id), id).toBe(true);
    expect(scopeSet('all', w).size).toBe(w.nodes.length);
    expect(scopeSet('does-not-exist', w).size).toBe(w.nodes.length);
    expect(scopeSet('khepri', w).has('github')).toBe(false);
  });

  it('keeps a node that lost its only link (BACK-30: Sentry for an unauthorized persona) in every scope, and still reads it as a risk', () => {
    const owner = authorizedWorld(w, 'owner');
    expect(neighbours('sentry', owner.edges)).toEqual([]);
    for (const scope of ['retail-tower', 'khepri', 'seshat-bi', 'all']) expect(scopeSet(scope, owner).has('sentry'), scope).toBe(true);
    expect(filterSet('risks', owner).has('sentry')).toBe(true);
    expect(scopeSet('khepri', w).has('sentry')).toBe(false);
  });

  it('filters risks to the failing check and the two problem services, never to unknown-health nodes', () => {
    expect([...filterSet('risks', w)].sort()).toEqual(['port', 'sentry', 'stock-sync']);
    expect(filterSet('products', w).size).toBe(2);
    expect(filterSet('all', w).size).toBe(w.nodes.length);
  });

  it('counts kinds and link classifications from the fixture', () => {
    expect(kindCounts(w)).toEqual({ product: 2, project: 3, service: 5 });
    expect(linkCounts('retail-tower', w)).toEqual({ observed: 0, correlated: 0, hypothesis: 0, unknown: 3 });
    expect(linkCounts('stock-sync', w)).toEqual({ observed: 1, correlated: 1, hypothesis: 1, unknown: 1 });
    expect(neighbours('github', w.edges)).toEqual(['stock-sync']);
  });

  it('zooms about a point so that point stays put, and clamps', () => {
    const v = zoomAt(HOME_VIEW, 1.5, 300, 200);
    expect(v.tx + 300 * v.k).toBeCloseTo(300, 6);
    expect(v.ty + 200 * v.k).toBeCloseTo(200, 6);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(zoomAt(HOME_VIEW, 100, 0, 0).k).toBe(ZOOM_MAX);
  });

  it('centres a node on focus', () => {
    const n = w.nodes.find((x) => x.id === 'jira')!;
    const v = focusView(n, 1.5);
    expect(n.x * v.k + v.tx).toBeCloseTo(CANVAS.w / 2, 6);
    expect(n.y * v.k + v.ty).toBeCloseTo(CANVAS.h / 2, 6);
  });

  it('moves between nodes by arrow direction', () => {
    expect(nextByDirection('retail-tower', 'up', w.nodes)).toBe('stock-sync');
    expect(nextByDirection('retail-tower', 'right', w.nodes)).toBe('inventory');
    expect(nextByDirection('retail-tower', 'left', w.nodes)).toBe('pos');
    expect(nextByDirection('stock-sync', 'up', w.nodes)).toBeNull();
    expect(nextByDirection('nope', 'up', w.nodes)).toBeNull();
  });
});

describe('replay', () => {
  const ev = WORLD.replay;
  it('is deterministic over evenly spaced events', () => {
    expect(totalMs(ev)).toBe((ev.length - 1) * STEP_MS);
    expect(indexAt(0, ev)).toBe(0);
    expect(indexAt(STEP_MS - 1, ev)).toBe(0);
    expect(indexAt(STEP_MS, ev)).toBe(1);
    expect(indexAt(1e9, ev)).toBe(ev.length - 1);
    expect(indexAt(-5, ev)).toBe(0);
    expect(indexAt(5, [])).toBe(-1);
    expect(clampMs(-1, ev)).toBe(0);
    expect(msOfIndex(3)).toBe(3 * STEP_MS);
  });

  it('only moves forward through stages as the cursor advances', () => {
    const order = ['observed', 'ingested', 'correlated', 'hypothesis', 'proposed'];
    let last = -1;
    ev.forEach((_, i) => {
      const r = order.indexOf(stageAt(i, ev));
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    });
    expect(stageAt(ev.length - 1, ev)).toBe('proposed');
    expect(stageAt(5, ev)).toBe('hypothesis');
  });

  it('never closes the loop: deciding and closing stay open at every position', () => {
    ev.forEach((_, i) => {
      const m = milestonesAt(i, ev);
      expect(m.find((x) => x.key === 'decide')!.state).toBe('todo');
      expect(m.find((x) => x.key === 'close')!.state).toBe('todo');
    });
    expect(milestonesAt(0, ev)[0]!.state).toBe('done');
    expect(milestonesAt(5, ev).find((x) => x.key === 'validate')!.state).toBe('progress');
  });

  it('announces the evidence gap only once it has been replayed', () => {
    expect(gapsAt(3, ev)).toHaveLength(0);
    expect(gapsAt(4, ev).map((e) => e.id)).toEqual(['R-5']);
  });

  it('advances by speed and stops at the end', () => {
    expect(advance(0, 100, 4, ev)).toEqual({ ms: 400, ended: false });
    expect(advance(totalMs(ev) - 10, 100, 1, ev)).toEqual({ ms: totalMs(ev), ended: true });
    expect(SPEEDS).toEqual([1, 2, 4]);
  });
});

describe('deck', () => {
  it('derives counts from the missions, with no invented activity totals', () => {
    const c = deckCounts(WORLD);
    expect(c).toMatchObject({ agents: 5, active: 5, needsReview: 1, reviewing: 2, monitoring: 2 });
    expect(Object.values(c.byStatus).reduce((a, b) => a + b, 0)).toBe(WORLD.missions.length);
  });

  it('filters by agent and status', () => {
    expect(filterMissions(WORLD.missions, { agent: 'AG-3', status: 'all' })).toHaveLength(1);
    expect(filterMissions(WORLD.missions, { agent: 'all', status: 'waiting_review' }).map((m) => m.id)).toEqual(['MSN-DEMO-5']);
    expect(filterMissions(WORLD.missions, { agent: 'AG-1', status: 'idle' })).toHaveLength(0);
  });
});
