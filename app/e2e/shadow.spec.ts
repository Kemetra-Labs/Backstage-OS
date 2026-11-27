// COG-07 (BACK-110): the read-only shadow view of the cognitive core. Committed synthetic output only: it is
// labelled as shadow (never live), makes no request, has no controls, keeps unknown and blocked in words,
// and lays out in English and Arabic at every width.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { LANGS, openRoute, WIDTHS, type LoadQuery } from './helpers';

const load = async (page: Page, q: LoadQuery = {}) => {
  const errors = await openRoute(page, '/shadow', q);
  await expect(page.getByTestId('shadow-search')).toBeVisible();
  return errors;
};

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`shadow layout ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
      const errors = await load(page, { lang, width });
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      expect(errors).toEqual([]);
    });
  }
}

test('shadow view is labelled synthetic shadow output, never live', async ({ page }) => {
  await load(page);
  await expect(page.getByTestId('shadow-marker')).toContainText('not live telemetry');
  await expect(page.locator('main')).not.toContainText('Live: read from the Kawalys server');
});

test('shadow view makes no request beyond the app itself', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await load(page);
  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'))).toEqual([]);
  expect(requests.filter((u) => u.includes('/api/'))).toEqual([]);
});

test('shadow view has no controls in main', async ({ page }) => {
  await load(page);
  await expect(page.locator('main button, main input, main select, main textarea, main [role="switch"]')).toHaveCount(0);
});

test('unknown and blocked tasks are said in words, and nothing is called healthy or ready', async ({ page }) => {
  await load(page);
  await expect(page.getByTestId('shadow-kind')).toHaveAttribute('data-kind', 'insufficient-evidence');
  await expect(page.locator('[data-task="T3"] [data-dim="state"]')).toHaveText('Unknown');
  await expect(page.locator('[data-task="T1"] [data-dim="state"]')).toHaveText('Blocked');
  await expect(page.locator('[data-state="ready"], [data-health="healthy"]')).toHaveCount(0);
});

test('Arabic shows the states in Arabic', async ({ page }) => {
  await load(page, { lang: 'ar' });
  await expect(page.locator('[data-task="T3"] [data-dim="state"]')).toHaveText('غير معروفة');
});

for (const lang of LANGS) {
  test(`axe ${lang} shadow view: no WCAG A/AA violations`, async ({ page }) => {
    await load(page, { lang });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }))).toEqual([]);
  });
}
