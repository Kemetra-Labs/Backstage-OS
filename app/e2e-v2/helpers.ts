import { expect, type Page } from '@playwright/test';

export const ORIGIN = 'http://127.0.0.1:4279';
export const SCREENS = ['mission-map', 'source-observatory', 'mission-replay', 'agent-flight-deck'] as const;
export type Screen = (typeof SCREENS)[number];
export const WIDTHS = [320, 375, 768, 1440] as const;
export const LANGS = ['en', 'ar'] as const;
export const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;

export interface Probe {
  readonly errors: string[];
  readonly requests: string[];
}

interface Opts {
  readonly screen?: Screen;
  readonly lang?: string;
  readonly persona?: string;
  readonly width?: number;
  readonly height?: number;
  readonly extra?: string;
}

/** Opens a V2 screen and records console errors and every request, so tests can assert nothing left the origin. */
export async function load(page: Page, o: Opts = {}): Promise<Probe> {
  const probe: Probe = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') probe.errors.push(m.text()); });
  page.on('pageerror', (e) => probe.errors.push(String(e)));
  page.on('request', (r) => probe.requests.push(r.url()));
  await page.setViewportSize({ width: o.width ?? 1440, height: o.height ?? 1000 });
  const q = new URLSearchParams({ persona: o.persona ?? 'owner', lang: o.lang ?? 'en' });
  const extra = o.extra ? `&${o.extra}` : '';
  await page.goto(`/v2.html#/${o.screen ?? 'mission-map'}?${q.toString()}${extra}`);
  await expect(page.locator('h1')).toBeVisible();
  return probe;
}

/** Visible text of every button, link, and its accessible name, for the control-vocabulary check. */
export async function controlLabels(page: Page): Promise<string[]> {
  return page.locator('button, a[href]').evaluateAll((els) =>
    els.flatMap((e) => [(e.textContent ?? '').trim(), e.getAttribute('aria-label') ?? '', e.getAttribute('title') ?? ''].filter(Boolean)),
  );
}

export async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
