// Portfolio response adapter (BACK-57 slice 3): server JSON to the display contract. Pure; no network.
import { describe, expect, it } from 'vitest';
import { countDisplay, effectiveFreshness, freshnessOf, isInertLink, needsDemoMarker, resolveLabel } from '../contract/rules';
import { sourceBuckets } from '../view/portfolioView';
import { GITHUB_TTL_SECONDS, parsePortfolio, toPortfolio } from './portfolio';

const NOW = new Date('2026-11-25T12:10:00Z');
const opts = { now: NOW, ttlSeconds: GITHUB_TTL_SECONDS, synthetic: true };

/** Hand-made to match server/src/portfolio/portfolio.model.ts as merged in #101. */
const source = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  provider: 'github',
  externalRef: 'kemetra-labs/backstage-os',
  state: 'ok',
  reason: null,
  lastReadAt: '2026-11-25T12:00:00.000Z',
  lists: {
    pullRequests: { state: 'ok', reason: null, count: 1, complete: true },
    issues: { state: 'ok', reason: null, count: 20, complete: false },
  },
  items: [
    {
      evidenceId: 'e-12',
      kind: 'pull_request',
      number: 12,
      title: 'Add the portfolio route',
      state: 'open',
      draft: false,
      updatedAt: '2026-11-24T08:00:00.000Z',
      url: 'https://github.com/Kemetra-Labs/Backstage-OS/pull/12',
    },
  ],
  ...over,
});
const project = (sources: unknown[] = [source()]) => ({ id: 'p1', key: 'backstage-os', name: 'Backstage OS', state: 'ok', sources });
const detail = (sources: unknown[] = [source()]) => project(sources);

const one = (s: unknown) => toPortfolio(parsePortfolio({ projects: [project([s])] }), opts).projects[0]!.sources[0]!;

describe('a source that was read', () => {
  it('is reachable with its read as the last good read, and current within the GitHub TTL', () => {
    const s = one(source());
    expect(s.authority).toEqual({
      provider: 'github',
      connectivity: 'reachable',
      lastSuccessAt: '2026-11-25T12:00:00.000Z',
      ageMinutes: 10,
      ttlSeconds: 1800,
      synthetic: true,
    });
    expect(freshnessOf(s.authority)).toBe('current');
    expect(s.failure).toBeNull();
  });

  it('turns stale past the TTL, computed from the injected now', () => {
    const s = toPortfolio(parsePortfolio({ projects: [project()] }), { ...opts, now: new Date('2026-11-25T13:00:00Z') }).projects[0]!.sources[0]!;
    expect(freshnessOf(s.authority)).toBe('stale');
  });

  it('a read time in the future is not current: freshness unknown, and its items are not shown', () => {
    const p = toPortfolio(parsePortfolio({ projects: [project([source({ lastReadAt: '2026-11-26T00:00:00.000Z' })])] }), opts).projects[0]!;
    expect(p.sources[0]!.authority.lastSuccessAt).toBeNull();
    expect(freshnessOf(p.sources[0]!.authority)).toBe('unknown');
    expect(p.items).toEqual([]);
  });

  it('shows a full page as "at least", a short page as exact, and an unread list as not read', () => {
    const s = one(source({ lists: {
      pullRequests: { state: 'ok', reason: null, count: 3, complete: true },
      issues: { state: 'ok', reason: null, count: 20, complete: false },
    } }));
    expect(countDisplay(s.pullRequests)).toEqual({ kind: 'exact', value: 3, sourcesRead: 1, sourcesTotal: 1 });
    expect(countDisplay(s.issues)).toEqual({ kind: 'atLeast', value: 20, sourcesRead: 1, sourcesTotal: 1 });
    const unknownCompleteness = one(source({ lists: {
      pullRequests: { state: 'ok', reason: null, count: 3, complete: null },
      issues: { state: 'unknown', reason: 'rate_limited', count: null, complete: null },
    } }));
    expect(countDisplay(unknownCompleteness.pullRequests).kind).toBe('atLeast');
    expect(countDisplay(unknownCompleteness.issues).kind).toBe('notRead');
  });

  it('turns items into observed, all-visible evidence whose links stay inert while synthetic', () => {
    const [ref] = toPortfolio(parsePortfolio({ projects: [detail()] }), opts).projects[0]!.items;
    expect(ref).toMatchObject({ id: 'e-12', classification: 'observed', visibility: 'all' });
    expect(ref!.observation).toMatchObject({
      id: 'e-12',
      target: { kind: 'workItem', externalId: '#12', label: 'Add the portfolio route' },
      sourceUrl: 'https://github.com/Kemetra-Labs/Backstage-OS/pull/12',
    });
    expect(resolveLabel(ref!)).toBe('observed');
    expect(effectiveFreshness(ref!)).toBe('current');
    expect(isInertLink(ref!.observation!.sourceUrl, ref!.observation!.source.synthetic)).toBe(true);
    expect(needsDemoMarker([ref!.observation!.source])).toBe(true);
  });
});

describe('a source that was not read, or failed', () => {
  it('never read: reachable but never read, so freshness unknown, counted in the unknown bucket', () => {
    const s = one(source({ state: 'unknown', reason: 'never_read', lastReadAt: null, items: [],
      lists: { pullRequests: { state: 'unknown', reason: 'never_read', count: null, complete: null }, issues: { state: 'unknown', reason: 'never_read', count: null, complete: null } } }));
    expect(s.authority).toMatchObject({ connectivity: 'reachable', lastSuccessAt: null, ageMinutes: null });
    expect(freshnessOf(s.authority)).toBe('unknown');
    expect(sourceBuckets([s.authority])).toMatchObject({ unknown: 1, current: 0 });
    expect(s.failure).toBe('never_read');
  });

  it.each([
    ['denied', 'denied'],
    ['denied', 'not_visible'],
    ['unknown', 'timeout'],
    ['error', 'malformed'],
    ['stale', 'whatever'],
  ])('%s / %s: unavailable, no last good read, never current, no items', (state, reason) => {
    // The server's latest read failed; it does not know when the last good read was, so neither do we.
    const p = toPortfolio(parsePortfolio({ projects: [project([source({ state, reason })])] }), opts).projects[0]!;
    const s = p.sources[0]!;
    expect(s.authority).toMatchObject({ connectivity: 'unavailable', lastSuccessAt: null, ageMinutes: null });
    expect(freshnessOf(s.authority)).not.toBe('current');
    expect(sourceBuckets([s.authority])).toMatchObject({ unavailable: 1, current: 0 });
    expect(s.failure).toBe(reason);
    expect(p.items).toEqual([]);
    // The fixture's lists still say ok with counts: a failed source must not show them.
    expect(countDisplay(s.pullRequests).kind).toBe('notRead');
    expect(countDisplay(s.issues).kind).toBe('notRead');
  });

  it('a failure never becomes restricted evidence: no restricted visibility or reason anywhere', () => {
    const p = toPortfolio(parsePortfolio({ projects: [project([source({ state: 'denied', reason: 'denied' }), source({ id: 's2' })])] }), opts).projects[0]!;
    expect(JSON.stringify(p)).not.toContain('restricted');
  });
});

describe('the response is untrusted', () => {
  it.each([
    ['not an object', 'nope'],
    ['no projects array', {}],
    ['projects not an array', { projects: {} }],
  ])('%s: malformed, never an empty portfolio that looks fine, never a throw', (_label, body) => {
    expect(parsePortfolio(body)).toEqual({ projects: [], malformed: true, dropped: 0 });
  });

  it('a real empty portfolio is not malformed', () => {
    expect(parsePortfolio({ projects: [] })).toEqual({ projects: [], malformed: false, dropped: 0 });
  });

  it('drops a malformed project instead of guessing, and counts it', () => {
    const parsed = parsePortfolio({ projects: [{ id: 1 }, project()] });
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.dropped).toBe(1);
    expect(toPortfolio(parsed, opts)).toMatchObject({ malformed: false, dropped: 1 });
  });

  it.each([
    ['an unknown state', { state: 'healthy' }],
    ['a bad read time', { lastReadAt: 'yesterday' }],
    ['missing lists', { lists: undefined }],
    ['an ok list with a negative count', { lists: { pullRequests: { state: 'ok', reason: null, count: -1, complete: true }, issues: { state: 'ok', reason: null, count: 0, complete: true } } }],
  ])('%s fails closed to an unavailable, unread source, never ok', (_label, over) => {
    const s = one(source(over));
    expect(s.authority.connectivity).toBe('unavailable');
    expect(s.authority.lastSuccessAt).toBeNull();
    expect(s.failure).toBe('malformed');
    expect(countDisplay(s.pullRequests).kind).toBe('notRead');
  });

  it('removes bidi override and isolate controls from titles (EN/AR), keeping the text', () => {
    const title = '‮desrever‬ ⁧عنوان⁩';
    const items = toPortfolio(parsePortfolio({ projects: [detail([source({ items: [{ ...source().items[0], title }] })])] }), opts).projects[0]!.items;
    expect(items[0]!.observation!.target.label).toBe('desrever عنوان');
  });

  it('drops a source whose provider or id cannot be expressed, rather than inventing one', () => {
    const p = parsePortfolio({ projects: [project([source({ provider: 'gitlab' }), source({ id: 7 }), source({ id: 's2' })])] });
    expect(p.projects[0]!.sources.map((s) => s.id)).toEqual(['s2']);
    expect(p.dropped).toBe(2);
  });

  it('drops a malformed item and keeps no field outside the display contract', () => {
    const bad = { evidenceId: 'e-x', kind: 'pull_request', number: 'twelve', title: 1 };
    const extra = { ...source().items[0], body: 'secret body', evidenceId: 'e-13', number: 13 };
    const items = toPortfolio(parsePortfolio({ projects: [detail([source({ items: [bad, extra] })])] }), opts).projects[0]!.items;
    expect(items.map((i) => i.id)).toEqual(['e-13']);
    expect(JSON.stringify(items)).not.toContain('secret body');
  });

  it('keeps an item URL only if it is https on github.com', () => {
    const it = (url: unknown) => toPortfolio(parsePortfolio({ projects: [detail([source({ items: [{ ...source().items[0], url }] })])] }), opts).projects[0]!.items[0]!;
    expect(it('javascript:alert(1)').observation!.sourceUrl).toBeUndefined();
    expect(it('https://evil.example/Kemetra-Labs/Backstage-OS/pull/1').observation!.sourceUrl).toBeUndefined();
    expect(it('https://user:pw@github.com/x/y/pull/1').observation!.sourceUrl).toBeUndefined();
    expect(it('http://github.com/x/y/pull/1').observation!.sourceUrl).toBeUndefined();
    expect(it(null).observation!.sourceUrl).toBeUndefined();
  });
});
