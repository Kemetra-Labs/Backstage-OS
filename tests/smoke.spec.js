const { test, expect } = require('@playwright/test');
const { openApp, go, setSrc, hOverflow } = require('./helpers');

const ROUTES = ['home', 'portfolio', 'network', 'investigation', 'decisions', 'agents', 'operations', 'sources', 'design-system'];
const VIEWPORTS = [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 812], [320, 640]];

test.describe('smoke', () => {
  test('every screen renders without JS errors or broken assets (EN)', async ({ page }) => {
    const { errors, failed } = await openApp(page);
    for (const r of ROUTES) { await go(page, r); await expect(page.locator('main#main')).not.toBeEmpty(); }
    expect(errors, 'uncaught JS errors').toEqual([]);
    expect(failed, 'failed/4xx asset requests').toEqual([]);
  });

  for (const [w, h] of VIEWPORTS) {
    test(`no horizontal overflow on all screens @ ${w}x${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openApp(page);
      const bad = [];
      for (const r of ROUTES) { await go(page, r); const o = await hOverflow(page); if (o > 0) bad.push(`${r}: +${o}px`); }
      expect(bad).toEqual([]);
    });
  }

  for (const persona of ['owner', 'tech', 'biz']) {
    for (const lang of ['en', 'ar']) {
      test(`persona ${persona} / ${lang}: nav + dir + no errors`, async ({ page }) => {
        const { errors } = await openApp(page, { persona, lang });
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        for (const r of ['home', 'portfolio', 'investigation', 'decisions', 'agents']) { await go(page, r); }
        expect(await hOverflow(page)).toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      });
    }
  }

  test('language and persona switches work through the UI', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'عربي' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.locator('select[data-chg="persona"]').selectOption('biz');
    await expect(page.locator('.ucard b')).toContainText('Non-technical');
  });

  for (const src of ['ok', 'stale', 'down']) {
    test(`source state ${src}: popover toggles state and every screen survives`, async ({ page }) => {
      const { errors } = await openApp(page);
      await page.locator('.chip-btn.fresh').click();
      await page.locator(`.pop button[data-v="${src}"]`).click();
      await expect(page.locator('.chip-btn.fresh')).toHaveAttribute('data-s', src);
      for (const r of ROUTES) await go(page, r);
      expect(errors).toEqual([]);
    });
  }

  test('Ctrl+K opens search and Escape closes it', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#pal-in')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pal-in')).toHaveCount(0);
  });
});
