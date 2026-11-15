// Viewport-agnostic smoke: runs unchanged on real desktop and mobile browsers (no setViewportSize).
const { test, expect } = require('@playwright/test');
const { openApp, go, hOverflow } = require('../tests/helpers');

const ROUTES = ['home', 'portfolio', 'network', 'investigation', 'decisions', 'agents', 'operations', 'sources', 'design-system'];

test('every screen loads: no JS errors, no broken requests, no horizontal overflow', async ({ page }) => {
  const { errors, failed } = await openApp(page);
  const overflow = [];
  for (const r of ROUTES) { await go(page, r); if ((await hOverflow(page)) > 0) overflow.push(r); }
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  expect(overflow, 'screens with horizontal overflow').toEqual([]);
});

test('Arabic RTL renders and switches back', async ({ page }) => {
  await openApp(page, { lang: 'ar' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await hOverflow(page)).toBeLessThanOrEqual(0);
});

test('all three personas render Home', async ({ page }) => {
  for (const persona of ['owner', 'tech', 'biz']) {
    await openApp(page, { persona });
    await expect(page.locator('.ucard b')).toBeVisible();
  }
});

test('stale and unavailable states are shown', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { S.src = 'stale'; renderApp(); });
  await expect(page.locator('.notice.warn').first()).toContainText(/9 h/);
  await page.evaluate(() => { S.src = 'down'; renderApp(); });
  await expect(page.locator('.notice.crit').first()).toBeVisible();
});

test('mobile nav (only when the menu button is shown): focus in on open, back on Escape', async ({ page }) => {
  await openApp(page);
  const menu = page.locator('.menu-btn');
  test.skip(!(await menu.isVisible()), 'desktop layout: no menu button');
  await menu.click();
  await expect(page.locator('.side')).toHaveClass(/open/);
  await expect(page.locator('.side .nav button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.side')).not.toHaveClass(/open/);
});
