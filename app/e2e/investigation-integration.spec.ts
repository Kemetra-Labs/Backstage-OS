// Investigation Room integration (BACK-11): the S1 room gains links, a timeline and context; INV-DEMO-9 gets a summary
// room. investigation.spec.ts keeps asserting the S1 contract on #/investigation/INV-DEMO-7 and is not touched.
import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { BANNED, LANGS, openRoute as load, PERSONAS, WIDTHS } from './helpers';
import { expectNoLeaks } from './leaks';

const R7 = '/investigation/INV-DEMO-7';
const R9 = '/investigation/INV-DEMO-9';

const latinOutsideIsolates = (page: Page) =>
  page.evaluate(() => {
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

// ---- INV-DEMO-7: room integration --------------------------------------------------------------------------

test('drawer: the Explorer link goes to the evidence page for that case, and Back returns to the room', async ({ page }) => {
  await load(page, R7);
  await page.locator('[data-evidence="E-1"] button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const link = dialog.getByRole('link', { name: 'Open in Evidence Explorer' });
  await expect(link).toHaveAttribute('href', '#/evidence/E-1?from=INV-DEMO-7');
  await link.click();
  await expect(page).toHaveURL(/#\/evidence\/E-1\?from=INV-DEMO-7$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.locator('#root').getAttribute('inert')).toBeNull();
  await expect(page.locator('h1')).toContainText('E-1');
  await page.getByTestId('back-link').click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7$/);
  await expect(page.locator('h1')).toHaveText('Investigation Room');
});

test('drawer: the Explorer link is at least 44 px tall and keeps the focus trap and Esc working', async ({ page }) => {
  await load(page, R7, { width: 375 });
  const opener = page.locator('[data-evidence="E-2"] button');
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.getByRole('link', { name: 'Open in Evidence Explorer' }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

for (const persona of ['owner', 'nontechnical'] as const) {
  test(`drawer ${persona}: the Explorer link adds no banned token`, async ({ page }) => {
    await load(page, R7, { persona });
    // E-5 is Technical-only: it is not in the room at all for these personas, so there is no row to open.
    await expect(page.locator('[data-evidence="E-5"]')).toHaveCount(0);
    for (const id of ['E-1', 'E-2']) {
      await page.locator(`[data-evidence="${id}"] button`).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoLeaks(page, `${persona}/${id}`, { extra: BANNED });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
}

test('arabic drawer: the Explorer link has no Latin outside an isolate', async ({ page }) => {
  await load(page, R7, { lang: 'ar', persona: 'technical' });
  await page.locator('[data-evidence="E-1"] button').click();
  await expect(page.getByRole('dialog').locator('a.btn')).toBeVisible();
  expect(await latinOutsideIsolates(page)).toEqual([]);
});

test('room breadcrumbs are real links: Portfolio, the product and the current case', async ({ page }) => {
  await load(page, R7);
  const crumbs = page.locator('nav.crumbs li');
  await expect(crumbs).toHaveCount(3);
  await expect(crumbs.nth(0).locator('a')).toHaveAttribute('href', '#/portfolio');
  await expect(crumbs.nth(1).locator('a')).toHaveAttribute('href', '#/project/RT/stock-sync');
  await expect(crumbs.nth(1)).toContainText('Retail Tower OS');
  await expect(crumbs.nth(2).locator('[aria-current="page"]')).toContainText('INV-DEMO-7');
  await crumbs.nth(0).locator('a').click();
  await expect(page).toHaveURL(/#\/portfolio$/);
});

test('room keeps its S1 counts with the new sections present', async ({ page }) => {
  for (const persona of PERSONAS) {
    await load(page, R7, { persona });
    await expect(page.locator('[data-health="healthy"]')).toHaveCount(0);
    await expect(page.locator('[data-fact]')).toHaveCount(5);
    await expect(page.locator('.source.conn-not_configured')).toHaveCount(1);
    await expect(page.locator('.source.conn-unavailable')).toHaveCount(1);
    await expect(page.locator('.source.fresh-stale')).toHaveCount(2);
  }
});

test('evidence timeline: newest observation first; unread items are listed apart in words; withheld E-5 is absent for Owner', async ({ page }) => {
  await load(page, R7, { persona: 'owner' });
  const tl = page.getByTestId('evidence-timeline');
  const ids = await tl.locator('[data-timeline]').evaluateAll((els) => els.map((e) => e.getAttribute('data-timeline')));
  expect(ids).toEqual(['E-1', 'E-3', 'E-4', 'E-2']);
  await expect(tl.locator('[data-untimed="E-5"]')).toHaveCount(0);
  await expect(tl.locator('[data-timeline="E-5"]')).toHaveCount(0);
  await expect(tl).not.toContainText('Restricted to Technical');
  await expect(tl.locator('[data-untimed]')).toHaveCount(2);
  await expect(tl.locator('[data-untimed="E-6"]')).toContainText('Not read: source not set up');
  await expect(tl.locator('[data-untimed="E-7"]')).toContainText('Not read: source unavailable');
  await expect(tl.locator('[data-timeline="E-1"] .truth')).toHaveText('Observed');
  await expect(tl.locator('[data-timeline="E-3"] .truth')).toHaveText('Correlated');
  for (const id of ['E-1', 'E-2', 'E-3', 'E-4']) {
    await expect(tl.locator(`[data-timeline="${id}"] a`)).toHaveAttribute('href', `#/evidence/${id}?from=INV-DEMO-7`);
  }
});

test('evidence timeline: Technical sees the stale Sentry item on the timeline with its age; Nontechnical sees plain labels', async ({ page }) => {
  await load(page, R7, { persona: 'technical' });
  const tl = page.getByTestId('evidence-timeline');
  await expect(tl.locator('[data-timeline="E-5"]')).toContainText('stale');
  await expect(tl.locator('[data-timeline="E-5"]')).toContainText('9 h ago');
  await expect(tl.locator('[data-untimed="E-5"]')).toHaveCount(0);
  await load(page, R7, { persona: 'nontechnical' });
  await expect(page.getByTestId('evidence-timeline').locator('[data-timeline="E-3"] .truth')).toHaveText('Linked');
});

test('timeline entry links reach the Explorer', async ({ page }) => {
  await load(page, R7);
  await page.getByTestId('evidence-timeline').locator('[data-timeline="E-2"] a').click();
  await expect(page).toHaveURL(/#\/evidence\/E-2\?from=INV-DEMO-7$/);
});

test('missing evidence lists what could not be read', async ({ page }) => {
  await load(page, R7);
  const m = page.getByTestId('missing-evidence');
  await expect(m.locator('h2')).toHaveText('Missing evidence');
  await expect(m.locator('li')).toHaveCount(2);
  await expect(m).toContainText('Datadog');
  await expect(m).toContainText('not set up');
  await expect(m).toContainText('unavailable');
});

test('proposed decision is a neutral link to the proposal', async ({ page }) => {
  await load(page, R7);
  const d = page.getByTestId('proposed-decision');
  await expect(d.locator('h2')).toHaveText('Proposed decision');
  await expect(d.locator('[data-truth="proposed"]')).toHaveText('Proposed');
  const link = d.locator('a[href="#/decisions/DEC-DEMO-3"]');
  await expect(link).toContainText('Open proposal');
  await link.click();
  await expect(page).toHaveURL(/#\/decisions\/DEC-DEMO-3$/);
});

test('context links reach the product and, for non-Nontechnical, the component', async ({ page }) => {
  await load(page, R7);
  const c = page.getByTestId('case-context');
  await expect(c.locator('a[href="#/project/RT"]')).toBeVisible();
  await expect(c.locator('a[href="#/project/RT/stock-sync"]')).toBeVisible();
  await load(page, R7, { persona: 'nontechnical' });
  await expect(page.getByTestId('case-context').locator('a[href="#/project/RT/stock-sync"]')).toHaveCount(0);
});

for (const lang of LANGS) {
  for (const width of [320, 1440] as const) {
    test(`room additions ${lang} @${width}px technical: no overflow, ordered headings, no console errors`, async ({ page }) => {
      const errors = await load(page, R7, { lang, width, persona: 'technical' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      expect(errors).toEqual([]);
    });
  }
}

for (const persona of PERSONAS) {
  test(`room arabic/${persona}: the new sections add no Latin outside an isolate`, async ({ page }) => {
    await load(page, R7, { lang: 'ar', persona });
    await expect(page.getByTestId('evidence-timeline')).toBeVisible();
    expect(await latinOutsideIsolates(page)).toEqual([]);
  });
}

for (const persona of ['owner', 'nontechnical'] as const) {
  for (const lang of LANGS) {
    test(`room redaction ${lang}/${persona}: the new sections carry no banned token`, async ({ page }) => {
      await load(page, R7, { lang, persona });
      await expectNoLeaks(page, `${persona}/${lang}`, { extra: BANNED });
    });
  }
}

test('room touch targets: new links are at least 44 px tall at 375 px', async ({ page }) => {
  await load(page, R7, { width: 375 });
  const small = await page.locator('main .btn-link').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  expect(small).toBe(0);
});

// ---- INV-DEMO-9: summary room -----------------------------------------------------------------------------------

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`summary room ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
      const errors = await load(page, R9, { lang, width, persona: 'technical' });
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      expect(errors).toEqual([]);
    });
  }
}

test('INV-DEMO-9 header: crumbs, persona title and meta', async ({ page }) => {
  await load(page, R9, { persona: 'technical' });
  const crumbs = page.locator('nav.crumbs li');
  await expect(crumbs).toHaveCount(3);
  await expect(crumbs.nth(0).locator('a')).toHaveAttribute('href', '#/portfolio');
  await expect(crumbs.nth(1).locator('a')).toHaveAttribute('href', '#/project/KH');
  await expect(crumbs.nth(1)).toContainText('Khepri');
  await expect(crumbs.nth(2).locator('[aria-current="page"]')).toContainText('INV-DEMO-9');
  await expect(page.locator('.lede')).toContainText('khepri-api error spike');
  const meta = page.locator('.screen-head .meta');
  await expect(meta).toContainText('INV-DEMO-9');
  await expect(meta).toContainText('khepri-api');
  await expect(meta).toContainText('19 min ago');
  await load(page, R9, { persona: 'nontechnical' });
  await expect(page.locator('.screen-head .meta')).not.toContainText('khepri-api');
});

for (const persona of PERSONAS) {
  test(`INV-DEMO-9 ${persona}: conflicting signals are explained and health is degraded, never healthy`, async ({ page }) => {
    await load(page, R9, { persona });
    const c = page.getByTestId('conflicting-signals');
    await expect(c.locator('h2')).toHaveText('Conflicting signals');
    await expect(c).toContainText('Neither cancels the other');
    await expect(c.locator('[data-signal="E-21"] [data-truth="observed"], [data-signal="E-21"] .truth')).toBeVisible();
    await expect(c.locator('[data-signal="E-22"]')).toBeVisible();
    await expect(c).toContainText('Checks observed passing');
    await expect(c).toContainText('Errors observed rising');
    await expect(c.locator('[data-health="degraded"]')).toHaveCount(1);
    await expect(page.locator('[data-health="healthy"]')).toHaveCount(0);
    await expect(c).toContainText('never healthy');
  });
}

test('INV-DEMO-9: nothing says healthy for khepri-api, with or without the source states', async ({ page }) => {
  await load(page, R9, { persona: 'technical' });
  await expect(page.getByTestId('conflicting-signals')).toContainText('khepri-api');
  expect(await page.locator('[data-health]').evaluateAll((els) => els.map((e) => e.getAttribute('data-health')))).toEqual(['degraded']);
});

test('INV-DEMO-9 evidence opens in the Explorer, not a drawer', async ({ page }) => {
  await load(page, R9);
  const ev = page.getByTestId('summary-evidence');
  for (const id of ['E-21', 'E-22', 'E-24']) await expect(ev.locator(`[data-evidence-row="${id}"]`)).toBeVisible();
  await expect(ev.locator('button')).toHaveCount(0);
  await expect(ev.locator('[data-evidence-row="E-23"]')).toHaveCount(0);
  await expect(ev).not.toContainText('Restricted to Technical');
  await expect(ev.locator('[data-evidence-row="E-24"]')).toContainText('Not read');
  await load(page, R9, { persona: 'technical' });
  await expect(page.getByTestId('summary-evidence').locator('[data-evidence-row="E-23"]')).toBeVisible();
  await expect(page.getByTestId('summary-evidence')).not.toContainText('Restricted to Technical');
  await load(page, R9);
  await ev.locator('a[href="#/evidence/E-24?from=INV-DEMO-9"]').click();
  await expect(page).toHaveURL(/#\/evidence\/E-24\?from=INV-DEMO-9$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-state="unavailable"]')).toContainText('Not read');
});

test('INV-DEMO-9: hypothesis is labelled, impact is unknown, missing evidence and links are present', async ({ page }) => {
  await load(page, R9);
  await expect(page.getByTestId('summary-hypothesis').locator('[data-truth="hypothesis"]')).toHaveText('Hypothesis');
  await expect(page.getByTestId('summary-hypothesis')).toContainText('The cause is not established yet');
  await expect(page.getByTestId('summary-impact').locator('[data-truth="unknown"]')).toBeVisible();
  await expect(page.getByTestId('summary-impact')).toContainText('Unknown, not evidenced');
  await expect(page.getByTestId('missing-evidence').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('missing-evidence')).toContainText('Jira');
  await expect(page.getByTestId('proposed-decision').locator('a[href="#/decisions/DEC-DEMO-5"]')).toBeVisible();
  await expect(page.getByTestId('case-context').locator('a[href="#/project/KH"]')).toBeVisible();
  await expect(page.getByTestId('case-context').locator('a[href="#/project/KH/khepri-api"]')).toBeVisible();
});

test('INV-DEMO-9 says the full room is built only for INV-DEMO-7 and links to it', async ({ page }) => {
  await load(page, R9);
  await expect(page.getByTestId('summary-note')).toContainText('only for');
  await expect(page.getByTestId('summary-note')).toContainText('INV-DEMO-7');
  await page.locator('main a[href="#/investigation/INV-DEMO-7"]').click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7$/);
  await expect(page.getByTestId('stage-map')).toBeVisible();
});

test('INV-DEMO-9 hypothesis names the deploy for Technical only', async ({ page }) => {
  await load(page, R9, { persona: 'technical' });
  await expect(page.getByTestId('summary-hypothesis')).toContainText('DEMO-311');
  for (const persona of ['owner', 'nontechnical'] as const) {
    await load(page, R9, { persona });
    await expectNoLeaks(page, persona, { extra: BANNED });
  }
});

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`summary room controls ${lang}/${persona}: no forbidden action verbs`, async ({ page }) => {
      await load(page, R9, { lang, persona });
      const labels = await page.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
      expect(labels.length).toBeGreaterThan(5);
      for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
    });
  }
}

for (const persona of PERSONAS) {
  test(`summary room arabic/${persona}: no Latin run outside a left-to-right isolate`, async ({ page }) => {
    await load(page, R9, { lang: 'ar', persona });
    await expect(page.getByTestId('conflicting-signals')).toBeVisible();
    expect(await latinOutsideIsolates(page)).toEqual([]);
  });
}

test('summary room touch targets are at least 44 px at 375 px', async ({ page }) => {
  await load(page, R9, { width: 375, persona: 'technical' });
  const small = await page.locator('main button, main .btn-link').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  expect(small).toBe(0);
});

test('unknown investigation id shows an error state with links home', async ({ page }) => {
  await load(page, '/investigation/INV-NOPE');
  await expect(page.locator('[data-state="error"]')).toContainText('Case not found');
  await expect(page.locator('main a[href="#/"]')).toBeVisible();
  await expect(page.locator('main a[href="#/portfolio"]').last()).toBeVisible();
  await load(page, '/investigation/INV-NOPE', { lang: 'ar' });
  expect(await latinOutsideIsolates(page)).toEqual([]);
});
