// BACK-51 P4 negatives: signed-out and cross-workspace reads, double submit, an expiring session, Arabic copy, and privacy.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { INVESTIGATION } from '../src/i18n/screens/investigation';
import { SHELL } from '../src/i18n/shell';
import { explain, findLeaks, surfaces, type LeakOptions } from '../e2e/leaks';
import { apiGet, decisionCount, openLive, readSeed, signIn } from './helpers';

const ROUTE = '/investigation/INV-DEMO-7';

/** Opens the Investigation Room on the seeded case, signed in, with the live records on screen. */
async function openCase(page: Page, q: { lang?: string; persona?: string } = {}): Promise<void> {
  const seed = readSeed();
  await openLive(page, '/portfolio', q);
  expect(await signIn(page)).toBe(200);
  await openLive(page, ROUTE, { ...q, investigation: seed.investigationId });
  await expect(page.getByTestId('session-bar')).toHaveAttribute('data-session', 'signedIn');
  await expect(page.getByTestId('server-record').first()).toBeVisible();
}

test('signed out, every route reads as not found', async ({ page }) => {
  const seed = readSeed();
  await openLive(page, '/portfolio');
  const paths = ['/api/portfolio', '/api/investigations', `/api/investigations/${seed.investigationId}`, '/api/evidence', '/api/decisions', '/api/auth/me'];
  const headerCases: Record<string, string>[] = [{}, { 'x-kawalys-demo-persona': 'technical' }];
  for (const headers of headerCases) {
    for (const p of paths) {
      const r = await apiGet(page, p, headers);
      const label = `${p} ${JSON.stringify(headers)}`;
      expect(r.status, label).toBe(404);
      expect((r.body as { error?: { code?: string } }).error?.code, label).toBe('not_found');
    }
  }
});

test('another workspace sees nothing', async ({ page }) => {
  const seed = readSeed();
  await openLive(page, '/portfolio');
  expect(await signIn(page)).toBe(200);

  const foreign = await apiGet(page, `/api/investigations/${seed.foreign.investigationId}`);
  const random = await apiGet(page, `/api/investigations/${randomUUID()}`);
  expect(foreign.status).toBe(404);
  expect(random.status).toBe(404);
  const bare = (b: unknown) => { const c = JSON.parse(JSON.stringify(b)) as { error?: { request_id?: string } }; delete c.error?.request_id; return c; };
  expect(bare(foreign.body)).toEqual(bare(random.body));

  const portfolio = await apiGet(page, '/api/portfolio');
  expect(portfolio.status).toBe(200);
  expect(JSON.stringify(portfolio.body)).not.toContain(seed.foreign.projectName);

  const read = page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/api/investigations/'));
  await openLive(page, ROUTE, { investigation: seed.foreign.investigationId });
  await read;
  await expect(page.getByTestId('session-bar')).toHaveAttribute('data-session', 'signedIn');
  // Positive control first: the panel has rendered the server's "not found" (LiveState), so the negatives below cannot pass early.
  await expect(page.getByTestId('server-records').getByTestId('live-state')).toHaveAttribute('data-live', 'not_found');
  await expect(page.getByTestId('server-record')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(seed.foreign.projectName);
});

test('double click records one decision', async ({ page }) => {
  const seed = readSeed();
  await openCase(page);
  const form = page.getByTestId('record-decision');
  await form.locator('#rd-decision').fill('Hold the release until the queue drains (double click)');
  await form.locator('#rd-rationale').fill('Double submit check, BACK-51 P4.');
  await form.locator('input[type="checkbox"]').first().check();
  const before = await decisionCount(page, seed.investigationId);
  const posts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /^\/api\/investigations\/[^/]+\/decisions$/.test(new URL(r.url()).pathname)) posts.push(r.url()); });
  await form.locator('button[type="submit"]').dblclick();
  await expect(form.getByRole('status')).toContainText('Decision recorded');
  await page.waitForLoadState('networkidle');
  expect(posts, 'exactly one decision POST was sent').toHaveLength(1);
  expect(await decisionCount(page, seed.investigationId)).toBe(before + 1);
});

test('session expiring mid-form keeps the draft', async ({ page }) => {
  const seed = readSeed();
  await openCase(page);
  const bar = page.getByTestId('session-bar');
  const form = page.getByTestId('record-decision');
  const decision = 'Rotate the deploy key after the incident (session expiry)';
  const rationale = 'The session ends while this is being written.';
  await form.locator('#rd-decision').fill(decision);
  await form.locator('#rd-rationale').fill(rationale);
  const before = await decisionCount(page, seed.investigationId);

  await page.context().clearCookies();
  await form.locator('button[type="submit"]').click();
  await expect(bar).toHaveAttribute('data-session', 'ended');
  // L9: the owner's records leave the screen when the session ends (the draft stays, the server's data does not).
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('server-record')).toHaveCount(0);
  await expect(page.getByTestId('server-decision')).toHaveCount(0);
  // BACK-127: ended is locked. The notice is shown, no field and no draft text is on screen; the draft is only hidden.
  await expect(bar).toHaveAttribute('data-locked', 'true');
  await expect(form).toHaveAttribute('data-gate', 'locked');
  await expect(form.locator('#rd-decision')).toHaveCount(0);
  await expect(form.locator('button')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(decision);
  await expect(page.locator('body')).not.toContainText(rationale);

  // Sign in again without reloading: the draft lives in memory.
  expect(await signIn(page)).toBe(200);
  await bar.getByRole('button', { name: 'Check again' }).click();
  await expect(bar).toHaveAttribute('data-session', 'signedIn');
  // The draft returns only after the case is read again for this sign-in.
  await expect(form).toHaveAttribute('data-gate', 'open');
  await expect(form.locator('#rd-decision')).toHaveValue(decision);
  await expect(form.locator('#rd-rationale')).toHaveValue(rationale);

  await form.locator('button[type="submit"]').click();
  await expect(form.getByRole('status')).toContainText('Decision recorded');
  expect(await decisionCount(page, seed.investigationId)).toBe(before + 1);
});

test('Sign out leaves no portfolio project and no record on screen', async ({ page }) => {
  const seed = readSeed();
  const bar = page.getByTestId('session-bar');
  await openLive(page, '/portfolio');
  expect(await signIn(page)).toBe(200);
  await page.reload();
  await expect(bar).toHaveAttribute('data-session', 'signedIn');
  // Positive control: the project is on screen before sign-out, so the absence below proves the panel was cleared.
  await expect(page.getByTestId('portfolio-github')).toContainText(seed.projectName);

  await bar.getByRole('button', { name: 'Sign out' }).click();
  await expect(bar).toHaveAttribute('data-session', 'signedOut');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('portfolio-github')).not.toContainText(seed.projectName);
  await expect(page.locator('body')).not.toContainText(seed.projectName);
  await expect(page.getByTestId('server-record')).toHaveCount(0);

  // Moving on inside the app (no reload) shows nothing of the owner's data either.
  await page.evaluate(() => { window.location.hash = '#/investigation/INV-DEMO-7'; });
  // Wait for the Investigation panel itself to finish its read as not_found (h1 may still be the Portfolio heading).
  await expect(page.getByTestId('server-records').getByTestId('live-state')).toHaveAttribute('data-live', 'not_found');
  await expect(page.getByTestId('server-record')).toHaveCount(0);
});

test('Arabic copy is present for every live string', async ({ page }) => {
  await openCase(page, { lang: 'ar' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // The expected text is the app's own Arabic copy (i18n/shell.ts live.session, i18n/screens/investigation.ts), none of it containing {braces}.
  const ar = INVESTIGATION.ar;
  const session = SHELL.ar.live.session;
  const bar = page.getByTestId('session-bar');
  await expect(bar.getByRole('button', { name: session.signOut, exact: true })).toBeVisible();
  await expect(bar.locator('.session-who')).toHaveText(session.signedIn);

  const form = page.getByTestId('record-decision');
  await expect(form.getByRole('heading', { name: ar.recordDecision.title, exact: true })).toBeVisible();
  await expect(form.locator('label[for="rd-decision"]')).toHaveText(ar.recordDecision.decisionLabel);
  await expect(form.locator('label[for="rd-rationale"]')).toHaveText(ar.recordDecision.rationaleLabel);
  await expect(form.locator('button[type="submit"]')).toHaveText(ar.recordDecision.submit);

  const records = page.getByTestId('server-records');
  await expect(records.getByRole('heading', { name: ar.serverRecords.liveTitle, exact: true })).toBeVisible();
  await expect(records.getByRole('heading', { name: ar.serverRecords.recordsTitle, exact: true })).toBeVisible();
  await expect(records.getByRole('heading', { name: ar.serverRecords.decisionsTitle, exact: true })).toBeVisible();

  // Nothing falls back to the English copy.
  const en = INVESTIGATION.en;
  const text = await page.locator('main').innerText();
  for (const l of [en.recordDecision.title, en.recordDecision.submit, en.serverRecords.recordsTitle, en.serverRecords.decisionsTitle, SHELL.en.live.session.signOut]) {
    expect(text, `must not contain "${l}"`).not.toContain(l);
  }
});

// The tokens in leaks.ts come from the committed fixtures and demo copy (E-5, O-5 ... and the "restricted" placeholders), so against
// server data they can only catch a placeholder or a fixture id leaking into a live page. The seeded foreign workspace's names are
// added as extras, which is what makes the probe meaningful here.
for (const persona of ['owner', 'technical'] as const) {
  test(`nothing restricted leaks in live mode (${persona})`, async ({ page }) => {
    const seed = readSeed();
    const bodies: { where: string; text: string }[] = [];
    const pending: Promise<void>[] = [];
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (!u.pathname.startsWith('/api/')) return;
      pending.push(r.text().then((text) => { bodies.push({ where: `api ${u.pathname}`, text }); }, () => undefined));
    });
    await openCase(page, { persona });
    await Promise.all(pending);

    const opts: LeakOptions = persona === 'technical'
      ? { restricted: false, extra: [seed.foreign.projectName, seed.foreign.investigationId] }
      : { extra: [seed.foreign.projectName, seed.foreign.investigationId] };
    expect(bodies.length).toBeGreaterThan(0);
    const found = findLeaks([...(await surfaces(page)), ...bodies], opts);
    expect(found, explain(found)).toEqual([]);
    if (persona === 'owner') await expect(page.locator('[data-testid="server-record"] .srv-ref')).toHaveCount(0);
  });
}

test('nontechnical sees no decision form and makes no investigation request', async ({ page }) => {
  const seed = readSeed();
  const requested: string[] = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/investigations')) requested.push(p); });
  await openLive(page, '/portfolio', { persona: 'nontechnical' });
  expect(await signIn(page)).toBe(200);
  await openLive(page, ROUTE, { persona: 'nontechnical', investigation: seed.investigationId });
  await expect(page.getByTestId('session-bar')).toHaveAttribute('data-session', 'signedIn');
  // Settle point: the Investigation screen is fully rendered (h1 and the page's own panels) and the network is idle, so a
  // regression that fetched the case or drew the form would have done so by now.
  await expect(page.locator('main h1, h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('record-decision')).toHaveCount(0);
  await expect(page.getByTestId('server-records')).toHaveCount(0);
  expect(requested).toEqual([]);
});
