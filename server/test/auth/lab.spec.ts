import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { AuthConfigError, loadAuthConfig } from '../../src/auth/auth.config';
import { runInNewContext } from 'node:vm';
import { labApiBase, renderSignInPage } from '../../src/auth/lab/sign-in-page';
import { createApp } from '../../src/create-app';
import { startApp, type TestApp } from './_helpers';

const PROJECT_ID = 'PkawalysTest0001';
const COMPONENT_URL = 'https://unpkg.com/@descope/web-component@4.6.3/dist/index.js';

const saved = { ...process.env };

function setLabEnv(overrides: Record<string, string | undefined> = {}): void {
  const env: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    KAWALYS_AUTH_LAB: '1',
    KAWALYS_DESCOPE_PROJECT_ID: PROJECT_ID,
    KAWALYS_OWNER_SUBJECT: 'UkawalysOwner0001',
    ...overrides,
  };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

function nonceOf(csp: string): string {
  const m = /script-src 'nonce-([^']+)'/.exec(csp);
  if (m === null) throw new Error('no nonce in CSP');
  return m[1]!;
}

describe('lab configuration', () => {
  it('is off unless the flag is exactly 1, and any other non-empty value throws', () => {
    expect(loadAuthConfig({}).lab).toBe(false);
    expect(loadAuthConfig({ KAWALYS_AUTH_LAB: '' }).lab).toBe(false);
    expect(loadAuthConfig({ KAWALYS_AUTH_LAB: '1' }).lab).toBe(true);
    for (const bad of ['0', 'true', 'yes', 'on', '2']) {
      expect(() => loadAuthConfig({ KAWALYS_AUTH_LAB: bad })).toThrow(AuthConfigError);
    }
  });

  it('production refuses KAWALYS_AUTH_LAB=1', async () => {
    expect(() => loadAuthConfig({ NODE_ENV: 'production', KAWALYS_AUTH_LAB: '1' })).toThrow(/KAWALYS_AUTH_LAB/);
    expect(() =>
      loadAuthConfig({
        NODE_ENV: 'production',
        KAWALYS_AUTH_LAB: '1',
        KAWALYS_DESCOPE_PROJECT_ID: PROJECT_ID,
        KAWALYS_OWNER_SUBJECT: 'UkawalysOwner0001',
      }),
    ).toThrow(/KAWALYS_AUTH_LAB/);
    setLabEnv({ NODE_ENV: 'production' });
    await expect(createApp()).rejects.toBeInstanceOf(AuthConfigError);
    await expect(createApp()).rejects.toThrow(/KAWALYS_AUTH_LAB/);
  });
});

describe('GET /auth/lab', () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.app.close();
    t = undefined;
  });

  it('is absent (404 envelope) when the lab flag is off', async () => {
    setLabEnv({ KAWALYS_AUTH_LAB: undefined });
    t = await startApp();
    const res = await t.get('/auth/lab');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.text).error).toBeDefined();
  });

  it('is absent when the flag is on but the project is not configured', async () => {
    setLabEnv({ KAWALYS_DESCOPE_PROJECT_ID: undefined, KAWALYS_OWNER_SUBJECT: undefined });
    t = await startApp();
    const res = await t.get('/auth/lab');
    expect(res.status).toBe(404);
  });

  it('serves the page with a strict CSP and no caching when on', async () => {
    setLabEnv();
    t = await startApp();
    const res = await t.get('/auth/lab');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    const csp = res.headers['content-security-policy'] as string;
    const nonce = nonceOf(csp);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`script-src 'nonce-${nonce}' https://unpkg.com`);
    expect(csp).toContain("connect-src 'self' https://api.descope.com");
    expect(csp).toContain("frame-ancestors 'none'");
    // The nonce on the one inline script is the header's nonce.
    expect(res.text).toContain(`<script nonce="${nonce}">`);
    expect(res.text).toContain(`project-id="${PROJECT_ID}"`);
    expect(res.text).toContain('flow-id="sign-in"');
    expect(res.text).toContain('Lab tool. Loopback only. English only.');
  });

  it('uses a fresh nonce for every request', async () => {
    setLabEnv();
    t = await startApp();
    const a = await t.get('/auth/lab');
    const b = await t.get('/auth/lab');
    expect(nonceOf(a.headers['content-security-policy'] as string)).not.toBe(
      nonceOf(b.headers['content-security-policy'] as string),
    );
  });

  it('is also served with a trailing slash (Express routing is not strict)', async () => {
    setLabEnv();
    t = await startApp();
    const res = await t.get('/auth/lab/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('flow-id="sign-in"');
  });

  it('is public: it needs no session and does not touch the verifier', async () => {
    setLabEnv();
    t = await startApp();
    expect((await request(t.app.getHttpServer()).get('/auth/lab')).status).toBe(200);
    expect(t.verifier.seen).toEqual([]);
  });
});

describe('renderSignInPage', () => {
  const page = renderSignInPage(PROJECT_ID, 'abc123');

  it('pins the web component by exact version and SRI', () => {
    expect(page).toContain(COMPONENT_URL);
    expect(page).toMatch(/integrity="sha384-[A-Za-z0-9+/]{64}"/);
    expect(page).toContain('crossorigin="anonymous"');
    expect(page).not.toMatch(/web-component@(latest|\^|~|4(?!\.6\.3))/);
  });

  it('never stores a token and only posts the session JWT', () => {
    expect(page).not.toMatch(/localStorage|sessionStorage|document\.cookie|refreshJwt/);
    expect(page).toContain("if (!detail || typeof detail.sessionJwt !== 'string')");
    expect(page).toContain("fetch(base + '/session'");
    expect(page).toContain("fetch(base + '/me')");
    expect(page).toContain("Authorization: 'Bearer ' + detail.sessionJwt");
  });

  it('clears the Descope SDK session once the exchange settles, on the success and the failure paths', () => {
    const logout = 'flow.sdk.logout()';
    expect(page.split(logout)).toHaveLength(2); // exactly one call
    const at = page.indexOf(logout);
    const guard = page.indexOf("if (!detail || typeof detail.sessionJwt !== 'string')");
    const exchange = page.indexOf("fetch(base + '/session'");
    const exchangeOk = page.indexOf("if (!res.ok) throw new Error('session');");
    const resultCatch = page.indexOf('.catch(');
    const settled = page.indexOf('.finally(function () {');
    expect(exchange).toBeGreaterThan(guard);
    // The one logout call is inside a settle handler that runs whether the exchange was ok, not ok (refused
    // token, wrong subject, 429) or the fetch rejected, so it is not tied to res.ok.
    expect(settled).toBeGreaterThan(exchange);
    expect(settled).toBeGreaterThan(exchangeOk);
    expect(settled).toBeGreaterThan(resultCatch);
    expect(at).toBeGreaterThan(settled);
    expect(page.slice(exchangeOk, settled)).not.toContain(logout);
    expect(page).toContain('Descope session cleared');
    expect(page).toContain('Could not clear the Descope session; clear site data now');
    // A failing logout is contained: it cannot reach the result line.
    expect(page).toContain('} catch (ignored) { showCleared(false); }');
  });

  it('tells the owner to clear site data, near the top', () => {
    const sentence = 'After use, clear site data for this address.';
    expect(page).toContain(sentence);
    expect(page.indexOf(sentence)).toBeLessThan(page.indexOf('<descope-wc'));
  });

  it('renders returned text with textContent, never innerHTML', () => {
    expect(page).toContain('textContent');
    expect(page).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
  });

  it('calls only same-origin routes', () => {
    expect(page).not.toMatch(/fetch\(\s*['"`]https?:/);
  });

  it('injects only the validated project id', () => {
    expect(() => renderSignInPage('P<script>', 'n')).toThrow();
    expect(() => renderSignInPage('P"onload="x', 'n')).toThrow();
    expect(() => renderSignInPage('', 'n')).toThrow();
  });

  it('injects only a validated nonce', () => {
    expect(() => renderSignInPage(PROJECT_ID, 'n"><script>')).toThrow();
    expect(() => renderSignInPage(PROJECT_ID, '')).toThrow();
  });
});

// BACK-51 P2: the page is reached directly (/auth/lab, the Descope redirect) and through the app's same-origin proxy
// (/api/auth/lab, prefix stripped before the BFF). Its requests must go back the way it came, so it derives its API base
// from its own address instead of calling root-absolute /auth/... paths.
describe('lab API base path (BACK-51 P2)', () => {
  it('labApiBase strips the trailing /lab and refuses anything else', () => {
    expect(labApiBase('/auth/lab')).toBe('/auth');
    expect(labApiBase('/auth/lab/')).toBe('/auth');
    expect(labApiBase('/api/auth/lab')).toBe('/api/auth');
    expect(labApiBase('/api/auth/lab/')).toBe('/api/auth');
    for (const bad of ['/', '', '/auth', '/auth/labx', '/auth/lab/x', '/lab']) expect(labApiBase(bad)).toBeNull();
  });

  it('holds no root-absolute /auth/ path', () => {
    expect(renderSignInPage(PROJECT_ID, 'abc123')).not.toMatch(/['"`]\/auth\//);
  });

  interface Call { readonly url: string; readonly init: { method?: string; headers?: Record<string, string> } | undefined }

  /** Runs the page's inline script against stub DOM, location and fetch; fires a successful Descope flow. */
  async function runPage(pathname: string, sessionStatus = 200): Promise<{ calls: Call[]; result: string }> {
    const page = renderSignInPage(PROJECT_ID, 'abc123');
    const m = /<script nonce="abc123">\n([\s\S]*?)\n<\/script>/.exec(page);
    if (m === null) throw new Error('no inline script');
    const calls: Call[] = [];
    const nodes: Record<string, { textContent: string }> = { result: { textContent: '' }, 'descope-status': { textContent: '' } };
    const listeners: Record<string, (e: unknown) => void> = {};
    const flow = {
      addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; },
      sdk: { logout: () => Promise.resolve({ ok: true }) },
    };
    const fetch = (url: string, init?: Call['init']) => {
      calls.push({ url, init });
      const body = url.endsWith('/me') ? { user: { id: 'u1', role: 'owner' } } : {};
      return Promise.resolve({ ok: url.endsWith('/me') || sessionStatus === 200, json: () => Promise.resolve(body) });
    };
    const document = { getElementById: (id: string) => nodes[id], querySelector: () => flow };
    runInNewContext(m[1]!, { document, location: { pathname }, fetch, Promise, String, Error });
    listeners['success']!({ detail: { sessionJwt: 'jwt.x.y' } });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
    return { calls, result: nodes['result']!.textContent };
  }

  it.each([
    ['/auth/lab', '/auth'],
    ['/auth/lab/', '/auth'],
    ['/api/auth/lab', '/api/auth'],
  ])('at %s it posts to %s/session, then reads %s/me', async (pathname, base) => {
    const { calls, result } = await runPage(pathname);
    expect(calls.map((c) => c.url)).toEqual([`${base}/session`, `${base}/me`]);
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.headers).toEqual({ Authorization: 'Bearer jwt.x.y' });
    expect(result).toBe('Signed in as u1');
  });

  it('a refused session exchange stops there: no /me request, and the failure line is shown', async () => {
    const { calls, result } = await runPage('/api/auth/lab', 404);
    expect(calls.map((c) => c.url)).toEqual(['/api/auth/session']);
    expect(result).toBe('Sign-in did not complete');
  });

  it('makes no request from an address it does not recognise', async () => {
    const { calls, result } = await runPage('/elsewhere');
    expect(calls).toEqual([]);
    expect(result).toBe('Sign-in did not complete');
  });
});
