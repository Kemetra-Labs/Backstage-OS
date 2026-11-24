// Shared by the lens specs (map, Source Observatory, Replay, Flight Deck, convergence): what must never reach a lay persona's screen, and
// the one way to read every place a restricted id could hide. One copy, so the matrix is changed once.
import { expect, type Page } from '@playwright/test';
import { DOMAIN } from '../src/domain/fixture';
import { openRoute, type LoadQuery } from './helpers';

/** Evidence the canonical model withholds from lay personas. */
export const WITHHELD = Object.values(DOMAIN.evidence).filter((e) => e.visibility === 'technical');
/** Their ids and the ids of the observations behind them: two cues that a record exists. */
export const RESTRICTED: readonly string[] = [...WITHHELD.map((e) => e.id), ...WITHHELD.flatMap((e) => (e.observation ? [e.observation.id] : []))];

export const hash = (page: Page): Promise<string> => page.evaluate(() => window.location.hash);

/** True when `id` appears as a whole token (not inside DEMO-5 or E-50). */
export const hasId = (text: string, id: string): boolean => new RegExp(`(^|[^A-Za-z0-9-])${id}([^A-Za-z0-9-]|$)`).test(text);

/** True when any restricted id is present in the text, as a token or as a quoted JSON key. */
export const leaks = (text: string): readonly string[] => RESTRICTED.filter((id) => hasId(text, id) || text.includes(`"${id}"`));

/** Visible text, hidden text, the address, and every aria-label, title, alt, href and data-* value on the page. */
export const surface = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const out: string[] = [document.body.innerText, document.body.textContent ?? '', window.location.href];
    for (const el of document.querySelectorAll('*')) {
      for (const a of Array.from(el.attributes)) {
        if (a.name === 'aria-label' || a.name === 'title' || a.name === 'alt' || a.name === 'href' || a.name.startsWith('data-')) out.push(`${a.name}=${a.value}`);
      }
    }
    return out.join('\n');
  });

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
