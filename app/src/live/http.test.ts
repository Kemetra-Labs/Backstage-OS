// BACK-51 P1: the one request module (src/live/http.ts). Every case injects the fetcher, so nothing here touches the network.
import { describe, expect, it, vi } from 'vitest';
import { apiPath, apiRequest, exchangeSessionToken, failureOf, SESSION_CHECK_PATH, SESSION_EXCHANGE_PATH } from './http';

type Init = RequestInit & { headers: Record<string, string> };

function fake(status: number, text = '', contentType = 'application/json') {
  return vi.fn(async (_path: string, _init?: RequestInit) => new Response(status === 204 ? null : text, { status, headers: { 'Content-Type': contentType } }));
}

describe('apiPath', () => {
  it('accepts relative /api paths, with a query', () => {
    expect(apiPath('/api/portfolio')).toBe('/api/portfolio');
    expect(apiPath('/api/decisions?investigationId=x')).toBe('/api/decisions?investigationId=x');
  });

  it('refuses absolute, protocol-relative, backslash, traversal and non-/api paths', () => {
    for (const p of ['https://evil.test/api/x', 'http://127.0.0.1:8787/portfolio', '//evil.test/api', '/\\evil', '/api\\..\\auth', '/api/../auth', '/api/x/..', '/api//x', '/api/%2e%2e/portfolio', '/api/%2E./auth', '/api/.%2e', '/api/x%2f..%2f..%2fauth', '/api/x%5c..', '/portfolio', 'api/x', '', '/api', ' /api/x', '/api/x#frag'])
      expect(apiPath(p), p).toBeNull();
  });
});

describe('failureOf', () => {
  it('maps statuses as the server means them (401 and 404 are identical on purpose)', () => {
    expect(failureOf(401)).toBe('not_found');
    expect(failureOf(404)).toBe('not_found');
    expect(failureOf(400)).toBe('invalid');
    expect(failureOf(429)).toBe('rate_limited');
    expect(failureOf(500)).toBe('error');
    expect(failureOf(501)).toBe('error');
  });

  it('a gateway that cannot reach the server is unavailable, not an error of the server', () => {
    expect(failureOf(502)).toBe('unavailable');
    expect(failureOf(503)).toBe('unavailable');
    expect(failureOf(504)).toBe('unavailable');
  });

  it.each([520, 521, 522, 523, 524])('Cloudflare origin error %i is unavailable like a gateway failure', (status) => {
    expect(failureOf(status)).toBe('unavailable');
  });

  it('Cloudflare origin errors never read as signed in or as a refusal: the exchange and a session check say unavailable', async () => {
    for (const status of [520, 521, 522, 523, 524]) {
      const fetcher = async () => new Response('', { status });
      expect(await exchangeSessionToken('a.b.c', { fetcher })).toEqual({ ok: false, failure: 'unavailable', status });
      expect(await apiRequest(SESSION_CHECK_PATH, { fetcher })).toEqual({ ok: false, failure: 'unavailable', status });
    }
  });

  it('any other refusal is an error', () => {
    expect(failureOf(403)).toBe('error');
    expect(failureOf(409)).toBe('error');
    expect(failureOf(302)).toBe('error');
  });
});

describe('apiRequest', () => {
  it('a refused path makes no request', async () => {
    const f = fake(200, '{}');
    expect(await apiRequest('https://evil.test/api/x', { fetcher: f })).toEqual({ ok: false, failure: 'invalid', status: null });
    expect(f).not.toHaveBeenCalled();
  });

  it('GET: same-origin credentials, JSON accepted, no body and no content type', async () => {
    const f = fake(200, '{"projects":[]}');
    const r = await apiRequest('/api/portfolio', { fetcher: f });
    expect(r).toEqual({ ok: true, status: 200, body: { projects: [] } });
    const [path, init] = f.mock.calls[0]! as [string, Init];
    expect(path).toBe('/api/portfolio');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(init.body).toBeUndefined();
  });

  it('POST: a JSON body with its content type', async () => {
    const f = fake(201, '{"id":"d1"}');
    const r = await apiRequest('/api/investigations/x/decisions', { method: 'POST', body: { decision: 'a' }, fetcher: f });
    expect(r).toEqual({ ok: true, status: 201, body: { id: 'd1' } });
    const init = f.mock.calls[0]![1] as Init;
    expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"decision":"a"}');
  });

  it('passes the abort signal through', async () => {
    const f = fake(200, '{}');
    const c = new AbortController();
    await apiRequest('/api/portfolio', { fetcher: f, signal: c.signal });
    expect((f.mock.calls[0]![1] as Init).signal).toBe(c.signal);
  });

  it('204 is ok with no body', async () => {
    expect(await apiRequest('/api/auth/session', { method: 'DELETE', fetcher: fake(204) })).toEqual({ ok: true, status: 204, body: null });
  });

  it('a 2xx that is not JSON (e.g. index.html from a host without the proxy) is an error, never an empty answer', async () => {
    expect(await apiRequest('/api/portfolio', { fetcher: fake(200, '<!doctype html><html></html>', 'text/html') })).toEqual({ ok: false, failure: 'error', status: 200 });
  });

  it('a failure carries no body: the error envelope is never handed on', async () => {
    const r = await apiRequest('/api/investigations/x', { fetcher: fake(404, '{"error":{"code":"not_found","message":"m","request_id":"r"}}') });
    expect(r).toEqual({ ok: false, failure: 'not_found', status: 404, recheckSession: true });
  });

  it('not_found (401 or 404, identical on purpose) asks for a session re-check at GET /api/auth/me; nothing else does', async () => {
    expect(SESSION_CHECK_PATH).toBe('/api/auth/me');
    expect(apiPath(SESSION_CHECK_PATH)).toBe(SESSION_CHECK_PATH);
    for (const status of [401, 404]) expect(await apiRequest('/api/portfolio', { fetcher: fake(status) })).toMatchObject({ failure: 'not_found', recheckSession: true });
    for (const status of [400, 429, 500, 502]) expect(await apiRequest('/api/portfolio', { fetcher: fake(status) })).not.toHaveProperty('recheckSession');
  });

  it.each([[400, 'invalid'], [429, 'rate_limited'], [500, 'error'], [502, 'unavailable']] as const)('status %i is %s', async (status, failure) => {
    expect(await apiRequest('/api/portfolio', { fetcher: fake(status, '{}') })).toEqual({ ok: false, failure, status });
  });

  it('a network failure is unavailable', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await apiRequest('/api/portfolio', { fetcher: f })).toEqual({ ok: false, failure: 'unavailable', status: null });
  });

  it('an abort is marked, so the caller can drop it instead of showing unavailable', async () => {
    const f = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await apiRequest('/api/portfolio', { fetcher: f })).toEqual({ ok: false, failure: 'unavailable', status: null, aborted: true });
  });

  it('a body that fails to read is unavailable', async () => {
    const f = vi.fn(async () => ({ status: 200, text: async () => { throw new TypeError('reset'); } }) as unknown as Response);
    expect(await apiRequest('/api/portfolio', { fetcher: f })).toEqual({ ok: false, failure: 'unavailable', status: null });
  });

  it('uses the global fetch when none is injected', async () => {
    const f = fake(200, '{}');
    vi.stubGlobal('fetch', f);
    try {
      expect(await apiRequest('/api/portfolio')).toEqual({ ok: true, status: 200, body: {} });
      expect(f).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('exchangeSessionToken', () => {
  const JWT = 'header.payload.signature';

  it('the path is a valid relative /api path', () => {
    expect(SESSION_EXCHANGE_PATH).toBe('/api/auth/session');
    expect(apiPath(SESSION_EXCHANGE_PATH)).toBe(SESSION_EXCHANGE_PATH);
  });

  it('sends POST with a Bearer header and no body', async () => {
    const f = fake(200, '{}');
    const r = await exchangeSessionToken(JWT, { fetcher: f });
    expect(r).toEqual({ ok: true, status: 200, body: {} });
    const [path, init] = f.mock.calls[0]! as [string, Init];
    expect(path).toBe('/api/auth/session');
    expect(path).not.toContain(JWT);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ Accept: 'application/json', Authorization: `Bearer ${JWT}` });
    expect(init.body).toBeUndefined();
  });

  it('passes the abort signal through', async () => {
    const f = fake(200, '{}');
    const c = new AbortController();
    await exchangeSessionToken(JWT, { fetcher: f, signal: c.signal });
    expect((f.mock.calls[0]![1] as Init).signal).toBe(c.signal);
  });

  it('maps 401 and 404 to the same not_found failure', async () => {
    const a = await exchangeSessionToken(JWT, { fetcher: fake(401) });
    const b = await exchangeSessionToken(JWT, { fetcher: fake(404) });
    expect(a).toMatchObject({ ok: false, failure: 'not_found' });
    expect(b).toMatchObject({ ok: false, failure: 'not_found' });
    expect({ ...a, status: 0 }).toEqual({ ...b, status: 0 });
  });

  it('maps 429 to rate_limited and a gateway failure to unavailable', async () => {
    expect(await exchangeSessionToken(JWT, { fetcher: fake(429) })).toEqual({ ok: false, failure: 'rate_limited', status: 429 });
    expect(await exchangeSessionToken(JWT, { fetcher: fake(503) })).toEqual({ ok: false, failure: 'unavailable', status: 503 });
  });

  it('maps a thrown fetch to unavailable, without the token in the result', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const r = await exchangeSessionToken(JWT, { fetcher: f });
    expect(r).toEqual({ ok: false, failure: 'unavailable', status: null });
    expect(JSON.stringify(r)).not.toContain(JWT);
  });

  it('a failure never carries the server body', async () => {
    const r = await exchangeSessionToken(JWT, { fetcher: fake(401, '{"error":{"code":"unauthorized","message":"bad token"}}') });
    expect(JSON.stringify(r)).not.toContain('bad token');
  });

  it('an empty token makes no request', async () => {
    const f = fake(200, '{}');
    expect(await exchangeSessionToken('', { fetcher: f })).toEqual({ ok: false, failure: 'invalid', status: null });
    expect(f).not.toHaveBeenCalled();
  });
});
