// BACK-51 P1: the live-mode switch and the two live reads. The fetcher is injected: nothing here touches the network.
import { describe, expect, it, vi } from 'vitest';
import { CITED_RESOLVE_MAX, citationsToResolve, investigationIdFrom, LIVE, liveMode, liveStateKind, projectIdFrom, readCognitionSearches, readInvestigation, readPortfolio, searchQueriesFrom } from './reads';

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
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'ok', body: { investigation: { id: 'i' }, decisions: { items: [] }, chosen: 'address', observations: null, cited: {} } });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('a failed investigation read fails the panel with its own kind', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [404, ''], [`/api/decisions?investigationId=${ID}`]: [200, '{"items":[]}'] });
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'failed', failure: 'not_found' });
  });

  it('only the decisions read failed: the records stand, decisions are null (the view says incomplete, never "none")', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [200, '{"id":"i"}'], [`/api/decisions?investigationId=${ID}`]: [500, ''] });
    expect(await readInvestigation(ID, undefined, f)).toEqual({ status: 'ok', body: { investigation: { id: 'i' }, decisions: null, chosen: 'address', observations: null, cited: {} } });
  });

  it('an aborted read returns null', async () => {
    const f = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await readInvestigation(ID, new AbortController().signal, f)).toBeNull();
  });
});

describe('readInvestigation: project observations and cited records (BACK-148, decision L)', () => {
  const PROJECT = '00000000-0000-4000-8000-000000000002';
  const OBS = '00000000-0000-4000-8000-000000000006';
  const FAR = '00000000-0000-4000-8000-0000000000f0';
  const CASE_REC = '00000000-0000-4000-8000-000000000001';
  const inv = JSON.stringify({ id: ID, projectId: PROJECT, evidence: [{ id: CASE_REC, type: 'Correlation' }] });
  const dec = (citations: string[]) => JSON.stringify({ items: [{ id: 'd', citations }], nextCursor: null });
  const projection = `/api/evidence?projectId=${PROJECT}&type=Observation`;

  it('reads the projection of the case project after the case, and resolves only citations neither list holds', async () => {
    const f = routes({
      [`/api/investigations/${ID}`]: [200, inv],
      [`/api/decisions?investigationId=${ID}`]: [200, dec([CASE_REC, OBS, FAR])],
      [projection]: [200, JSON.stringify({ items: [{ id: OBS, type: 'Observation' }] })],
      [`/api/evidence/${FAR}`]: [200, JSON.stringify({ id: FAR, type: 'Observation' })],
    });
    const r = await readInvestigation(ID, undefined, f);
    expect(r).toMatchObject({ status: 'ok', body: { observations: { items: [{ id: OBS }] }, cited: { [FAR]: { id: FAR } } } });
    expect(f.mock.calls.map((c) => c[0])).toEqual([`/api/investigations/${ID}`, `/api/decisions?investigationId=${ID}`, projection, `/api/evidence/${FAR}`]);
  });

  it('a failed projection is null, never an empty list, and never fails the room', async () => {
    const f = routes({ [`/api/investigations/${ID}`]: [200, inv], [`/api/decisions?investigationId=${ID}`]: [200, dec([])], [projection]: [500, ''] });
    expect(await readInvestigation(ID, undefined, f)).toMatchObject({ status: 'ok', body: { observations: null, cited: {} } });
  });

  it('a cited record the server does not return is null (unknown), and the room still opens', async () => {
    const f = routes({
      [`/api/investigations/${ID}`]: [200, inv],
      [`/api/decisions?investigationId=${ID}`]: [200, dec([FAR])],
      [projection]: [200, '{"items":[]}'],
      [`/api/evidence/${FAR}`]: [404, ''],
    });
    expect(await readInvestigation(ID, undefined, f)).toMatchObject({ status: 'ok', body: { cited: { [FAR]: null } } });
  });

  it('builds no path from a case body without a UUID project id: no projection request', async () => {
    for (const projectId of [undefined, '../auth/me', 7]) {
      const f = routes({
        [`/api/investigations/${ID}`]: [200, JSON.stringify({ id: ID, projectId, evidence: [] })],
        [`/api/decisions?investigationId=${ID}`]: [200, dec([])],
      });
      expect(await readInvestigation(ID, undefined, f)).toMatchObject({ status: 'ok', body: { observations: null } });
      expect(f).toHaveBeenCalledTimes(2);
    }
  });

  it('an abort during the projection returns null', async () => {
    let n = 0;
    const f = vi.fn(async (path: string) => {
      n += 1;
      if (path.startsWith('/api/evidence')) throw new DOMException('aborted', 'AbortError');
      return new Response(path.includes('decisions') ? dec([]) : inv, { status: 200 });
    });
    expect(await readInvestigation(ID, new AbortController().signal, f)).toBeNull();
    expect(n).toBe(3);
  });
});

describe('citationsToResolve', () => {
  const A = '00000000-0000-4000-8000-00000000000a';
  const B = '00000000-0000-4000-8000-00000000000b';
  const C = '00000000-0000-4000-8000-00000000000c';
  it('keeps cited UUIDs that neither list holds, each once, in cited order, from decisions and case decisions', () => {
    const inv = { evidence: [{ id: A }, { id: 'x', type: 'HumanDecision', citations: [C, B] }] };
    const decisions = { items: [{ citations: [A, B, 'not-a-uuid', B] }] };
    expect(citationsToResolve(inv, decisions, { items: [{ id: C }] })).toEqual([B]);
    expect(citationsToResolve(inv, decisions, null)).toEqual([B, C]);
  });

  it('stops at the cap: at most CITED_RESOLVE_MAX reads per room read', () => {
    const many = Array.from({ length: CITED_RESOLVE_MAX + 10 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(citationsToResolve({ evidence: [] }, { items: [{ citations: many }] }, null)).toHaveLength(CITED_RESOLVE_MAX);
  });

  it('a malformed body resolves nothing rather than throwing', () => {
    expect(citationsToResolve(null, 'x', 7)).toEqual([]);
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
    expect(await readInvestigation(null, undefined, f)).toEqual({ status: 'ok', body: { investigation: { id: 'n' }, decisions: { items: [] }, chosen: 'newest', observations: null, cited: {} } });
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

describe('COG-07 live shadow search', () => {
  it('takes the project from ?project= only as a UUID', () => {
    expect(projectIdFrom(`?project=${ID}`)).toBe(ID);
    for (const s of ['', '?project=', '?project=abc', `?project=${ID}/x`, '?project=../auth/me']) expect(projectIdFrom(s), s).toBeNull();
  });

  it('takes up to five non-empty ?q= queries of at most 500 characters, in order', () => {
    expect(searchQueriesFrom('?q=login&q=%2312')).toEqual(['login', '#12']);
    expect(searchQueriesFrom('?q=&q=%20%20&q=ok')).toEqual(['ok']);
    expect(searchQueriesFrom(`?q=${'a'.repeat(501)}&q=ok`)).toEqual(['ok']);
    expect(searchQueriesFrom('?q=1&q=2&q=3&q=4&q=5&q=6')).toEqual(['1', '2', '3', '4', '5']);
    expect(searchQueriesFrom('')).toEqual([]);
  });

  it('reads one encoded search per query, in order', async () => {
    const base = `/api/cognition/projects/${ID}/search?q=`;
    const f = routes({ [`${base}login`]: [200, '{"n":1}'], [`${base}%2312`]: [200, '{"n":2}'] });
    expect(await readCognitionSearches(ID, ['login', '#12'], undefined, f)).toEqual({ status: 'ok', body: [{ n: 1 }, { n: 2 }] });
  });

  it('any failed search fails the whole read with that failure', async () => {
    const base = `/api/cognition/projects/${ID}/search?q=`;
    const f = routes({ [`${base}a`]: [200, '{}'], [`${base}b`]: [429, '{}'] });
    expect(await readCognitionSearches(ID, ['a', 'b'], undefined, f)).toEqual({ status: 'failed', failure: 'rate_limited' });
  });
});

