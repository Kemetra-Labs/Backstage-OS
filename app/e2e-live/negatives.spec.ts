// BACK-51 P4 negatives: signed-out and cross-workspace reads, double submit, an expiring session, Arabic copy, and privacy.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
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
  for (const headers of [{}, { 'x-kawalys-demo-persona': 'technical' }]) {
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
  await form.locator('button[type="submit"]').dblclick();
  await expect(form.getByRole('status')).toContainText('Decision recorded');
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
  await expect(form.locator('#rd-decision')).toHaveValue(decision);
  await expect(form.locator('#rd-rationale')).toHaveValue(rationale);

  // Sign in again without reloading: the draft lives in memory.
  expect(await signIn(page)).toBe(200);
  await bar.getByRole('button', { name: 'Check again' }).click();
  await expect(bar).toHaveAttribute('data-session', 'signedIn');
  await expect(form.locator('#rd-decision')).toHaveValue(decision);
  await expect(form.locator('#rd-rationale')).toHaveValue(rationale);

  await form.locator('button[type="submit"]').click();
  await expect(form.getByRole('status')).toContainText('Decision recorded');
  expect(await decisionCount(page, seed.investigationId)).toBe(before + 1);
});

test('Arabic copy is present for every live string', async ({ page }) => {
  await openCase(page, { lang: 'ar' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // EN labels hard-coded from app/src/i18n/shell.ts (live.session) and app/src/i18n/screens/investigation.ts (liveTitle, recordDecision).
  const english: Record<string, string[]> = {
    'session-bar': ['Sign out', 'Signed in as the owner'],
    'record-decision': ['Record a decision', 'Record decision', 'Rationale', 'Cited records'],
    'server-records': ['Server records'],
  };
  for (const [id, labels] of Object.entries(english)) {
    const text = await page.getByTestId(id).innerText();
    expect(text, id).toMatch(/[؀-ۿ]/);
    for (const l of labels) expect(text, `${id} must not contain "${l}"`).not.toContain(l);
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
  await expect(page.getByTestId('record-decision')).toHaveCount(0);
  await expect(page.getByTestId('server-records')).toHaveCount(0);
  expect(requested).toEqual([]);
});
