import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { BANNED, LANGS, openRoute, PERSONAS, WIDTHS, type LoadQuery } from './helpers';

const load = async (page: Page, q: LoadQuery = {}) => {
  const errors = await openRoute(page, '/', q);
  await expect(page.getByTestId('home-attention')).toBeVisible();
  return errors;
};

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`home layout ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
      const errors = await load(page, { lang, width });
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      expect(errors).toEqual([]);
    });
  }
}

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`home controls ${lang}/${persona}: no forbidden action verbs`, async ({ page }) => {
      await load(page, { lang, persona });
      const labels = await page.locator('main button, main a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
      expect(labels.length).toBeGreaterThan(8);
      for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
    });

    test(`home truth ${lang}/${persona}: counts from data, nothing healthy, unknown and stale in words`, async ({ page }) => {
      await load(page, { lang, persona });
      const signal = (k: string) => page.locator(`[data-signal="${k}"] .home-signal-value`);
      await expect(signal('products')).toHaveText('3');
      await expect(signal('attention')).toHaveText('2');
      await expect(signal('investigations')).toHaveText('2');
      await expect(signal('proposals')).toHaveText('2'); // DEC-DEMO-1 is approved, not waiting
      const notCurrent = Number(await signal('sources').textContent());
      expect(notCurrent).toBeGreaterThan(0);
      await expect(page.locator('[data-health="healthy"]')).toHaveCount(0);
      await expect(page.locator('[data-source-health="RT"] [data-health="unknown"]')).toBeVisible();
      await expect(page.locator('[data-source-health="KH"] [data-health="degraded"]')).toBeVisible();
      await expect(page.locator('[data-source-health="SB"] [data-health="unknown"]')).toBeVisible();
      await expect(page.locator('[data-source-health="SB"] .triad-item.conn-not_configured')).toBeVisible();
      // The Retail Tower CI failure leads the attention list.
      await expect(page.locator('[data-attention]').first()).toHaveAttribute('data-attention', 'ATT-RT-1');
      await expect(page.locator('[data-attention="ATT-RT-1"] .sev-high')).toBeVisible();
      await expect(page.locator('[data-attention="ATT-RT-1"] [data-truth]')).toHaveCount(2);
      // Proposals appear only as Proposed work: none is shown as approved.
      await expect(page.getByTestId('home-proposals').locator('[data-truth="approved"]')).toHaveCount(0);
    });
  }
}

test('home: simulated agent events are marked and activity is newest first', async ({ page }) => {
  await load(page, { lang: 'en' });
  const items = page.locator('[data-testid="home-activity"] [data-timeline]');
  expect(await items.count()).toBeGreaterThan(3);
  await expect(page.locator('[data-timeline="ACT-3"]')).toContainText('Simulated');
  const ages = await page.locator('[data-testid="home-activity"] .tl-time').allTextContents();
  const minutes = ages.map((a) => (a.includes(' h ') ? 60 * parseInt(a, 10) : parseInt(a, 10)));
  expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
});

test('home: Owner sees restricted evidence counted, Technical sees it unrestricted', async ({ page }) => {
  await load(page, { persona: 'owner' });
  await expect(page.locator('[data-investigation="INV-DEMO-7"]')).toContainText('restricted to Technical');
  await expect(page.locator('[data-attention="ATT-RT-1"]')).not.toContainText('Restricted to Technical');
  await load(page, { persona: 'technical' });
  await expect(page.locator('[data-investigation="INV-DEMO-7"]')).not.toContainText('restricted to Technical');
  await expect(page.locator('[data-attention="ATT-RT-1"] [data-evidence-chip="E-1"]')).toBeVisible();
});

test('home: nontechnical sees plain truth labels', async ({ page }) => {
  await load(page, { persona: 'nontechnical' });
  await expect(page.locator('[data-attention="ATT-RT-1"] .truth').first()).toHaveText('Confirmed');
});

for (const persona of ['owner', 'nontechnical'] as const) {
  for (const lang of LANGS) {
    test(`home banned tokens ${lang}/${persona}: no job names, run ids, PR ids or links`, async ({ page }) => {
      await load(page, { lang, persona });
      const text = await page.locator('body').innerText();
      for (const t of BANNED) expect(text, t).not.toContain(t);
      await expect(page.locator('.inert-link')).toHaveCount(0);
    });
  }
}

test('home technical: sees the job name and run id', async ({ page }) => {
  await load(page, { persona: 'technical' });
  await expect(page.getByTestId('home-attention')).toContainText('integration-tests');
  await expect(page.getByTestId('home-attention')).toContainText('#DEMO-4471');
});

for (const persona of PERSONAS) {
  test(`home arabic/${persona}: no Latin run outside a left-to-right isolate`, async ({ page }) => {
    await load(page, { lang: 'ar', persona });
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
    const arabicIndic = await page.evaluate(() => /[٠-٩۰-۹]/.test(document.body.innerText));
    expect(arabicIndic).toBe(false);
  });
}

test('home: links and buttons are at least 44 px high at 375 px', async ({ page }) => {
  await load(page, { width: 375 });
  const small = await page.locator('main a.btn, main button').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  expect(small).toBe(0);
});

test('home: neutral links reach the case, product, proposal and sources', async ({ page }) => {
  await load(page);
  await page.getByRole('link', { name: 'Open case INV-DEMO-7' }).first().click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7$/);

  await load(page);
  await page.locator('[data-attention="ATT-RT-1"]').getByRole('link', { name: 'View Retail Tower OS' }).click();
  await expect(page).toHaveURL(/#\/project\/RT$/);

  await load(page);
  await page.locator('[data-attention="ATT-RT-1"]').getByRole('link', { name: 'Open proposal DEC-DEMO-3' }).click();
  await expect(page).toHaveURL(/#\/decisions\/DEC-DEMO-3$/);

  await load(page);
  await page.getByRole('link', { name: 'Open source health' }).click();
  await expect(page).toHaveURL(/#\/sources$/);
});
