// BACK-172 (G1, G4): a decision whose response is lost after the server committed is retried from the UI with the same
// Idempotency-Key, so exactly one decision exists and "recorded" appears only after a 201. And a forged x-request-id never
// becomes the server's correlation id.
import { expect, test } from '@playwright/test';
import { decisionCount, openLive, readSeed, signIn } from './helpers';

test('a lost response is retried with the same key: one decision, recorded only after the 201', async ({ page }) => {
  const seed = readSeed();
  await openLive(page, '/portfolio');
  expect(await signIn(page)).toBe(200);
  await openLive(page, '/investigation/INV-DEMO-7', { investigation: seed.investigationId });
  const bar = page.getByTestId('session-bar');
  await expect(bar).toHaveAttribute('data-session', 'signedIn');
  const before = await decisionCount(page, seed.investigationId);

  const sent: { key: string | undefined; status: number | null }[] = [];
  let dropped = false;
  await page.route('**/api/investigations/*/decisions', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    const key = req.headers()['idempotency-key'];
    if (!dropped) {
      dropped = true;
      // The request reaches the server and commits; the browser never sees the answer.
      const res = await route.fetch();
      sent.push({ key, status: res.status() });
      return route.abort('connectionreset');
    }
    const res = await route.fetch();
    sent.push({ key, status: res.status() });
    return route.fulfill({ response: res });
  });

  const form = page.getByTestId('record-decision');
  await form.locator('#rd-decision').fill('Hold the release until the retry test passes (e2e)');
  await form.locator('#rd-rationale').fill('Recorded by the BACK-172 retry regression.');
  await form.locator('input[type="checkbox"]').first().check();
  await form.locator('button[type="submit"]').click();

  // Unknown outcome: the draft stays, nothing says recorded.
  await expect(form.getByRole('alert')).toContainText('Not confirmed');
  await expect(form.getByRole('status')).not.toContainText('Decision recorded');
  await expect(form.locator('#rd-decision')).toHaveValue(/Hold the release/);

  await form.locator('button[type="submit"]').click();
  await expect(form.getByRole('status')).toContainText('Decision recorded');

  expect(sent).toHaveLength(2);
  expect(sent[0]!.status).toBe(201); // the server did commit the first attempt
  expect(sent[1]!.status).toBe(201); // the replay answers 201 with the first decision's id
  expect(sent[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(sent[1]!.key).toBe(sent[0]!.key);
  expect(await decisionCount(page, seed.investigationId)).toBe(before + 1);
  await expect(page.getByTestId('server-decision')).toHaveCount(before + 1);
});

test('a forged x-request-id is never echoed: the server answers with its own id', async ({ page }) => {
  await openLive(page, '/portfolio');
  const forged = 'forged-correlation-id-12345';
  const seen = await page.evaluate(async (id) => {
    const r = await fetch('/api/auth/me', { headers: { 'x-request-id': id } });
    return { header: r.headers.get('x-request-id'), body: await r.text() };
  }, forged);
  expect(seen.header).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(seen.header).not.toBe(forged);
  expect(seen.body).not.toContain(forged);
});
