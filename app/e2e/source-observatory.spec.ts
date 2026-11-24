// BACK-88: the V2 Source Observatory as a view of the existing Sources screen. One shell, one persona and language, one router
// (the hash); the selected source lives in the host route. The tables stay the default view and are unchanged. Readings stay
// three independent axes and Unknown is never Healthy; restricted evidence stays undisclosed across cards, table, timeline and
// every inspector tab. Persona is a display switch on synthetic data, not authorization. Nothing here is live telemetry.
import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { COPY } from '../src/i18n/strings';
import { LANGS, openRoute, PERSONAS, WIDTHS } from './helpers';
import { hasId, hash, RESTRICTED, surface } from './lens-helpers';

const LAY = ['owner', 'nontechnical'] as const;
const lens = (page: Page) => page.locator('[data-testid="source-observatory-lens"]');
const card = (page: Page, p: string) => page.locator(`.kv2-scard[data-provider="${p}"]`);


test('the canonical fixture has the restricted record this spec depends on', () => {
  expect(RESTRICTED).toContain('E-5');
});

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`Observatory view ${lang} @${width}px: one shell, one h1, no overflow, no console errors`, async ({ page }) => {
      const errors = await openRoute(page, '/sources/observatory', { lang, persona: 'owner', width });
      await expect(lens(page)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      expect(await page.locator('main').count()).toBe(1);
      expect(await page.locator('#sidenav').count()).toBe(1);
      expect(await page.locator('.kv2-app, .kv2-top, .kv2-side, .kv2-skip').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('Sources: the tables stay the default view and the Observatory is another view of the same screen', async ({ page }) => {
  await openRoute(page, '/sources', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(lens(page)).toHaveCount(0);
  await expect(page.locator('.view-switch a[data-view="tables"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#sidenav a[data-nav="sources"]')).toHaveAttribute('aria-current', 'page');
  expect(await page.locator('table').count()).toBeGreaterThan(0);
  await page.locator('.view-switch a[data-view="observatory"]').click();
  await expect(lens(page)).toBeVisible();
  expect(await hash(page)).toBe('#/sources/observatory');
  await expect(page.locator('.view-switch a[data-view="observatory"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#sidenav a[data-nav="sources"]')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(lens(page)).toHaveCount(0);
  expect(await page.locator('table').count()).toBeGreaterThan(0);
});

test('Observatory: selecting a source is a navigation, so Back, Forward and deep links restore it', async ({ page }) => {
  await openRoute(page, '/sources/observatory', { lang: 'en', persona: 'technical', width: 1440 });
  await expect(card(page, 'github')).toHaveAttribute('aria-pressed', 'true');
  await card(page, 'jira').click();
  expect(await hash(page)).toBe('#/sources/observatory/jira');
  await expect(card(page, 'jira')).toHaveAttribute('aria-pressed', 'true');
  await card(page, 'port').click();
  await page.goBack();
  await expect(card(page, 'jira')).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  expect(await hash(page)).toBe('#/sources/observatory');
  await page.goForward();
  await expect(card(page, 'jira')).toHaveAttribute('aria-pressed', 'true');
  await openRoute(page, '/sources/observatory/sentry', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(card(page, 'sentry')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(card(page, 'sentry')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: COPY.en.persona.technical, exact: true }).click();
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(card(page, 'sentry')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/sources/observatory/sentry');
});

test('Observatory: an unknown source is not found, never guessed', async ({ page }) => {
  await openRoute(page, '/sources/observatory/nope', { lang: 'en', persona: 'owner' });
  await expect(page.locator('h1')).toHaveText(/Page not found/);
  await expect(lens(page)).toHaveCount(0);
});

test('Observatory: the keyboard selects a source card, as a navigation', async ({ page }) => {
  await openRoute(page, '/sources/observatory', { lang: 'en', persona: 'technical', width: 1440 });
  await card(page, 'sentry').focus();
  await page.keyboard.press('Enter');
  expect(await hash(page)).toBe('#/sources/observatory/sentry');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-provider'))).toBe('sentry');
});

for (const persona of PERSONAS) {
  test(`Observatory ${persona}: three independent readings, and Unknown is never Healthy`, async ({ page }) => {
    await openRoute(page, '/sources/observatory', { lang: 'en', persona, width: 1440 });
    const read = async (p: string) => ({
      conn: await card(page, p).getAttribute('data-conn'),
      fresh: await card(page, p).getAttribute('data-fresh'),
      health: await card(page, p).getAttribute('data-health'),
    });
    // GitHub: a current observed read of itself. Everything else that claimed healthy has no current observed evidence.
    expect(await read('github')).toEqual({ conn: 'reachable', fresh: 'current', health: 'healthy' });
    expect(await read('jira')).toMatchObject({ conn: 'reachable', health: 'unknown' }); // claimed healthy, no evidence
    expect(await read('sentry')).toEqual({ conn: 'reachable', fresh: 'stale', health: 'unknown' }); // claimed healthy on a stale read
    expect(await read('port')).toMatchObject({ conn: 'unavailable', health: 'unknown' });
    expect(await read('datadog')).toEqual({ conn: 'not_configured', fresh: 'unknown', health: 'unknown' });
    expect(await read('confluence')).toEqual({ conn: 'not_configured', fresh: 'unknown', health: 'unknown' });
    const healthy = await page.locator('.kv2-scard').evaluateAll((els) => els.filter((e) => e.getAttribute('data-health') === 'healthy').map((e) => e.getAttribute('data-provider')));
    expect(healthy).toEqual(['github']);
  });
}

test('Observatory: what each persona is told is the same, so no count or status can reveal a withheld record', async ({ page }) => {
  const seen: Record<string, string> = {};
  for (const persona of PERSONAS) {
    await openRoute(page, '/sources/observatory', { lang: 'en', persona, width: 1440 });
    await expect(card(page, 'sentry')).toBeVisible();
    seen[persona] = await page.evaluate(() => {
      const t = (sel: string) => [...document.querySelectorAll(sel)].map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' | ');
      // The timeline wording is persona-specific by design (Technical gets the run id); its events, times and sources must be the same.
      return [t('.kv2-kpis'), t('.kv2-pins'), t('.kv2-scards'), t('.kv2-tl li time'), t('.kv2-tl li b')].join(' || ');
    });
  }
  expect(seen.owner).toBe(seen.technical);
  expect(seen.nontechnical).toBe(seen.technical);
});

const ROUTES = ['/sources/observatory', '/sources/observatory/sentry', '/sources/observatory/port', '/sources/observatory/github', '/sources/observatory/jira'] as const;

// One test per route: all five routes in one test took about 25 s on WebKit in CI (each click about 0.6 s) and crossed the 30 s timeout.
for (const lang of LANGS) {
  for (const persona of LAY) {
    for (const route of ROUTES) {
      test(`Observatory non-disclosure ${persona}/${lang} ${route}: no restricted id or observation in any view, tab or timeline filter`, async ({ page }) => {
        await openRoute(page, route, { lang, persona, width: 1440 });
        const scan = async (label: string) => {
          const text = await surface(page);
          for (const id of RESTRICTED) expect(hasId(text, id) || text.includes(`"${id}"`), `${persona}/${lang} ${route} ${label}: ${id}`).toBe(false);
        };
        await scan('cards');
        for (const mode of [1, 0]) {
          await lens(page).locator('.kv2-panel-head .kv2-seg button').nth(mode).click(); // table, then cards
          await scan(`mode ${mode}`);
        }
        const tabs = lens(page).getByRole('tab');
        for (let i = 0; i < (await tabs.count()); i += 1) {
          await tabs.nth(i).click();
          await scan(`tab ${i}`);
        }
        const axes = lens(page).locator('.kv2-timeline .kv2-seg button');
        for (let i = 0; i < (await axes.count()); i += 1) {
          await axes.nth(i).click();
          await scan(`timeline filter ${i}`);
        }
      });
    }
  }
}

for (const lang of LANGS) {
  test(`Observatory non-disclosure switch ${lang}: technical, owner, technical, owner on one page leaves nothing behind`, async ({ page }) => {
    await openRoute(page, '/sources/observatory/sentry', { lang, persona: 'technical', width: 1440 });
    const L = COPY[lang].persona;
    const has = async () => hasId(await surface(page), 'E-5');
    await lens(page).getByRole('tab').nth(1).click();
    const technicalSees = await has();
    for (const [p, expected] of [['owner', false], ['technical', technicalSees], ['owner', false], ['nontechnical', false]] as const) {
      await page.getByRole('button', { name: L[p], exact: true }).click();
      await lens(page).getByRole('tab').nth(1).click();
      expect(await has(), p).toBe(expected);
    }
  });
}

test('Observatory: nothing here acts on anything, and nothing says live', async ({ page }) => {
  for (const persona of PERSONAS) {
    await openRoute(page, '/sources/observatory', { lang: 'en', persona, width: 1440 });
    const labels = await page.locator('main button, main a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()).filter(Boolean));
    for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
    expect(await page.locator('main input:not([type="checkbox"]), main textarea').count()).toBe(0);
    expect(await page.evaluate(() => /\blive\b(?! data)/i.test(document.querySelector('main')!.innerText.replace(/not live/gi, '')))).toBe(false);
  }
});

test('Observatory: reduced motion plays no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/sources/observatory', { lang: 'en', persona: 'owner', width: 1440 });
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});
