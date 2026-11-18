import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { BANNED, LANGS, openRoute, PERSONAS, WIDTHS, type LoadQuery } from './helpers';

const load = async (page: Page, q: LoadQuery = {}) => {
  const errors = await openRoute(page, '/portfolio', q);
  await expect(page.getByTestId('product-RT')).toBeVisible();
  return errors;
};

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`portfolio layout ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
      const errors = await load(page, { lang, width });
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      await expect(page.locator('[data-testid^="product-"]')).toHaveCount(3);
      expect(errors).toEqual([]);
    });
  }
}

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`portfolio controls ${lang}/${persona}: no forbidden action verbs`, async ({ page }) => {
      await load(page, { lang, persona });
      const labels = await page.locator('main button, main a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
      expect(labels.length).toBeGreaterThan(8);
      for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
    });

    test(`portfolio truth ${lang}/${persona}: RT unknown, KH degraded, SB unknown and not set up, never healthy`, async ({ page }) => {
      await load(page, { lang, persona });
      await expect(page.locator('[data-health="healthy"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="product-RT"] [data-dim="health"] [data-health="unknown"]')).toBeVisible();
      await expect(page.locator('[data-testid="product-KH"] [data-dim="health"] [data-health="degraded"]')).toBeVisible();
      const sb = page.getByTestId('product-SB');
      await expect(sb.locator('[data-dim="health"] [data-health="unknown"]')).toBeVisible();
      await expect(sb.locator('.triad-item.conn-not_configured')).toBeVisible();
      await expect(sb.locator('.state-not_configured')).toBeVisible();
      await expect(sb.locator('[data-health="healthy"], [data-health="down"]')).toHaveCount(0);
      // Counts for the unconfigured product are "not read", never 0.
      await expect(sb.locator('[data-count="attention"]')).not.toHaveText('0');
      await expect(sb.locator('[data-count="attention"]')).toHaveText(lang === 'ar' ? 'غير مقروء' : 'Not read');
      await expect(page.getByTestId('product-RT').locator('[data-count="attention"]')).toHaveText('2');
    });
  }
}

test('portfolio: attention items carry truth chips and provenance, restricted ones say restricted', async ({ page }) => {
  await load(page, { persona: 'owner' });
  const item = page.locator('[data-attention="ATT-RT-1"]');
  await expect(item.locator('[data-evidence-row]')).toHaveCount(2);
  await expect(item.locator('[data-evidence-row] [data-truth]')).toHaveCount(2);
  await expect(item.locator('[data-provenance="read"]').first()).toContainText('GitHub');
  const payments = page.locator('[data-attention="ATT-RT-2"]');
  await expect(payments.locator('[data-provenance="restricted"]')).toHaveText('Restricted to Technical');
  await expect(payments.locator('[data-evidence-row] a')).toHaveCount(0);

  await load(page, { persona: 'technical' });
  await expect(page.locator('[data-attention="ATT-RT-2"] [data-provenance="read"]')).toContainText('Sentry');
  await expect(page.locator('[data-attention="ATT-RT-2"] [data-provenance="restricted"]')).toHaveCount(0);
});

test('portfolio: nontechnical gets plain labels and plain status words', async ({ page }) => {
  await load(page, { persona: 'nontechnical' });
  await expect(page.locator('[data-attention="ATT-RT-1"] [data-truth="observed"]').first()).toHaveText('Confirmed');
  await expect(page.locator('[data-testid="product-SB"] .pf-status')).toContainText('Not set up yet');
  await expect(page.locator('[data-testid="product-RT"] [data-count="investigations"]')).toHaveCount(0);
});

test('portfolio: Technical sees ids and component detail, Owner does not', async ({ page }) => {
  await load(page, { persona: 'technical' });
  await expect(page.locator('[data-attention="ATT-RT-1"]')).toContainText('stock-sync');
  await expect(page.getByTestId('product-RT')).toContainText('Components');
  await load(page, { persona: 'owner' });
  await expect(page.getByTestId('product-RT')).not.toContainText('Components');
});

for (const persona of ['owner', 'nontechnical'] as const) {
  for (const lang of LANGS) {
    test(`portfolio banned tokens ${lang}/${persona}: no job names, run ids, PR ids or links`, async ({ page }) => {
      await load(page, { lang, persona });
      const text = await page.locator('body').innerText();
      for (const t of BANNED) expect(text, t).not.toContain(t);
      await expect(page.locator('.inert-link')).toHaveCount(0);
    });
  }
}

for (const persona of PERSONAS) {
  test(`portfolio arabic/${persona}: no Latin run outside a left-to-right isolate`, async ({ page }) => {
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
  });
}

test('portfolio: touch targets are at least 44 px at 375 px', async ({ page }) => {
  await load(page, { width: 375 });
  const small = await page.locator('main a.btn, main button').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  expect(small).toBe(0);
});

test('portfolio: product filter narrows entries and explains Seshat-BI having nothing to list', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Seshat-BI' }).click();
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(1);
  await expect(page.getByTestId('portfolio-attention').locator('.state-not_configured')).toBeVisible();
  await expect(page.locator('[data-attention]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Khepri' }).click();
  await expect(page.locator('[data-attention]')).toHaveCount(1);
  await page.getByRole('button', { name: 'All products' }).click();
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(3);
});

test('portfolio: View links and case links reach the right routes', async ({ page }) => {
  await load(page);
  await page.getByRole('link', { name: 'View Retail Tower OS' }).click();
  await expect(page).toHaveURL(/#\/project\/RT$/);

  await load(page);
  await page.locator('[data-attention="ATT-RT-1"]').getByRole('link', { name: 'Open case INV-DEMO-7' }).click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7$/);

  await load(page);
  await page.locator('[data-attention="ATT-RT-1"]').getByRole('link', { name: 'Inspect evidence E-1' }).click();
  await expect(page).toHaveURL(/#\/evidence\/E-1\?from=INV-DEMO-7$/);
});
