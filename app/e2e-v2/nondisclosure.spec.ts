// BACK-30 (M05-D05-B): a Technical-only record (E-5) and everything derived from it must not reach Owner or Nontechnical
// in the V2 Mission Map or the B+C pilot: not in text, accessible names, tooltips, data attributes, counts, links or tabs.
// A display persona is not authorization; this checks the demo's scoping only, not a server-side control.
import { expect, test, type Page } from '@playwright/test';
import { WORLD } from '../src/design-lab/v2/fixtures/world';
import { authorizedWorld } from '../src/design-lab/v2/logic/authorize';
import { TABLE } from '../src/design-lab/v2/i18n/t';
import { COPY } from '../src/i18n/strings';
import { formatAge } from '../src/i18n/segments';
import { loadBc, squash, waitForIntroDone } from './bc-helpers';
import { load } from './helpers';

const UNAUTHORIZED = ['owner', 'nontechnical'] as const;
const LANGS = ['en', 'ar'] as const;
const copyOf = (key: 'chip.stale' | 'edge.restricted', lang: 'en' | 'ar'): string => TABLE[key][lang === 'ar' ? 1 : 0].replace(/[{}]/g, '');
/** Any map copy key in one language, with the {isolate} braces the renderer strips. */
const mapText = (key: Parameters<typeof copyOf>[0] | 'map.nl.inventory' | 'map.nl.inventory.none', lang: 'en' | 'ar'): string =>
  (TABLE[key] as readonly [string, string])[lang === 'ar' ? 1 : 0].replace(/[{}]/g, '');
const listWord = (lang: 'en' | 'ar'): string => TABLE['view.list'][lang === 'ar' ? 1 : 0];
const emptyCopy = (lang: 'en' | 'ar'): string => TABLE['map.signals.none'][lang === 'ar' ? 1 : 0];

/** On the Evidence tab the restricted-record placeholder must be gone (it would reveal the record exists) and the generic empty state shown. */
async function expectNoPlaceholder(page: Page, panel: string, lang: 'en' | 'ar'): Promise<void> {
  const restricted = [COPY[lang].restricted, COPY[lang].notRead.restricted];
  for (const text of restricted) await expect(page.getByText(text)).toHaveCount(0);
  await expect(page.locator(`${panel} .kv2-ev-list`)).toHaveCount(0);
  await expect(page.locator(`${panel} .kv2-empty`)).toHaveText(emptyCopy(lang));
}

const SCOPED_EDGES = authorizedWorld(WORLD, 'owner').edges.length;

// What a viewer could read about the restricted record: its id, its title and its age text. All three come from the
// fixture and the shipped copy, never from guesses, so a change to the record changes what this test looks for.
// The age text ("9 h ago") is also the age of the Sentry source's own last read, which every persona may see in the V2 source
// panel and on the Sentry node. So the id and title are matched on the whole page, and the age only inside the inspector, which
// for Inventory has no authorized reason to show it (its only provider came from E-5).
const E5 = WORLD.evidenceById['E-5']!;
const E5_AGE_MINUTES = E5.observation!.source.ageMinutes;
const escapeRe = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const e5Titles = (lang: 'en' | 'ar'): string[] => [...new Set((['owner', 'technical', 'nontechnical'] as const).map((p) => COPY[lang].evidenceItem['E-5']![p].replace(/[{}]/g, '')))];

/** Everything a viewer, a screen reader or a tooltip could read that matches the restricted id, title or age text. */
async function leaks(page: Page, lang: 'en' | 'ar' = 'en'): Promise<string[]> {
  const pageWide = ['E-5', ...e5Titles(lang)].map(escapeRe);
  const inspectorOnly = [escapeRe(formatAge(E5_AGE_MINUTES, lang))];
  return page.evaluate(({ wide, narrow }) => {
    const found: string[] = [];
    const scan = (root: Element, srcs: string[]) => {
      const res = srcs.map((x) => new RegExp(x));
      const body = (root as HTMLElement).innerText;
      for (const re of res) if (re.test(body)) found.push(`text ${re}: ${body.slice(Math.max(0, body.search(re) - 20), body.search(re) + 40)}`);
      for (const el of [root, ...root.querySelectorAll('*')]) {
        for (const a of el.attributes) {
          if (!(a.name === 'aria-label' || a.name === 'title' || a.name === 'alt' || a.name.startsWith('data-'))) continue;
          for (const re of res) if (re.test(a.value)) found.push(`${el.tagName}[${a.name}]=${a.value}`);
        }
      }
    };
    scan(document.body, wide);
    for (const insp of document.querySelectorAll('[data-testid="inspector"]')) scan(insp, narrow);
    return found;
  }, { wide: pageWide, narrow: inspectorOnly });
}

const openV2 = async (page: Page, persona: string, lang: string) => {
  await load(page, { screen: 'mission-map', persona, lang, extra: 'node=inventory' });
  await expect(page.locator('.kv2-map')).toBeVisible();
};

for (const persona of UNAUTHORIZED) {
  for (const lang of LANGS) {
    test.describe(`${persona} ${lang}`, () => {
      test('V2 map: no trace of E-5 on any inspector tab, no Inventory-Sentry link, evidence count 0', async ({ page }) => {
        await openV2(page, persona, lang);
        expect(await leaks(page, lang)).toEqual([]);
        expect((await page.locator('.kv2-node[data-node="inventory"]').getAttribute('aria-label')) ?? '').not.toContain(copyOf('chip.stale', lang));
        for (const tab of ['evidence', 'sources']) {
          await page.locator(`#mapinsp-tab-${tab}`).click();
          await expect(page.locator(`#mapinsp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
          expect(await leaks(page, lang)).toEqual([]);
        }
      });

      test('V2 Overview: the Inventory description does not describe the hidden record, it says no evidence was read', async ({ page }) => {
        await openV2(page, persona, lang);
        await expect(page.locator('#mapinsp-panel .kv2-insp-desc')).toHaveText(mapText('map.nl.inventory.none', lang));
        expect(squash(await page.locator('#mapinsp-panel').innerText())).not.toContain(mapText('map.nl.inventory', lang));
        expect(await leaks(page, lang)).toEqual([]);
      });

      for (const view of ['map', 'list'] as const) {
        test(`B+C ${view} Overview: the Inventory description does not describe the hidden record, it says no evidence was read`, async ({ page }) => {
          await loadBc(page, { persona, lang, node: 'inventory', view });
          await expect(page.locator('#bcinsp-panel .kv2-insp-desc')).toHaveText(mapText('map.nl.inventory.none', lang));
          expect(squash(await page.locator('#bcinsp-panel').innerText())).not.toContain(mapText('map.nl.inventory', lang));
          expect(await leaks(page, lang)).toEqual([]);
        });
      }

      test('Evidence tab: no restricted-record placeholder, only the generic empty state (V2 and B+C)', async ({ page }) => {
        await openV2(page, persona, lang);
        await page.locator('#mapinsp-tab-evidence').click();
        await expect(page.locator('#mapinsp-tab-evidence')).toHaveAttribute('aria-selected', 'true');
        await expectNoPlaceholder(page, '#mapinsp-panel', lang);
        await loadBc(page, { persona, lang, node: 'inventory', view: 'list', tab: 'evidence' });
        await expect(page.locator('#bcinsp-tab-evidence')).toHaveAttribute('aria-selected', 'true');
        await expectNoPlaceholder(page, '#bcinsp-panel', lang);
      });

      test('V2 list: Inventory shows evidence count 0, no Inventory-Sentry row, no edge.restricted copy', async ({ page }) => {
        await openV2(page, persona, lang);
        await page.getByRole('button', { name: listWord(lang), exact: true }).click();
        const nodes = page.locator('.kv2-list-view .kv2-table').first();
        await expect(nodes).toBeVisible();
        const row = nodes.locator('tbody tr', { hasText: 'Inventory service' });
        await expect(row.locator('td').last()).toHaveText('0');
        const links = page.locator('.kv2-list-view .kv2-table').nth(1);
        const linkRows = await links.locator('tbody tr').allInnerTexts();
        expect(linkRows.filter((r) => r.includes('Inventory service') && r.includes('Sentry'))).toEqual([]);
        expect(linkRows).toHaveLength(SCOPED_EDGES);
        await expect(page.getByText(copyOf('edge.restricted', lang))).toHaveCount(0);
        expect(await leaks(page, lang)).toEqual([]);
      });

      for (const view of ['map', 'list'] as const) {
        test(`B+C ${view}: no E-5, no d4, Inventory is not stale, map and list agree on the links`, async ({ page }) => {
          await loadBc(page, { persona, lang, node: 'inventory', view });
          if (view === 'map') await waitForIntroDone(page);
          expect(await leaks(page, lang)).toEqual([]);
          await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(0);
          await expect(page.getByText(copyOf('edge.restricted', lang))).toHaveCount(0);
          if (view === 'map') {
            const name = (await page.locator('.kv2-bc-node[data-node="inventory"]').getAttribute('aria-label')) ?? '';
            expect(name).not.toContain(copyOf('chip.stale', lang));
            expect(await page.locator('.kv2-bc-edge').count()).toBe(SCOPED_EDGES);
          }
          for (const tab of ['evidence', 'sources']) {
            await page.locator(`#bcinsp-tab-${tab}`).click();
            await expect(page.locator(`#bcinsp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
            expect(await leaks(page, lang)).toEqual([]);
          }
          if (view === 'map') await page.getByRole('button', { name: listWord(lang), exact: true }).click();
          await expect(page.locator('.kv2-bc-links tr[data-link]')).toHaveCount(SCOPED_EDGES);
          await expect(page.locator('.kv2-bc-links tr[data-link="d4"]')).toHaveCount(0);
          expect(await leaks(page, lang)).toEqual([]);
        });
      }
    });
  }
}

test.describe('Technical is permitted', () => {
  for (const lang of LANGS) {
    test(`Overview (${lang}): Technical still reads the original Inventory description on V2 and B+C`, async ({ page }) => {
      const was = mapText('map.nl.inventory', lang);
      await openV2(page, 'technical', lang);
      await expect(page.locator('#mapinsp-panel .kv2-insp-desc')).toHaveText(was);
      await loadBc(page, { persona: 'technical', lang, node: 'inventory', view: 'list' });
      await expect(page.locator('#bcinsp-panel .kv2-insp-desc')).toHaveText(was);
    });
  }

  test('V2: E-5 is visible in the Inventory evidence tab', async ({ page }) => {
    await openV2(page, 'technical', 'en');
    await page.locator('#mapinsp-tab-evidence').click();
    await expect(page.locator('#mapinsp-panel')).toContainText('E-5');
  });

  test('B+C: E-5 is visible in the Inventory evidence tab and d4 is drawn', async ({ page }) => {
    await loadBc(page, { persona: 'technical', lang: 'en', node: 'inventory', view: 'map', tab: 'evidence' });
    await waitForIntroDone(page);
    await expect(page.locator('#bcinsp-panel')).toContainText('E-5');
    await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(1);
  });
});

test('switching the display persona from Technical to Owner drops E-5 and d4 at once (display only, not authorization)', async ({ page }) => {
  await loadBc(page, { persona: 'technical', lang: 'en', node: 'inventory', view: 'map', tab: 'evidence' });
  await waitForIntroDone(page);
  await expect(page.locator('#bcinsp-panel')).toContainText('E-5');
  await page.evaluate(() => { location.hash = location.hash.replace('technical', 'owner'); });
  await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(0);
  expect(await leaks(page)).toEqual([]);
  expect(squash(await page.locator('#bcinsp-panel').innerText())).not.toContain('E-5');
});

test('V2 map: switching the display persona from Technical to Owner drops E-5 and the stale-error description at once (display only, not authorization)', async ({ page }) => {
  await openV2(page, 'technical', 'en');
  await page.locator('#mapinsp-tab-evidence').click();
  await expect(page.locator('#mapinsp-tab-evidence')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#mapinsp-panel')).toContainText('E-5');
  await page.evaluate(() => { location.hash = location.hash.replace('technical', 'owner'); });
  await expect(page.locator('#mapinsp-panel')).not.toContainText('E-5');
  await expect(page.locator('#mapinsp-panel .kv2-empty')).toHaveText(emptyCopy('en'));
  expect(await leaks(page)).toEqual([]);
  await page.locator('#mapinsp-tab-overview').click();
  await expect(page.locator('#mapinsp-panel .kv2-insp-desc')).toHaveText(mapText('map.nl.inventory.none', 'en'));
  expect(squash(await page.locator('#mapinsp-panel').innerText())).not.toContain(mapText('map.nl.inventory', 'en'));
});
