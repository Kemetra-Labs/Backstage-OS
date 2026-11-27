// Shared setup for the live suite (BACK-51 P4). Everything that talks to the BFF does it from the page (same origin, `/api`
// proxied by vite preview), so the session cookie lives in the browser exactly as for the owner; `page.request` is never used
// because its cookie jar may refuse `Secure` cookies over http.
import path from 'node:path';
import fs from 'node:fs';
import { expect, type Page } from '@playwright/test';

// The suite is run from app/ (npm run e2e:live), so cwd is the app directory.
export const SEED_FILE: string = path.resolve(process.cwd(), 'test-results', 'e2e-live', 'seed.json');

export interface LiveSeed {
  investigationId: string;
  projectId: string;
  projectName: string;
  foreign: { investigationId: string; projectName: string; projectId: string };
}

export function readSeed(): LiveSeed {
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')) as LiveSeed;
}

/** The fake owner token the test-only BFF entry accepts (server/test/e2e). */
export const OWNER_TOKEN = 'owner.valid.token';

export interface LiveQuery {
  lang?: string; persona?: string; /** `?investigation=<uuid>`, which the live Investigation Room reads. */ investigation?: string;
  /** COG-07 live shadow search: `?project=<uuid>` and repeatable `?q=`. */ project?: string; q?: readonly string[];
}

/**
 * Opens a hash route in the live build and waits until the session bar has left `checking`. Returns the console and page
 * errors collected from the moment the page was created.
 */
const watched = new WeakMap<Page, { errors: string[]; api404: number }>();

export async function openLive(page: Page, route: string, q: LiveQuery = {}): Promise<string[]> {
  let w = watched.get(page);
  if (!w) {
    const state = { errors: [] as string[], api404: 0 };
    w = state;
    watched.set(page, state);
    page.on('console', (m) => { if (m.type() === 'error') state.errors.push(m.text()); });
    page.on('pageerror', (e) => state.errors.push(String(e)));
    page.on('response', (r) => { if (r.status() === 404 && new URL(r.url()).pathname.startsWith('/api/')) state.api404 += 1; });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const params = new URLSearchParams();
  if (q.lang) params.set('lang', q.lang);
  if (q.persona) params.set('persona', q.persona);
  if (q.investigation) params.set('investigation', q.investigation);
  if (q.project) params.set('project', q.project);
  for (const query of q.q ?? []) params.append('q', query);
  await page.goto(`/?${params.toString()}#${route}`);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByTestId('session-bar')).not.toHaveAttribute('data-session', 'checking');
  return w.errors;
}

/**
 * Console errors that are not expected. Chrome's "Failed to load resource ... 404" line carries no URL, so such a line is
 * tolerated only while there are fewer of them than 404 responses seen for /api/* paths; any other 404 (an asset, a favicon)
 * or any other error is returned.
 */
export function unexpectedErrors(page: Page): string[] {
  const w = watched.get(page);
  if (!w) return [];
  let budget = w.api404;
  return w.errors.filter((e) => {
    if (e.includes('Failed to load resource') && e.includes('404') && budget > 0) { budget -= 1; return false; }
    return true;
  });
}

export async function signIn(page: Page, token: string = OWNER_TOKEN): Promise<number> {
  return page.evaluate(async (t) => {
    const r = await fetch('/api/auth/session', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
    return r.status;
  }, token);
}

export async function apiGet(page: Page, apiPath: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async ([p, h]) => {
    const r = await fetch(p as string, { headers: h as Record<string, string> });
    const text = await r.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* not JSON: keep the text */ }
    return { status: r.status, body };
  }, [apiPath, headers] as const);
}

/** Number of decisions the server holds for one investigation, following `nextCursor` across pages. */
export async function decisionCount(page: Page, investigationId: string): Promise<number> {
  let count = 0;
  let cursor: string | null = null;
  for (let i = 0; i < 100; i += 1) {
    const qs: string = `investigationId=${encodeURIComponent(investigationId)}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const r = await apiGet(page, `/api/decisions?${qs}`);
    expect(r.status).toBe(200);
    const b = r.body as { items?: unknown[]; nextCursor?: string | null };
    count += b.items?.length ?? 0;
    cursor = b.nextCursor ?? null;
    if (!cursor) return count;
  }
  throw new Error('decisionCount: too many pages');
}
