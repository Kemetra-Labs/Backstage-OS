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
  it('no chosen investigation: no request at all', async () => {
    const f = routes({});
    expect(await readInvestigation(null, undefined, f)).toEqual({ status: 'failed', failure: 'notChosen' });
    expect(f).not.toHaveBeenCalled();
  });

  it('reads the investigation and its decisions, filtered by the server', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [200, '{"id":"i"}'], [`/api/decisions?investigationId=${ID}`]: [200, '{"items":[]}'] });
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'ok', body: { investigation: { id: 'i' }, decisions: { items: [] } } });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('a failed investigation read fails the panel with its own kind', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [404, ''], [`/api/decisions?investigationId=${ID}`]: [200, '{"items":[]}'] });
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'failed', failure: 'not_found' });
  });

  it('only the decisions read failed: the records stand, decisions are null (the view says incomplete, never "none")', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [200, '{"id":"i"}'], [`/api/decisions?investigationId=${ID}`]: [500, ''] });
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'ok', body: { investigation: { id: 'i' }, decisions: null } });
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
