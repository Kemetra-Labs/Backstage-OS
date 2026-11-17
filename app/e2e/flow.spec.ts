// Cross-screen checks owned by the lead: every route × persona × language obeys the S1 rules, and the one synthetic
// story can be walked end to end: Home → Portfolio → Project → Investigation → Evidence → Decision.
import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';

const ROUTES = [
  '#/', '#/portfolio', '#/project/RT', '#/project/RT/stock-sync', '#/project/KH', '#/project/SB',
  '#/investigation/INV-DEMO-7', '#/investigation/INV-DEMO-9', '#/evidence/E-1?from=INV-DEMO-7', '#/evidence/E-12',
  '#/evidence/E-24', '#/decisions', '#/decisions/DEC-DEMO-3', '#/decisions/DEC-DEMO-1', '#/agents', '#/sources', '#/nope',
] as const;
const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;
const LANGS = ['en', 'ar'] as const;
const BANNED = ['integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'AssertionError', 'example.invalid', 'DEMO-4468', 'DEMO-5120', 'DEMO-311'];

async function open(page: Page, hash: string, q: { lang?: string; persona?: string; width?: number } = {}) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.setViewportSize({ width: q.width ?? 1280, height: 900 });
  const params = new URLSearchParams();
  if (q.lang) params.set('lang', q.lang);
  if (q.persona) params.set('persona', q.persona);
  await page.goto(`/?${params.toString()}${hash}`);
  await expect(page.locator('h1')).toBeVisible();
  return errors;
}

const latinOutsideIsolates = (page: Page) => page.evaluate(() => {
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
  for (const lang of LANGS) {
    for (const persona of PERSONAS) {
      test(`rules ${route} ${lang}/${persona} @320`, async ({ page }) => {
        const errors = await open(page, route, { lang, persona, width: 320 });
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('h1')).toHaveCount(1);
        const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
        levels.reduce((prev, cur) => { expect(cur, `heading h${cur} after h${prev}`).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
        const labels = await page.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
        for (const l of labels) expect(isForbiddenControlLabel(l), `control label: ${l}`).toBe(false);
        if (persona !== 'technical') {
          const text = await page.locator('body').innerText();
          for (const b of BANNED) expect(text.includes(b), `banned token ${b}`).toBe(false);
        }
        if (lang === 'ar') expect(await latinOutsideIsolates(page)).toEqual([]);
        // Copy tokens are always rendered through Text: a visible brace means a raw copy string leaked.
        expect(await page.locator('body').innerText(), 'raw {token} braces').not.toMatch(/[{}]/);
        await expect(page.locator('.demo')).toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  }
}

for (const route of ROUTES) {
  test(`touch targets ≥ 44 px @375 ${route}`, async ({ page }) => {
    await open(page, route, { width: 375 });
    const small = await page.locator('main button, main a.btn, main .crumbs a, header button').evaluateAll((els) =>
      els.map((e) => ({ r: e.getBoundingClientRect(), t: (e.textContent ?? '').trim() }))
        .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44)).map(({ t }) => t));
    expect(small).toEqual([]);
  });
}

test('journey: Home → Portfolio → Retail Tower → stock-sync → INV-DEMO-7 → E-1 → back → DEC-DEMO-3 → evidence', async ({ page }) => {
  await open(page, '#/');
  await page.locator('#sidenav a[data-nav="portfolio"]').click();
  await expect(page).toHaveURL(/#\/portfolio$/);
  await page.locator('main a[href="#/project/RT"]').first().click();
  await expect(page).toHaveURL(/#\/project\/RT$/);
  await page.locator('[data-testid="dep-graph"] [data-node="stock-sync"]').click();
  await expect(page).toHaveURL(/#\/project\/RT\/stock-sync$/);
  await page.locator('main a[href="#/investigation/INV-DEMO-7"]').first().click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7$/);
  await expect(page.locator('main')).toBeFocused();
  await page.locator('[data-evidence="E-1"] button').click();
  await page.getByRole('dialog').locator('a[href="#/evidence/E-1?from=INV-DEMO-7"]').click();
  await expect(page).toHaveURL(/#\/evidence\/E-1\?from=INV-DEMO-7$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#root')).not.toHaveAttribute('inert', /.*/);
  await page.locator('main a[href="#/investigation/INV-DEMO-7"]').first().click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7$/);
  await page.locator('main a[href="#/decisions/DEC-DEMO-3"]').first().click();
  await expect(page).toHaveURL(/#\/decisions\/DEC-DEMO-3$/);
  await expect(page.locator('main')).toContainText('RT-DEMO-112');
  await page.locator('main a[href="#/evidence/E-1?from=INV-DEMO-7"]').first().click();
  await expect(page).toHaveURL(/#\/evidence\/E-1/);
  // Browser history works across the hash routes.
  await page.goBack();
  await expect(page).toHaveURL(/#\/decisions\/DEC-DEMO-3$/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/evidence\/E-1/);
});

test('persona and language persist across navigation and reload', async ({ page }) => {
  await open(page, '#/');
  await page.getByRole('button', { name: 'Technical', exact: true }).click();
  await page.getByRole('button', { name: 'عربي' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('#sidenav a[data-nav="decisions"]').click();
  await expect(page).toHaveURL(/persona=technical/);
  await expect(page).toHaveURL(/lang=ar/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.seg button[aria-pressed="true"]').first()).toHaveText(/./);
  await expect(page).toHaveURL(/#\/decisions$/);
});

test('sidebar marks the current section', async ({ page }) => {
  await open(page, '#/evidence/E-1?from=INV-DEMO-7');
  await expect(page.locator('#sidenav a[data-nav="investigation"]')).toHaveAttribute('aria-current', 'page');
  await open(page, '#/project/KH');
  await expect(page.locator('#sidenav a[data-nav-project="KH"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#sidenav a[data-nav="project"]')).not.toHaveAttribute('aria-current', 'page');
});

test('narrow screens: menu button opens and closes navigation', async ({ page }) => {
  await open(page, '#/', { width: 375 });
  const menu = page.locator('.menu-btn');
  await expect(page.locator('#sidenav')).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#sidenav a[data-nav="agents"]').click();
  await expect(page).toHaveURL(/#\/agents$/);
  await expect(page.locator('#sidenav')).toBeHidden();
});

test('demo search finds the story and hides technical-only evidence from Owner', async ({ page }) => {
  await open(page, '#/');
  const box = page.getByRole('searchbox');
  await box.fill('INV-DEMO-7');
  await page.locator('.search-pop a[href="#/investigation/INV-DEMO-7"]').click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7$/);
  await box.fill('E-12');
  await expect(page.locator('.search-pop')).toContainText(/No match/);
  await box.press('Escape');
  await expect(page.locator('.search-pop')).toHaveCount(0);
});

test('skip link moves focus to main without changing the route', async ({ page, browserName }) => {
  await open(page, '#/portfolio');
  // WebKit leaves links out of the Tab order by default (a Safari setting), so there the link is focused directly.
  if (browserName === 'webkit') await page.locator('.skip').focus();
  else await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page).toHaveURL(/#\/portfolio$/);
});

test('unknown is never healthy anywhere: every healthy mark has current observed evidence (api-gateway, khepri-web)', async ({ page }) => {
  for (const route of ['#/', '#/portfolio', '#/project/RT', '#/project/KH', '#/project/SB', '#/sources', '#/agents', '#/decisions']) {
    await open(page, route, { persona: 'technical' });
    const healthy = await page.locator('[data-health="healthy"]').evaluateAll((els) =>
      els.map((e) => e.closest('[data-node]')?.getAttribute('data-node') ?? e.closest('[data-component]')?.getAttribute('data-component') ?? `unattributed on ${location.hash}`));
    for (const h of healthy) expect(['api-gateway', 'khepri-web'], `healthy mark: ${h}`).toContain(h);
  }
});

test('selecting a component on the map keeps focus and scroll in place', async ({ page }) => {
  await open(page, '#/project/RT', { width: 1280 });
  const node = page.locator('[data-testid="dep-graph"] [data-node="stock-sync"]');
  await node.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  const before = await page.evaluate(() => window.scrollY);
  await node.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/project\/RT\/stock-sync$/);
  await expect(page.locator('main')).not.toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(before).toBeGreaterThan(0);
  // A different screen still moves focus to main.
  await page.locator('main a[href="#/investigation/INV-DEMO-7"]').first().click();
  await expect(page.locator('main')).toBeFocused();
});
