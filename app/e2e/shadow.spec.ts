// COG-07 (BACK-110): the read-only shadow view of the cognitive core. Committed synthetic output only: it is
// labelled as shadow (never live), makes no request, has no controls, keeps unknown and blocked in words,
// and lays out in English and Arabic at every width.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectSoundLayout, LANGS, openRoute, WIDTHS, type LoadQuery } from './helpers';

const open = (page: Page, q: LoadQuery = {}) =>
  openRoute(page, '/shadow', q).then(async (errors) => {
    await expect(page.getByTestId('shadow-search')).toBeVisible();
    return errors;
  });

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`shadow view ${lang} at ${width}px lays out soundly with no console errors`, async ({ page }) => {
      const errors = await open(page, { lang, width });
      await expectSoundLayout(page, lang);
      expect(errors).toEqual([]);
    });
  }
}

test('shadow view is labelled synthetic shadow output, never live', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('shadow-marker')).toContainText('not live telemetry');
  await expect(page.locator('main')).not.toContainText('Live: read from the Kawalys server');
});

test('shadow view makes no request beyond the app itself', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await open(page);
  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'))).toEqual([]);
  expect(requests.filter((u) => u.includes('/api/'))).toEqual([]);
});

test('shadow view has no controls in main', async ({ page }) => {
  await open(page);
  await expect(page.locator('main button, main input, main select, main textarea, main [role="switch"]')).toHaveCount(0);
});

test('unknown and blocked tasks are said in words, and nothing is called healthy or ready', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('shadow-kind')).toHaveAttribute('data-kind', 'insufficient-evidence');
  await expect(page.locator('[data-task="T3"] [data-dim="state"]')).toHaveText('Unknown');
  await expect(page.locator('[data-task="T1"] [data-dim="state"]')).toHaveText('Blocked');
  await expect(page.locator('[data-state="ready"], [data-health="healthy"]')).toHaveCount(0);
});

test('Arabic shows the states in Arabic', async ({ page }) => {
  await open(page, { lang: 'ar' });
  await expect(page.locator('[data-task="T3"] [data-dim="state"]')).toHaveText('غير معروفة');
});

for (const lang of LANGS) {
  test(`axe ${lang} shadow view: no WCAG A/AA violations`, async ({ page }) => {
    await open(page, { lang });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }))).toEqual([]);
  });
}
