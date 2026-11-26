// BACK-51 P1: the live-mode switch and the two live reads. The fetcher is injected: nothing here touches the network.
import { describe, expect, it, vi } from 'vitest';
import { investigationIdFrom, LIVE, liveMode, liveStateKind, readInvestigation, readPortfolio } from './reads';

const ID = '00000000-0000-4000-8000-000000000004';

function routes(table: Record<string, [number, string]>) {
  return vi.fn(async (path: string) => {
    const hit = table[path];
    if (!hit) throw new TypeError(`unexpected ${path}`);
    return new Response(hit[1], { status: hit[0] });
  });
}

describe('live mode switch', () => {
  it('is on only for exactly VITE_KAWALYS_LIVE=1', () => {
    expect(liveMode({})).toBe(false);
    expect(liveMode({ VITE_KAWALYS_LIVE: '0' })).toBe(false);
    expect(liveMode({ VITE_KAWALYS_LIVE: 'true' })).toBe(false);
    expect(liveMode({ VITE_KAWALYS_LIVE: ' 1' })).toBe(false);
    expect(liveMode({ VITE_KAWALYS_LIVE: '1' })).toBe(true);
  });

  it('is off in the test build, as in every default build', () => {
    expect(LIVE).toBe(false);
  });
});

describe('investigationIdFrom', () => {
  it('takes only a UUID', () => {
    expect(investigationIdFrom(`?investigation=${ID}`)).toBe(ID);
    expect(investigationIdFrom(`?persona=x&investigation=${ID.toUpperCase()}`)).toBe(ID.toUpperCase());
    for (const s of ['', '?investigation=', '?investigation=abc', '?investigation=../auth/me', `?investigation=${ID}/x`, `?investigation=${ID}%2F..`])
      expect(investigationIdFrom(s), s).toBeNull();
  });
});

describe('readPortfolio', () => {
  it('reads GET /api/portfolio', async () => {
    const f = routes({ '/api/portfolio': [200, '{"projects":[]}'] });
    expect(await readPortfolio(undefined, f)).toEqual({ status: 'ok', body: { projects: [] } });
  });

  it('a failure keeps its kind, never an empty portfolio', async () => {
    expect(await readPortfolio(undefined, routes({ '/api/portfolio': [404, ''] }))).toEqual({ status: 'failed', failure: 'not_found' });
    expect(await readPortfolio(undefined, routes({}))).toEqual({ status: 'failed', failure: 'unavailable' });
  });

  it('an abort returns null: the caller sets no state', async () => {
    const f = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await readPortfolio(new AbortController().signal, f)).toBeNull();
  });
});

describe('readInvestigation', () => {
  it('an id in the address wins: the investigation list is never read', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [200, '{"id":"i"}'], [`/api/decisions?investigationId=${ID}`]: [200, '{"items":[]}'] });
    expect(await readInvestigation(ID, undefined, f)).toMatchObject({ status: 'ok', body: { chosen: 'address' } });
    expect(f.mock.calls.map((c) => c[0])).not.toContain('/api/investigations');
  });

  it('reads the investigation and its decisions, filtered by the server', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [200, '{"id":"i"}'], [`/api/decisions?investigationId=${ID}`]: [200, '{"items":[]}'] });
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'ok', body: { investigation: { id: 'i' }, decisions: { items: [] }, chosen: 'address' } });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('a failed investigation read fails the panel with its own kind', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [404, ''], [`/api/decisions?investigationId=${ID}`]: [200, '{"items":[]}'] });
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'failed', failure: 'not_found' });
  });

  it('only the decisions read failed: the records stand, decisions are null (the view says incomplete, never "none")', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [200, '{"id":"i"}'], [`/api/decisions?investigationId=${ID}`]: [500, ''] });
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'ok', body: { investigation: { id: 'i' }, decisions: null, chosen: 'address' } });
  });

  it('an aborted read returns null', async () => {
    const f = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await readInvestigation(ID, new AbortController().signal, f)).toBeNull();
  });
});

describe('liveStateKind', () => {
  it('maps every live state to a StateBlock kind; nothing maps to a healthy or empty word', () => {
    expect(liveStateKind('loading')).toBe('loading');
    expect(liveStateKind('not_found')).toBe('unknown');
    expect(liveStateKind('notChosen')).toBe('unknown');
    expect(liveStateKind('unavailable')).toBe('unavailable');
    expect(liveStateKind('invalid')).toBe('error');
    expect(liveStateKind('rate_limited')).toBe('error');
    expect(liveStateKind('error')).toBe('error');
  });
});

describe('readInvestigation with no id: the newest visible investigation (BACK-51 P1, owner decision 2026-11-26)', () => {
  const NEWER = '00000000-0000-4000-8000-0000000000aa';
  const list = (items: unknown) => [200, JSON.stringify({ items })] as [number, string];

  it('reads GET /api/investigations and opens its first item (the server sorts newest first)', async () => {
    const f = routes({
      '/api/investigations': list([{ id: NEWER, title: 'b' }, { id: ID, title: 'a' }]),
      [`/api/investigations/${NEWER}`]: [200, '{"id":"n"}'],
      [`/api/decisions?investigationId=${NEWER}`]: [200, '{"items":[]}'],
    });
    expect(await readInvestigation(null, undefined, f)).toEqual({ status: 'ok', body: { investigation: { id: 'n' }, decisions: { items: [] }, chosen: 'newest' } });
    expect(f.mock.calls.map((c) => c[0])).toEqual(['/api/investigations', `/api/investigations/${NEWER}`, `/api/decisions?investigationId=${NEWER}`]);
  });

  it('an empty list: nothing to show, said in words, and no further request', async () => {
    const f = routes({ '/api/investigations': list([]) });
    expect(await readInvestigation(null, undefined, f)).toEqual({ status: 'failed', failure: 'notChosen' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a failed list read keeps its own kind', async () => {
    expect(await readInvestigation(null, undefined, routes({ '/api/investigations': [404, ''] }))).toEqual({ status: 'failed', failure: 'not_found' });
    expect(await readInvestigation(null, undefined, routes({ '/api/investigations': [502, ''] }))).toEqual({ status: 'failed', failure: 'unavailable' });
  });

  it('a malformed list, or a first item without a UUID id, is an error: never a guessed case, never a path built from it', async () => {
    for (const body of ['{"nope":true}', '{"items":"x"}', JSON.stringify({ items: [{ id: '../auth/me' }] }), JSON.stringify({ items: [7] })]) {
      const f = routes({ '/api/investigations': [200, body] });
      expect(await readInvestigation(null, undefined, f), body).toEqual({ status: 'failed', failure: 'error' });
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it('an aborted list read returns null', async () => {
    const f = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await readInvestigation(null, new AbortController().signal, f)).toBeNull();
  });
});
