// BACK-87: the B+C Mission Map mounted inside the one host AppShell. One shell, one persona and language, one router (the hash);
// the map's selection lives in the host route, so deep links and Back/Forward work. Restricted evidence stays undisclosed across the
// map, the list, every inspector tab and the route. Persona is a display switch on synthetic data, not authorization.
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/i18n/strings';
import { LANGS, openRoute, PERSONAS, WIDTHS } from './helpers';
import { hash, RESTRICTED, surface } from './lens-helpers';

const LAY = ['owner', 'nontechnical'] as const;
const node = (page: Page, id: string) => page.locator(`.kv2-bc-node[data-node="${id}"]`);


test('the canonical fixture has the restricted record this spec depends on', () => {
  expect(RESTRICTED).toContain('E-5');
  expect(RESTRICTED).toContain('O-5');
});

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`Mission Map ${lang} @${width}px: one shell, one h1, no overflow, no console errors, right direction`, async ({ page }) => {
      const errors = await openRoute(page, '/map', { lang, persona: 'owner', width });
      await expect(page.locator('[data-testid="mission-map-lens"]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      expect(await page.locator('main').count()).toBe(1);
      expect(await page.locator('#sidenav').count()).toBe(1);
      expect(await page.locator('.skip').count()).toBe(1);
      // No second application shell, and nothing of the lab's own navigation.
      expect(await page.locator('.kv2-app, .kv2-top, .kv2-side, .kv2-skip').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

// BACK-91 (axe label-content-name-mismatch, WCAG 2.5.3 Label in Name): a speech-input user says what they see, so every word a node
// shows (title, description on the selected card, status, read age) must appear in its accessible name as one unbroken run.
const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const containsRun = (name: string[], run: string[]): boolean =>
  run.length === 0 || name.some((_, i) => run.every((w, j) => name[i + j] === w));

for (const lang of LANGS) {
  for (const persona of ['owner', 'technical'] as const) {
    test(`Mission Map ${lang}/${persona}: every node's accessible name contains its visible text, also on the selected card`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); // no intro, so every card is at rest and visible
      await openRoute(page, '/map/retail-tower/inventory', { lang, persona });
      await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
      const ids = await page.locator('.kv2-bc-node').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.node ?? ''));
      expect(ids.length).toBe(10);
      for (const id of ids) {
        const el = node(page, id);
        // The browser's computed accessible name (aria snapshot), not an attribute, so a name computed from content is checked too.
        const name = /button "(.*)"/.exec(await el.ariaSnapshot())?.[1] ?? '';
        const n = { id, visible: await el.evaluate((e) => (e as HTMLElement).innerText), name };
        expect(words(n.visible).length, `${n.id} shows text`).toBeGreaterThan(0);
        expect(containsRun(words(n.name), words(n.visible)), `${n.id}: name "${n.name}" must contain the visible "${n.visible}"`).toBe(true);
      }
    });
  }
}

// BACK-91: on a narrow canvas unselected nodes hide their status chip, but a screen-reader user must still hear the status
// (unknown is never healthy, and stale or unavailable must not sound like healthy). The name is computed from content, so the
// chip may be visually hidden but never removed from the name.
for (const lang of LANGS) {
  test(`Mission Map ${lang} @375px: every node's accessible name still carries its status word`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openRoute(page, '/map', { lang, persona: 'owner', width: 375 });
    // Phones open on the list; switch to the map, where unselected nodes hide their chip.
    await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(0).click();
    await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'map');
    // Precondition: an unselected chip takes no visible space at this width (so the test is about a hidden status).
    expect(await page.locator('.kv2-bc-node:not([data-selected]) .kv2-chip').first().evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    const ids = await page.locator('.kv2-bc-node').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.node ?? ''));
    for (const id of ids) {
      const el = node(page, id);
      const status = ((await el.locator('.kv2-chip').evaluate((e) => e.textContent ?? '')) || '').trim();
      expect(status.length, `${id} has a status word`).toBeGreaterThan(0);
      const name = /button "(.*)"/.exec(await el.ariaSnapshot())?.[1] ?? '';
      expect(name, `${id}: the name must carry "${status}"`).toContain(status);
    }
  });
}

test('Mission Map: the host navigation has the entry, marks it current, and the title names the screen', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'owner' });
  await expect(page.locator('#sidenav a[data-nav="map"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#sidenav a[data-nav="map"]')).toHaveText('Mission Map');
  await expect(page).toHaveTitle(/Mission Map/);
  await page.locator('#sidenav a[data-nav="portfolio"]').click();
  await expect(page.locator('#sidenav a[data-nav="map"]')).not.toHaveAttribute('aria-current', 'page');
  await page.locator('#sidenav a[data-nav="map"]').click();
  await expect(page.locator('[data-testid="mission-map-lens"]')).toBeVisible();
  // Navigating to a different screen moves focus to <main>, as on every other screen.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
});

test('Mission Map: the hash carries the selection only, persona and language stay in the query (one router)', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'technical', width: 1440 });
  await node(page, 'pos').click();
  expect(await hash(page)).toBe('#/map/retail-tower/pos');
  const u = new URL(page.url());
  expect(u.hash).toBe('#/map/retail-tower/pos');
  expect(Object.fromEntries(u.searchParams)).toEqual({ persona: 'technical', lang: 'en' });
});

test('Mission Map: selecting is a navigation, so Back and Forward restore the selection', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'technical', width: 1440 });
  await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  await node(page, 'pos').click();
  await expect(node(page, 'pos')).toHaveAttribute('aria-pressed', 'true');
  await node(page, 'jira').click();
  await expect(node(page, 'jira')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/jira');
  await page.goBack();
  await expect(node(page, 'pos')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/pos');
  await page.goBack();
  expect(await hash(page)).toBe('#/map');
  await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(node(page, 'pos')).toHaveAttribute('aria-pressed', 'true');
});

test('Mission Map: a deep link selects the node, survives a reload, a persona switch and a language switch', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/inventory', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: COPY.en.persona.technical, exact: true }).click();
  await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/inventory');
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/inventory');
});

test('Mission Map: scope changes are navigations too, and an unknown scope is not found, never guessed', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'owner', width: 1440 });
  await page.locator('.kv2-bc select').selectOption('khepri');
  expect(await hash(page)).toBe('#/map/khepri');
  await page.goBack();
  expect(await hash(page)).toBe('#/map');
  await openRoute(page, '/map/nope', { lang: 'en', persona: 'owner' });
  await expect(page.locator('h1')).toHaveText(/Page not found/);
  expect(await page.locator('[data-testid="mission-map-lens"]').count()).toBe(0);
});

test('Mission Map: an id the persona\'s world does not hold is dropped, not echoed', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/E-5', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.kv2-bc-node[aria-pressed="true"]').count()).toBe(1);
// The dropped id is also taken out of the address, so it is not kept in the URL, the history or a copied link.  await expect.poll(() => hash(page)).toBe('#/map/retail-tower');
  const text = await page.evaluate(() => document.body.innerText + document.body.textContent);
  expect(text).not.toContain('E-5');
});

test('Mission Map: the keyboard moves between nodes and Enter selects, as a navigation', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'technical', width: 1440 });
  await node(page, 'stock-sync').focus();
  await page.keyboard.press('ArrowRight');
  const moved = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-node'));
  expect(moved).toBeTruthy();
  expect(moved).not.toBe('stock-sync');
  await page.keyboard.press('Enter');
  expect(await hash(page)).toBe(`#/map/retail-tower/${moved}`);
  // Selecting is an in-screen change, so it does not move focus to <main>: the focused node is still the focused element.
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-node'))).toBe(moved);
});

test('Mission Map: on a phone the accessible list comes first, and the list view is complete', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'owner', width: 375 });
  await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'list');
  expect(await page.locator('.kv2-bc-ledger tr').count()).toBeGreaterThan(5);
  await page.locator('.kv2-bc-ledger button[data-node="pos"]').click();
  expect(await hash(page)).toBe('#/map/retail-tower/pos');
});

test('Mission Map: reduced motion plays no animation and no intro', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/map', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(page.locator('[data-testid="bc-canvas"]')).not.toHaveAttribute('data-intro', /.*/);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  expect(running).toBe(0);
});

test('Mission Map: the inspector actions are host navigations, not the lab\'s screens', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/stock-sync', { lang: 'en', persona: 'technical', width: 1440 });
  await page.getByRole('button', { name: 'Open the investigation replay' }).click();
  expect(await hash(page)).toBe('#/investigation/INV-DEMO-7/replay');
  await page.goBack();
  await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  await openRoute(page, '/map/all/github', { lang: 'en', persona: 'technical', width: 1440 });
  await page.getByRole('button', { name: 'Open in Source Observatory' }).first().click();
  // The provider the inspector named travels with the navigation (BACK-88): the Observatory view of that source.
  expect(await hash(page)).toBe('#/sources/observatory/github');
});

test('Mission Map: a verified system links to its Project Intelligence page, an unverified one says why not', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/pos', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(page.locator('[data-testid="map-open-project"]')).toHaveAttribute('href', '#/project/RT/pos');
  await page.locator('[data-testid="map-open-project"]').click();
  await expect(page.locator('main')).toHaveAttribute('data-route', 'project');
  await openRoute(page, '/map/all/github', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(page.locator('[data-testid="map-no-project"]')).toBeVisible();
  expect(await page.locator('[data-testid="map-open-project"]').count()).toBe(0);
  await openRoute(page, '/map/khepri', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(page.locator('[data-testid="map-no-project"]')).toBeVisible();
// The link describes what the map shows: with no node in the route the map falls back to stock-sync, and so does the link.  for (const r of ['/map', '/map/all', '/map/retail-tower']) {    await openRoute(page, r, { lang: 'en', persona: 'owner', width: 1440 });    await expect(page.locator('[data-testid="map-open-project"]'), r).toHaveAttribute('href', '#/project/RT/stock-sync');    await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');  }
});

const ROUTES = ['/map', '/map/retail-tower/inventory', '/map/retail-tower/stock-sync', '/map/all/sentry', '/map/retail-tower/E-5'] as const;

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`Mission Map non-disclosure ${persona}/${lang}: no restricted id, record or observation on any route, view or tab`, async ({ page }) => {
      for (const route of ROUTES) {
        await openRoute(page, route, { lang, persona, width: 1440 });
// The address holds no restricted id on any route: the probe route types one, and the page takes it back out of the address.        for (const id of RESTRICTED) await expect.poll(() => page.url(), route).not.toContain(id);
        for (const view of ['map', 'list'] as const) {
          await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(view === 'list' ? 1 : 0).click();
          await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', view);
          const tabs = page.getByRole('tab');
          for (let i = 0; i < (await tabs.count()); i += 1) {
            await tabs.nth(i).click();
            // The address of a route the tester typed (the E-5 probe) is theirs; everything the page adds must be clean.
            const text = await surface(page);
for (const id of RESTRICTED) expect(page.url(), `${route} ${view} tab ${i}`).not.toContain(id);
            for (const id of RESTRICTED) {
              expect(text.includes(`"${id}"`) || new RegExp(`(^|[^A-Za-z0-9-])${id}([^A-Za-z0-9-]|$)`).test(text), `${persona}/${lang} ${route} ${view} tab ${i}: ${id}`).toBe(false);
            }
          }
        }
      }
    });
  }
}

for (const lang of LANGS) {
  test(`Mission Map non-disclosure switch ${lang}: technical, owner, technical, owner on one page leaves nothing behind`, async ({ page }) => {
    await openRoute(page, '/map/all/sentry', { lang, persona: 'technical', width: 1440 });
    const L = COPY[lang].persona;
    const has = async () => /(^|[^A-Za-z0-9-])E-5([^A-Za-z0-9-]|$)/.test(await surface(page));
    await page.getByRole('tab').nth(1).click();
    expect(await has(), 'technical sees the record').toBe(true);
    for (const [p, expected] of [['owner', false], ['technical', true], ['owner', false], ['nontechnical', false]] as const) {
      await page.getByRole('button', { name: L[p], exact: true }).click();
      await page.getByRole('tab').nth(1).click();
      expect(await has(), p).toBe(expected);
    }
  });
}

for (const persona of PERSONAS) {
  test(`Mission Map ${persona}: no operational control that acts on anything (read-only)`, async ({ page }) => {
    await openRoute(page, '/map', { lang: 'en', persona, width: 1440 });
    await expect(page.getByRole('button', { name: /(approve|execute|deploy|merge|retry|release now|run now)/i })).toHaveCount(0);
  });
}
