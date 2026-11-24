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

// The kind that follows a node's name (map button and list row) is joined with the same comma, and the lens heading uses the
// shell's wording for the screen ("خريطة المهام"), not a second translation of "Mission Map".
test('Mission Map ar: node names join the kind with the Arabic comma, and the heading matches the side navigation', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/stock-sync', { lang: 'ar', persona: 'owner' });
  const node = page.locator('.kv2-bc-node[data-node="stock-sync"]');
  await expect(node).toContainText('، مشروع');
  expect(await node.innerText()).not.toContain(',');
  const nav = (await page.locator('#sidenav [aria-current="page"]').innerText()).trim();
  await expect(page.locator('h1')).toContainText(nav);
});

test('Mission Map en: node names keep ", Project"', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/stock-sync', { lang: 'en', persona: 'owner' });
  await expect(page.locator('.kv2-bc-node[data-node="stock-sync"]')).toContainText(', Project');
});
