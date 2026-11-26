import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { LANGS, openRoute, PERSONAS, WIDTHS, type LoadQuery } from './helpers';

const load = (page: Page, q: LoadQuery = {}) => openRoute(page, '/investigation/INV-DEMO-7', q);

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`layout ${lang} @${width}px: no overflow, one h1, ordered headings, sources, no console errors`, async ({ page }) => {
      const errors = await load(page, { lang, width });
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      // Each of the five source states is visible.
      for (const p of ['github', 'jira', 'sentry', 'datadog', 'port']) await expect(page.locator(`[data-provider="${p}"]`)).toBeVisible();
      await expect(page.locator('.source.conn-not_configured')).toHaveCount(1);
      await expect(page.locator('.source.conn-unavailable')).toHaveCount(1);
      await expect(page.locator('.source.fresh-stale')).toHaveCount(2);
      await expect(page.locator('.demo')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`controls ${lang}/${persona}: no forbidden action verbs`, async ({ page }) => {
      await load(page, { lang, persona });
      const labels = await page.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
      expect(labels.length).toBeGreaterThan(5);
      for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
    });

    test(`truth ${lang}/${persona}: impact unknown, no healthy node without evidence`, async ({ page }) => {
      await load(page, { lang, persona });
      await expect(page.locator('.impact [data-truth="unknown"]')).toBeVisible();
      await expect(page.locator('[data-health="healthy"]')).toHaveCount(0);
      await expect(page.locator('[data-node="inventory"] [data-health="unknown"]')).toBeVisible();
      await expect(page.locator('[data-fact]')).toHaveCount(5);
    });
  }
}

test('touch targets are at least 44 px at 375 px', async ({ page }) => {
  await load(page, { width: 375 });
  const small = await page.locator('main button, header button').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  expect(small).toBe(0);
});

test('drawer: keyboard open, focus inside, Tab stays inside, Esc returns focus', async ({ page }) => {
  await load(page);
  const opener = page.locator('[data-evidence="E-1"] button');
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  // Focus drifts to the page body (e.g. a click on plain text): the next Tab must land back inside the dialog.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  // The page behind the dialog is inert.
  expect(await page.locator('#root').getAttribute('inert')).not.toBeNull();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.locator('#root').getAttribute('inert')).toBeNull();
  await expect(opener).toBeFocused();
});

test('segmented controls show a focus ring that is not clipped', async ({ page }) => {
  await load(page);
  await page.locator('.seg button').first().focus();
  await page.keyboard.press('Tab'); // keyboard focus so :focus-visible applies
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { inSeg: !!el.closest('.seg'), style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset) };
  });
  expect(ring.inSeg).toBe(true);
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThan(0);
  expect(ring.offset).toBeLessThan(0); // drawn inside the button, so overflow:hidden on the group cannot clip it
});

test('copy status resets when persona changes', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await load(page);
  await page.getByRole('button', { name: 'Copy proposal text' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied');
  await page.getByRole('button', { name: 'Technical', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('');
});

test('persona redaction: raw output for technical only', async ({ page }) => {
  await load(page, { persona: 'technical' });
  await page.locator('[data-evidence="E-1"] button').click();
  await expect(page.locator('.raw')).toContainText('AssertionError');
  await expect(page.locator('.inert-link')).toContainText('example.invalid');

  for (const persona of ['owner', 'nontechnical'] as const) {
    await load(page, { persona });
    await page.locator('[data-evidence="E-1"] button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('AssertionError');
    await expect(page.locator('.inert-link')).toHaveCount(0);
  }
});

test('nontechnical sees plain labels', async ({ page }) => {
  await load(page, { persona: 'nontechnical' });
  await expect(page.locator('[data-fact="observed"] .truth')).toHaveText('Confirmed');
  await expect(page.locator('[data-fact="hypothesis"] .truth')).toHaveText('Likely reason');
});

test('arabic: map keeps left-to-right, ids are isolated', async ({ page }) => {
  await load(page, { lang: 'ar', persona: 'technical' });
  const dir = await page.getByTestId('stage-map').evaluate((el) => getComputedStyle(el).direction);
  expect(dir).toBe('ltr');
  const isolated = await page.locator('bdi[dir="ltr"]').allTextContents();
  for (const token of ['RT-DEMO-112', '#DEMO-4471', 'Retail Tower OS', 'INV-DEMO-7']) {
    expect(isolated.some((t) => t.includes(token)), token).toBe(true);
  }
  const arabicIndic = await page.evaluate(() => /[٠-٩۰-۹]/.test(document.body.innerText));
  expect(arabicIndic).toBe(false);
});

for (const lang of LANGS) {
  test(`layout ${lang} @320px technical: longest unbreakable tokens still fit`, async ({ page }) => {
    const errors = await load(page, { lang, persona: 'technical', width: 320 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

for (const lang of LANGS) {
  for (const persona of ['owner', 'nontechnical'] as const) {
    test(`redaction ${lang}/${persona}: no job names, run ids or PR ids in list or drawers`, async ({ page }) => {
      await load(page, { lang, persona });
      const banned = ['integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'AssertionError', 'example.invalid'];
      const check = async () => {
        const text = await page.locator('body').innerText();
        for (const b of banned) expect(text.includes(b), `${persona}/${lang}: ${b}`).toBe(false);
      };
      await check();
      for (const id of ['E-1', 'E-2', 'E-3']) {
        await page.locator(`[data-evidence="${id}"] button`).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await check();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    });
  }
}

for (const persona of PERSONAS) {
  test(`arabic/${persona}: no Latin run outside a left-to-right isolate (v4 §7 rule)`, async ({ page }) => {
    await load(page, { lang: 'ar', persona });
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
    expect(await offenders()).toEqual([]);
    await page.locator('[data-evidence="E-1"] button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await offenders()).toEqual([]);
  });
}

for (const width of [320, 375] as const) {
  test(`arabic @${width}px: ids and versions never break across lines`, async ({ page }) => {
    await load(page, { lang: 'ar', persona: 'technical', width });
    const broken = await page.locator('main bdi.ltr:not(.inert-link)').evaluateAll((els) =>
      els.filter((e) => e.getClientRects().length > 1).map((e) => e.textContent));
    expect(broken).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('reduced motion: no running animations when the drawer opens', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  await page.locator('[data-evidence="E-3"] button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

// BACK-62: a stale evidence row is visibly different from a current one (not only in its text).
for (const lang of LANGS) {
  test(`stale rows ${lang}: styled apart from current rows, with freshness on every row`, async ({ page }) => {
    await load(page, { lang, persona: 'technical' });
    const rows = page.locator('.evidence-list > li[data-evidence]');
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(rows.nth(i)).toHaveAttribute('data-freshness', /^(current|stale|unknown)$/);
    const stale = page.locator('li[data-evidence][data-freshness="stale"]').first();
    const current = page.locator('li[data-evidence][data-freshness="current"]').first();
    await expect(stale).toHaveClass(/fresh-stale/);
    const side = (l: typeof stale) => l.evaluate((el) => getComputedStyle(el).borderInlineStartStyle);
    expect(await side(stale)).toBe('solid');
    expect(await side(current)).not.toBe('solid');
  });
}

// BACK-57 (owner decision 2026-11-26): server-shaped records of a separate synthetic case, from the committed fixtures through
// the src/api adapters. Demo data, read states only, no links, nothing requested. Owner and Technical see it; Nontechnical does not.
const SRV_DEMO = { en: 'Demo data: synthetic records, not live', ar: 'بيانات تجريبية: سجلات مصطنعة، ليست مباشرة' } as const;
const SRV_TITLE = { en: 'Server-shaped demo records', ar: 'سجلات تجريبية بصيغة الخادم' } as const;
const SRV_LABEL = { en: ['Hypothesis', 'Unknown', 'Proposed'], ar: ['فرضية', 'مجهول', 'مقترح'] } as const;
const SRV_READ = { en: ['Stale', 'Not read'], ar: ['قديمة', 'غير مقروءة'] } as const;
for (const lang of LANGS) {
  for (const persona of ['owner', 'technical'] as const) {
    test(`server-shaped records ${lang}/${persona}: demo marker, type badges, read states, proposed decision, no health word, no link, no request`, async ({ page }) => {
      const requests: string[] = [];
      page.on('request', (r) => { if (!['document', 'script', 'stylesheet', 'image', 'font'].includes(r.resourceType())) requests.push(`${r.resourceType()} ${r.url()}`); });
      const errors = await load(page, { lang, persona });
      const panel = page.getByTestId('server-records');
      await expect(panel).toBeVisible();
      await expect(panel.locator('h2')).toHaveText(SRV_TITLE[lang]);
      await expect(panel.getByTestId('server-records-demo')).toHaveText(SRV_DEMO[lang]);
      const records = panel.getByTestId('server-record');
      await expect(records).toHaveCount(2);
      await expect(panel.locator('[data-testid="server-record"] [data-truth]')).toHaveText([SRV_LABEL[lang][0], SRV_LABEL[lang][1]]);
      await expect(panel.locator('.srv-read')).toHaveText([...SRV_READ[lang]]);
      await expect(records.nth(1)).toContainText(lang === 'ar' ? 'فشلت قراءة المصدر.' : 'The source read failed.');
      await expect(records.nth(1).locator('.srv-age')).toHaveCount(0);
      const decision = panel.getByTestId('server-decision');
      await expect(decision).toHaveCount(1);
      await expect(decision.locator('[data-truth]')).toHaveText(SRV_LABEL[lang][2]);
      await expect(decision.locator('[data-creator="recorded"]')).toBeVisible();
      await expect(panel.locator('[data-truth="approved"], [data-truth="observed"], [data-read="current"], [data-health], a, button')).toHaveCount(0);
      expect(await panel.innerText()).not.toMatch(/healthy|سليم/i);
      // Owner sees no source reference and none of the server's free text; Technical sees both, isolated left to right.
      const refs = panel.locator('bdi.srv-ref');
      if (persona === 'owner') {
        await expect(refs).toHaveCount(0);
        for (const t of ['example-org', '#42', 'checkout-e2e', 'actions/runs']) await expect(panel).not.toContainText(t);
      } else {
        await expect(refs).toHaveText(['github:example-org/demo-storefront#pull/42', 'github:example-org/demo-storefront#actions/runs/1002', 'Revert pull request #42 on main and re-run checkout-e2e']);
        for (const el of await refs.all()) await expect(el).toHaveAttribute('dir', 'ltr');
      }
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test(`server-shaped records ${lang}/nontechnical: no panel`, async ({ page }) => {
    await load(page, { lang, persona: 'nontechnical' });
    await expect(page.getByTestId('server-records')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(SRV_TITLE[lang]);
  });
}
