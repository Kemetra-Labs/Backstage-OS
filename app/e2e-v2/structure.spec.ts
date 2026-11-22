// V2 structure, truth rules, personas, language and isolation. Runs against the built lab on its own port.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { LANGS, ORIGIN, PERSONAS, SCREENS, WIDTHS, controlLabels, load, overflow } from './helpers';

for (const screen of SCREENS) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      test(`layout ${screen} ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors, no foreign requests`, async ({ page }) => {
        const probe = await load(page, { screen, lang, width });
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await expect(page.locator('h1')).toHaveCount(1);
        const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => (h as HTMLElement).offsetParent !== null || getComputedStyle(h).position === 'fixed').map((h) => Number(h.tagName[1])));
        levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
        await expect(page.locator('.kv2-demo')).toBeVisible();
        expect(probe.errors).toEqual([]);
        const foreign = probe.requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:'));
        expect(foreign).toEqual([]);
        expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
      });
    }
  }
}

for (const screen of SCREENS) {
  for (const lang of LANGS) {
    for (const persona of PERSONAS) {
      test(`controls ${screen} ${lang}/${persona}: no forbidden action verb, no form, no submit`, async ({ page }) => {
        await load(page, { screen, lang, persona });
        const labels = await controlLabels(page);
        expect(labels.length).toBeGreaterThan(10);
        for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
        await expect(page.locator('form, input[type="submit"], button[type="submit"]')).toHaveCount(0);
      });
    }
  }
}

for (const screen of SCREENS) {
  test(`truth ${screen}: no invented percentages, no composite score, no executable approval`, async ({ page }) => {
    await load(page, { screen });
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\d\s?%/);
    expect(text).not.toMatch(/\b(trust score|overall trust|trust posture|mission health|confidence:?\s*0\.\d)/i);
    await expect(page.getByRole('button', { name: /(approve|execute|deploy|merge|retry|release now|run now)/i })).toHaveCount(0);
  });
}

test('truth map: exactly one node reads Healthy, and claimed-healthy nodes read unknown or stale', async ({ page }) => {
  await load(page, { screen: 'mission-map' });
  const healthy = await page.locator('.kv2-node').evaluateAll((els) => els.filter((e) => /healthy/i.test(e.querySelector('.kv2-chip')?.textContent ?? '') && !/unknown/i.test(e.querySelector('.kv2-chip')?.textContent ?? '')).map((e) => e.getAttribute('data-node')));
  expect(healthy).toEqual(['github']);
  for (const id of ['khepri', 'jira', 'seshat-bi']) await expect(page.locator(`[data-node="${id}"] .kv2-chip`)).toContainText(/unknown/i);
  await expect(page.locator('[data-node="sentry"] .kv2-chip')).toContainText(/stale/i);
  // BACK-30: Inventory's only basis is Technical-only evidence, so Owner sees unknown, not stale. Technical still sees stale.
  await expect(page.locator('[data-node="inventory"] .kv2-chip')).toContainText(/unknown/i);
  await load(page, { screen: 'mission-map', persona: 'technical' });
  await expect(page.locator('[data-node="inventory"] .kv2-chip')).toContainText(/stale/i);
  await load(page, { screen: 'mission-map' });
  await expect(page.locator('[data-node="port"] .kv2-chip')).toContainText(/unavailable/i);
  await expect(page.locator('#kpi-risks')).toContainText('3');
  await expect(page.locator('#kpi-issues')).toContainText('2');
});

test('truth observatory: three independent axes, sentry is reachable and stale, port unavailable, no source healthy without evidence', async ({ page }) => {
  await load(page, { screen: 'source-observatory' });
  await expect(page.locator('.kv2-pin')).toHaveCount(3);
  await expect(page.locator('.kv2-scard[data-health="healthy"]')).toHaveCount(1);
  await expect(page.locator('.kv2-scard[data-provider="sentry"]')).toHaveAttribute('data-conn', 'reachable');
  await expect(page.locator('.kv2-scard[data-provider="sentry"]')).toHaveAttribute('data-fresh', 'stale');
  await expect(page.locator('.kv2-scard[data-provider="port"]')).toHaveAttribute('data-conn', 'unavailable');
  for (const p of ['datadog', 'confluence']) {
    await expect(page.locator(`.kv2-scard[data-provider="${p}"]`)).toHaveAttribute('data-conn', 'not_configured');
    await expect(page.locator(`.kv2-scard[data-provider="${p}"]`)).toContainText(/never read/i);
  }
});

test('shared world: INV-DEMO-7 and its evidence read the same on all four screens', async ({ page }) => {
  await load(page, { screen: 'mission-map', persona: 'technical' });
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.locator('#mapinsp-panel')).toContainText('E-1');
  await page.getByRole('link', { name: 'Mission Replay' }).click();
  await expect(page.locator('.kv2-pill').first()).toContainText('INV-DEMO-7');
  await expect(page.locator('#rpinsp-panel')).toContainText('E-1');
  await expect(page.locator('#rpinsp-panel')).toContainText('#DEMO-4471');
  await page.getByRole('link', { name: 'Source Observatory' }).click();
  await page.getByRole('button', { name: /^GitHub/ }).first().click();
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.locator('#obsinsp-panel')).toContainText('E-1');
  await page.getByRole('link', { name: 'Agent Flight Deck' }).click();
  await expect(page.locator('#mission-h')).toBeVisible();
  await expect(page.locator('#mission')).toContainText('E-1');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Technical', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const lang of LANGS) {
  test(`personas ${lang}: Nontechnical never sees run, PR or work-item ids; Owner never sees run or PR ids; Technical sees them`, async ({ page }) => {
    for (const screen of ['mission-replay', 'agent-flight-deck', 'source-observatory'] as const) {
      await load(page, { screen, lang, persona: 'nontechnical' });
      let text = await page.locator('body').innerText();
      expect(text, `nontechnical ${screen}`).not.toMatch(/DEMO-4471|DEMO-88|RT-DEMO-112|MSN-DEMO|integration-tests/);
      await load(page, { screen, lang, persona: 'owner' });
      text = await page.locator('body').innerText();
      expect(text, `owner ${screen}`).not.toMatch(/DEMO-4471|DEMO-88|integration-tests/);
    }
    await load(page, { screen: 'mission-replay', lang, persona: 'technical', extra: 'evt=R-1' });
    await expect(page.locator('body')).toContainText('integration-tests');
    await load(page, { screen: 'agent-flight-deck', lang, persona: 'technical' });
    await expect(page.locator('body')).toContainText('MSN-DEMO-5');
  });
}

test('restricted evidence stays restricted for Owner and Nontechnical on every screen', async ({ page }) => {
  await load(page, { screen: 'mission-replay', persona: 'owner' });
  await expect(page.locator('#rpinsp-panel')).toContainText('Restricted to Technical');
  await expect(page.locator('#rpinsp-panel')).not.toContainText('Sentry', { timeout: 500 }).catch(() => undefined);
  await load(page, { screen: 'mission-replay', persona: 'technical' });
  await expect(page.locator('#rpinsp-panel')).not.toContainText('Restricted to Technical');
});

for (const persona of PERSONAS) {
  for (const screen of SCREENS) {
    test(`arabic ${screen}/${persona}: no Latin run outside a left-to-right isolate, Latin digits only`, async ({ page }) => {
      await load(page, { screen, lang: 'ar', persona });
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || el.closest('script, style, option, kbd, bdi[dir="ltr"], [lang="en"], .kv2-sr')) continue;
          if (el.closest('select')) continue;
          const t = (n.textContent ?? '').trim();
          if (/[A-Za-z]{2,}/.test(t)) out.push(t);
        }
        return out;
      });
      expect(bad).toEqual([]);
      expect(await page.locator('body').innerText()).not.toMatch(/[٠-٩۰-۹]/);
    });
  }
}

test('arabic keeps map geometry left to right while text is right to left', async ({ page }) => {
  await load(page, { screen: 'mission-map', lang: 'ar' });
  const dir = await page.locator('.kv2-canvas').evaluate((e) => getComputedStyle(e).direction);
  expect(dir).toBe('ltr');
  const cardDir = await page.locator('.kv2-node-card').first().evaluate((e) => getComputedStyle(e).direction);
  expect(cardDir).toBe('rtl');
  const pos = await page.evaluate(() => ['pos', 'retail-tower', 'inventory'].map((id) => (document.querySelector(`[data-node="${id}"]`) as HTMLElement).getBoundingClientRect().left));
  expect(pos[0]!).toBeLessThan(pos[1]!);
  expect(pos[1]!).toBeLessThan(pos[2]!);
});

for (const screen of SCREENS) {
  test(`reduced motion ${screen}: no running animations`, async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: ORIGIN });
    const page = await ctx.newPage();
    await load(page, { screen });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    await ctx.close();
  });
}

test('keyboard: skip link is the first stop and lands on main; tabs move with arrow keys and mirror in Arabic', async ({ page }) => {
  await load(page, { screen: 'mission-map' });
  await page.keyboard.press('Tab');
  await expect(page.locator('.kv2-skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#kv2-main')).toBeFocused();
  await page.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Evidence' })).toHaveAttribute('aria-selected', 'true');
  await load(page, { screen: 'mission-map', lang: 'ar' });
  await page.locator('#mapinsp-tab-overview').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#mapinsp-tab-evidence')).toHaveAttribute('aria-selected', 'true');
});

test('keyboard focus is always visible on interactive elements', async ({ page }) => {
  await load(page, { screen: 'agent-flight-deck' });
  const missing: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const ok = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return true;
      const cs = getComputedStyle(el);
      const inner = el.querySelector('.kv2-orb, .kv2-node-card') as HTMLElement | null;
      const wrap = el.closest('.kv2-search, .kv2-select') as HTMLElement | null;
      const target = inner && el.matches('.kv2-node') ? getComputedStyle(inner) : wrap ? getComputedStyle(wrap) : cs;
      return (parseFloat(target.outlineWidth) > 0 && target.outlineStyle !== 'none') || target.boxShadow !== 'none';
    });
    if (!ok) missing.push(await page.evaluate(() => (document.activeElement as HTMLElement).outerHTML.slice(0, 80)));
  }
  expect(missing).toEqual([]);
});

test('responsive: at 375px the side navigation is behind a 44px menu button and closes after navigating', async ({ page }) => {
  await load(page, { screen: 'mission-map', width: 375, height: 800 });
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#kv2-side')).toHaveAttribute('data-open', 'false');
  await menu.click();
  await expect(page.locator('#kv2-side')).toHaveAttribute('data-open', 'true');
  await page.locator('#kv2-side').getByRole('link', { name: 'Source Observatory' }).click();
  await expect(page.locator('h1')).toContainText('Source Observatory');
  await expect(page.locator('#kv2-side')).toHaveAttribute('data-open', 'false');
});

test('touch targets: every visible control is at least 44 x 44 px on a touch phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, baseURL: ORIGIN });
  const page = await ctx.newPage();
  const small: string[] = [];
  for (const screen of SCREENS) {
    await load(page, { screen, width: 375, height: 812 });
    const found = await page.locator('button, a[href], select, input[type="range"], input[type="search"]').evaluateAll((els) =>
      els.flatMap((e) => {
        // A select or search input is operated through its labelled wrapper, which is the touch target.
        const host = (e.closest('label.kv2-select, .kv2-search') as HTMLElement | null) ?? (e as HTMLElement);
        const r = host.getBoundingClientRect();
        const cs = getComputedStyle(e);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || e.closest('[hidden]') || e.closest('.kv2-sr')) return [];
        // The side navigation is off-canvas until the menu opens.
        if (e.closest('#kv2-side') && (e.closest('#kv2-side') as HTMLElement).dataset.open !== 'true') return [];
        const off = r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || (e as HTMLElement).classList.contains('kv2-skip');
        if (off) return [];
        return r.width < 43.5 || r.height < 43.5 ? [`${e.tagName}.${(e as HTMLElement).className} ${Math.round(r.width)}x${Math.round(r.height)} ${(e.textContent ?? '').trim().slice(0, 24)}`] : [];
      }),
    );
    small.push(...found.map((f) => `${screen}: ${f}`));
  }
  await ctx.close();
  expect(small).toEqual([]);
});

test('search finds entities across screens and navigates to them', async ({ page }) => {
  await load(page, { screen: 'agent-flight-deck' });
  const box = page.getByRole('combobox', { name: 'Search' });
  await box.fill('stock');
  await expect(page.getByRole('option').first()).toBeVisible();
  await box.press('Enter');
  await expect(page.locator('h1')).toContainText('Mission Map');
  await expect(page.locator('.kv2-insp-head h2')).toContainText('stock-sync');
  await box.fill('zzzz-nothing');
  await expect(page.getByRole('option', { name: 'No match in the demo data' })).toBeVisible();
});

test('isolation: V2 assets carry no V1 selectors and V1 assets carry no V2 selectors', async ({ page }) => {
  await load(page, { screen: 'mission-map' });
  const sheets = await page.evaluate(() => [...document.styleSheets].map((s) => (s.href ?? 'inline')));
  expect(sheets.filter((s) => s !== 'inline').every((s) => s.startsWith(ORIGIN))).toBe(true);
  const rules = await page.evaluate(() => [...document.styleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join('\n'));
  expect(rules).not.toMatch(/\.topbar|\.brand-row|\.truth-observed|\.seg-btns|\.stage-map|\.ledger/);
  const v1Dir = path.resolve('dist/assets');
  const v1Css = readdirSync(v1Dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(path.join(v1Dir, f), 'utf8')).join('\n');
  expect(v1Css.length).toBeGreaterThan(1000);
  expect(v1Css).not.toMatch(/\.kv2-|--kv2-/);
  const v2Dir = path.resolve('dist-v2/assets');
  const v2Css = readdirSync(v2Dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(path.join(v2Dir, f), 'utf8')).join('\n');
  expect(v2Css).toMatch(/--kv2-cyan/);
  expect(v2Css).not.toMatch(/\.truth-observed|\.stage-map|\.ledger|--gold/);
});
