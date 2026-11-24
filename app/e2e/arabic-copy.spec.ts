// BACK-31: the B+C age bar joins its two readings with the language's own comma, so the Arabic accessible name reads
// "540 من 15 د، 36× الهدف" and never mixes in a Latin comma. English keeps ", ".
import { expect, test } from '@playwright/test';
import { openRoute } from './helpers';

const CASES = [
  { lang: 'en', label: '540 of 15 min, 36× target' },
  { lang: 'ar', label: '540 من 15 د، 36× الهدف' },
] as const;

for (const c of CASES) {
  test(`Mission Map ${c.lang}: the age bar's accessible name uses the language's comma`, async ({ page }) => {
    await openRoute(page, '/map/retail-tower/sentry', { lang: c.lang, persona: 'technical' });
    await page.locator('[role=tab]').nth(2).click();
    const age = page.locator('.kv2-bc-age').first();
    await expect(age).toHaveAttribute('aria-label', c.label);
    if (c.lang === 'ar') expect(await age.getAttribute('aria-label')).not.toContain(',');
  });
}
