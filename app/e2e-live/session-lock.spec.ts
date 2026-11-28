// BACK-127 SEC-02 browser regressions: the locked screen, the failed sign-out, a revoked grant, reload, a stale in-flight answer,
// return revalidation and Arabic copy. Real BFF on a disposable Postgres (see playwright.live.config.ts).
import { expect, test, type Page } from '@playwright/test';
import { INVESTIGATION } from '../src/i18n/screens/investigation';
import { SHELL } from '../src/i18n/shell';
import { decisionCount, openLive, readSeed, signIn } from './helpers';

const ROUTE = '/investigation/INV-DEMO-7';
const HOOK = 'http://127.0.0.1:8788'; // test-only grant hook of server/test/e2e/serve-e2e.ts
const DECISION = 'Pause the rollout until the mirror recovers (BACK-127)';
const RATIONALE = 'Typed before the session was locked.';

async function openCase(page: Page, q: { lang?: string } = {}): Promise<void> {
  const seed = readSeed();
  // The store's 60 s return-check floor runs on performance.now: a test moves it with window.__skew instead of waiting a minute.
  await page.addInitScript(() => {
    const real = performance.now.bind(performance);
    (window as unknown as { __skew: number }).__skew = 0;
    performance.now = () => real() + (window as unknown as { __skew: number }).__skew;
  });
  await openLive(page, '/portfolio', { ...q, persona: 'technical' });
  expect(await signIn(page)).toBe(200);
  await openLive(page, ROUTE, { ...q, persona: 'technical', investigation: seed.investigationId });
  await expect(page.getByTestId('session-bar')).toHaveAttribute('data-session', 'signedIn');
  await expect(page.getByTestId('server-record').first()).toBeVisible();
}

/** Writes a draft and ticks the first record. */
async function writeDraft(page: Page): Promise<void> {
  const form = page.getByTestId('record-decision');
  await form.locator('#rd-decision').fill(DECISION);
  await form.locator('#rd-rationale').fill(RATIONALE);
  await form.locator('input[type="checkbox"]').first().check();
}

/** What the owner's data would look like on screen; used as positive control before and absence check while locked. */
async function expectNoProtectedText(page: Page, withDraft = true): Promise<void> {
  await expect(page.getByTestId('server-record')).toHaveCount(0);
  await expect(page.getByTestId('server-decision')).toHaveCount(0);
  await expect(page.locator('.srv-ref')).toHaveCount(0);
  await expect(page.locator('#rd-decision')).toHaveCount(0);
  if (withDraft) {
    await expect(page.locator('body')).not.toContainText(DECISION);
    await expect(page.locator('body')).not.toContainText(RATIONALE);
  }
}

/** The tab "comes back": the same event the browser fires, which makes the store re-check through /api/auth/session-state. */
const comeBack = (page: Page, minutesAway = true) =>
  page.evaluate((jump) => {
    if (jump) (window as unknown as { __skew: number }).__skew += 61_000;
    document.dispatchEvent(new Event('visibilitychange'));
  }, minutesAway);

const hook = async (action: 'revoke' | 'restore') => {
  const r = await fetch(`${HOOK}/grants/${action}`, { method: 'POST' });
  expect(r.status).toBe(204);
};

test('server unreachable mid-session locks the case and the form, and unlocks with the draft back', async ({ page }) => {
  await openCase(page);
  await expect(page.locator('.srv-ref').first()).toBeVisible(); // positive control: a source reference is on screen
  await writeDraft(page);
  const bar = page.getByTestId('session-bar');
  const form = page.getByTestId('record-decision');

  await page.route('**/api/**', (r) => r.abort());
  await comeBack(page);
  await expect(bar).toHaveAttribute('data-locked', 'true');
  await expect(bar).toHaveAttribute('data-session', 'unavailable');
  await expect(form).toHaveAttribute('data-gate', 'locked');
  await expectNoProtectedText(page);
  await expect(bar.getByRole('link', { name: SHELL.en.live.session.locked.signIn })).toHaveAttribute('href', '/sign-in');
  await expect(bar).toBeFocused();

  await page.unroute('**/api/**');
  await bar.getByRole('button', { name: 'Check again' }).click();
  await expect(bar).toHaveAttribute('data-session', 'signedIn');
  await expect(bar).not.toHaveAttribute('data-locked', 'true');
  await expect(form).toHaveAttribute('data-gate', 'open');
  await expect(form.locator('#rd-decision')).toHaveValue(DECISION);
  await expect(form.locator('#rd-rationale')).toHaveValue(RATIONALE);
  await expect(form.locator('input[type="checkbox"]').first()).toBeChecked();
});

test('a failed sign-out keeps the screen locked, says so, offers a retry, and the draft is gone after sign-out and sign-in', async ({ page }) => {
  await openCase(page);
  await writeDraft(page);
  const bar = page.getByTestId('session-bar');
  const form = page.getByTestId('record-decision');

  await page.route('**/api/auth/session', (r) => (r.request().method() === 'DELETE' ? r.abort() : r.continue()));
  await bar.getByRole('button', { name: 'Sign out' }).click();
  await expect(bar).toHaveAttribute('data-locked', 'true');
  await expect(bar).toContainText(SHELL.en.live.session.signOutFailed.title);
  await expect(bar.getByRole('button', { name: SHELL.en.live.session.locked.retrySignOut })).toBeVisible();
  await expectNoProtectedText(page);

  await page.unroute('**/api/auth/session');
  await bar.getByRole('button', { name: SHELL.en.live.session.locked.retrySignOut }).click();
  await expect(bar).toHaveAttribute('data-session', 'signedOut');
  await expect(bar).not.toHaveAttribute('data-locked', 'true');

  expect(await signIn(page)).toBe(200);
  await bar.getByRole('button', { name: 'Check again' }).click();
  await expect(bar).toHaveAttribute('data-session', 'signedIn');
  await expect(form).toHaveAttribute('data-gate', 'open');
  await expect(form.locator('#rd-decision')).toHaveValue('');
  await expect(page.locator('body')).not.toContainText(DECISION);
});

test('a revoked grant: the record and its citation do not come back after the session ended and the owner signs in again', async ({ page }) => {
  await openCase(page);
  await writeDraft(page);
  const bar = page.getByTestId('session-bar');
  const form = page.getByTestId('record-decision');
  try {
    await page.context().clearCookies();
    await comeBack(page);
    await expect(bar).toHaveAttribute('data-session', 'ended');
    await expectNoProtectedText(page);

    await hook('revoke');
    expect(await signIn(page)).toBe(200);
    await bar.getByRole('button', { name: 'Check again' }).click();
    await expect(bar).toHaveAttribute('data-session', 'signedIn');
    // The server hides the whole case once its project has no active grant (not found), so the read for this sign-in never
    // succeeds: the draft stays hidden (fail closed) and neither the record, its citation nor the typed text comes back.
    await expect(page.getByTestId('server-records').getByTestId('live-state')).toHaveAttribute('data-live', 'not_found');
    await expect(form).toHaveAttribute('data-gate', 'rereading');
    await expectNoProtectedText(page);
    await expect(page.getByTestId('server-record')).toHaveCount(0);
  } finally {
    await hook('restore');
  }
});

test('reload drops the draft', async ({ page }) => {
  await openCase(page);
  await writeDraft(page);
  await page.reload();
  await expect(page.getByTestId('session-bar')).toHaveAttribute('data-session', 'signedIn');
  const form = page.getByTestId('record-decision');
  await expect(form.locator('#rd-decision')).toHaveValue('');
  await expect(form.locator('#rd-rationale')).toHaveValue('');
  await expect(page.locator('body')).not.toContainText(DECISION);
});

test('a decision answer that lands after the session locked shows nothing and keeps the draft', async ({ page }) => {
  const seed = readSeed();
  await openCase(page);
  await writeDraft(page);
  const bar = page.getByTestId('session-bar');
  const form = page.getByTestId('record-decision');
  const before = await decisionCount(page, seed.investigationId);

  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  let reached!: () => void;
  const atServer = new Promise<void>((r) => { reached = r; });
  await page.route(/\/api\/investigations\/[^/]+\/decisions$/, async (r) => {
    reached();
    await held;
    await r.continue();
  });
  await form.locator('button[type="submit"]').click();
  await atServer;

  await page.context().clearCookies();
  await comeBack(page);
  await expect(bar).toHaveAttribute('data-locked', 'true');
  release();
  await page.waitForLoadState('networkidle');
  await expect(form).toHaveAttribute('data-gate', 'locked');
  await expect(page.locator('body')).not.toContainText('Decision recorded');
  await expectNoProtectedText(page);

  await page.unroute(/\/api\/investigations\/[^/]+\/decisions$/);
  expect(await signIn(page)).toBe(200);
  await bar.getByRole('button', { name: 'Check again' }).click();
  await expect(form).toHaveAttribute('data-gate', 'open');
  await expect(form.locator('#rd-decision')).toHaveValue(DECISION);
  await expect(form.getByRole('status')).not.toContainText('Decision recorded');
  expect(await decisionCount(page, seed.investigationId)).toBe(before); // the held send never carried a session
});

test('return revalidation uses /api/auth/session-state, never /api/auth/me, and at most once a minute', async ({ page }) => {
  await openCase(page);
  const paths: string[] = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p === '/api/auth/me' || p === '/api/auth/session-state') paths.push(p); });
  const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/session-state');
  await comeBack(page);
  expect((await answered).status()).toBe(200);
  await comeBack(page, false); // no time has passed: skipped by the floor
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForLoadState('networkidle');
  expect(paths).toEqual(['/api/auth/session-state']);
});

test('Arabic: the locked notice and its two actions have Arabic copy', async ({ page }) => {
  await openCase(page, { lang: 'ar' });
  await writeDraft(page);
  await page.route('**/api/**', (r) => r.abort());
  await comeBack(page);
  const bar = page.getByTestId('session-bar');
  await expect(bar).toHaveAttribute('data-locked', 'true');
  const s = SHELL.ar.live.session;
  await expect(bar).toContainText(s.locked.body);
  await expect(bar.getByRole('link', { name: s.locked.signIn, exact: true })).toHaveAttribute('href', '/sign-in?lang=ar');
  await expect(bar.getByRole('button', { name: s.checkAgain, exact: true })).toBeVisible();
  await expect(page.getByTestId('record-decision')).toContainText(INVESTIGATION.ar.recordDecision.locked.title);
  const text = await bar.innerText();
  for (const l of [SHELL.en.live.session.locked.signIn, SHELL.en.live.session.checkAgain, SHELL.en.live.session.locked.body]) expect(text).not.toContain(l);
  await page.unroute('**/api/**');
});
