// BACK-91: the whole app as one product. Every screen, the old ones and the four B+C lenses, is checked for the same invariants: one
// AppShell, one persona and language authority, one router (the hash), restricted evidence undisclosed, Unknown never Healthy, and a
// cross-screen journey whose Back and Forward retrace exactly. Persona is a display switch on synthetic data, not authorization.
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/i18n/strings';
import { LANGS, PERSONAS } from './helpers';
import { hash, LENS_READY, leaks, openScreen as openRoute, RESTRICTED, SCREENS, surface } from './lens-helpers';

const LAY = ['owner', 'nontechnical'] as const;

const LENSES = ['/map', '/sources/observatory', '/investigation/INV-DEMO-7/replay', '/agents/deck'] as const;

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
      // By id: aria-controls is only set while the results list exists (BACK-91 axe fix), so it cannot locate the closed box.
      const box = page.locator('#demo-search');
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

// BACK-92 R3 (M11, from e2e-v2/interactions.spec.ts "review regressions"): the ?lang= seed is read once. After a switch back to English,
// moving to another screen (a lens view or a V1 screen, by link or by address) and reloading never bring Arabic back, in the shell or
// inside a lens.
test('a ?lang= seed cannot override a later switch back to English', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'ar', persona: 'owner', width: 1440 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const english = async (where: string) => {
    await expect(page.locator('html'), where).toHaveAttribute('lang', 'en');
    await expect(page.locator('html'), where).toHaveAttribute('dir', 'ltr');
    expect(/[؀-ۿ]/.test(await page.locator('main').innerText()), `${where}: Arabic text in main`).toBe(false);
  };
  await page.locator('#sidenav a[data-nav="sources"]').click();
  await expect(page.locator('main')).toHaveAttribute('data-route', 'sources');
  await english('sources');
  await page.locator('.view-switch a[data-view="observatory"]').click();
  await expect(page.locator('[data-testid="source-observatory-lens"]')).toBeVisible();
  await english('observatory');
  for (const route of ['/investigation/INV-DEMO-7/replay', '/agents/deck', '/']) {
    await page.evaluate((r) => { window.location.hash = `#${r}`; }, route);
    if (route !== '/') await expect(page.locator(LENS_READY)).toBeVisible();
    await english(route);
  }
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await english('after reload');
});

// BACK-92 R3 (M16, from e2e-v2/structure.spec.ts and interactions.spec.ts "responsive nav"): at 375 px the side navigation is closed and
// none of its links can take focus; the menu opens it, and Escape closes it again and returns focus to the menu button.
for (const lang of LANGS) {
  test(`at 375px the closed side navigation is not focusable, and Escape closes it ${lang}`, async ({ page }) => {
    for (const route of [...LENSES, '/']) {
      await openRoute(page, route, { lang, persona: 'owner', width: 375 });
      const nav = page.locator('#sidenav');
      const menu = page.locator('button[aria-controls="sidenav"]');
      const focusable = () => nav.locator('a').evaluateAll((els) => els.filter((a) => { (a as HTMLElement).focus(); return document.activeElement === a; }).length);
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await expect(nav).toBeHidden();
      expect(await nav.locator('a').count(), route).toBeGreaterThan(5);
      expect(await focusable(), `${route}: a closed-menu link took focus`).toBe(0);
      // Escape from the menu button.
      await menu.click();
      await expect(nav).toBeVisible();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(nav, route).toBeHidden();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await expect(menu).toBeFocused();
      // Escape from a link inside the open menu: focus must not stay on a link that is now hidden.
      await menu.click();
      await nav.locator('a').first().focus();
      await page.keyboard.press('Escape');
      await expect(nav, route).toBeHidden();
      await expect(menu).toBeFocused();
      expect(await focusable(), `${route}: a link took focus after Escape`).toBe(0);
    }
  });
}

test('reduced motion on every screen: no running animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of SCREENS) {
    await openRoute(page, route, { lang: 'en', persona: 'owner', width: 1440 });
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), route).toBe(0);
  }
});
