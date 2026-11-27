// COG-07 live shadow search against the real BFF (owner decision 2026-11-27): signed in, the search reads the server for the
// project in the address and is labelled live; a project in another workspace reads as not found; reasoning is said in words
// to be unavailable live, and the synthetic fixture is never shown in live mode.
import { expect, test } from '@playwright/test';
import { openLive, readSeed, signIn, unexpectedErrors } from './helpers';

test('signed in, the live shadow search reads the seeded project and is labelled live', async ({ page }) => {
  const seed = readSeed();
  await openLive(page, '/portfolio');
  expect(await signIn(page)).toBe(200);
  await openLive(page, '/shadow', { project: seed.projectId, q: ['checkout', '#42'] });
  await expect(page.getByTestId('shadow-search')).toBeVisible();
  await expect(page.getByTestId('shadow-live-mark')).toBeVisible();
  await expect(page.locator('[data-query="checkout"]').first()).toHaveAttribute('data-outcome', /^(match|ambiguous|no-match)$/);
  await expect(page.getByTestId('shadow-reasoning-not-live')).toBeVisible();
  // The synthetic fixture never appears in live mode.
  await expect(page.locator('[data-task]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Login runbook');
  expect(unexpectedErrors(page)).toEqual([]);
});

test('a project in another workspace reads as not found, in words', async ({ page }) => {
  const seed = readSeed();
  await openLive(page, '/portfolio');
  expect(await signIn(page)).toBe(200);
  await openLive(page, '/shadow', { project: seed.foreign.projectId, q: ['foreign'] });
  await expect(page.getByTestId('live-state')).toHaveAttribute('data-live', 'not_found');
  await expect(page.getByTestId('shadow-search')).toHaveCount(0);
});

test('without a project or a query the view says so in words and requests nothing', async ({ page }) => {
  const seed = readSeed();
  await openLive(page, '/portfolio');
  expect(await signIn(page)).toBe(200);
  const searches: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/cognition/')) searches.push(r.url()); });
  await openLive(page, '/shadow', { q: ['checkout'] });
  await expect(page.locator('main [data-state="unknown"]').first()).toBeVisible();
  await openLive(page, '/shadow', { project: seed.projectId });
  await expect(page.locator('main [data-state="unknown"]').first()).toBeVisible();
  expect(searches).toEqual([]);
});
