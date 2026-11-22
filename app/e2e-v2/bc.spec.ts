// BACK-27: the Hybrid Mission Map pilot (concept B with C's list view), opened with v2.html?concept=bc.
// Runs against the built lab on port 4279 (npm run e2e:v2). Chromium only; WebKit is NOT RUN (see the report).
import { expect, test } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { clippedElements, infiniteAnimations, latinOutsideIsolates, loadBc, smallTargets, squash, waitForAnimationsSettled, waitForIntroDone } from './bc-helpers';
import { LANGS, ORIGIN, PERSONAS, WIDTHS, controlLabels, overflow } from './helpers';

const IDS = ['retail-tower', 'khepri', 'stock-sync', 'pos', 'inventory', 'github', 'jira', 'sentry', 'port', 'seshat-bi'];
const chipOf = (page: import('@playwright/test').Page, id: string) => page.locator(`.kv2-bc-node[data-node="${id}"] .kv2-chip`).innerText();

test.describe('layout', () => {
  for (const lang of LANGS) {
    for (const view of ['map', 'list'] as const) {
      for (const width of [...WIDTHS, 1024, 1180, 1181]) {
        test(`${view} ${lang} @${width}px: no overflow or clipping, one h1, ordered headings, no console errors, no foreign requests`, async ({ page }) => {
          const probe = await loadBc(page, { lang, width, view });
          await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
          expect(await overflow(page)).toBeLessThanOrEqual(0);
          expect(await clippedElements(page)).toEqual([]);
          await expect(page.locator('h1')).toHaveCount(1);
          const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => (h as HTMLElement).offsetParent !== null || getComputedStyle(h).position === 'fixed').map((h) => Number(h.tagName[1])));
          levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
          await expect(page.locator('.kv2-demo')).toBeVisible();
          expect(probe.errors).toEqual([]);
          expect(probe.requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:'))).toEqual([]);
          expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
        });
      }
    }
  }

  test('the V2 map is untouched without ?concept=bc', async ({ page }) => {
    await page.goto('/v2.html#/mission-map?persona=owner&lang=en');
    await expect(page.locator('.kv2-map')).toBeVisible();
    await expect(page.locator('.kv2-bc')).toHaveCount(0);
    await expect(page.locator('.kv2-node')).toHaveCount(10);
  });

  test('desktop: the shell collapses to a 76 px rail with the same four destinations, and the inspector floats at the inline end', async ({ page }) => {
    await loadBc(page, { width: 1440, height: 1000 });
    const side = await page.locator('#kv2-side').boundingBox();
    expect(Math.round(side!.width)).toBe(76);
    const links = page.locator('#kv2-side nav a');
    await expect(links).toHaveCount(4);
    await expect(page.locator('#kv2-side nav a[aria-current="page"]')).toContainText('Mission Map');
    const insp = await page.getByTestId('inspector').boundingBox();
    expect(insp!.x + insp!.width).toBeGreaterThan(1440 - 20);
    expect(Math.round(insp!.width)).toBeGreaterThanOrEqual(340);
  });

  test('phones open on the list; wider screens open on the map', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/v2.html?concept=bc#/mission-map?persona=owner&lang=en');
    await expect(page.locator('.kv2-bc-ledger')).toBeVisible();
    await expect(page.locator('.kv2-bc-canvas')).toHaveCount(0);
    const wide = await page.context().newPage();
    await wide.setViewportSize({ width: 1440, height: 1000 });
    await wide.goto('/v2.html?concept=bc#/mission-map?persona=owner&lang=en');
    await expect(wide.locator('.kv2-bc-canvas')).toBeVisible();
    await expect(wide.locator('.kv2-bc-ledger')).toHaveCount(0);
  });

  test('performance budget: the pilot stays within about 600 DOM and 200 SVG elements, no backdrop-filter, one filter', async ({ page }) => {
    // The budget is for the pilot's own screen. The shared V2 shell (top bar, navigation) is measured and reported, not budgeted.
    await loadBc(page, { view: 'map' });
    await waitForIntroDone(page);
    const count = () => page.evaluate(() => {
      const stage = document.querySelector('.kv2-bc')!;
      const all = [...stage.querySelectorAll('*')];
      return {
        page: document.body.querySelectorAll('*').length,
        pageSvg: document.body.querySelectorAll('svg, svg *').length,
        dom: all.length,
        svg: stage.querySelectorAll('svg, svg *').length,
        backdrop: all.filter((e) => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).length,
        filters: all.filter((e) => getComputedStyle(e).filter !== 'none').length,
      };
    });
    const map = await count();
    await page.getByRole('button', { name: 'List' }).click();
    const list = await count();
    await page.goto('/v2.html#/mission-map?persona=owner&lang=en');
    await expect(page.locator('.kv2-map')).toBeVisible();
    const v2 = await page.evaluate(() => ({ page: document.body.querySelectorAll('*').length, pageSvg: document.body.querySelectorAll('svg, svg *').length }));
    const measured = `bc budget: map stage dom=${map.dom} svg=${map.svg} | whole page dom=${map.page} svg=${map.pageSvg} | list stage dom=${list.dom} svg=${list.svg} | V2 map whole page dom=${v2.page} svg=${v2.pageSvg}`;
    console.log(measured);
    test.info().annotations.push({ type: 'bc-budget', description: measured });
    // SPEC section 7 says "about 600 / about 200": hard product limits on the pilot's own stage (shell drift cannot move them), 5 % of headroom on the SVG count, recorded in the report.
    expect(map.dom).toBeLessThanOrEqual(600);
    expect(map.svg).toBeLessThanOrEqual(210);
    expect(map.backdrop).toBe(0);
    expect(map.filters).toBeLessThanOrEqual(1);
  });
});

test.describe('map and list carry the same information', () => {
  test('map: ten systems, each a native button named "title, kind, status"', async ({ page }) => {
    await loadBc(page);
    const nodes = page.locator('.kv2-bc-node');
    await expect(nodes).toHaveCount(10);
    const info = await nodes.evaluateAll((els) => els.map((e) => ({ tag: e.tagName, id: (e as HTMLElement).dataset.node, label: e.getAttribute('aria-label') ?? '' })));
    expect(info.map((i) => i.id).sort()).toEqual([...IDS].sort());
    for (const i of info) {
      expect(i.tag).toBe('BUTTON');
      expect(i.label, i.id).toMatch(/^.+, (Product|Project|Service), .+$/);
    }
  });

  test('list: 10 systems, 6 sources, 10 links (Owner), 6 timeline events, and the three counters in the matrix headings', async ({ page }) => {
    await loadBc(page, { view: 'list' });
    await expect(page.locator('.kv2-bc-ledger tbody tr')).toHaveCount(10);
    await expect(page.locator('.kv2-bc-matrix tbody tr')).toHaveCount(6);
    await expect(page.locator('.kv2-bc-links tbody tr')).toHaveCount(10); // Owner: 11 links minus d4 (Technical-only basis, BACK-30)
    await expect(page.locator('.kv2-bc-tl li')).toHaveCount(6);
    const head = squash(await page.locator('.kv2-bc-matrix thead').innerText());
    for (const c of ['3 of 6 reachable', '2 of 6 within target', '1 of 6 confirmed healthy']) {
      expect(head).toContain(c);
      expect(squash(await page.getByTestId('bc-readings').innerText())).toContain(c);
    }
  });

  test('the same systems carry the same status word on the map and in the list', async ({ page }) => {
    await loadBc(page);
    const onMap: Record<string, string> = {};
    for (const id of IDS) onMap[id] = squash(await chipOf(page, id));
    await page.getByRole('button', { name: 'List' }).click();
    const inList = await page.locator('.kv2-bc-ledger tbody tr').evaluateAll((rows) => Object.fromEntries(rows.map((r) => [(r.querySelector('button') as HTMLElement).dataset.node, (r.querySelector('.kv2-chip')!.textContent ?? '').trim()])));
    expect(inList).toEqual(onMap);
  });

  test('one selection: a node, a ledger row and the inspector always agree, and the hash keeps it', async ({ page }) => {
    await loadBc(page, { node: 'stock-sync' });
    await page.locator('.kv2-bc-node[data-node="pos"]').click();
    await expect(page.locator('.kv2-bc-insp h2')).toContainText('POS client');
    await expect(page.locator('.kv2-bc-node[data-node="pos"]')).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).toContain('node=pos');
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.locator('.kv2-bc-ledger tr[data-selected] button')).toHaveAttribute('data-node', 'pos');
    await page.locator('.kv2-bc-ledger button[data-node="jira"]').click();
    await expect(page.locator('.kv2-bc-insp h2')).toContainText('Jira');
    await expect(page.locator('.kv2-bc-ledger button[data-node="jira"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('.kv2-bc-node[data-node="jira"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.kv2-bc-node[aria-pressed="true"]')).toHaveCount(1);
  });

  test('changing the scope selects the scoped product and marks it Focus', async ({ page }) => {
    await loadBc(page);
    await page.getByLabel('Scope').selectOption('khepri');
    await expect(page.locator('.kv2-bc-insp h2')).toContainText('Khepri');
    await expect(page.getByTestId('inspector').locator('.kv2-chip-focus')).toBeVisible();
    await expect(page.locator('.kv2-bc-node[data-node="khepri"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('filters dim in the map and hide in the list, and an empty result says so', async ({ page }) => {
    await loadBc(page);
    await page.getByRole('button', { name: 'Risks' }).click();
    await expect(page.locator('.kv2-bc-node[data-dim]')).toHaveCount(7);
    await expect(page.locator('.kv2-bc-edge[data-dim]')).toHaveCount(10); // no link joins two risk systems (Owner: d4 is not drawn)
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.locator('.kv2-bc-ledger tbody tr')).toHaveCount(3);
    await expect(page.locator('.kv2-bc-links')).toContainText('No links match this filter.');
    await expect(page.locator('.kv2-bc-matrix tbody tr')).toHaveCount(6); // sources are not systems: never filtered away
  });

  test('keyboard: arrows move focus between nodes, Enter selects, tabs move with arrows and mirror in Arabic', async ({ page }) => {
    await loadBc(page, { node: 'stock-sync' });
    await page.locator('.kv2-bc-node[data-node="stock-sync"]').focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.node)).toBe('github');
    await expect(page.locator('.kv2-bc-insp h2')).toContainText('stock-sync'); // moving focus does not select
    await page.keyboard.press('Enter');
    await expect(page.locator('.kv2-bc-insp h2')).toContainText('GitHub');
    await page.getByRole('tab', { name: 'Overview' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Evidence' })).toHaveAttribute('aria-selected', 'true');
    await loadBc(page, { lang: 'ar' });
    await page.locator('#bcinsp-tab-overview').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#bcinsp-tab-evidence')).toHaveAttribute('aria-selected', 'true');
  });

  test('keyboard: the skip link is the first stop, and every node shows a visible focus ring', async ({ page }) => {
    await loadBc(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('.kv2-skip')).toBeFocused();
    const missing: string[] = [];
    for (const id of IDS) {
      await page.locator(`.kv2-bc-node[data-node="${id}"]`).focus();
      const ok = await page.evaluate((nid) => {
        const el = document.querySelector(`.kv2-bc-node[data-node="${nid}"]`)!;
        const orb = getComputedStyle(el.querySelector('.kv2-bc-orb')!);
        return parseFloat(orb.outlineWidth) > 0 && orb.outlineStyle !== 'none';
      }, id);
      if (!ok) missing.push(id);
    }
    expect(missing).toEqual([]);
  });
});

test.describe('truth rules', () => {
  for (const view of ['map', 'list'] as const) {
    for (const lang of LANGS) {
      test(`${view} ${lang}: no percentage, no composite score, no executable approval`, async ({ page }) => {
        await loadBc(page, { view, lang });
        const text = await page.locator('body').innerText();
        expect(text).not.toMatch(/\d\s?%/);
        expect(text).not.toMatch(/\b(trust score|overall trust|trust posture|mission health|confidence:?\s*0\.\d)/i);
        // Controls only: an evidence row may quote an event title ("...was merged...") that is not an action.
        await expect(page.getByRole('button', { name: /(approve|execute|deploy|merge|retry|release now|run now)/i }).and(page.locator('button:not(.kv2-ev)'))).toHaveCount(0);
      });
    }
  }

  test('unknown is never healthy: exactly one system and one source read Healthy', async ({ page }) => {
    await loadBc(page, { view: 'map' });
    const healthy = await page.locator('.kv2-bc-node').evaluateAll((els) => els.filter((e) => /^healthy$/i.test((e.querySelector('.kv2-chip')?.textContent ?? '').trim())).map((e) => (e as HTMLElement).dataset.node));
    expect(healthy).toEqual(['github']);
    for (const id of ['khepri', 'jira', 'seshat-bi', 'pos', 'retail-tower']) expect(await chipOf(page, id)).toMatch(/Health unknown/);
    expect(await chipOf(page, 'sentry')).toMatch(/Stale/);
    // BACK-30: Inventory's only basis is Technical-only evidence, so for Owner it is unknown (not healthy, and not stale either)
    expect(await chipOf(page, 'inventory')).toMatch(/Health unknown/);
    expect(await chipOf(page, 'port')).toMatch(/Unavailable/);
    expect(await chipOf(page, 'stock-sync')).toMatch(/CI check failing/);
    await page.getByRole('button', { name: 'List' }).click();
    const rows = await page.locator('.kv2-bc-matrix tbody tr').evaluateAll((trs) => trs.map((r) => ({ id: (r as HTMLElement).dataset.source, health: (r.querySelectorAll('td')[2]!.textContent ?? '').trim() })));
    expect(rows.filter((r) => /^healthy$/i.test(r.health)).map((r) => r.id)).toEqual(['github']);
    expect(rows.find((r) => r.id === 'jira')!.health).toBe('Unknown');
    await page.getByRole('button', { name: 'Map', exact: true }).click(); // same page, so the list view is still selected
    await loadBc(page, { view: 'map', persona: 'technical' });
    expect(await chipOf(page, 'inventory')).toMatch(/Stale/); // the permitted persona still sees the stale Technical-only read
  });

  test('stale, unavailable and unresolved are shown, not hidden', async ({ page }) => {
    await loadBc(page, { view: 'list' });
    const matrix = squash(await page.locator('.kv2-bc-matrix').innerText());
    expect(matrix).toContain('540 of 15 min');
    expect(matrix).toContain('36× target');
    expect(matrix).toContain('1500 of 1440 min');
    expect(matrix).toContain('Offline');
    expect(matrix.match(/never read/g)).toHaveLength(2); // Datadog and Confluence
    expect(matrix.match(/Not set up/g)).toHaveLength(2);
    // BACK-30: the only stale link (d4) rests on Technical-only evidence, so Owner has none; Technical still sees it flagged
    await expect(page.locator('.kv2-bc-links [data-stale-chip]')).toHaveCount(0);
    await expect(page.locator('.kv2-bc-links tr[data-link="d4"]')).toHaveCount(0);
    await expect(page.locator('.kv2-bc-links tbody tr[data-truth="unknown"]')).toHaveCount(4);
    await expect(page.locator('.kv2-bc-links tbody tr[data-truth="group"]')).toHaveCount(3);
    // the age bars carry their numbers as text
    const label = await page.locator('.kv2-bc-matrix tr[data-source="sentry"] .kv2-bc-age').getAttribute('aria-label');
    expect(label).toBe('540 of 15 min, 36× target');
    await loadBc(page, { view: 'list', persona: 'technical' });
    await expect(page.locator('.kv2-bc-links [data-stale-chip]')).toHaveCount(1);
    await expect(page.locator('.kv2-bc-links tr[data-link="d4"] [data-stale-chip]')).toHaveCount(1);
  });

  test('restricted evidence: Owner is not told it exists, Technical sees the detail (BACK-30, M05-D05-B)', async ({ page }) => {
    await loadBc(page, { node: 'sentry', tab: 'evidence', persona: 'owner' });
    const owner = squash(await page.getByTestId('inspector').innerText());
    // No id, no "Restricted to Technical" placeholder, no title, provider or age: the Technical-only record is simply absent
    expect(owner).not.toMatch(/Restricted to Technical|E-5|Recent errors|Sentry API|540 min/i);
    expect(owner).toContain('No evidence has been read for this item.');
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.locator('.kv2-bc-links tr[data-link="d4"]')).toHaveCount(0);
    expect(squash(await page.locator('.kv2-bc-links').innerText())).not.toMatch(/Inventory errors were reported|restricted to Technical/i);
    await loadBc(page, { node: 'sentry', tab: 'evidence', persona: 'technical', view: 'list' });
    expect(squash(await page.getByTestId('inspector').innerText())).toMatch(/E-5/);
    expect(squash(await page.locator('.kv2-bc-links tr[data-link="d4"]').innerText())).toContain('Inventory errors were reported in Sentry (stale read)');
  });

  test('Sources tab: a provider named only by Technical-only evidence is listed for Technical and not for Owner', async ({ page }) => {
    await loadBc(page, { node: 'inventory', tab: 'sources', persona: 'owner' });
    await expect(page.locator('.kv2-bc-srcrows li')).toHaveCount(0);
    await expect(page.getByTestId('inspector')).toContainText('No evidence has been read for this item.');
    await loadBc(page, { node: 'inventory', tab: 'sources', persona: 'technical' });
    await expect(page.locator('.kv2-bc-srcrows li')).toHaveCount(1);
    await expect(page.locator('.kv2-bc-srcrows li')).toContainText('Sentry');
  });

  test('the inspector shows a source with its age against target and links to the Source Observatory', async ({ page }) => {
    await loadBc(page, { node: 'sentry', tab: 'sources', persona: 'technical' });
    await expect(page.locator('.kv2-bc-srcrows li')).toHaveCount(1);
    await expect(page.locator('.kv2-bc-srcrows .kv2-bc-age')).toHaveAttribute('aria-label', '540 of 15 min, 36× target');
    await page.locator('.kv2-bc-srcrows').getByRole('button', { name: 'Sentry' }).click();
    await expect(page.locator('h1')).toContainText('Source Observatory');
  });

  for (const lang of LANGS) {
    for (const persona of PERSONAS) {
      for (const view of ['map', 'list'] as const) {
        test(`controls ${view} ${lang}/${persona}: no forbidden action verb, no form, no submit`, async ({ page }) => {
          await loadBc(page, { lang, persona, view });
          const labels = await controlLabels(page);
          expect(labels.length).toBeGreaterThan(10);
          for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
          await expect(page.locator('form, input[type="submit"], button[type="submit"]')).toHaveCount(0);
        });
      }
    }
  }
});

test.describe('return context and links out', () => {
  test('opening the Source Observatory and going back returns to the pilot with the same system, view and tab', async ({ page }) => {
    await loadBc(page, { view: 'list', node: 'stock-sync' });
    await page.locator('.kv2-bc-ledger button[data-node="sentry"]').click();
    await page.getByRole('button', { name: 'Open in Source Observatory' }).click();
    await expect(page.locator('h1')).toContainText('Source Observatory');
    expect(page.url()).toContain('src=sentry');
    await page.goBack();
    await expect(page.locator('h1')).toContainText('Mission Map');
    await expect(page.locator('h1')).toContainText('B + C pilot');
    await expect(page.locator('.kv2-bc-ledger tr[data-selected] button')).toHaveAttribute('data-node', 'sentry');
    expect(page.url()).toContain('node=sentry');
  });

  test('the rail link back to Mission Map returns to the pilot, and the replay link opens the replay', async ({ page }) => {
    await loadBc(page, { node: 'stock-sync' });
    await page.getByRole('button', { name: 'Open the investigation replay' }).click();
    await expect(page.locator('h1')).toContainText('Mission Replay');
    await page.locator('#kv2-side nav').getByRole('link', { name: 'Mission Map' }).click();
    await expect(page.getByTestId('bc-stage')).toBeVisible();
  });

  test('search selects a system on the pilot map', async ({ page }) => {
    await loadBc(page);
    const box = page.getByRole('combobox', { name: 'Search' });
    await box.fill('Sentry');
    await box.press('Enter');
    await expect(page.locator('.kv2-bc-insp h2')).toContainText('Sentry');
    await expect(page.locator('.kv2-bc-node[data-node="sentry"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Arabic and right-to-left', () => {
  for (const view of ['map', 'list'] as const) {
    test(`${view}: the canvas stays left-to-right, panels flip, and every Latin run is isolated`, async ({ page }) => {
      await loadBc(page, { lang: 'ar', view, width: 1440 });
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      if (view === 'map') expect(await page.locator('.kv2-bc-canvas').evaluate((e) => getComputedStyle(e).direction)).toBe('ltr');
      const insp = await page.getByTestId('inspector').boundingBox();
      const region = await page.locator('.kv2-bc-region').boundingBox();
      expect(insp!.x).toBeLessThan(region!.x); // the inspector sits at the inline end, which is the left in Arabic
      expect(await latinOutsideIsolates(page)).toEqual([]);
    });
  }
});

test.describe('motion', () => {
  test('reduced motion: zero animations, also after selecting and switching views, and no first-load orbit', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: ORIGIN });
    const page = await ctx.newPage();
    await loadBc(page);
    await page.locator('.kv2-bc-node[data-node="github"]').click();
    await expect(page.locator('.kv2-bc-node[data-node="github"][data-selected]')).toHaveCount(1);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator('.kv2-bc-draw')).toHaveCount(0);
    await page.getByRole('button', { name: 'List' }).click();
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('.kv2-bc-canvas')).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    // the selection is still shown without motion: own links stay, the rest are dimmed
    await expect(page.locator('.kv2-bc-edge[data-hl]')).toHaveCount(1); // GitHub has one link of its own (d1)
    await expect(page.locator('.kv2-bc-edge[data-dim]')).toHaveCount(9); // Owner: d4 (Technical-only basis) is not drawn, so 11 - 1 own - 1
    await ctx.close();
  });

  test('idle page runs no infinite animation, including the decorative background', async ({ page }) => {
    await loadBc(page);
    await waitForIntroDone(page);
    expect(await infiniteAnimations(page)).toEqual([]);
  });

  test('selecting a system sweeps one trace per own link, once; nothing loops', async ({ page }) => {
    await loadBc(page);
    await waitForIntroDone(page); // the first-load orbit has finished
    await page.locator('.kv2-bc-node[data-node="stock-sync"]').click();
    await page.locator('.kv2-bc-node[data-node="pos"]').click();
    await page.locator('.kv2-bc-node[data-node="stock-sync"]').click();
    await expect(page.locator('.kv2-bc-trace')).toHaveCount(5); // g1, d1, d2, d3, d5
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => ({ it: a.effect!.getTiming().iterations, d: a.effect!.getTiming().duration })));
    expect(running.length).toBeGreaterThan(0);
    for (const a of running) { expect(a.it).toBe(1); expect(Number(a.d)).toBeLessThanOrEqual(1000); }
    await waitForAnimationsSettled(page); // a looping trace never settles, so it fails here
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  });

  test('first-load orbit: plays once, animates only opacity, translate and stroke-dashoffset, never more than 10 at once, never replays', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __seen: boolean; __max: number; __props: string[]; __done: boolean; __timedOut: boolean };
      w.__seen = false; w.__max = 0; w.__props = []; w.__done = false; w.__timedOut = false;
      const tick = () => {
        if (document.querySelector('.kv2-bc-canvas[data-intro]')) w.__seen = true;
        const active = document.getAnimations().filter((a) => (a.effect?.getComputedTiming() as { phase?: string } | undefined)?.phase === 'active');
        w.__max = Math.max(w.__max, active.length);
        for (const a of active) for (const kf of (a.effect as KeyframeEffect).getKeyframes()) for (const k of Object.keys(kf)) if (!w.__props.includes(k)) w.__props.push(k);
        const idle = w.__seen && !document.querySelector('.kv2-bc-canvas[data-intro]') && !document.getAnimations().some((a) => a.playState === 'running');
        if (idle) w.__done = true;
        else if (performance.now() >= 10_000) { w.__timedOut = true; w.__done = true; }
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await loadBc(page);
    await page.waitForFunction(() => (window as unknown as { __done: boolean }).__done, null, { timeout: 12_000 });
    const r = await page.evaluate(() => {
      const w = window as unknown as { __seen: boolean; __max: number; __props: string[]; __timedOut: boolean };
      return { __seen: w.__seen, __max: w.__max, __props: w.__props, __timedOut: w.__timedOut };
    });
    expect(r.__timedOut).toBe(false);
    expect(r.__seen).toBe(true);
    expect(r.__max).toBeLessThanOrEqual(10);
    for (const p of r.__props) expect(['offset', 'easing', 'composite', 'computedOffset', 'strokeDashoffset', 'opacity', 'translate']).toContain(p);
    await expect(page.locator('.kv2-bc-canvas[data-intro]')).toHaveCount(0);
    await expect(page.locator('.kv2-bc-draw')).toHaveCount(0);
    await page.getByRole('button', { name: 'List' }).click();
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('.kv2-bc-canvas[data-intro]')).toHaveCount(0); // it does not replay within the page session
    await expect(page.locator('.kv2-bc-draw')).toHaveCount(0);
  });
});

test.describe('phone', () => {
  for (const view of ['map', 'list'] as const) {
    test(`touch targets at 375px (${view}): every visible control is at least 44 x 44, with and without touch emulation`, async ({ browser }) => {
      for (const touch of [true, false]) {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: touch, isMobile: touch, baseURL: ORIGIN });
        const page = await ctx.newPage();
        await loadBc(page, { width: 375, height: 812, view });
        expect(await smallTargets(page), `touch=${touch}`).toEqual([]);
        await ctx.close();
      }
    });
  }

  test('at 320px the matrix is one card per source and the counters sit above the list', async ({ page }) => {
    await loadBc(page, { width: 320, height: 700, view: 'list' });
    await expect(page.locator('.kv2-bc-matrix thead')).toBeHidden();
    const rows = await page.locator('.kv2-bc-matrix tbody tr').count();
    expect(rows).toBe(6);
    const readings = await page.getByTestId('bc-readings').boundingBox();
    const ledger = await page.locator('#bc-ledger').boundingBox();
    expect(readings!.y).toBeLessThan(ledger!.y);
    expect(squash(await page.getByTestId('bc-readings').innerText())).toContain('3 of 6 reachable');
  });

  test('the map is usable on a phone too: ten buttons inside the canvas, none clipped', async ({ page }) => {
    await loadBc(page, { width: 375, height: 812, view: 'map' });
    const box = await page.locator('.kv2-bc-canvas').boundingBox();
    const nodes = await page.locator('.kv2-bc-node').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.width, r.height]; }));
    expect(nodes).toHaveLength(10);
    for (const [l, r, w, h] of nodes as number[][]) {
      expect(l).toBeGreaterThanOrEqual(-0.5);
      expect(r).toBeLessThanOrEqual(375.5);
      expect(w).toBeGreaterThanOrEqual(43.5);
      expect(h).toBeGreaterThanOrEqual(43.5);
    }
    expect(box!.width).toBeGreaterThan(300);
  });

  // BACK-33 (Sonar S6845 on Tables.tsx): the three tables sit in scroll regions with tabIndex={0}. This is the keyboard evidence
  // the owner cites when accepting those warnings: Tab from the control before the region lands on it, it is a named
  // region, and when it overflows the arrow key scrolls it. Two scenarios: the default size (only the ledger overflows, at 320),
  // and a 200% text-only resize (WCAG 1.4.4), approximated by doubling the px font tokens and the table font sizes, where each
  // table overflows at the width chosen for it (the matrix and links tables stack as cards on a phone at default size).
  test('list tables: each scroll region is reachable by Tab, named, and scrolls with the arrow keys', async ({ browser }) => {
    const TEXT_200 = ':root{--kv2-t-xs:22px;--kv2-t-sm:24px;--kv2-t-md:27px;--kv2-t-lg:30px;--kv2-t-xl:36px;--kv2-t-2xl:46px;--kv2-t-3xl:72px}.kv2-table{font-size:26px}.kv2-table thead th{font-size:24px}';
    const REGIONS = [
      { id: 'ledger', line: 31, name: { en: 'Systems ledger', ar: 'سجل الأنظمة' }, wide: 320 },
      { id: 'matrix', line: 79, name: { en: 'Source readings', ar: 'قراءات المصادر' }, wide: 641 },
      { id: 'links', line: 111, name: { en: 'Links between systems', ar: 'الروابط بين الأنظمة' }, wide: 320 },
    ] as const;
    const scrolled = new Set<string>();
    for (const scenario of ['default', 'text-200'] as const) {
      for (const lang of ['en', 'ar'] as const) {
        const key = lang === 'en' ? 'ArrowRight' : 'ArrowLeft';
        for (const region of REGIONS) {
          // default: 375, then 320 only if 375 shows no overflow. text-200: the width chosen for this table.
          const widths = scenario === 'default' ? [375, 320] : [region.wide];
          const log: string[] = [];
          for (const width of widths) {
            const ctx = await browser.newContext({ viewport: { width, height: 812 }, baseURL: ORIGIN });
            const page = await ctx.newPage();
            await loadBc(page, { width, height: 812, view: 'list', lang });
            await waitForIntroDone(page);
            if (scenario === 'text-200') await page.addStyleTag({ content: TEXT_200 });
            const where = `${scenario}/${lang}/${region.id}@${width}`;
            // The surrounding Panel is a region with the same name, so address the scroll wrapper itself.
            const el = page.locator(`#bc-${region.id} .kv2-table-wrap`);
            await expect(el).toHaveCount(1);
            await expect(el).toHaveRole('region');
            await expect(el).toHaveAccessibleName(region.name[lang]);
            // Known starting focus: the last tabbable control before the region in document order.
            const startedFrom = await el.evaluate((r) => {
              const tabbable = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')]
                .filter((e) => !e.hasAttribute('disabled') && e.tabIndex >= 0 && !e.closest('[hidden], [inert]') && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0);
              const before = tabbable.filter((e) => e !== r && (e.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).pop();
              before?.focus();
              return before ? `${before.tagName.toLowerCase()}${before.getAttribute('aria-label') ? `[${before.getAttribute('aria-label')}]` : ''}` : null;
            });
            expect(startedFrom, `${where}: a control precedes the region`).not.toBeNull();
            await page.keyboard.press('Tab');
            expect(await el.evaluate((r) => document.activeElement === r), `${where}: Tab from ${startedFrom} lands on the region`).toBe(true);
            const m = await el.evaluate((r) => ({ sw: r.scrollWidth, cw: r.clientWidth }));
            const overflows = m.sw > m.cw;
            if (scenario === 'text-200') expect(overflows, `${where}: overflows at 200% text (${m.sw}/${m.cw})`).toBe(true);
            if (overflows) {
              const before = await el.evaluate((r) => r.scrollLeft);
              await page.keyboard.press(key);
              await expect.poll(() => el.evaluate((r) => r.scrollLeft), { message: `${where}: ${key} scrolls` }).not.toBe(before);
              scrolled.add(`${scenario}/${lang}/${region.id}`);
            }
            log.push(`${width}px ${m.sw}/${m.cw} ${overflows ? `overflows, ${key} scrolls` : 'no overflow'}`);
            await ctx.close();
            if (overflows) break;
          }
          test.info().annotations.push({ type: `S6845 line ${region.line}`, description: `${scenario} ${lang} ${region.id}: reached by Tab, named; ${log.join('; ')}` });
        }
      }
    }
    // The evidence the SonarCloud comments cite: the ledger scrolls at default size (320), and every table scrolls at 200% text.
    for (const lang of ['en', 'ar']) {
      expect(scrolled.has(`default/${lang}/ledger`), `default/${lang}: ledger scrolls by arrow key at 320`).toBe(true);
      for (const r of REGIONS) expect(scrolled.has(`text-200/${lang}/${r.id}`), `text-200/${lang}/${r.id} scrolls by arrow key`).toBe(true);
    }
  });
});

// BACK-34: on a phone the canvas aspect ratio changes while the SVG stretches (preserveAspectRatio="none"), so the cues that
// must keep their shape are HTML markers and non-scaling strokes. Node coordinates are not moved (SPEC.md deviation record).
test.describe('phone map legibility', () => {
  for (const [width, height] of [[320, 700], [375, 812], [768, 1024]] as const) {
    test(`map at ${width}px: link markers are round, on their link, counted from the DOM; strokes do not scale; orbs do not overlap`, async ({ page }) => {
      await loadBc(page, { width, height, view: 'map' });
      await waitForIntroDone(page);

      // markers are HTML siblings of the node buttons, not SVG shapes
      await expect(page.locator('.kv2-bc-svg .kv2-bc-mk')).toHaveCount(0);
      const expected = await page.locator('.kv2-bc-edge').evaluateAll((els) => els.filter((e) => {
        const d = (e as SVGElement).dataset;
        return d.truth !== 'unknown' && d.cls !== 'group'; // observed, correlated and hypothesis links carry a marker, as before
      }).length);
      expect(expected).toBeGreaterThan(0);
      await expect(page.locator('.kv2-bc-canvas > .kv2-bc-mk')).toHaveCount(expected);

      const marks = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.kv2-bc-mk')].map((m) => {
        const r = m.getBoundingClientRect();
        const path = document.querySelector<SVGPathElement>(`.kv2-bc-edge[data-id="${m.dataset.edge}"] path:not(.kv2-bc-glow)`)!;
        const p = path.getPointAtLength(path.getTotalLength() / 2);
        const q = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
        return { edge: m.dataset.edge, w: r.width, h: r.height, off: Math.hypot(r.left + r.width / 2 - q.x, r.top + r.height / 2 - q.y) };
      }));
      expect(marks).toHaveLength(expected);
      for (const m of marks) {
        expect(m.w, `${m.edge} width`).toBeGreaterThanOrEqual(10);
        expect(m.h, `${m.edge} height`).toBeGreaterThanOrEqual(10);
        expect(Math.abs(m.w - m.h), `${m.edge} stretched`).toBeLessThanOrEqual(1);
        expect(m.off, `${m.edge} off its link`).toBeLessThanOrEqual(3);
      }

      const effects = await page.evaluate(() => [...document.querySelectorAll('.kv2-bc-edge path, .kv2-bc-orbit')].map((e) => getComputedStyle(e).vectorEffect));
      expect(effects.length).toBeGreaterThan(0);
      expect([...new Set(effects)]).toEqual(['non-scaling-stroke']);

      const orbs = await page.locator('.kv2-bc-orb').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, n: (e.closest('[data-node]') as HTMLElement).dataset.node }; }));
      expect(orbs).toHaveLength(10);
      for (let i = 0; i < orbs.length; i++) {
        for (let j = i + 1; j < orbs.length; j++) {
          const a = orbs[i]!; const b = orbs[j]!;
          const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
          const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
          expect(ox > 4 && oy > 4, `orbs ${a.n} and ${b.n} overlap by ${Math.round(ox)} x ${Math.round(oy)}`).toBe(false);
        }
      }

      if (width <= 640) expect(await smallTargets(page)).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await clippedElements(page)).toEqual([]);
    });
  }

  test('markers keep their shape and colour state: dim follows the edge, and they stay left-to-right in Arabic', async ({ page }) => {
    await loadBc(page, { width: 375, height: 812, view: 'map', lang: 'ar', node: 'stock-sync' });
    await waitForIntroDone(page);
    const dimEdges = await page.locator('.kv2-bc-edge[data-dim]').evaluateAll((els) => els.map((e) => (e as SVGElement).dataset.id).sort());
    const dimMarks = await page.locator('.kv2-bc-mk[data-dim]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.edge).sort());
    const withMark = await page.locator('.kv2-bc-mk').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.edge));
    expect(dimMarks).toEqual(dimEdges.filter((id) => withMark.includes(id)));
    expect(await page.locator('.kv2-bc-mk').evaluateAll((els) => els.map((e) => getComputedStyle(e).direction))).toEqual(withMark.map(() => 'ltr'));
    await expect(page.locator('.kv2-bc-mk[data-shape="diamond"]')).not.toHaveCount(0);
    await expect(page.locator('.kv2-bc-mk[data-shape="circle"]')).not.toHaveCount(0);
  });

  test('reduced motion at 375px: markers are present and nothing animates', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: ORIGIN });
    const page = await ctx.newPage();
    await loadBc(page, { width: 375, height: 812, view: 'map' });
    await expect(page.locator('.kv2-bc-mk').first()).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await ctx.close();
  });
});
