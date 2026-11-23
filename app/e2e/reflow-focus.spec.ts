// BACK-91: two accessibility properties the convergence spec did not cover, checked by the browser on every screen of the one app.
//
// 1. Zoom reflow. A 1280 px window at 200% zoom lays the page out at 640 CSS px wide and at 400% at 320 CSS px by 256 CSS px (WCAG 2.1
//    1.4.10 reference size). The browsers' own zoom is not scriptable here, so the layout width is what is set: this checks the layout,
//    not a real zoomed browser, and it is NOT a replacement for a person zooming a real browser (BACK-32).
// 2. Focus after navigation. A keyboard or screen-reader user must never be left on <body> after a link, Back or Forward; a move to
//    another screen lands on <main>.
//
// Persona is a display switch on synthetic data, not authorization.
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/i18n/strings';
import { LANGS } from './helpers';
import { openScreen, SCREENS } from './lens-helpers';

const ZOOM = [
  { name: '200% (640 CSS px)', width: 640, height: 450 },
  { name: '400% (320 CSS px)', width: 320, height: 256 },
] as const;

/** What a zoomed user needs: no sideways page scroll, the content inside the window, and the persona and language controls reachable. */
const reflow = (page: Page) =>
  page.evaluate(() => {
    const iw = window.innerWidth;
    const within = (el: Element | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= -1 && r.right <= iw + 1;
    };
    const buttons = [...document.querySelectorAll('.topbar [role="group"] button, .topbar button')];
    return {
      pageOverflow: document.documentElement.scrollWidth > iw,
      mainInside: within(document.querySelector('main')),
      controls: buttons.length,
      controlsOutside: buttons.filter((b) => !within(b)).map((b) => (b.textContent ?? '').trim()),
    };
  });

for (const lang of LANGS) {
  for (const z of ZOOM) {
    test(`zoom reflow ${lang} at ${z.name}: every screen lays out in the window, with the persona and language controls reachable`, async ({ page }) => {
      for (const route of SCREENS) {
        const errors = await openScreen(page, route, { lang, persona: 'owner', width: z.width });
        await page.setViewportSize({ width: z.width, height: z.height });
        const f = await reflow(page);
        expect(f.pageOverflow, `${route} ${lang} ${z.name}: sideways page scroll`).toBe(false);
        expect(f.mainInside, `${route} ${lang} ${z.name}: <main> inside the window`).toBe(true);
        expect(f.controls, `${route} ${lang} ${z.name}: persona and language controls exist`).toBeGreaterThanOrEqual(5);
        expect(f.controlsOutside, `${route} ${lang} ${z.name}: controls outside the window`).toEqual([]);
        expect(errors, route).toEqual([]);
      }
    });
  }
}

const active = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return { onBody: a === null || a === document.body, id: a?.id ?? '' };
  });

test('focus after navigation: a link to another screen lands on <main>; Back and Forward never leave focus on <body>', async ({ page }) => {
  await openScreen(page, '/', { lang: 'en', persona: 'owner', width: 1440 });
  const links = page.locator('#sidenav a[data-nav]');
  const keys = await links.evaluateAll((els) => els.map((e) => e.getAttribute('data-nav') ?? ''));
  expect(keys.length).toBeGreaterThanOrEqual(8);
  let clicks = 0;
  for (const key of keys) {
    const link = page.locator(`#sidenav a[data-nav="${key}"]`);
    // The link of the screen already open changes nothing, by design: focus is only moved when the screen changes.
    if ((await link.getAttribute('aria-current')) === 'page') continue;
    await link.click();
    clicks += 1;
    await expect.poll(async () => (await active(page)).id, `${key}: focus lands on <main>`).toBe('main');
  }
  expect(clicks, 'a journey through every other screen').toBe(keys.length - 1);
  for (let i = 0; i < clicks; i += 1) {
    await page.goBack();
    await expect.poll(async () => (await active(page)).onBody, `Back ${i + 1}: focus is not on <body>`).toBe(false);
  }
  for (let i = 0; i < clicks; i += 1) {
    await page.goForward();
    await expect.poll(async () => (await active(page)).onBody, `Forward ${i + 1}: focus is not on <body>`).toBe(false);
  }
});

for (const lang of LANGS) {
  test(`focus after navigation ${lang}: the same holds with the interface in ${lang === 'ar' ? 'Arabic (RTL)' : 'English'}`, async ({ page }) => {
    await openScreen(page, '/', { lang, persona: 'technical', width: 1440 });
    await page.getByRole('button', { name: COPY[lang].persona.owner, exact: true }).click();
    for (const key of ['portfolio', 'sources', 'agents'] as const) {
      await page.locator(`#sidenav a[data-nav="${key}"]`).click();
      await expect.poll(async () => (await active(page)).id, `${lang} ${key}`).toBe('main');
    }
    await page.goBack();
    await expect.poll(async () => (await active(page)).onBody, `${lang} Back`).toBe(false);
  });
}
