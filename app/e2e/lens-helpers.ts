// Shared by the lens specs (map, Source Observatory, Replay, Flight Deck, convergence): the screen list and the lens loaders. What must
// never reach a lay persona's screen, and how every surface is read, is the one probe in leaks.ts (BACK-92 R7).
import { expect, type Page } from '@playwright/test';
import { openRoute, type LoadQuery } from './helpers';

export const hash = (page: Page): Promise<string> => page.evaluate(() => window.location.hash);

/** Every screen of the app: the eight V1 screens and the four lens views. */
export const SCREENS = [
  '/', '/portfolio', '/project/RT', '/project/RT/stock-sync', '/project/KH', '/investigation/INV-DEMO-7', '/evidence/E-1', '/decisions', '/agents', '/sources',
  '/map', '/map/retail-tower/inventory', '/sources/observatory', '/investigation/INV-DEMO-7/replay', '/agents/deck',
] as const;

export const LENS_READY = '[data-testid="mission-map-lens"], [data-testid="source-observatory-lens"], [data-testid="replay-lens"], [data-testid="agent-deck-lens"]';

/** Opens a route and, for a lens view, waits for the lens itself: the page heading is already visible while the lazy chunk loads. */
export async function openScreen(page: Page, route: string, q: LoadQuery = {}) {
  const errors = await openRoute(page, route, q);
  if (/^\/(map|sources\/observatory|investigation\/[^/]+\/replay|agents\/deck)/.test(route)) await expect(page.locator(LENS_READY)).toBeVisible();
  return errors;
}

/** Puts the Mission Map in the map or list mode with its "Map | List" control (phones open on the list, wider screens on the map). */
export async function setMapMode(page: Page, mode: 'map' | 'list'): Promise<void> {
  const stage = page.locator('[data-testid="bc-stage"]');
  if ((await stage.getAttribute('data-mode')) !== mode) await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(mode === 'list' ? 1 : 0).click();
  await expect(stage).toHaveAttribute('data-mode', mode);
}
