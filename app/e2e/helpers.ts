// Shared setup for the Kawalys screen specs. Every spec used to carry its own copy of these constants and of the
// page loader; keeping one copy means a change to the matrix or the redaction list is made once.
import { expect, type Page } from '@playwright/test';

export const WIDTHS = [320, 375, 768, 1440] as const;
export const LANGS = ['en', 'ar'] as const;
export const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;

/** Strings that must never reach any persona's screen (raw CI/PR ids, assertion text, inert demo hosts). */
export const BANNED = ['integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'AssertionError', 'example.invalid', 'DEMO-4468', 'DEMO-5120', 'DEMO-311'];

export interface LoadQuery {
  lang?: string; persona?: string; width?: number; /** BACK-82: ?renderer=flow opts into the React Flow map. */ renderer?: string;
  /** BACK-62: ?github=<form> forces a connector failure form on the Portfolio GitHub reads panel. */ github?: string;
}

/**
 * Opens a hash route with the viewport and query set, and resolves once the h1 is visible.
 * Returns the console and page errors collected from the moment the page was created, so a spec can assert on them.
 */
export async function openRoute(page: Page, route: string, q: LoadQuery = {}) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Offline runs: answer Google Fonts with empty CSS. Aborting instead makes Chromium log ERR_FAILED to the console.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.setViewportSize({ width: q.width ?? 1280, height: 900 });
  const params = new URLSearchParams();
  if (q.lang) params.set('lang', q.lang);
  if (q.persona) params.set('persona', q.persona);
  if (q.renderer) params.set('renderer', q.renderer);
  if (q.github) params.set('github', q.github);
  await page.goto(`/?${params.toString()}#${route}`);
  await expect(page.locator('h1')).toBeVisible();
  return errors;
}
