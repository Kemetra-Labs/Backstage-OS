// BACK-82: regression suite for the opt-in React Flow dependency map (?renderer=flow). The existing project.spec.ts keeps
// proving the default DepGraph path unchanged; this file proves the flagged variant keeps the same facts, the same
// privacy, the same keyboard and language behaviour, and that it falls back to DepGraph.
import { expect, test, type Page } from '@playwright/test';
import { BANNED, LANGS, openRoute, PERSONAS, WIDTHS, type LoadQuery } from './helpers';

const FLOW = '[data-testid="dep-flow"]';
const hashOf = (page: Page) => page.evaluate(() => window.location.hash);
const load = (page: Page, q: LoadQuery & { route?: string } = {}) =>
  openRoute(page, q.route ?? '/project/RT', { renderer: 'flow', ...q });
/** The flow map is lazy: wait for the canvas and for React Flow to have measured and shown every node. */
const ready = async (page: Page, count = 6) => {
  await expect(page.locator(FLOW)).toBeVisible();
  await expect(page.locator(`${FLOW} [data-node]`)).toHaveCount(count);
  await expect(page.locator(`${FLOW} .react-flow__node[style*="visibility: visible"]`)).toHaveCount(count);
};

// ---- the default path is untouched -----------------------------------------------------------------------------
test('without the flag, or with an unknown value, the map is DepGraph and React Flow is never loaded', async ({ page }) => {
  for (const renderer of [undefined, 'depgraph', 'bogus', 'FLOW']) {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await openRoute(page, '/project/RT', renderer ? { renderer } : {});
    await expect(page.getByTestId('dep-graph')).toBeVisible();
    await expect(page.locator(FLOW)).toHaveCount(0);
    await expect(page.locator('.react-flow')).toHaveCount(0);
    expect(requested.some((u) => /DepFlowCanvas/.test(u)), `${renderer}: chunk fetched`).toBe(false);
    page.removeAllListeners('request');
  }
});

test('the flag is kept in the URL when the persona or language is switched', async ({ page }) => {
  await load(page);
  await ready(page);
  await page.getByRole('button', { name: 'Technical', exact: true }).click();
  await expect(page).toHaveURL(/renderer=flow/);
  await ready(page);
});

// ---- same facts as DepGraph, every persona ---------------------------------------------------------------------
for (const persona of PERSONAS) {
  test(`RT ${persona}: same six nodes and same health as DepGraph; payments ${persona === 'technical' ? 'degraded' : 'unknown'}, inventory unknown, never promoted to healthy`, async ({ page }) => {
    const errors = await load(page, { persona });
    await ready(page);
    for (const id of ['pos', 'api-gateway', 'stock-sync', 'payments', 'inventory', 'reporting']) {
      await expect(page.locator(`${FLOW} [data-node="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator(`${FLOW} [data-health="healthy"]`)).toHaveCount(1);
    await expect(page.locator('[data-node="api-gateway"] [data-health="healthy"]')).toBeVisible();
    await expect(page.locator('[data-node="inventory"] [data-health="unknown"]')).toBeVisible();
    await expect(page.locator(`[data-node="payments"] [data-health="${persona === 'technical' ? 'degraded' : 'unknown'}"]`)).toBeVisible();
    for (const id of ['pos', 'stock-sync', 'reporting']) await expect(page.locator(`[data-node="${id}"] [data-health="unknown"]`)).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('edges: six drawn, certainty by class matches the table, and the table still lists every one', async ({ page }) => {
  await load(page);
  await ready(page);
  await expect(page.locator(`${FLOW} .react-flow__edge`)).toHaveCount(6);
  await expect(page.locator(`${FLOW} .kwf-authored`)).toHaveCount(0); // catalog edges whose record was never read are Provisional
  await expect(page.locator(`${FLOW} .kwf-provisional`)).toHaveCount(5);
  await expect(page.locator(`${FLOW} .kwf-hypothesis`)).toHaveCount(1);
  await expect(page.locator(`${FLOW} .react-flow__edge.animated`)).toHaveCount(0);
  await page.locator('details.proj-details summary').click();
  await expect(page.locator('[data-testid="dep-table"] tbody tr')).toHaveCount(6);
  await expect(page.locator('[data-edge="payments->inventory"]')).toContainText('Suspected');
  await expect(page.locator(`${FLOW} [data-testid^="rf__edge-e"][data-testid*="payments->inventory"]`)).toHaveClass(/kwf-hypothesis/);
  await expect(page.locator('[data-testid="dep-flow-undrawn"]')).toHaveCount(0);
});

// ---- selection, Escape, navigation ------------------------------------------------------------------------------
test('click selects through the URL, keeps Open case, click again clears; Escape clears too', async ({ page }) => {
  const errors = await load(page, { persona: 'technical' });
  await ready(page);
  await page.locator('[data-node="stock-sync"]').click();
  await expect(page).toHaveURL(/#\/project\/RT\/stock-sync$/);
  await expect(page.locator('[data-node="stock-sync"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: /Open case/ })).toHaveAttribute('href', '#/investigation/INV-DEMO-7');
  await expect(page.getByTestId('ci-failing')).toHaveText('CI check failing');
  await page.locator('[data-node="stock-sync"]').click();
  await expect(page).toHaveURL(/#\/project\/RT$/);
  await expect(page.getByTestId('selected-hint')).toBeVisible();

  await page.locator('[data-node="payments"]').click();
  await expect(page.locator('[data-node="payments"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/project\/RT$/);
  await expect(page.locator('[data-node][aria-pressed="true"]')).toHaveCount(0);
  expect(await hashOf(page)).toBe('#/project/RT');
  expect(errors).toEqual([]);
});

test('Escape clears the selection even when focus is outside the map, but not while typing in a text field', async ({ page }) => {
  await load(page, { persona: 'technical', route: '/project/RT/stock-sync' });
  await ready(page);
  await expect(page.locator('[data-node="stock-sync"]')).toHaveAttribute('aria-pressed', 'true');
  // Typing in the demo search box: its own Escape clears the text and the selection stays.
  const search = page.getByRole('searchbox');
  await search.fill('stock');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page).toHaveURL(/#\/project\/RT\/stock-sync$/);
  // Focus on the page body, as after a mouse click in Safari: Escape clears the selection.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/project\/RT$/);
  await expect(page.locator('[data-node][aria-pressed="true"]')).toHaveCount(0);
});

test('a component opened by URL is selected on the flow map', async ({ page }) => {
  await load(page, { route: '/project/RT/stock-sync' });
  await ready(page);
  await expect(page.locator('[data-node="stock-sync"]')).toHaveAttribute('aria-pressed', 'true');
});

// ---- read-only ---------------------------------------------------------------------------------------------------
test('read-only: nodes cannot be dragged, edges cannot be made, nothing is deleted, no zoom or editing controls exist', async ({ page, browserName }) => {
  await load(page);
  await ready(page);
  const box = async (id: string) => (await page.locator(`[data-node="${id}"]`).boundingBox())!;
  const before = await box('api-gateway');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + 40, before.y + 90, { steps: 6 });
  await page.mouse.up();
  const after = await box('api-gateway');
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeLessThan(1);

  // Dragging from a connection handle must not create a link.
  const h = await page.locator('.react-flow__handle-right').first().boundingBox();
  const target = await box('reporting');
  if (h) {
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 20, target.y + 20, { steps: 6 });
    await page.mouse.up();
  }
  await expect(page.locator(`${FLOW} .react-flow__edge`)).toHaveCount(6);

  await page.locator('[data-node="payments"]').focus();
  await page.keyboard.press('Delete');
  // React Flow's default delete key is Backspace. WebKit also treats a bare Backspace as "go back", which is the browser, not the map.
  if (browserName !== 'webkit') await page.keyboard.press('Backspace');
  await expect(page.locator(`${FLOW} [data-node]`)).toHaveCount(6);
  await expect(page.locator(`${FLOW} .react-flow__edge`)).toHaveCount(6);

  for (const sel of ['.react-flow__controls', '.react-flow__minimap', '.react-flow__selection', '.react-flow__nodesselection']) {
    await expect(page.locator(`${FLOW} ${sel}`)).toHaveCount(0);
  }
  // Wheel and double-click do not zoom: the viewport transform stays at scale 1.
  const t = () => page.locator(`${FLOW} .react-flow__viewport`).evaluate((el) => (el as HTMLElement).style.transform);
  const start = await t();
  await page.mouse.move(before.x + 20, before.y + 20);
  await page.mouse.wheel(0, -400);
  await page.locator(`${FLOW} .react-flow__pane`).dblclick({ position: { x: 5, y: 5 }, force: true });
  expect(await t()).toBe(start);
  expect(start).toContain('scale(1)');
});

// ---- keyboard and screen-reader semantics -----------------------------------------------------------------------
test('keyboard: one tab stop per node (edges are not focusable), Enter selects, no focusable edge or handle', async ({ page }) => {
  await load(page);
  await ready(page);
  const stops = await page.locator(`${FLOW} :is(a, button, input, select, textarea, [tabindex]:not([tabindex="-1"]))`)
    .evaluateAll((els) => els.map((e) => `${e.tagName}:${(e as HTMLElement).dataset.node ?? e.className}`));
  // Six node buttons, plus the library's own attribution link. Not the 54-press path BACK-22 measured with focusable edges.
  expect(stops.filter((s) => s.startsWith('BUTTON'))).toHaveLength(6);
  expect(stops.length).toBeLessThanOrEqual(7);
  await expect(page.locator(`${FLOW} .react-flow__edge[tabindex], ${FLOW} .react-flow__handle[tabindex], ${FLOW} .react-flow__node[tabindex]`)).toHaveCount(0);

  // Walk the real tab order from the first node and count the stops inside the map.
  await page.locator('[data-node="pos"]').focus();
  let presses = 0;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    presses += 1;
    const inside = await page.evaluate((sel) => !!document.activeElement?.closest(sel), FLOW);
    if (!inside) break;
  }
  expect(presses, 'tab presses from the first node until focus leaves the map').toBeLessThanOrEqual(7);

  await page.locator('[data-node="payments"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/project\/RT\/payments$/);
  await expect(page.locator('[data-node="payments"]')).toHaveAttribute('aria-pressed', 'true');
});

test('focusing a node scrolls the map so the node is visible, with the canvas offset left alone', async ({ page }) => {
  await load(page, { width: 768 });
  await ready(page);
  await page.locator('[data-node="reporting"]').focus();
  const r = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="dep-flow"]') as HTMLElement;
    const n = document.querySelector('[data-testid="dep-flow"] [data-node="reporting"]') as HTMLElement;
    const sr = s.getBoundingClientRect();
    const nr = n.getBoundingClientRect();
    return { left: nr.left >= sr.left - 1, right: nr.right <= sr.right + 1, transform: (document.querySelector('.react-flow__viewport') as HTMLElement).style.transform };
  });
  expect(r.left && r.right).toBe(true);
  // Chromium serializes "translate(0px, 0px)", WebKit "translate(0px)": same identity transform.
  expect(r.transform).toMatch(/^translate\(0px(, 0px)?\) scale\(1\)$/);
});

test('the library roles are neutralised: no role=application, no English node or edge descriptions in any language', async ({ page }) => {
  for (const lang of LANGS) {
    await load(page, { lang });
    await ready(page);
    await expect(page.locator(`${FLOW} .react-flow`)).not.toHaveAttribute('role', 'application');
    await expect(page.locator(FLOW)).toHaveAttribute('role', 'group');
    await expect(page.locator(`${FLOW} [aria-roledescription]`)).toHaveCount(await page.locator(`${FLOW} .react-flow__edge`).count());
    await expect(page.locator(`${FLOW} .react-flow__edge[aria-hidden="true"]`)).toHaveCount(6);
    const hidden = await page.locator(`${FLOW} [style*="display: none"]`).allTextContents();
    expect(hidden).toHaveLength(2);
    for (const t of hidden) {
      expect(t, `${lang}: library default text`).not.toMatch(/press enter or space/i);
      if (lang === 'ar') {
        expect(t).toMatch(/[؀-ۿ]/);
        expect(t.replace('Enter', ''), 'Arabic description keeps Latin only for the key name').not.toMatch(/[A-Za-z]/);
      }
    }
    const html = await page.content();
    expect(html.includes('Edge from'), `${lang}: library default edge label`).toBe(false);
    expect(html.includes('Press enter or space'), `${lang}: library default node text`).toBe(false);
  }
});

// ---- language and layout ----------------------------------------------------------------------------------------
test('arabic: the flow map stays left to right and ids stay isolated', async ({ page }) => {
  await load(page, { lang: 'ar', persona: 'technical', route: '/project/RT/stock-sync', width: 1440 });
  await ready(page);
  expect(await page.locator(FLOW).evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
  const x = async (id: string) => (await page.locator(`[data-node="${id}"]`).boundingBox())!.x;
  expect(await x('pos')).toBeLessThan(await x('api-gateway'));
  expect(await x('api-gateway')).toBeLessThan(await x('stock-sync'));
  expect(await x('stock-sync')).toBeLessThan(await x('inventory'));
  expect(await page.locator(`${FLOW} [data-node="stock-sync"] .dg-box`).getAttribute('dir')).toBe('rtl');
  expect(await page.locator(`${FLOW} bdi[dir="ltr"]`).count()).toBeGreaterThan(5);
});

for (const persona of PERSONAS) {
  test(`arabic/${persona}: no Latin run outside a left-to-right isolate with the flow map on`, async ({ page }) => {
    await load(page, { lang: 'ar', persona, route: '/project/RT/inventory' });
    await ready(page);
    const offenders = await page.evaluate(() => {
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
    expect(offenders).toEqual([]);
  });
}

for (const width of WIDTHS) {
  for (const lang of LANGS) {
    test(`layout ${lang} @${width}px: no page overflow, table replaces the map under 640 px, touch targets >= 44 px, no console errors`, async ({ page }) => {
      const errors = await load(page, { lang, width, persona: 'technical' });
      if (width < 640) {
        await expect(page.getByTestId('table-view')).toBeVisible();
        await expect(page.locator(FLOW)).toHaveCount(0);
      } else {
        await ready(page);
        const small = await page.locator(`${FLOW} button`).evaluateAll((els) =>
          els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
        expect(small).toBe(0);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
}

// ---- filters, table view ----------------------------------------------------------------------------------------
test('filters narrow the flow map, clearing restores it, and an empty result says so', async ({ page }) => {
  await load(page, { persona: 'technical' });
  await ready(page);
  const env = page.getByRole('group', { name: 'Environment' });
  const layer = page.getByRole('group', { name: 'Layer' });
  await env.getByRole('button', { name: 'Staging' }).click();
  await ready(page, 2);
  await expect(page.locator(`${FLOW} .react-flow__edge`)).toHaveCount(1);
  await env.getByRole('button', { name: 'All' }).click();
  await ready(page, 6);
  await env.getByRole('button', { name: 'Production' }).click();
  await layer.getByRole('button', { name: 'Data' }).click();
  await expect(page.getByTestId('map-panel').locator('[data-state="empty"]')).toBeVisible();
  await expect(page.locator(FLOW)).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await ready(page, 6);
});

test('Table view replaces the flow map and the Map view brings it back', async ({ page }) => {
  await load(page);
  await ready(page);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.getByTestId('table-view')).toBeVisible();
  await expect(page.locator(FLOW)).toHaveCount(0);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await ready(page);
  await expect(page.locator('details.proj-details summary')).toBeVisible();
});

test('Seshat-BI (no components) shows the empty state, not a flow canvas', async ({ page }) => {
  await load(page, { route: '/project/SB' });
  await expect(page.getByTestId('map-empty').locator('[data-state="empty"]')).toBeVisible();
  await expect(page.locator(FLOW)).toHaveCount(0);
  await expect(page.locator('main [data-health="healthy"]')).toHaveCount(0);
});

test('Khepri: the conflicting-signal component is degraded while CI is green', async ({ page }) => {
  await load(page, { route: '/project/KH/khepri-api' });
  await ready(page, 3);
  await expect(page.locator('[data-node="khepri-api"] [data-health="degraded"]')).toBeVisible();
  await expect(page.locator('[data-node="khepri-web"] [data-health="healthy"]')).toBeVisible();
  await expect(page.locator('[data-node="khepri-worker"] [data-health="unknown"]')).toBeVisible();
});

// ---- privacy ----------------------------------------------------------------------------------------------------
for (const lang of LANGS) {
  for (const persona of ['owner', 'nontechnical'] as const) {
    test(`privacy ${lang}/${persona}: no restricted evidence id, job name or run id anywhere in the page source, including attributes`, async ({ page }) => {
      for (const route of ['/project/RT', '/project/RT/inventory', '/project/RT/payments', '/project/RT/stock-sync']) {
        await load(page, { lang, persona, route });
        await ready(page);
        // page.content() is the serialized DOM: it covers attributes, ARIA labels, data-*, hidden nodes, test ids and title.
        const html = await page.content();
        for (const id of ['E-5', 'E-12']) expect(new RegExp(`\\b${id}\\b`).test(html), `${persona}/${lang}${route}: ${id}`).toBe(false);
        for (const b of BANNED) expect(html.includes(b), `${persona}/${lang}${route}: ${b}`).toBe(false);
        expect(html).not.toContain('Restricted to Technical');
        // The adapter drops evidence basis, so no evidence id is attached to the canvas for any persona.
        expect(await page.locator(FLOW).evaluate((el) => /\bE-\d+\b/.test(el.outerHTML)), `${persona}/${lang}${route}: evidence id inside the map`).toBe(false);
      }
    });
  }
}

test('technical still reaches restricted evidence through the selected panel, not through the map', async ({ page }) => {
  await load(page, { persona: 'technical', route: '/project/RT/inventory' });
  await ready(page);
  await expect(page.locator('[data-evidence="E-5"] [data-truth="observed"]')).toBeVisible();
  expect(await page.locator(FLOW).evaluate((el) => /\bE-\d+\b/.test(el.outerHTML))).toBe(false);
});

// ---- motion -----------------------------------------------------------------------------------------------------
test('reduced motion: no animation or transition on nodes, edges or the viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  await ready(page);
  const m = await page.locator(FLOW).evaluate((root) => {
    const dur = (s: string) => s.split(',').every((x) => parseFloat(x) === 0);
    const els = [...root.querySelectorAll('button.dg-node, .react-flow__edge-path, .react-flow__viewport, .react-flow__node')];
    return els.map((e) => { const c = getComputedStyle(e); return { transition: dur(c.transitionDuration), animation: c.animationName === 'none' || dur(c.animationDuration) }; });
  });
  expect(m.length).toBeGreaterThan(10);
  expect(m.every((x) => x.transition && x.animation)).toBe(true);
  await expect(page.locator(`${FLOW} .react-flow__edge.animated`)).toHaveCount(0);
});

// ---- rollback ---------------------------------------------------------------------------------------------------
test('rollback: if the React Flow chunk cannot load, DepGraph is drawn with the same data and selection still works', async ({ page }) => {
  await page.route(/DepFlowCanvas[^/]*\.(js|css)$/, (r) => r.abort());
  await load(page, { persona: 'technical' });
  await expect(page.getByTestId('flow-fallback')).toBeVisible();
  await expect(page.getByTestId('dep-graph')).toBeVisible();
  await expect(page.locator(FLOW)).toHaveCount(0);
  await expect(page.locator('[data-testid="dep-graph"] [data-node]')).toHaveCount(6);
  await expect(page.locator('[data-node="api-gateway"] [data-health="healthy"]')).toBeVisible();
  await expect(page.locator('main [data-health="healthy"]')).toHaveCount(1);
  await page.locator('[data-node="stock-sync"]').click();
  await expect(page).toHaveURL(/#\/project\/RT\/stock-sync$/);
  await page.locator('details.proj-details summary').click();
  await expect(page.locator('[data-testid="dep-table"] tbody tr')).toHaveCount(6);
});
