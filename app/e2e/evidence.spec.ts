import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { BANNED, LANGS, openRoute as load, PERSONAS, WIDTHS } from './helpers';
import { expectNoLeaks, RESTRICTED_IDS } from './leaks';

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

const E1 = '/evidence/E-1?from=INV-DEMO-7';

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`explorer layout ${lang} @${width}px: no overflow, one h1, ordered headings, no console errors`, async ({ page }) => {
      const errors = await load(page, E1, { lang, width, persona: 'technical' });
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator('h1')).toHaveCount(1);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
      levels.reduce((prev, cur) => { expect(cur).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
      await expect(page.locator('h1')).toContainText('E-1');
      expect(errors).toEqual([]);
    });
  }
}

for (const id of ['E-5', 'E-12', 'E-23', 'E-24']) {
  test(`explorer ${id}: no overflow at 320 px in Arabic for Technical`, async ({ page }) => {
    const errors = await load(page, `/evidence/${id}`, { lang: 'ar', width: 320, persona: 'technical' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    for (const id of ['E-1', 'E-22']) {
      test(`explorer controls ${lang}/${persona}/${id}: no forbidden action verbs`, async ({ page }) => {
        await load(page, `/evidence/${id}`, { lang, persona });
        const labels = await page.locator('button, a').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
        expect(labels.length).toBeGreaterThan(5);
        for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
      });
    }
  }
}

for (const persona of PERSONAS) {
  for (const id of ['E-1', 'E-3', 'E-12', 'E-23', 'E-24']) {
    test(`explorer arabic/${persona}/${id}: no Latin run outside a left-to-right isolate`, async ({ page }) => {
      await load(page, `/evidence/${id}`, { lang: 'ar', persona });
      expect(await latinOutsideIsolates(page)).toEqual([]);
    });
  }
}

for (const lang of LANGS) {
  for (const persona of ['owner', 'nontechnical'] as const) {
    for (const id of ['E-1', 'E-2', 'E-23']) {
      test(`explorer redaction ${lang}/${persona}/${id}: no job names, run ids, PR ids or demo links`, async ({ page }) => {
        await load(page, `/evidence/${id}?from=${id === 'E-23' ? 'INV-DEMO-9' : 'INV-DEMO-7'}`, { lang, persona });
        // E-23 is withheld from these personas: the not-found page echoes the id the visitor typed, so that one id is ignored.
        await expectNoLeaks(page, `${persona}/${lang}/${id}`, { extra: BANNED, ignore: RESTRICTED_IDS.includes(id) ? [id] : [] });
        await expect(page.locator('.raw')).toHaveCount(0);
        await expect(page.locator('.inert-link')).toHaveCount(0);
      });
    }
  }
}

test('E-1 for Technical shows raw output, the inert link, target, rule field and read-at time', async ({ page }) => {
  await load(page, E1, { persona: 'technical' });
  await expect(page.locator('.raw')).toContainText('AssertionError');
  await expect(page.locator('.inert-link')).toContainText('example.invalid');
  await expect(page.locator('[data-field="link"] a')).toHaveCount(0); // inert: text, never a followable link
  await expect(page.locator('[data-field="target"]')).toBeVisible();
  await expect(page.locator('[data-field="readAt"]')).toBeVisible();
  await expect(page.locator('[data-field="observedAt"]')).toBeVisible();
  await expect(page.locator('[data-field="source"]')).toContainText('GitHub');
});

test('only E-1 has raw output, even for Technical', async ({ page }) => {
  await load(page, '/evidence/E-2?from=INV-DEMO-7', { persona: 'technical' });
  await expect(page.locator('.raw')).toHaveCount(0);
  await expect(page.locator('.inert-link')).toContainText('example.invalid');
});

test('Owner sees observed-at but no target, rule, id or link; Nontechnical sees neither time nor environment', async ({ page }) => {
  await load(page, E1, { persona: 'owner' });
  await expect(page.locator('[data-field="observedAt"]')).toBeVisible();
  for (const f of ['target', 'rule', 'externalId', 'link', 'readAt']) await expect(page.locator(`[data-field="${f}"]`)).toHaveCount(0);
  await load(page, E1, { persona: 'nontechnical' });
  for (const f of ['observedAt', 'environment', 'target']) await expect(page.locator(`[data-field="${f}"]`)).toHaveCount(0);
  await expect(page.locator('[data-field="source"]')).toBeVisible();
});

test('E-12 does not exist for Owner and Nontechnical (same not-found state as an unknown id), visible for Technical', async ({ page }) => {
  for (const persona of ['owner', 'nontechnical'] as const) {
    await load(page, '/evidence/E-12', { persona });
    await expect(page.locator('[data-state="error"]')).toContainText('Evidence not found');
    await expect(page.locator('[data-state="restricted"]')).toHaveCount(0);
    await expect(page.locator('[data-field="source"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="evidence-title"]')).toHaveCount(0);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Restricted to Technical');
    expect(body).not.toContain('payments');
  }
  await load(page, '/evidence/E-12', { persona: 'technical' });
  await expect(page.locator('[data-state="restricted"]')).toHaveCount(0);
  await expect(page.locator('[data-field="source"]')).toContainText('Sentry');
  await expect(page.locator('[data-testid="evidence-title"]')).toContainText('payments');
});

test('E-24 shows not read with its reason, never a time or a zero', async ({ page }) => {
  await load(page, '/evidence/E-24', { persona: 'owner' });
  await expect(page.locator('[data-state="unavailable"]')).toContainText('Not read');
  await expect(page.locator('[data-field="observedAt"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="classification"]')).toContainText('Unknown');
  await expect(page.locator('[data-truth="unknown"]').first()).toBeVisible();
});

test('E-6 and E-31 are not read because the source is not set up; E-7 because it is unavailable', async ({ page }) => {
  await load(page, '/evidence/E-6?from=INV-DEMO-7');
  await expect(page.locator('[data-state="not_configured"]')).toContainText('not set up');
  await load(page, '/evidence/E-31');
  await expect(page.locator('[data-state="not_configured"]')).toContainText('Not read');
  await load(page, '/evidence/E-7?from=INV-DEMO-7');
  await expect(page.locator('[data-state="unavailable"]')).toContainText('unavailable');
});

test('stale evidence says stale in words with its age, and is never labelled current', async ({ page }) => {
  await load(page, '/evidence/E-5?from=INV-DEMO-7', { persona: 'technical' });
  await expect(page.locator('[data-field="freshness"]')).toContainText('stale');
  await expect(page.locator('[data-field="freshness"]')).toContainText('9 h ago');
  await expect(page.locator('[data-testid="freshness-note"]')).toContainText('never as current');
});

test('classification: Correlated shows its rule for Technical only; Nontechnical gets the plain label', async ({ page }) => {
  await load(page, '/evidence/E-3?from=INV-DEMO-7', { persona: 'technical' });
  await expect(page.locator('.explorer-lead [data-truth="correlated"]')).toHaveText('Correlated');
  await expect(page.locator('[data-field="rule"]')).toContainText('Jira key in the commit message');
  await expect(page.locator('[data-testid="classification"]')).toContainText('A link is not a cause');
  await load(page, '/evidence/E-3?from=INV-DEMO-7', { persona: 'owner' });
  await expect(page.locator('[data-field="rule"]')).toHaveCount(0);
  await load(page, '/evidence/E-3?from=INV-DEMO-7', { persona: 'nontechnical' });
  await expect(page.locator('.explorer-lead [data-truth="correlated"]')).toHaveText('Linked');
  await load(page, '/evidence/E-1?from=INV-DEMO-7');
  await expect(page.locator('[data-testid="classification"]')).toContainText('Nothing was inferred');
});

test('crumbs come from the case and link to Portfolio, the product and the case', async ({ page }) => {
  await load(page, E1);
  const crumbs = page.locator('nav.crumbs li');
  await expect(crumbs).toHaveCount(4);
  await expect(crumbs.nth(0).locator('a')).toHaveAttribute('href', '#/portfolio');
  await expect(crumbs.nth(1).locator('a')).toHaveAttribute('href', '#/project/RT');
  await expect(crumbs.nth(2).locator('a')).toHaveAttribute('href', '#/investigation/INV-DEMO-7');
  await expect(crumbs.nth(3).locator('[aria-current="page"]')).toContainText('E-1');
});

test('without from, the crumbs and back link come from the case that cites the item', async ({ page }) => {
  await load(page, '/evidence/E-22');
  await expect(page.getByTestId('back-link')).toHaveAttribute('href', '#/investigation/INV-DEMO-9');
  await expect(page.locator('nav.crumbs li')).toHaveCount(4);
  await load(page, '/evidence/E-11');
  await expect(page.getByTestId('back-link')).toHaveCount(0); // cited by no case
  await expect(page.locator('nav.crumbs li')).toHaveCount(3);
});

test('Back returns to the originating investigation', async ({ page }) => {
  await load(page, E1);
  await page.getByTestId('back-link').click();
  await expect(page).toHaveURL(/#\/investigation\/INV-DEMO-7$/);
  await expect(page.locator('h1')).toHaveText('Investigation Room');
});

test('supporting entities: cases, proposals and product are neutral links', async ({ page }) => {
  await load(page, E1);
  const side = page.getByTestId('supporting-entities');
  await expect(side.locator('a[href="#/investigation/INV-DEMO-7"]')).toBeVisible();
  await expect(side.locator('a[href="#/decisions/DEC-DEMO-3"]')).toBeVisible();
  await expect(side.locator('a[href="#/project/RT"]')).toBeVisible();
  await expect(side.locator('a[href="#/project/RT/stock-sync"]')).toBeVisible();
  await side.locator('a[href="#/decisions/DEC-DEMO-3"]').click();
  await expect(page).toHaveURL(/#\/decisions\/DEC-DEMO-3$/);
});

test('Nontechnical gets the product link but not the component name', async ({ page }) => {
  await load(page, E1, { persona: 'nontechnical' });
  const side = page.getByTestId('supporting-entities');
  await expect(side.locator('a[href="#/project/RT"]')).toBeVisible();
  await expect(side.locator('a[href="#/project/RT/stock-sync"]')).toHaveCount(0);
});

test('sibling index lists the other evidence and unread items; E-5 is absent for Owner, present for Technical; inspecting one navigates', async ({ page }) => {
  await load(page, E1, { persona: 'technical' });
  const techSib = page.getByTestId('sibling-evidence');
  for (const id of ['E-2', 'E-3', 'E-4', 'E-5', 'E-6', 'E-7']) await expect(techSib.locator(`[data-sibling="${id}"]`)).toBeVisible();
  await expect(techSib.locator('[data-sibling="E-5"]')).not.toContainText('Restricted to Technical');
  await load(page, E1, { persona: 'owner' });
  const sib = page.getByTestId('sibling-evidence');
  for (const id of ['E-2', 'E-3', 'E-4', 'E-6', 'E-7']) await expect(sib.locator(`[data-sibling="${id}"]`)).toBeVisible();
  await expect(sib.locator('[data-sibling="E-5"]')).toHaveCount(0);
  await expect(sib).not.toContainText('Restricted to Technical');
  await expect(sib.locator('[data-sibling="E-6"]')).toContainText('Not read');
  await expect(sib.locator('[data-sibling="E-1"]')).toHaveCount(0);
  await sib.locator('a[href="#/evidence/E-2?from=INV-DEMO-7"]').click();
  await expect(page).toHaveURL(/#\/evidence\/E-2\?from=INV-DEMO-7$/);
  await expect(page.locator('h1')).toContainText('E-2');
});

test('unknown id shows an error state with links home', async ({ page }) => {
  await load(page, '/evidence/E-999');
  await expect(page.locator('[data-state="error"]')).toContainText('Evidence not found');
  await expect(page.locator('main a[href="#/"]')).toBeVisible();
  await expect(page.locator('main a[href="#/portfolio"]').last()).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
});

test('an unknown id in Arabic keeps its id isolated', async ({ page }) => {
  await load(page, '/evidence/E-999', { lang: 'ar' });
  expect(await latinOutsideIsolates(page)).toEqual([]);
});

test('explorer touch targets are at least 44 px at 375 px', async ({ page }) => {
  await load(page, E1, { width: 375, persona: 'technical' });
  const small = await page.locator('main button, main .btn-link').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  expect(small).toBe(0);
});

test('nothing on the explorer claims health', async ({ page }) => {
  for (const persona of PERSONAS) {
    await load(page, E1, { persona });
    await expect(page.locator('[data-health]')).toHaveCount(0);
  }
});
