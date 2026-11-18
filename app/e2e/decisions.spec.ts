import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { BANNED, LANGS, openRoute as load, PERSONAS, WIDTHS } from './helpers';

const LAY = ['owner', 'nontechnical'] as const;
const DETAIL_IDS = ['DEC-DEMO-3', 'DEC-DEMO-5', 'DEC-DEMO-1'] as const;
const INBOX = '/decisions';
const detail = (id: string) => `/decisions/${id}`;

const seg = (page: Page, name: string) => page.locator('main .seg').getByRole('button', { name, exact: true });
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const headingLevels = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('main h1,main h2,main h3,main h4')].map((h) => Number(h.tagName[1])));

for (const route of [INBOX, detail('DEC-DEMO-3')]) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      test(`layout ${route} ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
        const errors = await load(page, route, { lang, width });
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        expect(await overflowOf(page)).toBeLessThanOrEqual(0);
        await expect(page.locator('h1')).toHaveCount(1);
        const levels = await headingLevels(page);
        expect(levels[0]).toBe(1);
        levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
        expect(errors).toEqual([]);
      });
    }
  }
}

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    for (const route of [INBOX, ...DETAIL_IDS.map(detail), detail('DEC-NOPE')]) {
      test(`controls ${route} ${lang}/${persona}: no forbidden action verbs`, async ({ page }) => {
        await load(page, route, { lang, persona });
        const labels = await page.locator('a, button').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
        expect(labels.length).toBeGreaterThan(5);
        for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
      });
    }
  }
}

for (const persona of PERSONAS) {
  for (const id of [...DETAIL_IDS, 'DEC-NOPE']) {
    test(`detail ${id} ${persona}: no buttons at all inside main`, async ({ page }) => {
      await load(page, detail(id), { persona });
      await expect(page.locator('main button')).toHaveCount(0);
      await expect(page.locator('main [role="button"], main input, main select, main textarea')).toHaveCount(0);
    });
  }
}

test('inbox: the only buttons in main are the project filter', async ({ page }) => {
  await load(page, INBOX);
  const outside = await page.locator('main button').evaluateAll((els) => els.filter((e) => !e.closest('.seg')).length);
  expect(outside).toBe(0);
  await expect(page.locator('main .seg button')).toHaveCount(4);
});

test('inbox: pending sorted, rows complete, historical record separate and labelled', async ({ page }) => {
  await load(page, INBOX);
  const pending = page.getByTestId('dec-pending');
  await expect(pending.locator('[data-decision]')).toHaveText([/DEC-DEMO-3/, /DEC-DEMO-5/]);
  const row = pending.locator('[data-decision="DEC-DEMO-3"]');
  await expect(row.locator('.truth')).toHaveText('Proposed');
  await expect(row.locator('.sev')).toBeVisible();
  await expect(row).toContainText('Retail Tower OS');
  await expect(row).toContainText('min ago');
  await expect(row.locator('[data-part="evidence"]')).toContainText(/\d+ read, \d+ not read, \d+ restricted\. Worst freshness: (current|stale|unknown)\./);
  await expect(row.locator('[data-part="unknowns"]')).toContainText('Unknowns: 2');
  await expect(row.getByRole('link', { name: 'Open proposal DEC-DEMO-3' })).toBeVisible();
  const hist = page.getByTestId('dec-historical');
  await expect(hist.getByRole('heading', { name: 'Historical record (synthetic)' })).toBeVisible();
  await expect(hist.locator('[data-decision]')).toHaveCount(1);
  await expect(hist.locator('[data-decision="DEC-DEMO-1"]')).toBeVisible();
  await expect(pending.locator('[data-decision="DEC-DEMO-1"]')).toHaveCount(0);
});

test('inbox: persistent explanation that Kawalys does not record, approve or execute', async ({ page }) => {
  await load(page, INBOX);
  const notice = page.getByTestId('dec-notice');
  await expect(notice).toContainText('does not record, approve or execute decisions');
  await expect(notice.locator('a, button')).toHaveCount(0);
  for (const name of ['Khepri', 'Seshat-BI']) {
    await seg(page, name).click();
    await expect(notice).toBeVisible();
  }
});

test('inbox: project filter, Seshat-BI is an empty state', async ({ page }) => {
  await load(page, INBOX);
  await seg(page, 'Khepri').click();
  await expect(page.locator('[data-decision]')).toHaveCount(1);
  await expect(page.locator('[data-decision="DEC-DEMO-5"]')).toBeVisible();
  await seg(page, 'Seshat-BI').click();
  await expect(page.getByTestId('dec-pending').locator('[data-state="empty"]')).toBeVisible();
  await expect(page.locator('[data-decision]')).toHaveCount(0);
  await seg(page, 'Retail Tower OS').click();
  await expect(page.locator('[data-decision]')).toHaveCount(2);
  await seg(page, 'All').click();
  await expect(page.locator('[data-decision]')).toHaveCount(3);
});

for (const persona of PERSONAS) {
  test(`truth ${persona}: Proposed on DEC-DEMO-3, Approved only on DEC-DEMO-1`, async ({ page }) => {
    await load(page, INBOX, { persona });
    await expect(page.locator('[data-decision="DEC-DEMO-3"] [data-truth="proposed"]')).toHaveCount(1);
    await expect(page.locator('[data-decision="DEC-DEMO-5"] [data-truth="approved"]')).toHaveCount(0);
    await expect(page.locator('[data-decision="DEC-DEMO-3"] [data-truth="approved"]')).toHaveCount(0);
    await expect(page.locator('[data-decision="DEC-DEMO-1"] [data-truth="approved"]')).toHaveCount(1);
    await expect(page.locator('main [data-truth="approved"]')).toHaveCount(1);

    await load(page, detail('DEC-DEMO-3'), { persona });
    await expect(page.locator('main [data-truth="approved"]')).toHaveCount(0);
    await expect(page.getByTestId('dec-next').locator('[data-truth="proposed"]')).toHaveCount(1);
    await expect(page.locator('[data-evidence] [data-truth="proposed"], [data-evidence] [data-truth="approved"]')).toHaveCount(0);

    await load(page, detail('DEC-DEMO-1'), { persona });
    await expect(page.locator('main [data-truth="approved"]').first()).toBeVisible();
    await expect(page.locator('main [data-truth="proposed"]')).toHaveCount(0);
  });
}

test('detail: Owner sees the unknowns, apart from observed facts and hypotheses', async ({ page }) => {
  await load(page, detail('DEC-DEMO-3'), { persona: 'owner' });
  const unknowns = page.getByTestId('dec-unknowns');
  await expect(unknowns).toBeVisible();
  await expect(unknowns.locator('li')).toHaveCount(2);
  await expect(unknowns.locator('[data-truth="unknown"]')).toHaveCount(2);
  await expect(unknowns).toContainText('Customer or runtime impact: not evidenced');
  await expect(page.getByTestId('dec-hypotheses').locator('[data-truth="hypothesis"]')).toHaveCount(1);
  await expect(page.getByTestId('dec-observed').locator('[data-truth="hypothesis"]')).toHaveCount(0);
});

test('detail: Nontechnical gets the plain labels', async ({ page }) => {
  await load(page, detail('DEC-DEMO-3'), { persona: 'nontechnical' });
  await expect(page.getByTestId('dec-next').locator('[data-truth="proposed"]')).toHaveText('Suggested step');
  await expect(page.getByTestId('dec-next').getByRole('heading', { name: 'Suggested step' })).toBeVisible();
  await expect(page.getByTestId('dec-hypotheses').locator('[data-truth="hypothesis"]')).toHaveText('Likely reason');
  await expect(page.getByTestId('dec-unknowns').locator('[data-truth="unknown"]').first()).toHaveText('Not known');
  await expect(page.locator('main')).not.toContainText('Proposed');
});

test('detail: options side by side on desktop, stacked on mobile, none selectable, empty unknowns kept', async ({ page }) => {
  await load(page, detail('DEC-DEMO-3'), { width: 1440 });
  const opts = page.locator('[data-option]');
  await expect(opts).toHaveCount(3);
  const tops = await opts.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await expect(page.locator('[data-option="A"]')).toContainText('Suggested option');
  await expect(page.locator('[data-option="A"] [data-truth="proposed"]')).toBeVisible();
  await expect(page.locator('[data-option="B"] [data-truth="proposed"]')).toHaveCount(0);
  await expect(page.locator('[data-option="C"] [data-part="option-unknowns"]')).toHaveText('none recorded');
  await expect(page.locator('[data-option] button, [data-option] a, [data-option] input')).toHaveCount(0);
  for (const label of ['Benefit', 'Risk', 'Unknowns', 'Evidence']) await expect(page.locator('[data-option="A"] dt', { hasText: label })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 900 });
  const lefts = await opts.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  const tops2 = await opts.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(lefts).size).toBe(1);
  expect(new Set(tops2).size).toBe(3);
});

test('detail: external id is plain text, never a link; no inert link is followable', async ({ page }) => {
  for (const persona of PERSONAS) {
    await load(page, detail('DEC-DEMO-3'), { persona });
    const next = page.getByTestId('dec-next');
    await expect(next).toContainText('Decided in RT-DEMO-112 (demo link, not followed)');
    await expect(next.locator('a')).toHaveCount(0);
    const linkTexts = await page.locator('main a').allTextContents();
    expect(linkTexts.some((t) => t.includes('RT-DEMO-112'))).toBe(false);
    await expect(page.locator('main a[href*="invalid"]')).toHaveCount(0);
  }
});

test('detail: future approval panel lists what is missing and says it is not a control', async ({ page }) => {
  await load(page, detail('DEC-DEMO-3'));
  const f = page.getByTestId('dec-future');
  await expect(f.getByRole('heading', { name: 'Future approval interface (not built)' })).toBeVisible();
  await expect(f.locator('li')).toHaveCount(4);
  await expect(f).toContainText('authenticated approver identity');
  await expect(f).toContainText('Server-side authorisation per project');
  await expect(f).toContainText('audit record in the source system');
  await expect(f).toContainText('separation of proposal and decision');
  await expect(f).toContainText('None of it exists');
  await expect(f).toContainText('Nothing on this page is a control');
  await expect(f.locator('a, button')).toHaveCount(0);
});

test('detail: observed list shows provenance, not-read and restricted items, and no confidence number', async ({ page }) => {
  await load(page, detail('DEC-DEMO-5'), { persona: 'owner' });
  const rows = page.locator('[data-evidence]');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first().locator('.evidence-status')).toContainText(/min ago|h ago/);
  await expect(rows.first().locator('.evidence-status')).toContainText(/current|stale|unknown/);
  for (const persona of PERSONAS) {
    for (const id of DETAIL_IDS) {
      await load(page, detail(id), { persona });
      expect(await page.locator('main').innerText()).not.toMatch(/\d+\s?%/);
    }
  }
});

test('detail: DEC-DEMO-3 and the evidence for Technical vs Owner redaction', async ({ page }) => {
  await load(page, detail('DEC-DEMO-3'), { persona: 'technical' });
  await expect(page.locator('main')).toContainText('integration-tests');
  await load(page, detail('DEC-DEMO-3'), { persona: 'owner' });
  await expect(page.locator('main')).not.toContainText('integration-tests');
});

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`redaction ${lang}/${persona}: no banned strings on inbox or any detail`, async ({ page }) => {
      for (const route of [INBOX, ...DETAIL_IDS.map(detail)]) {
        await load(page, route, { lang, persona });
        const text = await page.locator('body').innerText();
        for (const b of BANNED) expect(text.includes(b), `${route} ${persona}/${lang}: ${b}`).toBe(false);
      }
    });
  }
}

for (const persona of PERSONAS) {
  test(`arabic/${persona}: no Latin run outside a left-to-right isolate`, async ({ page }) => {
    for (const route of [INBOX, ...DETAIL_IDS.map(detail), detail('DEC-NOPE')]) {
      await load(page, route, { lang: 'ar', persona });
      const offenders = await page.evaluate(() => {
        const out: string[] = [];
        const root = document.querySelector('main') ?? document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.textContent ?? '';
          const el = n.parentElement;
          if (!el || !/[A-Za-z]/.test(t) || el.closest('script,style')) continue;
          if (!el.closest('[dir="ltr"], [lang="en"]')) out.push(t.trim());
        }
        return out;
      });
      expect(offenders, `${route}/${persona}`).toEqual([]);
      const arabicIndic = await page.evaluate(() => /[٠-٩۰-۹]/.test(document.body.innerText));
      expect(arabicIndic).toBe(false);
    }
  });
}

test('arabic: ids stay whole and left to right', async ({ page }) => {
  await load(page, detail('DEC-DEMO-3'), { lang: 'ar', persona: 'technical', width: 320 });
  const isolated = await page.locator('bdi[dir="ltr"]').allTextContents();
  for (const token of ['DEC-DEMO-3', 'RT-DEMO-112', 'E-1', 'INV-DEMO-7', 'Retail Tower OS']) {
    expect(isolated.some((t) => t.includes(token)), token).toBe(true);
  }
  const broken = await page.locator('main bdi.ltr').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 1).map((e) => e.textContent));
  expect(broken).toEqual([]);
  expect(await overflowOf(page)).toBeLessThanOrEqual(0);
});

test('unknown id: error state with a way back to the inbox', async ({ page }) => {
  await load(page, detail('DEC-NOPE'));
  await expect(page.locator('[data-state="error"]')).toBeVisible();
  await expect(page.locator('main [data-truth]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Open the Decision Inbox' }).click();
  await expect(page).toHaveURL(/#\/decisions$/);
  await expect(page.getByTestId('dec-pending')).toBeVisible();
});

test('navigation: inbox, detail, inspect evidence reaches the evidence route from the case', async ({ page }) => {
  await load(page, INBOX);
  await page.getByRole('link', { name: 'Open proposal DEC-DEMO-3' }).click();
  await expect(page).toHaveURL(/#\/decisions\/DEC-DEMO-3$/);
  await expect(page.locator('h1')).toHaveText('Decision detail');
  await expect(page.locator('.crumbs')).toContainText('Decision Inbox');
  await expect(page.locator('.crumbs')).toContainText('DEC-DEMO-3');
  await expect(page.getByTestId('dec-context')).toBeVisible();
  await page.getByRole('link', { name: 'Inspect evidence E-1' }).click();
  await expect(page).toHaveURL(/#\/evidence\/E-1\?from=INV-DEMO-7$/);
});

test('navigation: case, project and breadcrumb links', async ({ page }) => {
  await load(page, detail('DEC-DEMO-3'));
  await expect(page.getByRole('link', { name: 'Open case INV-DEMO-7' })).toHaveAttribute('href', '#/investigation/INV-DEMO-7');
  await expect(page.getByRole('link', { name: 'View Retail Tower OS' })).toHaveAttribute('href', '#/project/RT');
  await page.locator('.crumbs').getByRole('link', { name: 'Decision Inbox' }).click();
  await expect(page).toHaveURL(/#\/decisions$/);

  await load(page, detail('DEC-DEMO-1'));
  await expect(page.getByRole('link', { name: /Open case/ })).toHaveCount(0);
  await expect(page.locator('[data-evidence] a').first()).toHaveAttribute('href', '#/evidence/E-41');
});

test('touch targets are at least 44 px at 375 px', async ({ page }) => {
  for (const route of [INBOX, detail('DEC-DEMO-3')]) {
    await load(page, route, { width: 375 });
    const small = await page.locator('main .dec-screen a.btn, main .dec-screen button').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
    expect(small, route).toBe(0);
  }
});

test('keyboard: every link on the detail page is reachable and shows a focus ring', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit leaves links out of the Tab order by default (Safari setting); covered on Chromium');
  await load(page, detail('DEC-DEMO-3'));
  const link = page.getByRole('link', { name: 'Inspect evidence E-1' });
  await link.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(link).toBeFocused();
  const ring = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThan(0);
});
