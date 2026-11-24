// BACK-30 (M05-D05-B): a Technical-only record (E-5) and everything derived from it must not reach Owner or Nontechnical
// in the V2 Mission Map or the B+C pilot (BACK-30), nor in Source Observatory, Mission Replay, Agent Flight Deck or the shell
// search (BACK-66): not in text, accessible names, tooltips, data attributes, counts, links or tabs.
// A display persona is not authorization; this checks the demo's scoping only, not a server-side control.
import { expect, test, type Page } from '@playwright/test';
import { WORLD } from '../src/design-lab/v2/fixtures/world';
import { INV_DEMO_7 } from '../src/fixture/inv-demo-7';
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
async function leaks(page: Page, lang: 'en' | 'ar' = 'en', opts: { readonly inspectorAge?: boolean } = {}): Promise<string[]> {
  const pageWide = ['E-5', ...e5Titles(lang)].map(escapeRe);
  // The Observatory and Replay inspectors show the Sentry source's own last-read age, which is the same text as E-5's age and is an
  // authorized source fact there, so those screens match the id and the title only.
  const inspectorOnly = opts.inspectorAge === false ? [] : [escapeRe(formatAge(E5_AGE_MINUTES, lang))];
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
            // All of the node's text, hidden parts included: a superset of its accessible name, which is computed from content (BACK-91).
            const name = await page.locator('.kv2-bc-node[data-node="inventory"]').evaluate((e) => e.textContent ?? '');
            expect(name.length).toBeGreaterThan(0);
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

// ---- BACK-66: Source Observatory, Mission Replay, Agent Flight Deck and shell search ---------------------------------------------
// The same rule as above, on the four surfaces that used to read the unfiltered world. A display persona is not authorization; this
// checks the demo's scoping, not a server-side control (X02/X04 stay open).
const at = (key: 'obs.ev.none' | 'deck.md.events' | 'deck.md.events.unknown', lang: 'en' | 'ar'): string => TABLE[key][lang === 'ar' ? 1 : 0];
const scoped = (persona: 'owner' | 'nontechnical') => authorizedWorld(WORLD, persona);
const READABLE = (persona: 'owner' | 'nontechnical'): number => INV_DEMO_7.evidence.filter((e) => scoped(persona).evidenceById[e.id] !== undefined).length;

const openObservatory = async (page: Page, persona: string, lang: string, src = 'sentry') => {
  await load(page, { screen: 'source-observatory', persona, lang, extra: `src=${src}` });
  await expect(page.locator('#obsinsp-panel')).toBeVisible();
};

for (const persona of UNAUTHORIZED) {
  for (const lang of LANGS) {
    test.describe(`BACK-66 ${persona} ${lang}`, () => {
      test('Source Observatory: Sentry shows no E-5 on any tab, only the generic empty state, and keeps its authorized stale reading', async ({ page }) => {
        await openObservatory(page, persona, lang);
        expect(await leaks(page, lang, { inspectorAge: false })).toEqual([]);
        // Independently authorized facts survive: reachable, stale by its own age, health unknown (never healthy).
        const card = page.locator('.kv2-scard[data-provider="sentry"]');
        await expect(card).toHaveAttribute('data-conn', 'reachable');
        await expect(card).toHaveAttribute('data-fresh', 'stale');
        await expect(card).toHaveAttribute('data-health', 'unknown');
        for (const tab of ['evidence', 'provenance', 'details']) {
          await page.locator(`#obsinsp-tab-${tab}`).click();
          await expect(page.locator(`#obsinsp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
          expect(await leaks(page, lang, { inspectorAge: false })).toEqual([]);
        }
        await page.locator('#obsinsp-tab-evidence').click();
        for (const text of [COPY[lang].restricted, COPY[lang].notRead.restricted]) await expect(page.getByText(text)).toHaveCount(0);
        await expect(page.locator('#obsinsp-panel .kv2-ev-list')).toHaveCount(0);
        await expect(page.locator('#obsinsp-panel .kv2-empty')).toHaveText(at('obs.ev.none', lang));
      });

      test('Source Observatory: authorized records stay visible (every GitHub record, including E-8)', async ({ page }) => {
        await openObservatory(page, persona, lang, 'github');
        await page.locator('#obsinsp-tab-evidence').click();
        const github = Object.values(scoped(persona).evidenceById).filter((e) => e.observation?.source.provider === 'github');
        expect(github.map((e) => e.id)).toContain('E-8');
        await expect(page.locator('#obsinsp-panel .kv2-ev-list li')).toHaveCount(github.length);
        expect(await leaks(page, lang, { inspectorAge: false })).toEqual([]);
      });

      test('Mission Replay: no E-5 row, count, title, attribute or placeholder; the authorized rows and the gap stay', async ({ page }) => {
        await load(page, { screen: 'mission-replay', persona, lang, extra: 'evt=R-5' });
        await expect(page.locator('#rpinsp-panel')).toBeVisible();
        expect(await leaks(page, lang, { inspectorAge: false })).toEqual([]);
        for (const text of [COPY[lang].restricted, COPY[lang].notRead.restricted]) await expect(page.getByText(text)).toHaveCount(0);
        const readable = READABLE(persona);
        expect(readable).toBeLessThan(INV_DEMO_7.evidence.length);
        await expect(page.locator('#rpinsp-panel .kv2-ev-list li')).toHaveCount(readable);
        await expect(page.locator('#evl-h .kv2-count')).toHaveText(String(readable));
        await expect(page.locator('[data-testid="story"] li')).toHaveCount(WORLD.replay.length);
        await expect(page.locator('#kpi-gaps')).toBeVisible();
        for (const tab of ['context', 'history', 'evidence']) {
          await page.locator(`#rpinsp-tab-${tab}`).click();
          await expect(page.locator(`#rpinsp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
          expect(await leaks(page, lang, { inspectorAge: false })).toEqual([]);
        }
      });

      test('Agent Flight Deck: MSN-DEMO-2 keeps E-9 and loses E-5, and its events figure is not defined, so no count can hint at the hidden record', async ({ page }) => {
        await load(page, { screen: 'agent-flight-deck', persona, lang, extra: 'msn=MSN-DEMO-2' });
        await expect(page.locator('#mission')).toBeVisible();
        expect(await leaks(page, lang, { inspectorAge: false })).toEqual([]);
        for (const text of [COPY[lang].restricted, COPY[lang].notRead.restricted]) await expect(page.getByText(text)).toHaveCount(0);
        await expect(page.locator('#mission .kv2-md-side .kv2-ev-list li')).toHaveCount(1);
        const events = page.locator('#mission .kv2-md-grid > div', { hasText: at('deck.md.events', lang) }).locator('dd');
        await expect(events).toHaveText(at('deck.md.events.unknown', lang));
      });

      // With the shipped fixture no search label carries E-5, so this passes on the old code too. It guards the user-visible result
      // (no E-5 hit, Sentry still found); the scoping itself is proven by the buildHits unit tests on a constructed world.
      test('Shell search: no E-5 hit, and an authorized target (Sentry) is still found (scoping itself: buildHits unit tests)', async ({ page }) => {
        await load(page, { screen: 'mission-map', persona, lang });
        const box = page.locator('.kv2-search input');
        await box.fill('E-5');
        await expect(page.locator('.kv2-search-list li[role="option"]')).toHaveCount(1);
        await expect(page.locator('.kv2-search-list li[aria-disabled="true"]')).toHaveCount(1);
        await box.fill('Sentry');
        await expect(page.locator('.kv2-search-list li[aria-disabled="true"]')).toHaveCount(0);
        expect(await page.locator('.kv2-search-list li[role="option"]').count()).toBeGreaterThan(0);
        expect(await leaks(page, lang, { inspectorAge: false })).toEqual([]);
      });
    });
  }
}

test.describe('BACK-66 Technical is permitted', () => {
  test('Observatory: Technical reads E-5 on the Sentry evidence tab', async ({ page }) => {
    await openObservatory(page, 'technical', 'en');
    await page.locator('#obsinsp-tab-evidence').click();
    await expect(page.locator('#obsinsp-panel')).toContainText('E-5');
  });

  test('Replay: Technical reads all seven evidence rows including E-5', async ({ page }) => {
    await load(page, { screen: 'mission-replay', persona: 'technical', lang: 'en' });
    await expect(page.locator('#rpinsp-panel .kv2-ev-list li')).toHaveCount(INV_DEMO_7.evidence.length);
    await expect(page.locator('#rpinsp-panel')).toContainText('E-5');
  });

  test('Deck: Technical sees MSN-DEMO-2 with both evidence rows, and its events figure is still not defined (the same wording as every persona)', async ({ page }) => {
    await load(page, { screen: 'agent-flight-deck', persona: 'technical', lang: 'en', extra: 'msn=MSN-DEMO-2' });
    await expect(page.locator('#mission .kv2-md-side .kv2-ev-list li')).toHaveCount(2);
    await expect(page.locator('#mission .kv2-md-side')).toContainText('E-5');
    const events = page.locator('#mission .kv2-md-grid > div', { hasText: at('deck.md.events', 'en') }).locator('dd');
    await expect(events).toHaveText(at('deck.md.events.unknown', 'en'));
  });

  // BACK-90 (owner decision A): the events figure is not defined, in the standalone lab as in the host Flight Deck. Every mission, all three
  // personas, both languages: the cell holds the same words and no digit, so no fixture value (the fixture has 2 to 4) can reach the screen.
  for (const lang of ['en', 'ar'] as const) {
    test(`Deck ${lang}: every mission's events figure reads as not defined for every persona, never a number`, async ({ page }) => {
      for (const persona of ['technical', 'owner', 'nontechnical'] as const) {
        for (const m of WORLD.missions) {
          await load(page, { screen: 'agent-flight-deck', persona, lang, extra: `msn=${m.id}` });
          const events = page.locator('#mission .kv2-md-grid > div', { hasText: at('deck.md.events', lang) }).locator('dd');
          await expect(events, `${persona} ${m.id}`).toHaveText(at('deck.md.events.unknown', lang));
          expect(await events.innerText(), `${persona} ${m.id}`).not.toMatch(/\d/);
        }
      }
    });
  }
});

test.describe('BACK-66 persona switch on the same page (display only, not authorization)', () => {
  const toOwner = (page: Page) => page.evaluate(() => { location.hash = location.hash.replace('technical', 'owner'); });

  test('Observatory: switching Technical to Owner removes E-5 at once', async ({ page }) => {
    await openObservatory(page, 'technical', 'en');
    await page.locator('#obsinsp-tab-evidence').click();
    await expect(page.locator('#obsinsp-panel')).toContainText('E-5');
    await toOwner(page);
    await expect(page.locator('#obsinsp-panel')).not.toContainText('E-5');
    await expect(page.locator('#obsinsp-panel .kv2-empty')).toHaveText(at('obs.ev.none', 'en'));
    expect(await leaks(page, 'en', { inspectorAge: false })).toEqual([]);
  });

  test('Replay: switching Technical to Owner removes E-5 and drops the evidence count from 7 to 6', async ({ page }) => {
    await load(page, { screen: 'mission-replay', persona: 'technical', lang: 'en' });
    await expect(page.locator('#evl-h .kv2-count')).toHaveText(String(INV_DEMO_7.evidence.length));
    await toOwner(page);
    await expect(page.locator('#evl-h .kv2-count')).toHaveText(String(READABLE('owner')));
    await expect(page.locator('#rpinsp-panel')).not.toContainText('E-5');
    expect(await leaks(page, 'en', { inspectorAge: false })).toEqual([]);
  });

  test('Deck: switching Technical to Owner removes E-5 from MSN-DEMO-2, and its events figure reads the same before and after', async ({ page }) => {
    await load(page, { screen: 'agent-flight-deck', persona: 'technical', lang: 'en', extra: 'msn=MSN-DEMO-2' });
    await expect(page.locator('#mission .kv2-md-side')).toContainText('E-5');
    const events = page.locator('#mission .kv2-md-grid > div', { hasText: at('deck.md.events', 'en') }).locator('dd');
    await expect(events).toHaveText(at('deck.md.events.unknown', 'en'));
    await toOwner(page);
    await expect(page.locator('#mission .kv2-md-side .kv2-ev-list li')).toHaveCount(1);
    await expect(events).toHaveText(at('deck.md.events.unknown', 'en'));
    expect(await leaks(page, 'en', { inspectorAge: false })).toEqual([]);
  });
});

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

// BACK-66 C-16: the Flight Deck hides mission ids from Nontechnical, so the shell search must not reveal them either.
test.describe('BACK-66 C-16 search shows mission ids only where the Deck does', () => {
  for (const lang of LANGS) {
    test(`Nontechnical ${lang}: "MSN" finds nothing; a mission is still found by its title`, async ({ page }) => {
      await load(page, { screen: 'mission-map', persona: 'nontechnical', lang });
      const box = page.locator('.kv2-search input');
      await box.fill('MSN');
      await expect(page.locator('.kv2-search-list li[role="option"]')).toHaveCount(1);
      await expect(page.locator('.kv2-search-list li[aria-disabled="true"]')).toHaveCount(1);
      const title = (TABLE['ms.fresh'] as readonly [string, string])[lang === 'ar' ? 1 : 0];
      await box.fill(title.slice(0, 6));
      await expect(page.locator('.kv2-search-list li[aria-disabled="true"]')).toHaveCount(0);
      await expect(page.locator('.kv2-search-list')).not.toContainText('MSN-');
    });
  }

  test('Owner: "MSN" still finds missions by id', async ({ page }) => {
    await load(page, { screen: 'mission-map', persona: 'owner', lang: 'en' });
    await page.locator('.kv2-search input').fill('MSN');
    await expect(page.locator('.kv2-search-list li[aria-disabled="true"]')).toHaveCount(0);
    await expect(page.locator('.kv2-search-list')).toContainText('MSN-DEMO-1');
  });
});
