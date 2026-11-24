// Loader and probes for the B+C pilot (v2.html?concept=bc). Kept apart from helpers.ts, whose load() cannot add a search param.
import { expect, type Page } from '@playwright/test';
import type { Probe } from './helpers';
// One copy of the shared probes, in the host suite (BACK-92 R3); the lab re-exports them until it retires.
export { clippedElements, infiniteAnimations, waitForAnimationsSettled, waitForIntroDone } from '../e2e/lens-fidelity';

export interface BcOpts {
  readonly lang?: string;
  readonly persona?: string;
  readonly width?: number;
  readonly height?: number;
  readonly node?: string;
  /** Always explicit in tests: without it phones open on the list. */
  readonly view?: 'map' | 'list';
  readonly tab?: string;
  readonly filter?: string;
  /** Extra hash parameters, e.g. scope=khepri. */
  readonly hash?: string;
}

export async function loadBc(page: Page, o: BcOpts = {}): Promise<Probe> {
  const probe: Probe = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') probe.errors.push(m.text()); });
  page.on('pageerror', (e) => probe.errors.push(String(e)));
  page.on('request', (r) => probe.requests.push(r.url()));
  await page.setViewportSize({ width: o.width ?? 1440, height: o.height ?? 1000 });
  const search = new URLSearchParams({ concept: 'bc', view: o.view ?? 'map' });
  if (o.tab) search.set('tab', o.tab);
  if (o.filter) search.set('f', o.filter);
  const hash = new URLSearchParams({ persona: o.persona ?? 'owner', lang: o.lang ?? 'en', node: o.node ?? 'stock-sync' });
  await page.goto(`/v2.html?${search.toString()}#/mission-map?${hash.toString()}${o.hash ? `&${o.hash}` : ''}`);
  await expect(page.getByTestId('bc-stage')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return probe;
}

/** Visible interactive elements smaller than 44 x 44 px, described for the failure message. */
export async function smallTargets(page: Page): Promise<string[]> {
  return page.locator('button, a[href], select, input[type="search"]').evaluateAll((els) =>
    els.flatMap((e) => {
      const host = (e.closest('label.kv2-select, .kv2-search') as HTMLElement | null) ?? (e as HTMLElement);
      const r = host.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || e.closest('[hidden]') || e.closest('.kv2-sr') || (e as HTMLElement).classList.contains('kv2-skip')) return [];
      const side = e.closest('#kv2-side') as HTMLElement | null;
      if (side && side.dataset.open !== 'true' && getComputedStyle(side).visibility === 'hidden') return [];
      if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0) return [];
      return r.width < 43.5 || r.height < 43.5 ? [`${e.tagName}.${(e as HTMLElement).className} ${Math.round(r.width)}x${Math.round(r.height)} ${(e.textContent ?? '').trim().slice(0, 24)}`] : [];
    }),
  );
}

/** Latin text outside an isolate (bdi, dir=ltr, lang=en, kbd, svg): in Arabic it would reorder the surrounding text. */
export async function latinOutsideIsolates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      const text = n.nodeValue ?? '';
      const p = n.parentElement;
      if (!/[A-Za-z]/.test(text) || !p || p.closest('bdi, [dir="ltr"], .kv2-ltr, kbd, svg, script, style, noscript, [lang="en"]')) continue;
      out.push(text.trim().slice(0, 40));
    }
    return out;
  });
}

export const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

