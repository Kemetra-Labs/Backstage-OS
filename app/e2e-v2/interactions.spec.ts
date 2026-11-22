// V2 interactions: the map, the observatory, the replay clock and the deck behave as the review brief describes.
import { expect, test } from '@playwright/test';
import { load } from './helpers';

test.describe('Mission Map', () => {
  test('selecting a node updates the inspector, the URL and the neighbourhood', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    await expect(page.locator('.kv2-insp-head h2')).toContainText('Retail Tower OS');
    await page.locator('[data-node="stock-sync"]').click();
    await expect(page.locator('.kv2-insp-head h2')).toContainText('stock-sync');
    await expect(page).toHaveURL(/node=stock-sync/);
    await expect(page.locator('[data-node="stock-sync"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#hood')).toContainText('Depends on');
  });

  test('the Risks filter keeps exactly the three risks lit and dims the rest', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    await page.getByRole('button', { name: 'Risks' }).click();
    const lit = await page.locator('.kv2-node:not([data-dim])').evaluateAll((els) => els.map((e) => e.getAttribute('data-node')).sort());
    expect(lit).toEqual(['port', 'sentry', 'stock-sync']);
    await page.getByRole('button', { name: 'Products' }).click();
    expect(await page.locator('.kv2-node:not([data-dim])').count()).toBe(2);
  });

  test('zoom buttons, reset and Ctrl+wheel move the constellation; panning drags it', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    const left = () => page.locator('[data-node="github"]').evaluate((e) => (e as HTMLElement).style.left);
    const home = await left();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const zoomed = await left();
    expect(zoomed).not.toBe(home);
    await page.getByRole('button', { name: 'Reset view' }).click();
    expect(await left()).toBe(home);
    const box = (await page.getByTestId('constellation').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    expect(await left()).not.toBe(home);
    await page.getByRole('button', { name: 'Reset view' }).click();
    await page.mouse.move(box.x + 40, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 160, { steps: 5 });
    await page.mouse.up();
    expect(await left()).not.toBe(home);
  });

  test('arrow keys move focus between nodes and +/- zoom from the keyboard', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    await page.locator('[data-node="retail-tower"]').focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-node="stock-sync"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.kv2-insp-head h2')).toContainText('stock-sync');
    const before = await page.locator('[data-node="github"]').evaluate((e) => (e as HTMLElement).style.left);
    await page.keyboard.press('+');
    expect(await page.locator('[data-node="github"]').evaluate((e) => (e as HTMLElement).style.left)).not.toBe(before);
  });

  test('the list view is a real table with the same systems and links, and is selectable', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Systems on the map' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Systems on the map' }).locator('tbody tr')).toHaveCount(10);
    await expect(page.getByRole('table', { name: 'Links between systems' }).locator('tbody tr')).toHaveCount(10); // Owner: 11 links minus d4 (BACK-30)
    await expect(page.getByRole('table', { name: 'Links between systems' })).toContainText('No evidence for this link');
    await page.getByRole('table', { name: 'Systems on the map' }).getByRole('button', { name: 'Jira' }).click();
    await expect(page.locator('.kv2-insp-head h2')).toContainText('Jira');
  });

  test('the scope select re-centres the map and the sidebar scope list stays in step', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    await page.getByLabel('Scope').first().selectOption('khepri');
    await expect(page.locator('[data-node="github"]')).toHaveAttribute('data-dim', 'true');
    await expect(page.locator('[data-node="khepri"]')).not.toHaveAttribute('data-dim', 'true');
    await page.locator('.kv2-side-group button', { hasText: 'Seshat BI' }).click();
    await expect(page.locator('.kv2-select select')).toHaveValue('seshat-bi');
  });

  test('drill-down opens the replay and the source observatory', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    await page.getByRole('button', { name: 'Open the investigation replay' }).click();
    await expect(page.locator('h1')).toContainText('Mission Replay');
    await page.goBack();
    await page.locator('[data-node="sentry"]').click();
    await page.getByRole('button', { name: 'Open in Source Observatory' }).click();
    await expect(page.locator('h1')).toContainText('Source Observatory');
    await expect(page.locator('.kv2-scard[data-provider="sentry"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('every link on the map says how we know it, and unknown links are dashed', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    const unknown = await page.locator('.kv2-edge[data-cls="dep"][data-truth="unknown"] path').first().evaluate((e) => getComputedStyle(e).strokeDasharray);
    expect(unknown).not.toBe('none');
    await expect(page.locator('.kv2-legend li')).toHaveCount(4);
  });
});

test.describe('Source Observatory', () => {
  test('selecting a card updates the inspector; Table shows the same six sources', async ({ page }) => {
    await load(page, { screen: 'source-observatory' });
    await page.locator('.kv2-scard[data-provider="jira"]').click();
    await expect(page.locator('.kv2-insp-head h2')).toContainText('Jira');
    await expect(page).toHaveURL(/src=jira/);
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(6);
    await page.getByRole('button', { name: 'Integrations' }).first().click();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(4);
  });

  test('the inspector shows last read, provenance and keeps the three readings separate', async ({ page }) => {
    await load(page, { screen: 'source-observatory', extra: 'src=port' });
    const panel = page.locator('#obsinsp-panel');
    await expect(panel).toContainText('Offline');
    await expect(panel).toContainText('stale');
    await expect(panel).toContainText('Health unknown');
    await expect(panel).toContainText('25 h ago');
    await page.getByRole('tab', { name: 'Provenance' }).click();
    await expect(panel).toContainText('Port API');
    await page.locator('.kv2-scard[data-provider="datadog"]').click();
    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(panel).toContainText('Never read');
  });

  test('timeline filters narrow the events and selecting an event selects its source', async ({ page }) => {
    await load(page, { screen: 'source-observatory' });
    await expect(page.locator('.kv2-tl li')).toHaveCount(6);
    await page.getByRole('button', { name: /^Incidents/ }).click();
    await expect(page.locator('.kv2-tl li')).toHaveCount(1);
    await page.getByRole('button', { name: /^Target health/ }).click();
    await expect(page.getByText('No events of this kind in the window.')).toBeVisible();
    await page.getByRole('button', { name: /^All events/ }).click();
    await page.locator('.kv2-tl-card', { hasText: 'Port' }).click();
    await expect(page.locator('.kv2-insp-head h2')).toContainText('Port');
  });
});

test.describe('Mission Replay', () => {
  test('the scrubber, stage buttons, previous and next move the cursor and the facts', async ({ page }) => {
    await load(page, { screen: 'mission-replay', extra: 'evt=R-1' });
    await expect(page.locator('.kv2-pos')).toContainText('Event 1 of 7');
    await expect(page.locator('.kv2-gap-mark')).toHaveCount(0);
    await expect(page.locator('[data-testid="proposal"]')).toContainText('Not drafted yet');
    await page.getByRole('button', { name: 'Next event' }).click();
    await expect(page.locator('.kv2-pos')).toContainText('Event 2 of 7');
    await page.locator('.kv2-stage[aria-current]').count();
    await page.locator('.kv2-stages li[data-stage="correlated"] .kv2-stage').click();
    await expect(page.locator('.kv2-pos')).toContainText('Event 4 of 7');
    await page.getByRole('button', { name: 'Next event' }).click();
    await expect(page.locator('.kv2-gap-mark')).toBeVisible();
    await page.locator('.kv2-range').focus();
    await page.keyboard.press('End');
    await expect(page.locator('.kv2-pos')).toContainText('Event 7 of 7');
    await expect(page.locator('[data-testid="proposal"]')).toContainText('Hold');
    await page.keyboard.press('Home');
    await expect(page.locator('.kv2-pos')).toContainText('Event 1 of 7');
    await expect(page.getByRole('button', { name: 'Previous event' })).toBeDisabled();
  });

  test('play runs a deterministic virtual clock: one event per 1.5 s, 4x is four times faster, and it stops at the end', async ({ page }) => {
    await page.clock.install();
    await load(page, { screen: 'mission-replay', extra: 'evt=R-1' });
    const pos = page.locator('.kv2-pos');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.clock.runFor(1600);
    await expect(pos).toContainText('Event 2 of 7');
    await page.clock.runFor(1500);
    await expect(pos).toContainText('Event 3 of 7');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.clock.runFor(5000);
    await expect(pos).toContainText('Event 3 of 7');
    await page.getByRole('radio', { name: '4x' }).or(page.getByRole('button', { name: '4x' })).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.clock.runFor(1600);
    await expect(pos).toContainText('Event 7 of 7');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="proposal"]')).toContainText('Hold');
  });

  test('Replay restarts from the first event and plays', async ({ page }) => {
    await page.clock.install();
    await load(page, { screen: 'mission-replay' });
    await page.getByRole('button', { name: 'Replay', exact: true }).click();
    await expect(page.locator('.kv2-pos')).toContainText('Event 1 of 7');
    await page.clock.runFor(1600);
    await expect(page.locator('.kv2-pos')).toContainText('Event 2 of 7');
  });

  test('playback starts and runs nothing: no request, no storage, no write', async ({ page }) => {
    await page.clock.install();
    const probe = await load(page, { screen: 'mission-replay', extra: 'evt=R-1' });
    const before = probe.requests.length;
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.clock.runFor(12000);
    expect(probe.requests.length).toBe(before);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('the story, hypotheses, evidence gaps and milestones follow the cursor', async ({ page }) => {
    await load(page, { screen: 'mission-replay', persona: 'technical', extra: 'evt=R-1' });
    await expect(page.locator('.kv2-milestones li[data-state="done"]')).toHaveCount(1);
    await page.getByRole('tab', { name: /Hypotheses/ }).click();
    await expect(page.getByText('No hypothesis yet.')).toBeVisible();
    await page.locator('.kv2-events li').nth(5).locator('button').click();
    await expect(page.locator('.kv2-pos')).toContainText('Event 6 of 7');
    await expect(page.locator('.kv2-hyps li')).toHaveCount(2);
    await expect(page.locator('.kv2-forag')).toBeVisible();
    await page.getByRole('tab', { name: /Evidence gaps/ }).click();
    await expect(page.locator('#rphold-panel')).toContainText('Runtime telemetry');
    await expect(page.locator('#rphold-panel')).toContainText('Catalog owner');
    await expect(page.locator('.kv2-milestones li[data-state="progress"]')).toHaveCount(1);
    await expect(page.locator('.kv2-milestones li[data-state="todo"]')).toHaveCount(2);
  });

  test('the only action on the screen is copying the proposal text, and it never claims a decision', async ({ page }) => {
    await load(page, { screen: 'mission-replay', extra: 'evt=R-7' });
    await expect(page.getByRole('button', { name: 'Copy proposal text' })).toBeVisible();
    await expect(page.getByTestId('proposal')).toContainText('Display only');
    await expect(page.getByTestId('proposal')).toContainText('Proposed');
  });

  test('inspector tabs show evidence, context and history', async ({ page }) => {
    await load(page, { screen: 'mission-replay', persona: 'technical', extra: 'evt=R-4' });
    await page.getByRole('tab', { name: 'Context' }).click();
    await expect(page.locator('#rpinsp-panel')).toContainText('Retail Tower OS');
    await expect(page.locator('#rpinsp-panel')).toContainText('Unknown');
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.locator('.kv2-hist li')).toHaveCount(4);
  });
});

test.describe('Agent Flight Deck', () => {
  test('is labelled simulated and has no approval, execution or write control', async ({ page }) => {
    await load(page, { screen: 'agent-flight-deck' });
    await expect(page.locator('.kv2-sim')).toContainText('Simulated');
    await expect(page.getByRole('button', { name: /approve|reject|execute|deploy|merge|write|apply|send|submit|confirm/i })).toHaveCount(0);
    await expect(page.getByTestId('deck-proposal')).toContainText('Proposed, nothing executes');
  });

  test('filters narrow the activity table and the count line follows', async ({ page }) => {
    await load(page, { screen: 'agent-flight-deck' });
    await expect(page.locator('.kv2-missions tbody tr')).toHaveCount(5);
    await page.locator('label.kv2-select', { hasText: 'Status' }).locator('select').selectOption('waiting_review');
    await expect(page.locator('.kv2-missions tbody tr')).toHaveCount(1);
    await expect(page.locator('.kv2-foot')).toContainText('Showing 1 of 5');
    await page.locator('label.kv2-select', { hasText: 'Status' }).locator('select').selectOption('idle');
    await expect(page.getByText('No mission matches these filters.')).toBeVisible();
    await page.locator('label.kv2-select', { hasText: 'Status' }).locator('select').selectOption('all');
    await page.getByRole('button', { name: /^Sensing/ }).click();
    await expect(page.locator('.kv2-missions tbody tr')).toHaveCount(2);
    await page.locator('label.kv2-select', { hasText: 'Agent' }).locator('select').selectOption('AG-1');
    await expect(page.locator('.kv2-missions tbody tr')).toHaveCount(1);
  });

  test('selecting a mission shows its detail, evidence and whether it proposes anything', async ({ page }) => {
    await load(page, { screen: 'agent-flight-deck', persona: 'technical' });
    await expect(page.locator('#mission')).toContainText('Draft a proposed next step');
    await expect(page.getByTestId('deck-proposal')).toContainText('Hold');
    await page.locator('.kv2-missions').getByRole('button', { name: /Test the likely cause/ }).click();
    await expect(page.locator('#mission')).toContainText('MSN-DEMO-4');
    await expect(page.getByTestId('deck-proposal')).toContainText('This mission proposes no action.');
    await expect(page).toHaveURL(/msn=MSN-DEMO-4/);
  });

  test('counts come from the missions and the jump buttons move to their section', async ({ page }) => {
    await load(page, { screen: 'agent-flight-deck' });
    await expect(page.getByTestId('active-missions')).toHaveText('5');
    await expect(page.locator('#kpi-review')).toContainText('1');
    await page.getByRole('button', { name: 'Capabilities' }).click();
    await expect(page.locator('#caps-h')).toBeFocused();
    await page.getByRole('button', { name: 'Open the audit trail' }).click();
    await expect(page.locator('h1')).toContainText('Mission Replay');
  });

  test('capabilities state their limits in words, never as scores', async ({ page }) => {
    await load(page, { screen: 'agent-flight-deck' });
    const caps = page.locator('#caps');
    await expect(caps).toContainText('3 of 6 sources readable');
    await expect(caps).toContainText('No write path to any source exists');
    await expect(caps).toContainText('no calibrated score');
  });
});

test.describe('review regressions', () => {
  test('a ?lang= seed cannot override a later switch back to English', async ({ page }) => {
    await page.goto('/v2.html?lang=ar#/mission-map');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await page.locator('.kv2-top-controls').getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('link', { name: 'Source Observatory' }).click();
    await expect(page.locator('h1')).toContainText('Source Observatory');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('searching for a replay event moves the replay cursor, not just the URL', async ({ page }) => {
    await load(page, { screen: 'mission-replay', extra: 'evt=R-6' });
    await expect(page.locator('.kv2-pos')).toContainText('Event 6 of 7');
    const box = page.getByRole('combobox', { name: 'Search' });
    await box.fill('R-3');
    await box.press('Enter');
    await expect(page.locator('.kv2-pos')).toContainText('Event 3 of 7');
    await expect(page).toHaveURL(/evt=R-3/);
  });

  test('a stale-backed link is flagged for Technical, and Owner is given neither the link nor a note that it exists (BACK-30)', async ({ page }) => {
    await load(page, { screen: 'mission-map' });
    await expect(page.locator('.kv2-edge[data-cls="dep"][data-stale]')).toHaveCount(0);
    await load(page, { screen: 'mission-map', persona: 'technical' });
    await expect(page.locator('.kv2-edge[data-cls="dep"][data-stale]')).toHaveCount(1);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const links = page.getByRole('table', { name: 'Links between systems' });
    await expect(links).toContainText('Inventory errors were reported in Sentry');
    await load(page, { screen: 'mission-map', persona: 'owner' }); // same page, so the list view stays selected
    await expect(links).toBeVisible(); // without this the two negative checks below would pass if the table had gone away
    await expect(links).not.toContainText('restricted to Technical');
    await expect(links).not.toContainText('Inventory errors were reported in Sentry');
  });

  test('at 375px the closed side navigation is not focusable, and Escape closes it', async ({ page }) => {
    await load(page, { screen: 'mission-map', width: 375, height: 800 });
    await expect(page.locator('#kv2-side')).toHaveCSS('visibility', 'hidden');
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.click();
    await expect(page.locator('#kv2-side')).toHaveCSS('visibility', 'visible');
    await page.keyboard.press('Escape');
    await expect(page.locator('#kv2-side')).toHaveAttribute('data-open', 'false');
    await expect(menu).toBeFocused();
    await expect(page.locator('#kv2-side')).toHaveCSS('visibility', 'hidden');
  });
});
