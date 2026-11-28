// BACK-148 decisions L and L2 (owner approval 28 Nov 2026), live build against the real BFF on a disposable Postgres: the room
// lists the case project's observations that are not part of the case (GET /api/evidence?projectId=&type=Observation), the owner
// cites one in a decision (the citation is the association), and the citation survives a reload. A grant revoked between the list
// and the submit refuses the write and records nothing; another project, an unknown project and a malformed filter look the same.
import { expect, test, type Page } from '@playwright/test';
import { apiGet, decisionCount, openLive, readSeed, signIn, unexpectedErrors } from './helpers';

const ROUTE = '/investigation/INV-DEMO-7';
const HOOK = 'http://127.0.0.1:8788'; // test-only grant hook of server/test/e2e/serve-e2e.ts

const hook = async (action: 'revoke' | 'restore') => {
  const r = await fetch(`${HOOK}/grants/${action}`, { method: 'POST' });
  expect(r.status).toBe(204);
};

type Item = { id: string; type: string; investigationId: string | null };

async function openCase(page: Page): Promise<void> {
  const seed = readSeed();
  await openLive(page, '/portfolio', { persona: 'technical' });
  expect(await signIn(page)).toBe(200);
  await openLive(page, ROUTE, { persona: 'technical', investigation: seed.investigationId });
  await expect(page.getByTestId('session-bar')).toHaveAttribute('data-session', 'signedIn');
  await expect(page.getByTestId('project-observations')).toHaveAttribute('data-state', 'ok');
}

/** The observations of the case project that have no case, as the server lists them. */
async function projectOnly(page: Page): Promise<Item[]> {
  const seed = readSeed();
  const r = await apiGet(page, `/api/evidence?projectId=${seed.projectId}&type=Observation`);
  expect(r.status).toBe(200);
  return (r.body as { items: Item[] }).items.filter((i) => i.investigationId === null);
}

test('a project observation is listed apart from the case, cited in a decision, and the citation survives a reload', async ({ page }) => {
  const seed = readSeed();
  await openCase(page);
  const outside = await projectOnly(page);
  expect(outside.length).toBeGreaterThan(0);
  const section = page.getByTestId('project-observations');
  await expect(section.getByTestId('project-observation')).toHaveCount(outside.length);
  await expect(section.getByTestId('project-observations-count')).toHaveAttribute('data-at-least', 'false');

  const form = page.getByTestId('record-decision');
  const picks = form.getByTestId('rd-project-pick');
  await expect(picks).toHaveCount(outside.length);
  const before = await decisionCount(page, seed.investigationId);
  await form.locator('#rd-decision').fill('Watch the latest main run before reverting (BACK-148)');
  await form.locator('#rd-rationale').fill('Cites a project observation that is not part of this case.');
  await picks.first().locator('input[type="checkbox"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(form.getByRole('status')).toContainText('Decision recorded');
  expect(await decisionCount(page, seed.investigationId)).toBe(before + 1);

  // The server holds the citation of the first listed project observation (the newest), which stays outside the case.
  const decisions = await apiGet(page, `/api/decisions?investigationId=${seed.investigationId}`);
  const newest = (decisions.body as { items: { decision: string; citations: string[] }[] }).items.find((d) => d.decision.includes('BACK-148'))!;
  expect(newest.citations).toEqual([outside[0]!.id]);
  const room = await apiGet(page, `/api/investigations/${seed.investigationId}`);
  expect((room.body as { evidence: Item[] }).evidence.map((e) => e.id)).not.toContain(outside[0]!.id);

  const cites = page.locator('[data-testid="server-decision-cite"][data-where="outside"]');
  await expect(cites).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('session-bar')).toHaveAttribute('data-session', 'signedIn');
  await expect(cites).toHaveCount(1);
  await expect(page.locator('[data-testid="server-decision-cite"][data-where="unresolved"]')).toHaveCount(0);
  expect(unexpectedErrors(page)).toEqual([]);
});

test('a grant revoked between the list and the submit refuses the decision and records nothing', async ({ page }) => {
  const seed = readSeed();
  await openCase(page);
  const before = await decisionCount(page, seed.investigationId);
  const form = page.getByTestId('record-decision');
  await form.locator('#rd-decision').fill('Should not be recorded (BACK-148 revoke)');
  await form.locator('#rd-rationale').fill('The grant is revoked before this is sent.');
  await form.getByTestId('rd-project-pick').first().locator('input[type="checkbox"]').check();
  try {
    await hook('revoke');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('alert')).toBeVisible();
    await expect(form.getByRole('status')).not.toContainText('Decision recorded');
  } finally {
    await hook('restore');
  }
  expect(await decisionCount(page, seed.investigationId)).toBe(before);
});

test('another project, an unknown project and a malformed filter look the same: an empty list, never a refusal that tells them apart', async ({ page }) => {
  const seed = readSeed();
  await openCase(page);
  const unknown = '00000000-0000-4000-8000-000000000000';
  for (const q of [`projectId=${seed.foreign.projectId}&type=Observation`, `projectId=${unknown}&type=Observation`, `projectId=${seed.projectId}&type=observation`, `projectId=${seed.projectId}&type=Observation&type=Correlation`]) {
    const r = await apiGet(page, `/api/evidence?${q}`);
    expect({ q, status: r.status, body: r.body }).toEqual({ q, status: 200, body: { items: [] } });
  }
  expect((await apiGet(page, `/api/evidence/${unknown}`)).status).toBe(404);
  await expect(page.locator('body')).not.toContainText(seed.foreign.projectName);
});
