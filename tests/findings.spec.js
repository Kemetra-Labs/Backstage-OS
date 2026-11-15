// BACK-4: independent reproduction of the bootstrap commit's findings F1-F6 against the served prototype.
const { test, expect } = require('@playwright/test');
const { openApp, setSrc, overlaps } = require('./helpers');

const box = loc => loc.first().boundingBox();

test.describe('F1 investigation status bar does not overlap the dependency graph', () => {
  for (const [w, h] of [[1440, 900], [1280, 800], [1100, 800], [1024, 768], [768, 1024], [390, 844], [320, 640]]) {
    for (const src of ['ok', 'stale', 'down']) {
      test(`all investigations @ ${w}px, source ${src}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await openApp(page);
        await setSrc(page, src);
        const ids = await page.evaluate(() => Object.keys(INVESTIGATIONS));
        const bad = [];
        for (const id of ids) {
          await page.evaluate(i => { S.inv = i; S.tab.inv = 'overview'; S.node = null; go('investigation'); }, id);
          const bar = page.locator('.statbar'), map = page.locator('.map');
          if (!(await bar.count()) || !(await map.count())) continue;
          if (overlaps(await box(bar), await box(map))) bad.push(id);
        }
        expect(bad, 'investigations whose status bar overlaps the graph').toEqual([]);
      });
    }
  }
});

test.describe('F2 Home risks and milestones cards are full width on mobile', () => {
  for (const w of [320, 375, 390, 430]) {
    test(`@ ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await openApp(page, { persona: 'owner' });
      const content = await box(page.locator('main#main'));
      for (const id of ['h-risk', 'h-ms']) {
        const p = await box(page.locator(`section[aria-labelledby="${id}"]`));
        expect(p, `${id} panel rendered`).not.toBeNull();
        expect(p.width, `${id} panel width ${p.width} vs content ${content.width}`).toBeGreaterThanOrEqual(content.width * 0.9 - 40);
        expect(p.x + p.width).toBeLessThanOrEqual(w + 0.5);
      }
    });
  }
});

test.describe('F3 "Soonest due" sorts chronologically', () => {
  // Demo inbox dates: D2 Nov 17, D1 Nov 18, D4 Nov 19, D3 Nov 30, D5 Dec 1 (Dec 1 must come after Nov 30).
  for (const lang of ['en', 'ar']) {
    test(`inbox order (${lang})`, async ({ page }) => {
      await openApp(page, { lang }, '#decisions');
      await page.locator('select[data-chg="dsort"]').selectOption('due');
      const ids = await page.locator('.dlist .dcard').evaluateAll(els => els.map(e => e.dataset.id));
      expect(ids).toEqual(['D2', 'D1', 'D4', 'D3', 'D5']);
    });
  }
});

test.describe('F4 mobile navigation focus', () => {
  for (const w of [390, 1024]) {
    test(`closed nav is unreachable by keyboard @ ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await openApp(page);
      expect(await page.locator('.side').evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
      const hits = [];
      for (let i = 0; i < 45; i++) { await page.keyboard.press('Tab'); hits.push(await page.evaluate(() => !!document.activeElement.closest('.side'))); }
      expect(hits.some(Boolean), 'Tab ever landed inside the closed nav').toBe(false);
    });
    test(`open moves focus in; Escape closes and returns focus @ ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await openApp(page);
      await page.locator('.menu-btn').click();
      await expect(page.locator('.side')).toHaveClass(/open/);
      await expect(page.locator('.side .nav button').first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('.side')).not.toHaveClass(/open/);
      await expect(page.locator('.menu-btn')).toBeFocused();
    });
  }
  test('RTL: nav is hidden when closed and opens at the right edge', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openApp(page, { lang: 'ar' });
    expect(await page.locator('.side').evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
    await page.locator('.menu-btn').click();
    await page.waitForTimeout(400); // slide transition .28s
    const b = await box(page.locator('.side'));
    expect(b.x + b.width).toBeGreaterThan(390 - 1);
  });
});

test.describe('F5 source provenance / freshness; Unknown is never Healthy', () => {
  test('down: home never shows engineering projects as On track, and says so', async ({ page }) => {
    await openApp(page);
    await setSrc(page, 'down');
    await expect(page.locator('.notice.crit').first()).toContainText(/not being read|unknown/i);
    const labels = await page.locator('.pcard').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    expect(labels.filter(t => /on track/i.test(t)), labels.join(' | ')).toEqual([]);
    expect(await page.locator('.pcard .badge.b-ok').count()).toBe(0);
  });
  test('down: evidence tab shows unavailable notice', async ({ page }) => {
    await openApp(page, { tab: { inv: 'evidence' } }, '#investigation');
    await setSrc(page, 'down');
    await expect(page.locator('.notice.crit').first()).toContainText(/not being read/i);
  });
  test('stale: evidence tab shows 9 h warning', async ({ page }) => {
    await openApp(page, { tab: { inv: 'evidence' } }, '#investigation');
    await setSrc(page, 'stale');
    await expect(page.locator('.notice.warn').first()).toContainText(/9 h/);
  });
  test('graph: nodes become unknown when sources are unavailable', async ({ page }) => {
    await openApp(page, {}, '#investigation');
    await setSrc(page, 'down');
    const states = await page.evaluate(() => INVESTIGATIONS[S.inv].nodes.map(n => effNode(n).s));
    expect(new Set(states)).toEqual(new Set(['unk']));
  });
  test('customers: stale warning and unavailable state', async ({ page }) => {
    await openApp(page, {}, '#network');
    await setSrc(page, 'stale');
    await expect(page.locator('.notice.warn').first()).toContainText(/9 h/);
    await setSrc(page, 'down');
    await expect(page.locator('main#main')).toContainText(/unavailable|not read|not being read/i);
  });
});

test.describe('F6 Reset demo', () => {
  test('restores demo state, keeps preferences, clears pending agent timers', async ({ page }) => {
    const { errors } = await openApp(page, { persona: 'tech', lang: 'en' }, '#agents');
    await page.locator('button[data-act="agentnew"]').click(); // starts a simulated run (timer)
    expect(await page.evaluate(() => Object.keys(S.runs).length)).toBeGreaterThan(0);
    await page.evaluate(() => { S.dsort = 'due'; S.dfilter = '1'; S.tab.dec = 'review'; S.inv = 'INV-999'; });
    await page.locator('.chip-btn.fresh').click();
    await page.locator('.pop button[data-v="down"]').click();
    await page.locator('.pop [data-act="reset"]').click();
    const st = await page.evaluate(() => ({ runs: Object.keys(S.runs).length, timers: Object.keys(TIMERS).length, src: S.src, dsort: S.dsort, dfilter: S.dfilter, tab: S.tab.dec, persona: S.persona, lang: S.lang, route: S.route, pop: S.pop }));
    expect(st).toMatchObject({ runs: 0, timers: 0, src: 'ok', dsort: 'priority', dfilter: 'all', tab: 'inbox', persona: 'tech', lang: 'en', route: 'agents', pop: false });
    await page.waitForTimeout(8000); // a leaked timer would fire a "finished" toast / history row
    expect(await page.evaluate(() => ({ runs: Object.keys(S.runs).length, items: (S.hist.items || []).length }))).toEqual({ runs: 0, items: 0 });
    await expect(page.locator('#toast')).not.toContainText(/finished/i);
    expect(errors).toEqual([]);
  });
});
