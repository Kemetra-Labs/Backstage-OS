// BACK-92 R4: the content-level non-disclosure checks of the retired lab suite (e2e-v2/nondisclosure.spec.ts and structure.spec.ts),
// moved onto the host lens routes. The per-lens host specs prove that no restricted id or observation id reaches a lay persona; these
// add what the lab also read: the withheld record's title and age text, the "restricted" placeholder copy, the Inventory description
// that rested on it, and the counts that would change if it were silently dropped (evidence rows, links, story rows). A display persona
// is not authorization; this checks the demo's scoping on synthetic data, not a server-side control.
import { expect, test, type Page } from '@playwright/test';
import { WORLD } from '../src/lenses/fixtures/world';
import { authorizedWorld } from '../src/lenses/logic/authorize';
import { TABLE } from '../src/i18n/index';
import { INV_DEMO_7 } from '../src/fixture/inv-demo-7';
import { COPY } from '../src/i18n/strings';
import { formatAge } from '../src/i18n/format';
import { LANGS } from './helpers';
import { waitForIntroDone } from './lens-fidelity';
import { expectNoLeaks, explain, leaksIn, leaks as probe, type Leak } from './leaks';
import { openScreen, SCREENS, setMapMode } from './lens-helpers';

const LAY = ['owner', 'nontechnical'] as const;
type Lang = (typeof LANGS)[number];
const text = (key: keyof typeof TABLE, lang: Lang): string => (TABLE[key] as readonly [string, string])[lang === 'ar' ? 1 : 0].replace(/[{}]/g, '');
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const SCOPED_EDGES = authorizedWorld(WORLD, 'owner').edges.length;
const scoped = (persona: (typeof LAY)[number]) => authorizedWorld(WORLD, persona);
const READABLE = (persona: (typeof LAY)[number]): number => INV_DEMO_7.evidence.filter((e) => scoped(persona).evidenceById[e.id] !== undefined).length;

// What a viewer could read about the restricted record: every withheld token (id, observation id, title in every persona's wording and
// both languages, rule, link, placeholder copy) comes from the shared probe in leaks.ts (BACK-92 R7). The one extra is the record's age
// text: it is also the Sentry source's own authorized last-read age, so it cannot be a page-wide token and is matched only inside the
// map inspector for Inventory, whose only provider came from E-5.
const E5 = WORLD.evidenceById['E-5']!;

/** Everything a viewer, a screen reader, a tooltip or the address could hold that names the restricted record (or, in the map inspector, its age). */
async function leaks(page: Page, lang: Lang, opts: { readonly inspectorAge?: boolean } = {}): Promise<Leak[]> {
  const found = await probe(page);
  if (opts.inspectorAge) found.push(...await probe(page, { within: '.kv2-bc-insp', restricted: false, extra: [formatAge(E5.observation!.source.ageMinutes, lang)] }));
  return found;
}

/** The "restricted" placeholder copy: a placeholder row is itself a disclosure, so it must never be rendered for a lay persona. */
async function expectNoPlaceholder(page: Page, lang: Lang): Promise<void> {
  for (const t of [COPY[lang].restricted, COPY[lang].notRead.restricted]) await expect(page.getByText(t)).toHaveCount(0);
}

for (const persona of LAY) {
  for (const lang of LANGS) {
    for (const mode of ['map', 'list'] as const) {
      test(`Map ${mode} ${persona}/${lang}: Inventory says no evidence was read, is not stale, and nothing names, ages or counts the withheld record`, async ({ page }) => {
        await openScreen(page, '/map/retail-tower/inventory', { lang, persona, width: 1440 });
        await setMapMode(page, mode);
        if (mode === 'map') await waitForIntroDone(page);
        await expect(page.locator('#bcinsp-panel .kv2-insp-desc')).toHaveText(text('map.nl.inventory.none', lang));
        expect(squash(await page.locator('#bcinsp-panel').innerText())).not.toContain(text('map.nl.inventory', lang));
        expect(await leaks(page, lang, { inspectorAge: true })).toEqual([]);
        await expect(page.getByText(text('edge.restricted', lang))).toHaveCount(0);
        if (mode === 'map') {
          // All of the node's text, hidden parts included: a superset of its accessible name, which is computed from content.
          const name = await page.locator('.kv2-bc-node[data-node="inventory"]').evaluate((e) => e.textContent ?? '');
          expect(name.length).toBeGreaterThan(0);
          expect(name).not.toContain(text('chip.stale', lang));
          expect(await page.locator('.kv2-bc-edge').count()).toBe(SCOPED_EDGES);
        }
        for (const tab of ['evidence', 'sources'] as const) {
          await page.locator(`#bcinsp-tab-${tab}`).click();
          await expect(page.locator(`#bcinsp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
          expect(await leaks(page, lang, { inspectorAge: true }), tab).toEqual([]);
        }
        // The Evidence tab shows the generic empty state, not a restricted-record placeholder.
        await page.locator('#bcinsp-tab-evidence').click();
        await expectNoPlaceholder(page, lang);
        await expect(page.locator('#bcinsp-panel .kv2-ev-list')).toHaveCount(0);
        await expect(page.locator('#bcinsp-panel .kv2-empty')).toHaveText(text('map.signals.none', lang));
        await setMapMode(page, 'list');
        await expect(page.locator('.kv2-bc-links tr[data-link]')).toHaveCount(SCOPED_EDGES);
        await expect(page.locator('.kv2-bc-links tr[data-link="d4"]')).toHaveCount(0);
        expect(await leaks(page, lang, { inspectorAge: true })).toEqual([]);
      });
    }

    test(`Observatory ${persona}/${lang}: Sentry shows no withheld title or placeholder on any tab, keeps its authorized stale reading, and GitHub keeps every record`, async ({ page }) => {
      await openScreen(page, '/sources/observatory/sentry', { lang, persona, width: 1440 });
      expect(await leaks(page, lang)).toEqual([]);
      const card = page.locator('.kv2-scard[data-provider="sentry"]');
      await expect(card).toHaveAttribute('data-conn', 'reachable');
      await expect(card).toHaveAttribute('data-fresh', 'stale');
      await expect(card).toHaveAttribute('data-health', 'unknown');
      for (const tab of ['evidence', 'provenance', 'details'] as const) {
        await page.locator(`#obsinsp-tab-${tab}`).click();
        await expect(page.locator(`#obsinsp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
        expect(await leaks(page, lang), tab).toEqual([]);
      }
      await page.locator('#obsinsp-tab-evidence').click();
      await expectNoPlaceholder(page, lang);
      await expect(page.locator('#obsinsp-panel .kv2-ev-list')).toHaveCount(0);
      await expect(page.locator('#obsinsp-panel .kv2-empty')).toHaveText(text('obs.ev.none', lang));
      // Authorized records stay: every GitHub record the persona may read, E-8 included.
      await page.locator('.kv2-scard[data-provider="github"]').click();
      await page.locator('#obsinsp-tab-evidence').click();
      const github = Object.values(scoped(persona).evidenceById).filter((e) => e.observation?.source.provider === 'github');
      expect(github.map((e) => e.id)).toContain('E-8');
      await expect(page.locator('#obsinsp-panel .kv2-ev-list li')).toHaveCount(github.length);
    });

    test(`Replay ${persona}/${lang}: no withheld row, title or placeholder; the readable evidence count, every story row and the gap stay`, async ({ page }) => {
      await openScreen(page, '/investigation/INV-DEMO-7/replay/R-5', { lang, persona, width: 1440 });
      expect(await leaks(page, lang)).toEqual([]);
      await expectNoPlaceholder(page, lang);
      const readable = READABLE(persona);
      expect(readable).toBeLessThan(INV_DEMO_7.evidence.length);
      await expect(page.locator('#rpinsp-panel .kv2-ev-list li')).toHaveCount(readable);
      await expect(page.locator('#evl-h .kv2-count')).toHaveText(String(readable));
      await expect(page.locator('[data-testid="story"] > li')).toHaveCount(WORLD.replay.length);
      await expect(page.locator('#kpi-gaps')).toBeVisible();
      for (const tab of ['context', 'history', 'evidence'] as const) {
        await page.locator(`#rpinsp-tab-${tab}`).click();
        await expect(page.locator(`#rpinsp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
        expect(await leaks(page, lang), tab).toEqual([]);
      }
    });

    test(`Flight Deck ${persona}/${lang}: MSN-DEMO-2 keeps E-9 and loses E-5, with no withheld title or placeholder`, async ({ page }) => {
      await openScreen(page, '/agents/deck/MSN-DEMO-2', { lang, persona, width: 1440 });
      await expect(page.locator('#mission')).toBeVisible();
      expect(await leaks(page, lang)).toEqual([]);
      await expectNoPlaceholder(page, lang);
      await expect(page.locator('#mission .kv2-md-side .kv2-ev-list li')).toHaveCount(1);
      // Nontechnical sees no evidence ids at all (persona id rules); Owner reads the authorized one.
      if (persona === 'owner') await expect(page.locator('#mission .kv2-md-side')).toContainText('E-9');
    });
  }
}

// Positive controls, so the matrix above is not vacuous: Technical reads what the others do not.
for (const lang of LANGS) {
  test(`Technical ${lang}: the original Inventory description on the map, E-5 on the Observatory, all seven Replay rows and both Deck rows`, async ({ page }) => {
    await openScreen(page, '/map/retail-tower/inventory', { lang, persona: 'technical', width: 1440 });
    await expect(page.locator('#bcinsp-panel .kv2-insp-desc')).toHaveText(text('map.nl.inventory', lang));
    await page.locator('#bcinsp-tab-evidence').click();
    await expect(page.locator('#bcinsp-panel')).toContainText('E-5');
    await openScreen(page, '/sources/observatory/sentry', { lang, persona: 'technical', width: 1440 });
    await page.locator('#obsinsp-tab-evidence').click();
    await expect(page.locator('#obsinsp-panel')).toContainText('E-5');
    await openScreen(page, '/investigation/INV-DEMO-7/replay', { lang, persona: 'technical', width: 1440 });
    await expect(page.locator('#rpinsp-panel .kv2-ev-list li')).toHaveCount(INV_DEMO_7.evidence.length);
    await expect(page.locator('#rpinsp-panel')).toContainText('E-5');
    await openScreen(page, '/agents/deck/MSN-DEMO-2', { lang, persona: 'technical', width: 1440 });
    await expect(page.locator('#mission .kv2-md-side .kv2-ev-list li')).toHaveCount(2);
    await expect(page.locator('#mission .kv2-md-side')).toContainText('E-5');
  });
}

// A same-page persona switch (display only, not authorization) changes the counts and the description at once, in both directions.
test('persona switch on one page: Replay evidence 7 to 6, Deck rows 2 to 1, and the map description swaps, Technical to Owner and back', async ({ page }) => {
  const L = COPY.en.persona;
  await openScreen(page, '/investigation/INV-DEMO-7/replay', { lang: 'en', persona: 'technical', width: 1440 });
  await expect(page.locator('#evl-h .kv2-count')).toHaveText(String(INV_DEMO_7.evidence.length));
  await page.getByRole('button', { name: L.owner, exact: true }).click();
  await expect(page.locator('#evl-h .kv2-count')).toHaveText(String(READABLE('owner')));
  expect(await leaks(page, 'en')).toEqual([]);
  await page.getByRole('button', { name: L.technical, exact: true }).click();
  await expect(page.locator('#evl-h .kv2-count')).toHaveText(String(INV_DEMO_7.evidence.length));

  await openScreen(page, '/agents/deck/MSN-DEMO-2', { lang: 'en', persona: 'technical', width: 1440 });
  await expect(page.locator('#mission .kv2-md-side .kv2-ev-list li')).toHaveCount(2);
  await page.getByRole('button', { name: L.owner, exact: true }).click();
  await expect(page.locator('#mission .kv2-md-side .kv2-ev-list li')).toHaveCount(1);
  expect(await leaks(page, 'en')).toEqual([]);

  await openScreen(page, '/map/retail-tower/inventory', { lang: 'en', persona: 'technical', width: 1440 });
  await expect(page.locator('#bcinsp-panel .kv2-insp-desc')).toHaveText(text('map.nl.inventory', 'en'));
  await page.getByRole('button', { name: L.owner, exact: true }).click();
  await expect(page.locator('#bcinsp-panel .kv2-insp-desc')).toHaveText(text('map.nl.inventory.none', 'en'));
  expect(await leaks(page, 'en', { inspectorAge: true })).toEqual([]);
  await page.getByRole('button', { name: L.technical, exact: true }).click();
  await expect(page.locator('#bcinsp-panel .kv2-insp-desc')).toHaveText(text('map.nl.inventory', 'en'));
});


// ---- BACK-66 / BACK-30 audit (2026-11-25): the vectors the matrix above did not yet reach. Persona is a display switch on synthetic
// data, not authorization (X02/X04 are not delivered); these check the demo's scoping only.

const searchHits = (page: Page): Promise<string> =>
  page.locator('.search-pop').evaluate((el) => [...el.querySelectorAll('li a')].map((a) => `${a.textContent ?? ''} ${a.getAttribute('href') ?? ''}`).join('\n'));
const mapRow = (page: Page, id: string) => page.locator(`tr:has(button[data-node="${id}"])`);

for (const persona of LAY) {
  for (const lang of LANGS) {
    // Phones open the map on its list, the inspector stacks under it and the navigation moves behind a menu: a different render path
    // from the 1440 px matrix above. Every screen, then the map list, the inspector tabs and the open menu, all through the one probe.
    test(`375 px ${persona}/${lang}: no trace of a withheld record on any screen, in the phone map list, its inspector or the open menu`, async ({ page }) => {
      for (const route of SCREENS) {
        await openScreen(page, route, { lang, persona, width: 375 });
        await expectNoLeaks(page, `375 ${persona}/${lang} ${route}`);
      }
      await openScreen(page, '/map/all/sentry', { lang, persona, width: 375 });
      await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'list');
      for (const tab of ['evidence', 'sources'] as const) {
        await page.locator(`#bcinsp-tab-${tab}`).click();
        await expect(page.locator(`#bcinsp-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
        await expectNoLeaks(page, `375 ${persona}/${lang} map ${tab}`);
      }
      await expect(mapRow(page, 'sentry').locator('.kv2-bc-num')).toHaveText('0');
      await page.locator('.menu-btn').click();
      await expect(page.locator('.menu-btn')).toHaveAttribute('aria-expanded', 'true');
      await expectNoLeaks(page, `375 ${persona}/${lang} open menu`);
    });

    // BACK-30 on the list view: the map-mode checks above read the Inventory chip and d4 on the canvas only.
    test(`BACK-30 list ${persona}/${lang}: Inventory's row is not Stale, Sentry's row counts no evidence, and d4 is drawn nowhere`, async ({ page }) => {
      await openScreen(page, '/map/all/inventory', { lang, persona, width: 1440 });
      await setMapMode(page, 'map');
      await waitForIntroDone(page);
      await expect(page.locator('.kv2-bc-edge')).not.toHaveCount(0);
      await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(0);
      await setMapMode(page, 'list');
      await expect(mapRow(page, 'inventory')).toHaveCount(1);
      await expect(mapRow(page, 'inventory')).not.toContainText(text('chip.stale', lang));
      await expect(mapRow(page, 'sentry').locator('.kv2-bc-num')).toHaveText('0');
      const inv = scoped(persona).nodes.find((n) => n.id === 'inventory')!;
      await expect(mapRow(page, 'inventory').locator('.kv2-bc-num')).toHaveText(String(inv.evidence.length));
      await expect(page.locator('.kv2-bc-links tr[data-link="d4"]')).toHaveCount(0);
      expect(await leaks(page, lang)).toEqual([]);
    });

    // Search suggestions for broad queries a curious viewer would type: id prefixes, the provider, the placeholder word, the record's
    // own wording. Every suggestion (label, kind and link) and the whole page after typing go through the probe.
    test(`search suggestions ${persona}/${lang}: broad queries offer nothing that names or links a withheld record`, async ({ page }) => {
      await openScreen(page, '/', { lang, persona, width: 1440 });
      const box = page.locator('#demo-search');
      const e5 = COPY[lang].evidenceItem['E-5']!.technical.replace(/[{}]/g, '');
      for (const q of ['E-', 'O-', 'E-1', 'E-2', 'sentry', 'restricted', e5.slice(0, 6)]) {
        await box.fill(q);
        await expect(page.locator('.search-pop')).toBeVisible();
        const found = leaksIn(await searchHits(page));
        expect(found, `query "${q}"\n${explain(found)}`).toEqual([]);
        await expectNoLeaks(page, `search "${q}"`, { ignore: [q] });
      }
    });
  }
}

// Positive control for the list checks above: Technical's Sentry row does count E-5, and Inventory's row is Stale.
test('BACK-30 list Technical: Sentry counts its record and Inventory is Stale (so the lay checks are not vacuous)', async ({ page }) => {
  await openScreen(page, '/map/all/inventory', { lang: 'en', persona: 'technical', width: 1440 });
  await setMapMode(page, 'list');
  await expect(mapRow(page, 'sentry').locator('.kv2-bc-num')).toHaveText('1');
  await expect(mapRow(page, 'inventory')).toContainText(text('chip.stale', 'en'));
});

for (const lang of LANGS) {
  // Cached state: the search index is memoized on the world and the popup stays open across a persona switch. Technical's hit on a
  // withheld record must vanish from the same open popup the moment it re-renders for a lay persona, and return for Technical.
  test(`search cached state ${lang}: Technical's E-12 suggestion leaves the open popup on a switch to a lay persona, and returns`, async ({ page }) => {
    const L = COPY[lang].persona;
    await openScreen(page, '/', { lang, persona: 'technical', width: 1440 });
    await page.locator('#demo-search').fill('E-1');
    const e12 = page.locator('.search-pop a[href*="/evidence/E-12"]');
    await expect(e12).toHaveCount(1);
    for (const p of ['owner', 'nontechnical'] as const) {
      await page.getByRole('button', { name: L[p], exact: true }).click();
      await expect(page.locator('#demo-search')).toHaveValue('E-1');
      await expect(page.locator('.search-pop')).toBeVisible();
      await expect(e12).toHaveCount(0);
      const found = leaksIn(await searchHits(page));
      expect(found, `${p}\n${explain(found)}`).toEqual([]);
      await expectNoLeaks(page, `${p} after the switch with the popup open`, { ignore: ['E-1'] });
    }
    await page.getByRole('button', { name: L.technical, exact: true }).click();
    await expect(e12).toHaveCount(1);
  });
}
