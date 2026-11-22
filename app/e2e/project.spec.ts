import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { BANNED, LANGS, openRoute, PERSONAS, WIDTHS, type LoadQuery } from './helpers';

const ROUTES = ['/project/RT', '/project/RT/stock-sync', '/project/RT/inventory', '/project/KH/khepri-api', '/project/SB'] as const;
/** Retail Tower edges declared in the catalog; their record (E-7) was never read, so they show as Provisional. */
const CATALOG_EDGES = ['pos->api-gateway', 'api-gateway->stock-sync', 'api-gateway->payments', 'stock-sync->inventory'] as const;

interface Q extends LoadQuery { route?: string }

const load = (page: Page, q: Q = {}) => openRoute(page, q.route ?? '/project/RT', q);

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const hashOf = (page: Page) => page.evaluate(() => window.location.hash);

// ---- layout ---------------------------------------------------------------------------------------------------
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    for (const route of ['/project/RT/stock-sync', '/project/SB'] as const) {
      test(`layout ${lang} @${width}px ${route}: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
        const errors = await load(page, { lang, width, route, persona: 'technical' });
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await expect(page.locator('h1')).toHaveCount(1);
        const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
        levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
        expect(errors).toEqual([]);
      });
    }
  }
}

test('h1 carries the screen title and the product name in English', async ({ page }) => {
  await load(page, { route: '/project/RT' });
  await expect(page.locator('h1')).toHaveText('Project Intelligence: Retail Tower OS');
});

// ---- controls, redaction, isolation ---------------------------------------------------------------------------
for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`controls ${lang}/${persona}: no forbidden action verbs on any route`, async ({ page }) => {
      for (const route of ROUTES) {
        await load(page, { lang, persona, route });
        const labels = await page.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
        expect(labels.length).toBeGreaterThan(5);
        for (const l of labels) expect(isForbiddenControlLabel(l), `${route}: ${l}`).toBe(false);
      }
    });
  }
}

for (const lang of LANGS) {
  for (const persona of ['owner', 'nontechnical'] as const) {
    test(`redaction ${lang}/${persona}: no job names, run ids, PR ids or links on any route or view`, async ({ page }) => {
      for (const route of ROUTES) {
        await load(page, { lang, persona, route });
        // textContent also covers the collapsed table; the toggle is checked in table view too.
        const text = async () => (await page.evaluate(() => document.body.textContent)) ?? '';
        for (const b of BANNED) expect((await text()).includes(b), `${persona}/${lang}${route}: ${b}`).toBe(false);
        const table = page.locator('.proj-controls .seg button').last();
        if (route !== '/project/SB' && (await page.locator('[data-testid="dep-graph"]').count()) > 0) {
          await table.click();
          for (const b of BANNED) expect((await text()).includes(b), `${persona}/${lang}${route} table: ${b}`).toBe(false);
        }
      }
    });
  }
}

test('technical sees job names, run ids and component ids that Owner does not', async ({ page }) => {
  await load(page, { persona: 'technical', route: '/project/RT/stock-sync' });
  const delivery = page.getByTestId('delivery-panel');
  await expect(delivery).toContainText('integration-tests (stock-sync)');
  await expect(delivery).toContainText('#DEMO-4471');
  await expect(page.getByTestId('selected-panel')).toContainText('Component id');
  await expect(page.getByTestId('selected-panel')).toContainText('integration-tests');

  await load(page, { persona: 'owner', route: '/project/RT/stock-sync' });
  await expect(page.getByTestId('delivery-panel')).not.toContainText('integration-tests');
  await expect(page.getByTestId('delivery-panel')).toContainText('Automated check');
  await expect(page.getByTestId('selected-panel')).not.toContainText('Component id');
  // Component names are fine for everyone.
  await expect(page.getByTestId('selected-panel')).toContainText('stock-sync');
});

for (const persona of PERSONAS) {
  test(`arabic/${persona}: no Latin run outside a left-to-right isolate`, async ({ page }) => {
    const offenders = () => page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent ?? '';
        const el = n.parentElement;
        if (!el || !/[A-Za-z]/.test(t) || el.closest('script,style')) continue;
        if (!el.closest('[dir="ltr"], [lang="en"]')) out.push(t.trim());
      }
      return out;
    });
    for (const route of ROUTES) {
      await load(page, { lang: 'ar', persona, route });
      expect(await offenders(), route).toEqual([]);
      if (route !== '/project/SB') {
        await page.locator('.proj-controls .seg button').last().click();
        expect(await offenders(), `${route} table`).toEqual([]);
      }
    }
  });
}

test('arabic: the map keeps left-to-right topology and ids are isolated', async ({ page }) => {
  await load(page, { lang: 'ar', persona: 'technical', route: '/project/RT/stock-sync', width: 1440 });
  const dir = await page.getByTestId('dep-graph').evaluate((el) => getComputedStyle(el).direction);
  expect(dir).toBe('ltr');
  // Source nodes sit left of their targets even though the page is right to left.
  const x = async (id: string) => (await page.locator(`[data-node="${id}"]`).boundingBox())!.x;
  expect(await x('pos')).toBeLessThan(await x('api-gateway'));
  expect(await x('api-gateway')).toBeLessThan(await x('stock-sync'));
  expect(await x('stock-sync')).toBeLessThan(await x('inventory'));
  const isolated = await page.locator('bdi[dir="ltr"]').allTextContents();
  for (const token of ['Retail Tower OS', 'stock-sync', 'INV-DEMO-7']) {
    expect(isolated.some((t) => t.includes(token)), token).toBe(true);
  }
  const arabicIndic = await page.evaluate(() => /[٠-٩۰-۹]/.test(document.body.innerText));
  expect(arabicIndic).toBe(false);
});

// ---- truth and state --------------------------------------------------------------------------------------------
for (const persona of PERSONAS) {
  test(`RT ${persona}: six map nodes, api-gateway is the only healthy one, inventory reads unknown, payments ${persona === 'technical' ? 'degraded' : 'unknown (its only basis is withheld)'}`, async ({ page }) => {
    await load(page, { persona, route: '/project/RT' });
    await expect(page.locator('[data-testid="dep-graph"] [data-node]')).toHaveCount(6);
    for (const id of ['pos', 'api-gateway', 'stock-sync', 'payments', 'inventory', 'reporting']) {
      await expect(page.locator(`[data-node="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('main [data-health="healthy"]')).toHaveCount(1);
    await expect(page.locator('[data-node="api-gateway"] [data-health="healthy"]')).toBeVisible();
    // Claimed healthy, last read stale: the contract says unknown.
    await expect(page.locator('[data-node="inventory"] [data-health="unknown"]')).toBeVisible();
    await expect(page.locator('[data-node="inventory"]')).not.toContainText(/^Healthy$/);
    // payments rests only on E-12 (Technical-only): degraded for Technical, unknown, never healthy, for the others.
    await expect(page.locator(`[data-node="payments"] [data-health="${persona === 'technical' ? 'degraded' : 'unknown'}"]`)).toBeVisible();
    await expect(page.locator('[data-node="payments"] [data-health="healthy"]')).toHaveCount(0);
    for (const id of ['pos', 'stock-sync', 'reporting']) await expect(page.locator(`[data-node="${id}"] [data-health="unknown"]`)).toBeVisible();
  });
}

test('unselected panel shows a hint to pick a component', async ({ page }) => {
  await load(page, { route: '/project/RT' });
  await expect(page.getByTestId('selected-hint')).toBeVisible();
  await expect(page.locator('[data-node][aria-pressed="true"]')).toHaveCount(0);
});

test('clicking stock-sync puts it in the URL and shows Open case linking to INV-DEMO-7', async ({ page }) => {
  await load(page, { route: '/project/RT' });
  await page.locator('[data-node="stock-sync"]').click();
  await expect(page).toHaveURL(/#\/project\/RT\/stock-sync$/);
  await expect(page.locator('[data-node="stock-sync"]')).toHaveAttribute('aria-pressed', 'true');
  const open = page.getByRole('link', { name: /Open case/ });
  await expect(open).toHaveAttribute('href', '#/investigation/INV-DEMO-7');
  await expect(open).toContainText('INV-DEMO-7');
  await expect(page.getByTestId('ci-failing')).toHaveText('CI check failing');
  await expect(page.locator('h1')).toHaveText('Project Intelligence: Retail Tower OS');
  // Clicking the selected node again clears the selection.
  await page.locator('[data-node="stock-sync"]').click();
  await expect(page).toHaveURL(/#\/project\/RT$/);
  await expect(page.getByTestId('selected-hint')).toBeVisible();
});

test('a component opened by URL is selected, with breadcrumbs to the product and portfolio', async ({ page }) => {
  await load(page, { route: '/project/RT/stock-sync' });
  await expect(page.locator('[data-node="stock-sync"]')).toHaveAttribute('aria-pressed', 'true');
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('href', '#/portfolio');
  await expect(crumbs.getByRole('link', { name: 'Retail Tower OS' })).toHaveAttribute('href', '#/project/RT');
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText('stock-sync');
  await crumbs.getByRole('link', { name: 'Retail Tower OS' }).click();
  await expect(page).toHaveURL(/#\/project\/RT$/);
});

test('selected component shows linked evidence with truth labels, and unread evidence as not read', async ({ page }) => {
  await load(page, { persona: 'technical', route: '/project/RT/stock-sync' });
  const sel = page.getByTestId('selected-panel');
  await expect(sel.locator('[data-evidence="E-1"] [data-truth="observed"]')).toBeVisible();
  await expect(sel.locator('[data-evidence="E-3"] [data-truth="correlated"]')).toBeVisible();
  await expect(sel.locator('[data-evidence="E-6"] [data-truth="unknown"]')).toBeVisible();
  await expect(sel.locator('[data-evidence="E-6"]')).toContainText('Not read: source not set up');
  await expect(sel.locator('[data-attention="ATT-RT-1"]')).toBeVisible();
  const inspect = sel.getByRole('link', { name: /Inspect evidence/ }).first();
  await expect(inspect).toHaveAttribute('href', /^#\/evidence\/E-\d/);
});

test('restricted evidence is absent for Owner and Nontechnical and shown in full to Technical', async ({ page }) => {
  for (const persona of ['owner', 'nontechnical'] as const) {
    await load(page, { persona, route: '/project/RT/inventory' });
    await expect(page.locator('[data-evidence="E-5"]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Restricted to Technical');
    await expect(page.locator('main')).not.toContainText('E-5');
    await expect(page.locator('[data-node], [data-health]').first()).toBeVisible();
  }
  await load(page, { persona: 'technical', route: '/project/RT/inventory' });
  await expect(page.locator('[data-evidence="E-5"] [data-truth="observed"]')).toBeVisible();
  await expect(page.locator('[data-evidence="E-5"]')).toContainText('stale');
});

test('nontechnical sees plain labels and plain field names', async ({ page }) => {
  await load(page, { persona: 'nontechnical', route: '/project/RT/stock-sync' });
  await expect(page.locator('[data-evidence="E-1"] [data-truth="observed"]')).toHaveText('Confirmed');
  await expect(page.locator('[data-evidence="E-3"] [data-truth="correlated"]')).toHaveText('Linked');
  await expect(page.getByTestId('selected-panel')).toContainText('Where it runs');
  await expect(page.getByTestId('ci-failing')).toHaveText('An automatic check is failing');
});

test('table view lists every edge and every component, and components are links', async ({ page }) => {
  await load(page, { route: '/project/RT' });
  await expect(page.getByTestId('table-view')).toHaveCount(0);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.getByTestId('table-view')).toBeVisible();
  await expect(page.getByTestId('dep-graph')).toHaveCount(0);
  const edges = ['pos->api-gateway', 'api-gateway->stock-sync', 'api-gateway->payments', 'stock-sync->inventory', 'payments->inventory', 'inventory->reporting'];
  await expect(page.locator('[data-testid="dep-table"] tbody tr')).toHaveCount(edges.length);
  for (const e of edges) await expect(page.locator(`[data-edge="${e}"]`)).toHaveCount(1);
  await expect(page.locator('.proj-list [data-component]')).toHaveCount(6);
  await expect(page.locator('[data-edge="payments->inventory"]')).toContainText('Suspected');
  await expect(page.locator('[data-edge="inventory->reporting"]')).toContainText('Provisional');
  // Catalog-declared edges whose catalog record (E-7) was never read are not shown as Declared.
  for (const e of CATALOG_EDGES) await expect(page.locator(`[data-edge="${e}"]`)).toContainText('Provisional');
  await page.locator('[data-component="stock-sync"] a').click();
  await expect(page).toHaveURL(/#\/project\/RT\/stock-sync$/);
  await expect(page.locator('[data-component="stock-sync"] a')).toHaveAttribute('aria-current', 'true');
  // Back to the map: the table is still offered as a disclosure.
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.getByTestId('dep-graph')).toBeVisible();
  await expect(page.locator('details.proj-details summary')).toBeVisible();
});

test('narrow screens show the table instead of the map, with no view toggle', async ({ page }) => {
  await load(page, { width: 375, route: '/project/RT' });
  await expect(page.getByTestId('table-view')).toBeVisible();
  await expect(page.getByTestId('dep-graph')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-testid="dep-table"] tbody tr')).toHaveCount(6);
});

test('filters: environment and layer narrow the map; filtering to nothing says so and can be cleared', async ({ page }) => {
  await load(page, { route: '/project/RT', persona: 'technical' });
  const env = page.getByRole('group', { name: 'Environment' });
  const layer = page.getByRole('group', { name: 'Layer' });
  await expect(env.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  await env.getByRole('button', { name: 'Staging' }).click();
  await expect(page.locator('[data-testid="dep-graph"] [data-node]')).toHaveCount(2);
  await expect(page.locator('[data-node="inventory"]')).toBeVisible();
  await expect(page.locator('[data-node="payments"]')).toBeVisible();
  await env.getByRole('button', { name: 'All' }).click();
  await layer.getByRole('button', { name: 'Service' }).click();
  await expect(page.locator('[data-testid="dep-graph"] [data-node]')).toHaveCount(2);
  await env.getByRole('button', { name: 'Production' }).click();
  await layer.getByRole('button', { name: 'Data' }).click();
  await expect(page.getByTestId('map-panel').locator('[data-state="empty"]')).toBeVisible();
  await expect(page.locator('[data-node]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-testid="dep-graph"] [data-node]')).toHaveCount(6);
  // Risks are product-wide: filters never hide them.
  await env.getByRole('button', { name: 'Staging' }).click();
  await expect(page.locator('[data-risk-component]')).toHaveCount(4);
  // Owner: payments rests only on withheld evidence, so it is one more unknown (5), still product-wide.
  await load(page, { route: '/project/RT', persona: 'owner' });
  await page.getByRole('group', { name: 'Environment' }).getByRole('button', { name: 'Staging' }).click();
  await expect(page.locator('[data-risk-component]')).toHaveCount(5);
});

test('sources: provider, connectivity, freshness and age in words; not set up and unavailable say so', async ({ page }) => {
  await load(page, { route: '/project/RT' });
  const panel = page.getByTestId('status-panel');
  for (const p of ['github', 'jira', 'sentry', 'datadog', 'port']) await expect(panel.locator(`[data-provider="${p}"]`)).toBeVisible();
  await expect(panel.locator('[data-provider="datadog"]')).toContainText('not set up');
  await expect(panel.locator('[data-provider="datadog"] [data-dim="freshness"]')).toHaveCount(0);
  await expect(panel.locator('[data-provider="port"]')).toContainText('unavailable');
  await expect(panel.locator('[data-provider="port"]')).toContainText('stale');
  await expect(panel.locator('[data-provider="sentry"]')).toContainText('stale · 9 h ago');
  await expect(panel.locator('[data-provider="github"]')).toContainText('current · 6 min ago');
  await expect(panel.locator('[data-dim="health"] [data-health="unknown"]')).toBeVisible();
});

test('CI and delivery evidence: status in words with a resolved truth label; a not-read item says not read', async ({ page }) => {
  await load(page, { persona: 'technical', route: '/project/RT' });
  const failing = page.locator('[data-delivery="DLV-RT-1"]');
  await expect(failing).toContainText('Failing');
  await expect(failing.locator('[data-truth="observed"]')).toBeVisible();
  await expect(page.locator('[data-delivery="DLV-RT-3"] [data-truth="correlated"]')).toBeVisible();
  await expect(page.locator('[data-delivery="DLV-RT-4"]')).toContainText('Planned');

  await load(page, { persona: 'owner', route: '/project/KH' });
  const unread = page.locator('[data-delivery="DLV-KH-2"]');
  await expect(unread).toContainText('Status unknown');
  await expect(unread).toContainText('Not read: source unavailable');
  await expect(unread.locator('[data-truth="unknown"]')).toBeVisible();
});

test('top-bar source strip names the product its sources belong to, in both languages', async ({ page }) => {
  // On a Khepri page, so the label is what tells the reader these chips are not Khepri's.
  await load(page, { route: '/project/KH/khepri-api' });
  await expect(page.locator('#topbar-sources-label')).toHaveText('Sources for Retail Tower OS');
  await expect(page.locator('.topbar .sources')).toHaveAttribute('aria-labelledby', 'topbar-sources-label');
  await load(page, { lang: 'ar', route: '/project/KH/khepri-api' });
  await expect(page.locator('#topbar-sources-label')).toHaveText('مصادر Retail Tower OS');
  await expect(page.locator('#topbar-sources-label bdi')).toHaveText('Retail Tower OS');
});

test('risks and unknowns: unknown components with reasons, unconfirmed links and sources not current; never green', async ({ page }) => {
  await load(page, { route: '/project/RT', persona: 'technical' });
  const risks = page.getByTestId('risks-panel');
  await expect(risks.locator('[data-risk-component]')).toHaveCount(4);
  await expect(risks.locator('[data-risk-component="inventory"]')).toHaveAttribute('data-reason', 'stale');
  await expect(risks.locator('[data-risk-component="pos"]')).toHaveAttribute('data-reason', 'not_set_up');
  await expect(risks.locator('[data-risk-component="stock-sync"]')).toContainText('Health unknown');
  await expect(risks.locator('[data-risk-component="payments"]')).toHaveCount(0);
  await expect(risks.locator('[data-risk-component="api-gateway"]')).toHaveCount(0);
  await expect(risks.locator('[data-risk-edge="payments->inventory"]')).toContainText('Suspected');
  await expect(risks.locator('[data-risk-edge="inventory->reporting"]')).toContainText('Provisional');
  for (const e of CATALOG_EDGES) await expect(risks.locator(`[data-risk-edge="${e}"]`)).toContainText('Provisional');
  for (const p of ['datadog', 'port', 'sentry']) await expect(risks.locator(`[data-risk-source="${p}"]`)).toBeVisible();
  await expect(risks.locator('[data-health="healthy"]')).toHaveCount(0);
  await expect(risks.getByRole('link', { name: 'inventory' })).toHaveAttribute('href', '#/project/RT/inventory');
});

test('risks and unknowns for Owner and Nontechnical: payments is an unknown with no evidence read, and names no withheld record', async ({ page }) => {
  for (const persona of ['owner', 'nontechnical'] as const) {
    await load(page, { route: '/project/RT', persona });
    const risks = page.getByTestId('risks-panel');
    await expect(risks.locator('[data-risk-component]')).toHaveCount(5);
    await expect(risks.locator('[data-risk-component="payments"]')).toContainText('Health unknown');
    await expect(risks.locator('[data-risk-component="payments"]')).not.toHaveAttribute('data-reason', 'stale');
    await expect(risks.locator('[data-health="healthy"]')).toHaveCount(0);
    await expect(risks).not.toContainText('E-12');
  }
});

test('Seshat-BI: empty map, sources not set up, links back, nothing shown as healthy', async ({ page }) => {
  await load(page, { route: '/project/SB' });
  await expect(page.getByTestId('map-empty').locator('[data-state="empty"]')).toBeVisible();
  await expect(page.getByTestId('status-panel').locator('[data-state="not_configured"]')).toBeVisible();
  await expect(page.getByTestId('map-empty').getByRole('link', { name: 'Open Portfolio' })).toHaveAttribute('href', '#/portfolio');
  await expect(page.locator('[data-node]')).toHaveCount(0);
  await expect(page.locator('main [data-health="healthy"]')).toHaveCount(0);
  await expect(page.getByTestId('status-panel').locator('[data-provider="github"]')).toContainText('not set up');
  await expect(page.getByTestId('risks-panel')).toContainText('No components are mapped');
  await expect(page.getByTestId('delivery-panel')).toContainText('No delivery items');
  await expect(page.locator('.proj-controls')).toHaveCount(0);
});

test('Khepri: the conflicting-signal component is degraded while CI is green, and links to INV-DEMO-9', async ({ page }) => {
  await load(page, { route: '/project/KH/khepri-api' });
  await expect(page.locator('[data-node="khepri-api"] [data-health="degraded"]')).toBeVisible();
  await expect(page.locator('[data-node="khepri-web"] [data-health="healthy"]')).toBeVisible();
  await expect(page.locator('[data-node="khepri-worker"] [data-health="unknown"]')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open case/ })).toHaveAttribute('href', '#/investigation/INV-DEMO-9');
  await expect(page.locator('[data-attention="ATT-KH-1"]')).toBeVisible();
  await expect(page.getByTestId('delivery-panel').locator('[data-delivery="DLV-KH-1"] [data-truth="observed"]')).toBeVisible();
  await expect(page.getByTestId('status-panel').locator('[data-provider="jira"]')).toContainText('unavailable');
});

test('unknown product shows the error state with a neutral link to the portfolio', async ({ page }) => {
  await load(page, { route: '/project/NOPE' });
  const err = page.getByTestId('project-error');
  await expect(err.locator('[data-state="error"]')).toBeVisible();
  await expect(err).toContainText('NOPE');
  await expect(err.getByRole('link', { name: 'Open Portfolio' })).toHaveAttribute('href', '#/portfolio');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('[data-node]')).toHaveCount(0);
});

test('unknown component shows the error state with links to the portfolio and the product', async ({ page }) => {
  await load(page, { route: '/project/RT/nope' });
  const err = page.getByTestId('project-error');
  await expect(err.locator('[data-state="error"]')).toBeVisible();
  await expect(err.getByRole('link', { name: 'Open Portfolio' })).toHaveAttribute('href', '#/portfolio');
  await expect(err.getByRole('link', { name: /View/ })).toHaveAttribute('href', '#/project/RT');
  for (const lang of LANGS) {
    await load(page, { lang, route: '/project/NOPE/x' });
    await expect(page.locator('[data-state="error"]')).toBeVisible();
  }
});

test('touch targets are at least 44 px at 375 px', async ({ page }) => {
  await load(page, { width: 375, route: '/project/RT/stock-sync' });
  const small = await page.locator('main button, .proj-comp-link, main .btn-link').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height < 44).length);
  expect(small).toBe(0);
  const btns = await page.locator('main button').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.width < 44).length);
  expect(btns).toBe(0);
});

test('map nodes are keyboard operable buttons and the selection follows focus and Enter', async ({ page }) => {
  await load(page, { route: '/project/RT' });
  await page.locator('[data-node="payments"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/project\/RT\/payments$/);
  expect(await hashOf(page)).toBe('#/project/RT/payments');
  await expect(page.locator('[data-node="payments"]')).toHaveAttribute('aria-pressed', 'true');
});
