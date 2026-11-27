// D3(a): in the default (fixture) build `/sign-in` is not a sign-in page. It is the normal app (the home screen, with its shell), the
// page makes no request to Descope or to /api/, and the build ships no sign-in code path. The live build's page is covered by the unit
// tests (src/live/signInFlow.test.ts) and the live end-to-end suite's sign-in helper, not here.
import { expect, test } from '@playwright/test';

test('the fixture build serves the normal app on /sign-in: no sign-in page, no Descope, no /api/ request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/sign-in?persona=owner&lang=en&t=not-a-real-token');

  await expect(page.locator('#sidenav')).toHaveCount(1);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByTestId('sign-in-page')).toHaveCount(0);
  await expect(page.locator('descope-wc')).toHaveCount(0);
  await expect(page.getByTestId('session-bar')).toHaveCount(0);
  expect(requests.filter((u) => /descope|\/api\//i.test(u))).toEqual([]);
  expect(errors).toEqual([]);
  // The shell's URL sync keeps the query as before (no special sign-in handling in this build).
  expect(page.url()).toContain('/sign-in?persona=owner&lang=en');
});
