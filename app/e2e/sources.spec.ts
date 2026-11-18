import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';

const WIDTHS = [320, 375, 768, 1440] as const;
const LANGS = ['en', 'ar'] as const;
const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;
const BANNED = ['integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'AssertionError', 'example.invalid', 'DEMO-4468', 'DEMO-5120', 'DEMO-311'];

async function load(page: Page, q: { lang?: string; persona?: string; width?: number } = {}) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.setViewportSize({ width: q.width ?? 1280, height: 900 });
  const params = new URLSearchParams();
  if (q.lang) params.set('lang', q.lang);
  if (q.persona) params.set('persona', q.persona);
  await page.goto(`/?${params.toString()}#/sources`);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByTestId('product-RT')).toBeVisible();
  return errors;
}

const row = (page: Page, product: string, provider: string) => page.locator(`[data-product="${product}"] [data-provider="${provider}"]`);

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`sources layout ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
      const errors = await load(page, { lang, width });
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      await expect(page.locator('table.source-table')).toHaveCount(3);
      expect(errors).toEqual([]);
    });
  }
}

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`sources controls ${lang}/${persona}: no forbidden verbs, no buttons, no credential fields`, async ({ page }) => {
      await load(page, { lang, persona });
      const labels = await page.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
      expect(labels.length).toBeGreaterThan(3);
      for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
      await expect(page.locator('main button')).toHaveCount(0);
      await expect(page.locator('main input, main select, main textarea, main [role="switch"]')).toHaveCount(0);
      await expect(page.locator('[data-health="healthy"]')).toHaveCount(0);
      await expect(page.locator('main [data-health]')).toHaveCount(0);
    });
  }
}

test('sources: Seshat-BI GitHub is not set up with unknown freshness', async ({ page }) => {
  await load(page);
  const r = row(page, 'SB', 'github');
  await expect(r.locator('[data-dim="connectivity"]')).toHaveText('not set up');
  await expect(r.locator('[data-dim="freshness"]')).toHaveText('unknown');
  await expect(r.locator('[data-dim="observation"]')).toHaveText('never read');
  await expect(r).toHaveAttribute('data-connectivity', 'not_configured');
});

test('sources: Khepri Jira is unavailable and stale', async ({ page }) => {
  await load(page);
  const r = row(page, 'KH', 'jira');
  await expect(r.locator('[data-dim="connectivity"]')).toHaveText('unavailable');
  await expect(r.locator('[data-dim="freshness"]')).toHaveText('stale');
  await expect(r.locator('[data-dim="observation"]')).toHaveText('5 h ago');
  await expect(row(page, 'RT', 'github').locator('[data-dim="freshness"]')).toHaveText('current');
  await expect(row(page, 'RT', 'github').locator('[data-dim="ttl"]')).toContainText('30');
  await expect(row(page, 'RT', 'github').locator('[data-dim="marker"]')).toHaveText('Synthetic');
});

test('sources: nothing says healthy, and unreachable or unset sources are never counted as current', async ({ page }) => {
  await load(page);
  await expect(page.locator('[data-health="healthy"]')).toHaveCount(0);
  const text = await page.locator('main').innerText();
  expect(/\bhealthy\b/i.test(text)).toBe(false);
  for (const r of await page.locator('tbody tr').all()) {
    const conn = await r.getAttribute('data-connectivity');
    const fresh = await r.getAttribute('data-freshness');
    if (conn !== 'reachable') expect(fresh).not.toBe('current');
  }
  await expect(page.locator('[data-summary="KH"]')).toContainText('1 unavailable');
  await expect(page.locator('[data-summary="KH"]')).toContainText('1 not set up');
  await expect(page.locator('[data-summary-row]')).toHaveCount(3);
});

test('sources: tables have captions and scoped headers', async ({ page }) => {
  await load(page);
  await expect(page.locator('table.source-table caption')).toHaveCount(3);
  expect(await page.locator('table.source-table th:not([scope])').count()).toBe(0);
  await expect(page.locator('table.source-table thead th[scope="col"]')).toHaveCount(18);
});

test('sources: state blocks explain unavailable and not set up', async ({ page }) => {
  await load(page);
  await expect(page.locator('[data-state="unavailable"]')).toContainText('Khepri');
  await expect(page.locator('[data-state="not_configured"]')).toContainText('Seshat-BI');
  await expect(page.locator('[data-state="not_configured"]')).toContainText('health cannot be claimed');
});

test('sources: three dimensions are explained and target health is elsewhere', async ({ page }) => {
  await load(page);
  const d = page.getByTestId('dimensions');
  for (const w of ['Source connectivity', 'Evidence freshness', 'Target health']) await expect(d).toContainText(w);
  await expect(d).toContainText('shows only the first two');
  await d.getByRole('link', { name: 'Open Portfolio' }).click();
  await expect(page).toHaveURL(/#\/portfolio/);
});

test('sources: integrations are informational, read-only and not connected', async ({ page }) => {
  await load(page);
  const box = page.getByTestId('integrations');
  await expect(box).toContainText('nothing is connected');
  await expect(box).toContainText('no credentials exist');
  await expect(box).toContainText('G2');
  await expect(box).toContainText('BACK-7');
  await expect(box).toContainText('Read-only');
  await expect(page.locator('[data-integration]')).toHaveCount(6);
  await expect(page.locator('[data-integration="github"]')).toContainText('Workflow runs and jobs');
  await expect(page.locator('[data-integration="jira"]')).toContainText('fixVersion');
});

test('sources: persona detail, technical sees TTL seconds, nontechnical a plain note', async ({ page }) => {
  await load(page, { persona: 'technical' });
  await expect(row(page, 'RT', 'github').locator('[data-dim="ttl"]')).toContainText('1800 s');
  await load(page, { persona: 'owner' });
  await expect(row(page, 'RT', 'github').locator('[data-dim="ttl"]')).not.toContainText('1800');
  await expect(page.locator('[data-plain-note]')).toHaveCount(0);
  await load(page, { persona: 'nontechnical' });
  await expect(page.locator('[data-plain-note]')).toContainText('Some information is missing or old');
  await expect(page.locator('[data-integration="github"]')).toContainText('Test and build results');
});

for (const lang of LANGS) {
  for (const persona of ['owner', 'nontechnical'] as const) {
    test(`sources redaction ${lang}/${persona}: no banned tokens`, async ({ page }) => {
      await load(page, { lang, persona });
      const text = await page.locator('body').innerText();
      for (const b of BANNED) expect(text.includes(b), `${persona}/${lang}: ${b}`).toBe(false);
    });
  }
}

for (const persona of PERSONAS) {
  test(`sources arabic/${persona}: no Latin run outside a left-to-right isolate`, async ({ page }) => {
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
    await expect(row(page, 'SB', 'github').locator('[data-dim="connectivity"]')).toHaveText('غير مُعد');
  });
}

test('sources: touch targets are at least 44 px at 375 px', async ({ page }) => {
  await load(page, { width: 375 });
  const small = await page.locator('main button, main a').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  expect(small).toBe(0);
});
