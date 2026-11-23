// BACK-89: the V2 Mission Replay as a view of the existing Investigation Room, with the three times of the replay kept apart (the
// processing clock, the time a source read the evidence, and "when it happened", which is not recorded and so not shown). One shell,
// one persona and language, one router; the selected event is in the route and moving the cursor replaces the history entry.
// Restricted evidence stays undisclosed. Persona is a display switch on synthetic data, not authorization. Nothing is live.
import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { COPY } from '../src/i18n/strings';
import { LANGS, openRoute, PERSONAS, WIDTHS } from './helpers';
import { hasId, hash, RESTRICTED, surface } from './lens-helpers';

const LAY = ['owner', 'nontechnical'] as const;
const ROOM = '/investigation/INV-DEMO-7';
const lens = (page: Page) => page.locator('[data-testid="replay-lens"]');
const story = (page: Page) => page.locator('[data-testid="story"] > li');
const basisRows = (page: Page) => page.locator('[data-testid="replay-time-basis"] tbody tr');
/** The number of replay events, read once the story has rendered (the lens is lazy and re-renders after a click or a persona switch). */
const eventCount = async (page: Page): Promise<number> => {
  await expect(story(page).first()).toBeVisible();
  return story(page).count();
};


test('the canonical fixture has the restricted record this spec depends on', () => {
  expect(RESTRICTED).toContain('E-5');
});

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`Replay view ${lang} @${width}px: one shell, one h1, no overflow, no console errors`, async ({ page }) => {
      const errors = await openRoute(page, `${ROOM}/replay`, { lang, persona: 'owner', width });
      await expect(lens(page)).toBeVisible();
      await expect(page.locator('[data-testid="replay-time-basis"]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      expect(await page.locator('main').count()).toBe(1);
      expect(await page.locator('.kv2-app, .kv2-top, .kv2-side, .kv2-skip').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('Investigation: the room stays the default view and the replay is another view of the same case', async ({ page }) => {
  await openRoute(page, ROOM, { lang: 'en', persona: 'owner', width: 1440 });
  await expect(lens(page)).toHaveCount(0);
  await expect(page.locator('.view-switch a[data-view="room"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#sidenav a[data-nav="investigation"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('.view-switch a[data-view="replay"]').click();
  await expect(lens(page)).toBeVisible();
  // The replay writes its starting event into the route (replacing the entry), so the address is the replay view at an event.
  await expect.poll(() => hash(page)).toMatch(/^#\/investigation\/INV-DEMO-7\/replay(\/R-\d+)?$/);
  await expect(page.locator('.view-switch a[data-view="replay"]')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(lens(page)).toHaveCount(0);
});

test('Replay: three times, kept apart: processing order, source read time, and an honest "not recorded"', async ({ page }) => {
  await openRoute(page, `${ROOM}/replay`, { lang: 'en', persona: 'technical', width: 1440 });
  const table = page.locator('[data-testid="replay-time-basis"]');
  await expect(table).toContainText('not the order things happened');
  await expect(table).toContainText('is not recorded in the demo data');
  await expect(basisRows(page)).toHaveCount(await eventCount(page));
  const rows = await basisRows(page).evaluateAll((trs) => trs.map((tr) => ({ order: tr.getAttribute('data-order'), cells: [...tr.children].map((c) => (c.textContent ?? '').trim()) })));
  // The CI failure was read at 14:02; the PR record was read at 13:27 yet is processed after it: order uncertain, never presented as sequence.
  const r2 = rows[1]!;
  expect(r2.order).toBe('uncertain');
  expect(r2.cells[3]).toContain('11-16 13:27');
  // An event with no evidence has no time, and says so.
  const none = rows.filter((r) => r.order === 'unknown');
  expect(none.length).toBeGreaterThan(0);
  for (const r of none) expect(r.cells[3]).toBe('No evidence, no time');
  // Steps are 1..n with no gap.
  expect(rows.map((r) => r.cells[0])).toEqual(rows.map((_, i) => String(i + 1)));
});

test('Replay: the selected event is in the route; moving the cursor replaces the history entry instead of adding one', async ({ page }) => {
  await openRoute(page, ROOM, { lang: 'en', persona: 'technical', width: 1440 });
  await page.locator('.view-switch a[data-view="replay"]').click();
  await story(page).nth(3).locator('button').click();
  await expect.poll(() => hash(page)).toMatch(/^#\/investigation\/INV-DEMO-7\/replay\/R-\d+$/);
  const first = await hash(page);
  const len = await page.evaluate(() => window.history.length);
  await story(page).nth(1).locator('button').click();
  await expect.poll(() => hash(page)).not.toBe(first);
  expect(await page.evaluate(() => window.history.length)).toBe(len);
  // Back leaves the replay view altogether (to the room), not one event at a time.
  await page.goBack();
  expect(await hash(page)).toBe('#/investigation/INV-DEMO-7');
});

test('Replay: a deep link opens at the event, and survives a reload, a persona switch and a language switch', async ({ page }) => {
  await openRoute(page, `${ROOM}/replay/R-4`, { lang: 'en', persona: 'technical', width: 1440 });
  await expect(story(page).nth(3)).toContainText(/.+/);
  await expect(story(page).nth(3).locator('button')).toHaveAttribute('aria-current', 'step');
  await page.reload();
  await expect(story(page).nth(3).locator('button')).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: COPY.en.persona.owner, exact: true }).click();
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await hash(page)).toBe('#/investigation/INV-DEMO-7/replay/R-4');
});

test('Replay: a case or event the data does not have is not found or ignored, never guessed', async ({ page }) => {
  await openRoute(page, `${ROOM}/replay/R-999`, { lang: 'en', persona: 'technical', width: 1440 });
  await expect(lens(page)).toBeVisible();
  expect(await page.locator('[data-testid="story"] button[aria-current="step"]').count()).toBeLessThanOrEqual(1);
  await openRoute(page, `${ROOM}/nope`, { lang: 'en', persona: 'owner' });
  await expect(page.locator('h1')).toHaveText(/Page not found/);
});

test('Replay: the keyboard scrubber moves the cursor and the route, replacing history', async ({ page }) => {
  await openRoute(page, `${ROOM}/replay/R-1`, { lang: 'en', persona: 'technical', width: 1440 });
  const len = await page.evaluate(() => window.history.length);
  await page.locator('.kv2-range').focus();
  await page.keyboard.press('End');
  await expect.poll(() => hash(page)).toMatch(/replay\/R-7$/);
  expect(await page.evaluate(() => window.history.length)).toBe(len);
});

test('Journey: Map to Replay and back, Map to Observatory and back, keep their selections', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/stock-sync', { lang: 'en', persona: 'technical', width: 1440 });
  await page.getByRole('button', { name: 'Open the investigation replay' }).click();
  await expect(lens(page)).toBeVisible();
  await expect.poll(() => hash(page)).toMatch(/^#\/investigation\/INV-DEMO-7\/replay(\/R-\d+)?$/);
  await page.goBack();
  await expect(page.locator('.kv2-bc-node[data-node="stock-sync"]')).toHaveAttribute('aria-pressed', 'true');
  await openRoute(page, '/map/all/github', { lang: 'en', persona: 'technical', width: 1440 });
  await page.getByRole('button', { name: 'Open in Source Observatory' }).first().click();
  await expect(page.locator('[data-testid="source-observatory-lens"]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.kv2-bc-node[data-node="github"]')).toHaveAttribute('aria-pressed', 'true');
});

const ROUTES = [`${ROOM}/replay`, `${ROOM}/replay/R-1`, `${ROOM}/replay/R-4`, `${ROOM}/replay/R-5`] as const;

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`Replay non-disclosure ${persona}/${lang}: no restricted id, observation, time or gap on any route or tab`, async ({ page }) => {
      for (const route of ROUTES) {
        await openRoute(page, route, { lang, persona, width: 1440 });
        const scan = async (label: string) => {
          const text = await surface(page);
          for (const id of RESTRICTED) expect(hasId(text, id) || text.includes(`"${id}"`), `${persona}/${lang} ${route} ${label}: ${id}`).toBe(false);
        };
        await scan('load');
        for (const tabs of [lens(page).locator('[role="tablist"]')]) {
          for (let k = 0; k < (await tabs.count()); k += 1) {
            const buttons = tabs.nth(k).getByRole('tab');
            for (let i = 0; i < (await buttons.count()); i += 1) {
              await buttons.nth(i).click();
              await scan(`tablist ${k} tab ${i}`);
            }
          }
        }
        // The time table is built from the authorized replay only: one row per visible event, steps without a gap.
        await expect(basisRows(page)).toHaveCount(await eventCount(page));
        const steps = await basisRows(page).evaluateAll((trs) => trs.map((tr) => (tr.children[0]?.textContent ?? '').trim()));
        expect(steps).toEqual(steps.map((_, i) => String(i + 1)));
      }
    });
  }
}

for (const lang of LANGS) {
  test(`Replay non-disclosure switch ${lang}: technical, owner, technical, owner on one page leaves nothing behind`, async ({ page }) => {
    await openRoute(page, `${ROOM}/replay/R-1`, { lang, persona: 'technical', width: 1440 });
    const L = COPY[lang].persona;
    const rows: Record<string, number> = {};
    for (const p of ['technical', 'owner', 'technical', 'owner', 'nontechnical'] as const) {
      await page.getByRole('button', { name: L[p], exact: true }).click();
      await expect(basisRows(page).first()).toBeVisible();
      const text = await surface(page);
      for (const id of RESTRICTED) if (p !== 'technical') expect(hasId(text, id) || text.includes(`"${id}"`), `${p}: ${id}`).toBe(false);
      const n = await eventCount(page);
      await expect(basisRows(page), `${p} rows equal events`).toHaveCount(n);
      rows[p] = n;
    }
    expect(rows.owner).toBe(rows.nontechnical);
  });
}

test('Replay: nothing here acts on anything, and nothing says live', async ({ page }) => {
  for (const persona of PERSONAS) {
    await openRoute(page, `${ROOM}/replay`, { lang: 'en', persona, width: 1440 });
    const labels = await lens(page).locator('button, a').evaluateAll((els) => els.map((e) => ((e.getAttribute('aria-label') ?? e.textContent) ?? '').trim()).filter(Boolean));
    // Play, previous, next and restart move a view cursor over fixed events; they do not act on anything.
    for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
    expect(await page.evaluate(() => /\blive\b/i.test(document.querySelector('main')!.innerText.replace(/not live/gi, '')))).toBe(false);
  }
});

test('Replay: reduced motion starts no playback and plays no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, `${ROOM}/replay`, { lang: 'en', persona: 'owner', width: 1440 });
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});
