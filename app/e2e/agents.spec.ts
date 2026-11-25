import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { BANNED, LANGS, openRoute, PERSONAS, WIDTHS, type LoadQuery } from './helpers';
import { expectNoLeaks } from './leaks';

const load = async (page: Page, q: LoadQuery = {}) => {
  const errors = await openRoute(page, '/agents', q);
  await expect(page.getByTestId('roster')).toBeVisible();
  return errors;
};

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`agents layout ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
      const errors = await load(page, { lang, width });
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      await expect(page.getByTestId('oversight')).toBeVisible();
      await expect(page.locator('[data-agent]')).toHaveCount(4);
      expect(errors).toEqual([]);
    });
  }
}

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`agents controls ${lang}/${persona}: no forbidden verbs, no "run", no buttons except the filter`, async ({ page }) => {
      await load(page, { lang, persona });
      const labels = await page.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
      expect(labels.length).toBeGreaterThan(5);
      for (const l of labels) {
        expect(isForbiddenControlLabel(l), l).toBe(false);
        expect(/run/i.test(l), l).toBe(false);
      }
      const stray = await page.locator('main button').evaluateAll((els) => els.filter((e) => !e.closest('.seg')).map((e) => e.textContent));
      expect(stray).toEqual([]);
      await expect(page.locator('main input, main select, main textarea, main [role="switch"]')).toHaveCount(0);
      await expect(page.locator('main [data-health]')).toHaveCount(0);
    });
  }
}

test('agents: every state is visible in words, remediation is not enabled', async ({ page }) => {
  await load(page);
  const state = (id: string) => page.locator(`[data-agent="${id}"] [data-agent-state]`);
  await expect(state('AG-scout')).toHaveText('Watching (simulated)');
  // BACK-102: evidence-collector works missions on the Flight Deck (correlation, hypothesis, proposal), so it is watching, not idle.
  await expect(state('AG-collector')).toHaveText('Watching (simulated)');
  await expect(state('AG-guard')).toHaveText('Paused by a human');
  await expect(state('AG-fixer')).toHaveText('Not enabled');
  await expect(page.locator('[data-agent="AG-fixer"] [data-last-activity]')).toHaveText('never');
  await expect(page.locator('[data-agent="AG-fixer"] [data-capability="not_available"]')).toHaveCount(1);
  await expect(page.locator('[data-agent="AG-scout"] [data-capability="simulated"]').first()).toContainText('simulated');
  // Four different shapes: no two states share a border style. The roster has no idle agent since BACK-102, so each of the four
  // states is applied in place to one badge to exercise the stylesheet rule an idle agent would hit.
  const styles = await page.locator('[data-agent-state]').first().evaluate((el) => ['watching', 'idle', 'paused', 'not_enabled'].map((s) => {
    el.setAttribute('data-agent-state', s);
    return getComputedStyle(el).borderTopStyle;
  }));
  expect(new Set(styles).size).toBe(4);
  await page.reload();
  // Nothing in the roster uses a healthy green.
  const colours = await page.locator('[data-agent-state]').evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
  expect(colours).not.toContain('rgb(36, 201, 139)');
});

test('agents: oversight explanation comes first and states the limits', async ({ page }) => {
  await load(page);
  const box = page.getByTestId('oversight');
  await expect(box).toContainText('Every agent shown here is simulated');
  await expect(box).toContainText('Nothing executes');
  await expect(box).toContainText('at most Proposed');
  await expect(box).toContainText('remediation agent is not part of this version');
  const order = await page.evaluate(() => {
    const o = document.querySelector('[data-testid="oversight"]');
    const r = document.querySelector('[data-testid="roster"]');
    return !!o && !!r && !!(o.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
});

test('agents: all timeline items carry a truth chip, newest first, none Approved', async ({ page }) => {
  await load(page);
  const items = page.locator('[data-timeline]');
  await expect(items).toHaveCount(5);
  for (const item of await items.all()) await expect(item.locator('[data-truth]')).toHaveCount(1);
  await expect(page.locator('[data-timeline] [data-truth="approved"]')).toHaveCount(0);
  await expect(page.locator('[data-timeline="ACT-8"]')).toContainText('A person');
  await expect(page.locator('[data-timeline="ACT-3"]')).toContainText('triage-scout');
  const ids = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-timeline')));
  expect(ids).toEqual(['ACT-4', 'ACT-5', 'ACT-3', 'ACT-6', 'ACT-8']);
});

test('agents: filter by project, and links reach case and evidence', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Khepri' }).click();
  await expect(page.locator('[data-timeline]')).toHaveCount(1);
  await expect(page.locator('[data-timeline="ACT-6"]')).toBeVisible();
  await page.getByRole('button', { name: 'All projects' }).click();
  await expect(page.locator('[data-timeline]')).toHaveCount(5);
  await page.getByRole('link', { name: 'Inspect evidence E-3' }).click();
  await expect(page).toHaveURL(/#\/evidence\/E-3/);
  await load(page);
  await page.getByRole('link', { name: 'Open case INV-DEMO-7' }).first().click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7/);
});

test('agents: nontechnical sees plain labels, technical sees agent ids', async ({ page }) => {
  await load(page, { persona: 'nontechnical' });
  await expect(page.locator('[data-timeline="ACT-4"] .truth')).toHaveText('Linked');
  await expect(page.locator('[data-agent="AG-scout"]')).not.toContainText('AG-scout');
  await load(page, { persona: 'technical' });
  await expect(page.locator('[data-agent="AG-scout"]')).toContainText('AG-scout');
});

for (const lang of LANGS) {
  for (const persona of ['owner', 'nontechnical'] as const) {
    test(`agents redaction ${lang}/${persona}: no banned tokens`, async ({ page }) => {
      await load(page, { lang, persona });
      await expectNoLeaks(page, `${persona}/${lang}`, { extra: BANNED });
    });
  }
}

for (const persona of PERSONAS) {
  test(`agents arabic/${persona}: no Latin run outside a left-to-right isolate`, async ({ page }) => {
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

test('agents: touch targets are at least 44 px at 375 px', async ({ page }) => {
  await load(page, { width: 375 });
  const small = await page.locator('main button, main a').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  expect(small).toBe(0);
});
