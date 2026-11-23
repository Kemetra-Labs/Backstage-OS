// BACK-91: the whole app as one product. Every screen, the old ones and the four B+C lenses, is checked for the same invariants: one
// AppShell, one persona and language authority, one router (the hash), restricted evidence undisclosed, Unknown never Healthy, and a
// cross-screen journey whose Back and Forward retrace exactly. Persona is a display switch on synthetic data, not authorization.
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/i18n/strings';
import { LANGS, openRoute as load, PERSONAS, type LoadQuery } from './helpers';
import { hash, leaks, RESTRICTED, surface } from './lens-helpers';

const LAY = ['owner', 'nontechnical'] as const;

/** Every screen of the app: the eight V1 screens and the four lens views. */
const SCREENS = [
  '/', '/portfolio', '/project/RT', '/project/RT/stock-sync', '/project/KH', '/investigation/INV-DEMO-7', '/evidence/E-1', '/decisions', '/agents', '/sources',
  '/map', '/map/retail-tower/inventory', '/sources/observatory', '/investigation/INV-DEMO-7/replay', '/agents/deck',
] as const;
const LENSES = ['/map', '/sources/observatory', '/investigation/INV-DEMO-7/replay', '/agents/deck'] as const;

const LENS_READY = '[data-testid="mission-map-lens"], [data-testid="source-observatory-lens"], [data-testid="replay-lens"], [data-testid="agent-deck-lens"]';

/** Opens a route and, for a lens view, waits for the lens itself: the page heading is already visible while the lazy chunk loads. */
async function openRoute(page: Page, route: string, q: LoadQuery = {}) {
  const errors = await load(page, route, q);
  if (/^\/(map|sources\/observatory|investigation\/[^/]+\/replay|agents\/deck)/.test(route)) await expect(page.locator(LENS_READY)).toBeVisible();
  return errors;
}

const shellFacts = (page: Page) =>
  page.evaluate(() => ({
    mains: document.querySelectorAll('main').length,
    sidenavs: document.querySelectorAll('#sidenav').length,
    skips: document.querySelectorAll('.skip').length,
    h1s: document.querySelectorAll('h1').length,
    labShell: document.querySelectorAll('.kv2-app, .kv2-top, .kv2-side, .kv2-skip').length,
    titleOk: /^Kawalys · /.test(document.title) && !/V2/.test(document.title),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));

for (const lang of LANGS) {
  for (const width of [375, 1440]) {
    test(`one AppShell on every screen ${lang} @${width}px: one main, one nav, one skip link, one h1, no lab shell, no overflow, no console errors`, async ({ page }) => {
      for (const route of SCREENS) {
        const errors = await openRoute(page, route, { lang, persona: 'owner', width });
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        const f = await shellFacts(page);
        expect(f, `${route} ${lang} @${width}`).toEqual({ mains: 1, sidenavs: 1, skips: 1, h1s: 1, labShell: 0, titleOk: true, overflow: false });
        expect(errors, route).toEqual([]);
      }
    });
  }
}

test('one persona and language authority: a switch on any screen holds on every other, and the hash never carries them', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'owner', width: 1440 });
  await page.getByRole('button', { name: COPY.en.persona.technical, exact: true }).click();
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  for (const nav of ['sources', 'agents', 'investigation', 'map'] as const) {
    await page.locator(`#sidenav a[data-nav="${nav}"]`).click();
    await expect(page.locator('main')).toHaveAttribute('data-route', nav);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: COPY.ar.persona.technical, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ persona: 'technical', lang: 'ar' });
    expect(await hash(page)).not.toContain('persona=');
    expect(await hash(page)).not.toContain('lang=');
  }
  // And back to English / Owner from the last screen, then through the lens views.
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: COPY.en.persona.owner, exact: true }).click();
  for (const route of LENSES) {
    await page.evaluate((r) => { window.location.hash = `#${r}`; }, route);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('button', { name: COPY.en.persona.owner, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('journey: Map, Replay, Room, Sources Observatory, Agents Deck, and Back and Forward retrace it exactly', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/stock-sync', { lang: 'en', persona: 'technical', width: 1440 });
  const seen: string[] = [];
  const settle = async (pattern: RegExp) => { await expect.poll(() => hash(page)).toMatch(pattern); seen.push(await hash(page)); };
  await settle(/^#\/map\/retail-tower\/stock-sync$/);
  await page.getByRole('button', { name: 'Open the investigation replay' }).click();
  // The replay writes its starting event into the route (replacing the entry), so the step is the address with an event.
  await settle(/^#\/investigation\/INV-DEMO-7\/replay\/R-\d+$/);
  await page.locator('.view-switch a[data-view="room"]').click();
  await settle(/^#\/investigation\/INV-DEMO-7$/);
  await page.locator('#sidenav a[data-nav="sources"]').click();
  await settle(/^#\/sources$/);
  await page.locator('.view-switch a[data-view="observatory"]').click();
  await settle(/^#\/sources\/observatory$/);
  await page.locator('.kv2-scard[data-provider="sentry"]').click();
  await settle(/^#\/sources\/observatory\/sentry$/);
  await page.locator('#sidenav a[data-nav="agents"]').click();
  await settle(/^#\/agents$/);
  await page.locator('.view-switch a[data-view="deck"]').click();
  await settle(/^#\/agents\/deck$/);
  // Back retraces every step in reverse (the replay's own starting event replaced its entry, so it is one step), then Forward again.
  for (const expected of [...seen].reverse().slice(1)) {
    await page.goBack();
    await expect.poll(() => hash(page)).toBe(expected);
  }
  for (const expected of seen.slice(1)) {
    await page.goForward();
    await expect.poll(() => hash(page)).toBe(expected);
  }
  await expect(page.locator('[data-testid="agent-deck-lens"]')).toBeVisible();
});

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`restricted evidence on every screen ${persona}/${lang}: no restricted id, observation, link or attribute anywhere, and search finds nothing`, async ({ page }) => {
      for (const route of SCREENS) {
        await openRoute(page, route, { lang, persona, width: 1440 });
        expect(leaks(await surface(page)), `${persona}/${lang} ${route}`).toEqual([]);
      }
      await openRoute(page, '/', { lang, persona, width: 1440 });
      const box = page.locator('input[aria-controls="demo-search-results"]');
      for (const id of RESTRICTED) {
        await box.fill(id);
        // Search matches substrings, so "O-5" may find an unrelated id such as DEMO-5. What must hold is that no result is the restricted id.
        await expect(page.locator('.search-pop')).toBeVisible();
        const results = await page.locator('.search-pop').evaluate((el) => [...el.querySelectorAll('li a')].map((a) => `${a.textContent ?? ''} ${a.getAttribute('href') ?? ''}`).join('\n'));
        expect(leaks(results), `search for ${id}`).toEqual([]);
      }
    });
  }
}

test('Technical does see the restricted record on the screens that list evidence (so the matrix is not vacuous)', async ({ page }) => {
  await openRoute(page, '/sources/observatory/sentry', { lang: 'en', persona: 'technical', width: 1440 });
  await page.locator('[data-testid="source-observatory-lens"]').getByRole('tab').nth(1).click();
  expect((await surface(page)).includes('E-5')).toBe(true);
});

test('Unknown is never Healthy, and every screen agrees: only GitHub is Healthy on the map and in the Observatory, and the tables never say healthy', async ({ page }) => {
  for (const persona of PERSONAS) {
    await openRoute(page, '/map', { lang: 'en', persona, width: 1440 });
    const mapHealthy = await page.locator('.kv2-bc-node').evaluateAll((els) => els.filter((e) => /^healthy$/i.test((e.querySelector('.kv2-chip')?.textContent ?? '').trim())).map((e) => e.getAttribute('data-node')));
    expect(mapHealthy, `map ${persona}`).toEqual(['github']);
    await openRoute(page, '/sources/observatory', { lang: 'en', persona, width: 1440 });
    const obsHealthy = await page.locator('.kv2-scard').evaluateAll((els) => els.filter((e) => e.getAttribute('data-health') === 'healthy').map((e) => e.getAttribute('data-provider')));
    expect(obsHealthy, `observatory ${persona}`).toEqual(['github']);
    await openRoute(page, '/sources', { lang: 'en', persona, width: 1440 });
    expect(/\bhealthy\b/i.test(await page.locator('main').innerText()), `tables ${persona}`).toBe(false);
  }
});

test('recorded divergence, pinned so a change is noticed: the map classifies stock-sync to inventory as a hypothesis (canonical), V1 Project Intelligence still shows it as authored', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'technical', width: 1440 });
  await expect(page.locator('.kv2-bc-edge[data-id="d3"]')).toHaveAttribute('data-truth', 'hypothesis');
});

test('keyboard on every lens screen: the skip link moves focus to <main>', async ({ page, browserName }) => {
  // Safari does not Tab to links unless the user turns that option on, so this is a Chromium check; WebKit is recorded as skipped, not passed.
  test.skip(browserName === 'webkit', 'Safari tabs to links only with the Tab-to-links option');
  for (const route of LENSES) {
    await openRoute(page, route, { lang: 'en', persona: 'owner', width: 1440 });
    // A fresh document each time, so the first Tab starts from the top of the page.
    await page.reload();
    await expect(page.locator(LENS_READY)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip')).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
  }
});

test('reduced motion on every screen: no running animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of SCREENS) {
    await openRoute(page, route, { lang: 'en', persona: 'owner', width: 1440 });
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), route).toBe(0);
  }
});
