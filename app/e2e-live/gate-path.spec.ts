// BACK-51 P4 happy path: the owner's whole gate path through the live build and the real BFF.
import { expect, test } from '@playwright/test';
import { apiGet, decisionCount, openLive, readSeed, signIn, unexpectedErrors } from './helpers';

test('owner signs in, reads Portfolio and the case, records a decision, signs out', async ({ page }) => {
  const seed = readSeed();
  const bar = page.getByTestId('session-bar');
  const records = page.getByTestId('server-record');
  const decisions = page.getByTestId('server-decision');

  // Signed out: the server answers 401/404 for the reads, and no project name reaches the page.
  await openLive(page, '/portfolio');
  await expect(bar).toHaveAttribute('data-session', 'signedOut');
  await expect(page.locator('body')).not.toContainText(seed.projectName);

  // Sign in from the page, so the session cookie is the browser's own.
  expect(await signIn(page)).toBe(200);
  await page.reload();
  await expect(bar).toHaveAttribute('data-session', 'signedIn');
  await expect(page.getByTestId('portfolio-github')).toContainText(seed.projectName);
  await expect(page.locator('body')).not.toContainText(seed.foreign.projectName);

  // The case: the hash route is the demo room (INV-DEMO-7); the live panel reads the case named in ?investigation=.
  await openLive(page, '/investigation/INV-DEMO-7', { investigation: seed.investigationId });
  await expect(bar).toHaveAttribute('data-session', 'signedIn');
  await expect(records.first()).toBeVisible();
  const before = await decisionCount(page, seed.investigationId);
  await expect(decisions).toHaveCount(before);
  const recorded = page.locator('[data-testid="server-decision"] .srv-creator[data-creator="recorded"]');
  const recordedBefore = await recorded.count();

  // Record a decision citing the first record.
  const form = page.getByTestId('record-decision');
  await form.locator('#rd-decision').fill('Pause checkout-e2e on main until #42 is reverted (e2e)');
  await form.locator('#rd-rationale').fill('Recorded by the BACK-51 P4 live suite.');
  await form.locator('input[type="checkbox"]').first().check();
  await form.locator('button[type="submit"]').click();
  await expect(form.getByRole('status')).toContainText('Decision recorded');

  expect(await decisionCount(page, seed.investigationId)).toBe(before + 1);
  await expect(decisions).toHaveCount(before + 1);
  await expect(page.locator('[data-testid="server-decision"][data-label="approved"]')).toHaveCount(0);
  await expect(recorded).toHaveCount(recordedBefore + 1);

  // Sign out: the records leave the screen and the server stops answering for this browser.
  await bar.getByRole('button', { name: 'Sign out' }).click();
  await expect(bar).toHaveAttribute('data-session', 'signedOut');
  await expect(records).toHaveCount(0);
  expect((await apiGet(page, '/api/portfolio')).status).toBe(404);

  // Console errors: only the 404s of /api/* reads made while signed out (see unexpectedErrors); a 404 anywhere else fails.
  expect(unexpectedErrors(page)).toEqual([]);
});
