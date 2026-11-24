// BACK-92 R4: the lens behaviour the retired V2 lab suite checked and no host spec did yet, moved onto the host routes before
// app/e2e-v2 was deleted. Sources: e2e-v2/bc.spec.ts (B+C map: list content, map/list agreement, filters, scope, keyboard tabs, link
// traces, the intro's first frame, phone list layout, control vocabulary), e2e-v2/interactions.spec.ts (Observatory, Replay and
// Flight Deck interactions) and e2e-v2/structure.spec.ts (ordered headings, nothing stored). Same assertions, host selectors and
// routes. Synthetic demo data; persona is a display switch, not authorization. Nothing here is live.
import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { COPY } from '../src/i18n/strings';
import { LANGS, PERSONAS } from './helpers';
import { waitForAnimationsSettled, waitForIntroDone } from './lens-fidelity';
import { hash, openScreen, setMapMode } from './lens-helpers';

const IDS = ['retail-tower', 'khepri', 'stock-sync', 'pos', 'inventory', 'github', 'jira', 'sentry', 'port', 'seshat-bi'];
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const node = (page: Page, id: string) => page.locator(`.kv2-bc-node[data-node="${id}"]`);
const chipOf = (page: Page, id: string) => node(page, id).locator('.kv2-chip').innerText();
const inspectorTitle = (page: Page) => page.locator('.kv2-bc-insp h2');

/** Opens a lens route at a width, in the map's given mode when it is the map. */
async function open(page: Page, route: string, q: { lang?: string; persona?: string; width?: number; height?: number } = {}, mode?: 'map' | 'list') {
  const errors = await openScreen(page, route, { lang: q.lang ?? 'en', persona: q.persona ?? 'owner', width: q.width ?? 1440 });
  if (q.height) await page.setViewportSize({ width: q.width ?? 1440, height: q.height }); // openRoute sets 900
  if (mode) await setMapMode(page, mode);
  return errors;
}

// ---- Mission Map (B+C), from e2e-v2/bc.spec.ts ---------------------------------------------------------------------------------

test('Map: ten systems, each a native button whose computed name ends with its kind', async ({ page }) => {
  await open(page, '/map', {}, 'map');
  const nodes = page.locator('.kv2-bc-node');
  await expect(nodes).toHaveCount(10);
  const info = await nodes.evaluateAll((els) => els.map((e) => ({ tag: e.tagName, id: (e as HTMLElement).dataset.node ?? '', aria: e.getAttribute('aria-label') })));
  expect(info.map((i) => i.id).sort()).toEqual([...IDS].sort());
  for (const i of info) {
    expect(i.tag).toBe('BUTTON');
    expect(i.aria, `${i.id}: name comes from the content, not an aria-label`).toBeNull();
    const name = /button "(.*)"/.exec(await node(page, i.id).ariaSnapshot())?.[1] ?? '';
    expect(name, i.id).toMatch(/, (Product|Project|Service)$/);
  }
});

test('Map list: 10 systems, 6 sources, 10 links (Owner), 6 timeline events, and the three counters in the matrix headings', async ({ page }) => {
  await open(page, '/map', {}, 'list');
  await expect(page.locator('.kv2-bc-ledger tbody tr')).toHaveCount(10);
  await expect(page.locator('.kv2-bc-matrix tbody tr')).toHaveCount(6);
  await expect(page.locator('.kv2-bc-links tbody tr')).toHaveCount(10); // Owner: 11 links minus d4 (Technical-only basis, BACK-30)
  await expect(page.locator('.kv2-bc-tl li')).toHaveCount(6);
  const head = squash(await page.locator('.kv2-bc-matrix thead').innerText());
  for (const c of ['3 of 6 reachable', '2 of 6 within target', '1 of 6 confirmed healthy']) {
    expect(head).toContain(c);
    expect(squash(await page.getByTestId('bc-readings').innerText())).toContain(c);
  }
});

test('Map: the same systems carry the same status word on the map and in the list', async ({ page }) => {
  await open(page, '/map', {}, 'map');
  const onMap: Record<string, string> = {};
  for (const id of IDS) onMap[id] = squash(await chipOf(page, id));
  await setMapMode(page, 'list');
  const inList = await page.locator('.kv2-bc-ledger tbody tr').evaluateAll((rows) => Object.fromEntries(rows.map((r) => [(r.querySelector('button') as HTMLElement).dataset.node, (r.querySelector('.kv2-chip')!.textContent ?? '').trim()])));
  expect(inList).toEqual(onMap);
});

test('Map: one selection, so a node, a ledger row and the inspector always agree, and the route keeps it', async ({ page }) => {
  await open(page, '/map/retail-tower/stock-sync', {}, 'map');
  await node(page, 'pos').click();
  await expect(inspectorTitle(page)).toContainText('POS client');
  await expect(node(page, 'pos')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/pos');
  await setMapMode(page, 'list');
  await expect(page.locator('.kv2-bc-ledger tr[data-selected] button')).toHaveAttribute('data-node', 'pos');
  await page.locator('.kv2-bc-ledger button[data-node="jira"]').click();
  await expect(inspectorTitle(page)).toContainText('Jira');
  await expect(page.locator('.kv2-bc-ledger button[data-node="jira"]')).toHaveAttribute('aria-pressed', 'true');
  await setMapMode(page, 'map');
  await expect(node(page, 'jira')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.kv2-bc-node[aria-pressed="true"]')).toHaveCount(1);
});

test('Map: changing the scope selects the scoped product and marks it Focus', async ({ page }) => {
  await open(page, '/map', {}, 'map');
  await page.locator('.kv2-bc select').selectOption('khepri');
  await expect(inspectorTitle(page)).toContainText('Khepri');
  await expect(page.getByTestId('inspector').locator('.kv2-chip-focus')).toBeVisible();
  await expect(node(page, 'khepri')).toHaveAttribute('aria-pressed', 'true');
});

test('Map: filters dim in the map and hide in the list, and an empty result says so', async ({ page }) => {
  await open(page, '/map', {}, 'map');
  await page.getByRole('button', { name: 'Risks' }).click();
  await expect(page.locator('.kv2-bc-node[data-dim]')).toHaveCount(7);
  await expect(page.locator('.kv2-bc-edge[data-dim]')).toHaveCount(10); // no link joins two risk systems (Owner: d4 is not drawn)
  await setMapMode(page, 'list');
  await expect(page.locator('.kv2-bc-ledger tbody tr')).toHaveCount(3);
  await expect(page.locator('.kv2-bc-links')).toContainText('No links match this filter.');
  await expect(page.locator('.kv2-bc-matrix tbody tr')).toHaveCount(6); // sources are not systems: never filtered away
});

test('Map: inspector tabs move with the arrow keys and mirror in Arabic', async ({ page }) => {
  await open(page, '/map/retail-tower/stock-sync', {}, 'map');
  await page.locator('#bcinsp-tab-overview').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#bcinsp-tab-evidence')).toHaveAttribute('aria-selected', 'true');
  await open(page, '/map/retail-tower/stock-sync', { lang: 'ar' }, 'map');
  await page.locator('#bcinsp-tab-overview').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#bcinsp-tab-evidence')).toHaveAttribute('aria-selected', 'true');
});

test('Map list: stale, unavailable and unresolved are shown, not hidden', async ({ page }) => {
  await open(page, '/map', {}, 'list');
  const matrix = squash(await page.locator('.kv2-bc-matrix').innerText());
  expect(matrix).toContain('540 of 15 min');
  expect(matrix).toContain('36× target');
  expect(matrix).toContain('1500 of 1440 min');
  expect(matrix).toContain('Offline');
  expect(matrix.match(/never read/g)).toHaveLength(2); // Datadog and Confluence
  expect(matrix.match(/Not set up/g)).toHaveLength(2);
  // BACK-30: the only stale link (d4) rests on Technical-only evidence, so Owner has none; Technical still sees it flagged
  await expect(page.locator('.kv2-bc-links [data-stale-chip]')).toHaveCount(0);
  await expect(page.locator('.kv2-bc-links tbody tr[data-truth="unknown"]')).toHaveCount(4);
  await expect(page.locator('.kv2-bc-links tbody tr[data-truth="group"]')).toHaveCount(3);
  // the age bars carry their numbers as text
  expect(await page.locator('.kv2-bc-matrix tr[data-source="sentry"] .kv2-bc-age').getAttribute('aria-label')).toBe('540 of 15 min, 36× target');
  await open(page, '/map', { persona: 'technical' }, 'list');
  await expect(page.locator('.kv2-bc-links [data-stale-chip]')).toHaveCount(1);
  await expect(page.locator('.kv2-bc-links tr[data-link="d4"] [data-stale-chip]')).toHaveCount(1);
});

test('Map: Unknown is never Healthy, node by node, and the permitted persona still sees the stale Technical-only read', async ({ page }) => {
  await open(page, '/map', {}, 'map');
  for (const id of ['khepri', 'jira', 'seshat-bi', 'pos', 'retail-tower']) expect(await chipOf(page, id), id).toMatch(/Health unknown/);
  expect(await chipOf(page, 'sentry')).toMatch(/Stale/);
  expect(await chipOf(page, 'inventory')).toMatch(/Health unknown/); // BACK-30: its only basis is Technical-only evidence
  expect(await chipOf(page, 'port')).toMatch(/Unavailable/);
  expect(await chipOf(page, 'stock-sync')).toMatch(/CI check failing/);
  await setMapMode(page, 'list');
  const rows = await page.locator('.kv2-bc-matrix tbody tr').evaluateAll((trs) => trs.map((r) => ({ id: (r as HTMLElement).dataset.source, health: (r.querySelectorAll('td')[2]!.textContent ?? '').trim() })));
  expect(rows.filter((r) => /^healthy$/i.test(r.health)).map((r) => r.id)).toEqual(['github']);
  expect(rows.find((r) => r.id === 'jira')!.health).toBe('Unknown');
  await open(page, '/map', { persona: 'technical' }, 'map');
  expect(await chipOf(page, 'inventory')).toMatch(/Stale/);
});

test('Map Sources tab: a provider named only by Technical-only evidence is listed for Technical, not for Owner; a source shows its age and opens the Observatory', async ({ page }) => {
  await open(page, '/map/retail-tower/inventory', {}, 'map');
  await page.locator('#bcinsp-tab-sources').click();
  await expect(page.locator('.kv2-bc-srcrows li')).toHaveCount(0);
  await expect(page.getByTestId('inspector')).toContainText('No evidence has been read for this item.');
  await open(page, '/map/retail-tower/inventory', { persona: 'technical' }, 'map');
  await page.locator('#bcinsp-tab-sources').click();
  await expect(page.locator('.kv2-bc-srcrows li')).toHaveCount(1);
  await expect(page.locator('.kv2-bc-srcrows li')).toContainText('Sentry');
  await open(page, '/map/all/sentry', { persona: 'technical' }, 'map');
  await page.locator('#bcinsp-tab-sources').click();
  await expect(page.locator('.kv2-bc-srcrows .kv2-bc-age')).toHaveAttribute('aria-label', '540 of 15 min, 36× target');
  await page.locator('.kv2-bc-srcrows').getByRole('button', { name: 'Sentry' }).click();
  expect(await hash(page)).toBe('#/sources/observatory/sentry');
  await expect(page.locator('[data-testid="source-observatory-lens"]')).toBeVisible();
});

test('Map: selecting a system sweeps one trace per own link, once; nothing loops', async ({ page }) => {
  await open(page, '/map', {}, 'map');
  await waitForIntroDone(page);
  await node(page, 'stock-sync').click();
  await node(page, 'pos').click();
  await node(page, 'stock-sync').click();
  await expect(page.locator('.kv2-bc-trace')).toHaveCount(5); // g1, d1, d2, d3, d5
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => ({ it: a.effect!.getTiming().iterations, d: a.effect!.getTiming().duration })));
  expect(running.length).toBeGreaterThan(0);
  for (const a of running) { expect(a.it).toBe(1); expect(Number(a.d)).toBeLessThanOrEqual(1000); }
  await waitForAnimationsSettled(page); // a looping trace never settles, so it fails here
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});

test('Map reduced motion: the selection is still shown without motion, own links lit and the rest dimmed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 1440 x 1000, as the lab ran it. At 1440 x 900 (and 1280 x 900) the map's filter and hint block lies over the GitHub orb, so a
  // pointer click lands on the hint text (BACK-92 R4 finding, recorded in the retiring PR; the keyboard path is unaffected).
  await open(page, '/map', { height: 1000 }, 'map');
  await node(page, 'github').click();
  await expect(page.locator('.kv2-bc-node[data-node="github"][data-selected]')).toHaveCount(1);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator('.kv2-bc-draw')).toHaveCount(0);
  await setMapMode(page, 'list');
  await setMapMode(page, 'map');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator('.kv2-bc-edge[data-hl]')).toHaveCount(1); // GitHub has one link of its own (d1)
  await expect(page.locator('.kv2-bc-edge[data-dim]')).toHaveCount(9); // Owner: d4 is not drawn, so 11 - 1 own - 1
});

// BACK-67: the first-load settle animation starts every node displaced outward; freeze each node animation at its first frame and at
// its end and require both to sit inside the canvas.
for (const width of [962, 1000, 1100, 1180, 1440]) {
  test(`Map @${width}px: nodes and cards stay inside the canvas, also on the first frame of the intro`, async ({ page }) => {
    await open(page, '/map', { width }, 'map');
    for (const at of ['start', 'end'] as const) {
      const outside = await page.evaluate((frame) => {
        for (const a of document.getAnimations()) {
          a.pause();
          if (a.effect?.getTiming().iterations === 1) a.currentTime = frame === 'start' ? 0 : (a.effect.getComputedTiming().endTime as number);
        }
        const c = document.querySelector('.kv2-bc-canvas')!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('.kv2-bc-node, .kv2-bc-node .kv2-bc-card')].flatMap((e) => {
          const r = e.getBoundingClientRect();
          return r.left < c.left - 0.5 || r.right > c.right + 0.5 ? [`${e.className.slice(0, 24)} ${Math.round(r.left)}..${Math.round(r.right)} of ${Math.round(c.left)}..${Math.round(c.right)}`] : [];
        });
      }, at);
      expect(outside, at).toEqual([]);
    }
  });
}

test('Map list @320px: the matrix is one card per source and the counters sit above the list', async ({ page }) => {
  await open(page, '/map', { width: 320 }, 'list');
  await expect(page.locator('.kv2-bc-matrix thead')).toBeHidden();
  await expect(page.locator('.kv2-bc-matrix tbody tr')).toHaveCount(6);
  const readings = await page.getByTestId('bc-readings').boundingBox();
  const ledger = await page.locator('#bc-ledger').boundingBox();
  expect(readings!.y).toBeLessThan(ledger!.y);
  expect(squash(await page.getByTestId('bc-readings').innerText())).toContain('3 of 6 reachable');
});

// From bc.spec.ts "controls": every control label on both map modes, every language and persona, is read against the shared vocabulary.
for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`Map controls ${lang}/${persona}: no forbidden action verb, no form, no submit, in the map and the list`, async ({ page }) => {
      await open(page, '/map', { lang, persona });
      for (const mode of ['map', 'list'] as const) {
        await setMapMode(page, mode);
        const labels = await page.locator('[data-testid="mission-map-lens"]').locator('button, a[href]').evaluateAll((els) =>
          els.flatMap((e) => [(e.textContent ?? '').trim(), e.getAttribute('aria-label') ?? '', e.getAttribute('title') ?? ''].filter(Boolean)));
        expect(labels.length, mode).toBeGreaterThan(10);
        for (const l of labels) expect(isForbiddenControlLabel(l), `${mode}: ${l}`).toBe(false);
        await expect(page.locator('form, input[type="submit"], button[type="submit"]')).toHaveCount(0);
      }
    });
  }
}

// ---- Every lens view, from e2e-v2/structure.spec.ts and bc.spec.ts "layout" ---------------------------------------------------------

const LENS_VIEWS = [['/map', 'map'], ['/map', 'list'], ['/sources/observatory'], ['/investigation/INV-DEMO-7/replay'], ['/agents/deck']] as const;
for (const lang of LANGS) {
  for (const width of [375, 1440]) {
    test(`lens views ${lang} @${width}px: headings never skip a level, and nothing is written to storage`, async ({ page }) => {
      for (const [route, mode] of LENS_VIEWS) {
        await open(page, route, { lang, width }, mode);
        const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => (h as HTMLElement).offsetParent !== null || getComputedStyle(h).position === 'fixed').map((h) => Number(h.tagName[1])));
        expect(levels[0], `${route} ${mode ?? ''}: starts at the h1`).toBe(1);
        levels.reduce((prev, cur) => { expect(cur, `${route} ${mode ?? ''}: ${levels.join(',')}`).toBeLessThanOrEqual(prev + 1); return cur; }, 1);
        expect(await page.evaluate(() => localStorage.length + sessionStorage.length), route).toBe(0);
      }
    });
  }
}

// ---- Source Observatory, from e2e-v2/interactions.spec.ts ------------------------------------------------------------------------

const obs = (page: Page) => page.locator('[data-testid="source-observatory-lens"]');

test('Observatory: selecting a card updates the inspector; the table shows the same six sources, and Integrations narrows it', async ({ page }) => {
  await open(page, '/sources/observatory');
  await page.locator('.kv2-scard[data-provider="jira"]').click();
  await expect(obs(page).locator('.kv2-insp-head h2')).toContainText('Jira');
  expect(await hash(page)).toBe('#/sources/observatory/jira');
  await obs(page).getByRole('button', { name: 'Table' }).click();
  await expect(obs(page).getByRole('table')).toBeVisible();
  await expect(obs(page).getByRole('table').locator('tbody tr')).toHaveCount(6);
  await obs(page).getByRole('button', { name: 'Integrations' }).first().click();
  await expect(obs(page).getByRole('table').locator('tbody tr')).toHaveCount(4);
});

test('Observatory: the inspector shows last read and provenance and keeps the three readings separate', async ({ page }) => {
  await open(page, '/sources/observatory/port');
  const panel = page.locator('#obsinsp-panel');
  await expect(panel).toContainText('Offline');
  await expect(panel).toContainText('stale');
  await expect(panel).toContainText('Health unknown');
  await expect(panel).toContainText('25 h ago');
  await obs(page).getByRole('tab', { name: 'Provenance' }).click();
  await expect(panel).toContainText('Port API');
  await page.locator('.kv2-scard[data-provider="datadog"]').click();
  await obs(page).getByRole('tab', { name: 'Details' }).click();
  await expect(panel).toContainText('Never read');
});

test('Observatory: timeline filters narrow the events, and selecting an event selects its source', async ({ page }) => {
  await open(page, '/sources/observatory');
  await expect(page.locator('.kv2-tl li')).toHaveCount(6);
  await obs(page).getByRole('button', { name: /^Incidents/ }).click();
  await expect(page.locator('.kv2-tl li')).toHaveCount(1);
  await obs(page).getByRole('button', { name: /^Target health/ }).click();
  await expect(obs(page).getByText('No events of this kind in the window.')).toBeVisible();
  await obs(page).getByRole('button', { name: /^All events/ }).click();
  await page.locator('.kv2-tl-card', { hasText: 'Port' }).click();
  await expect(obs(page).locator('.kv2-insp-head h2')).toContainText('Port');
  expect(await hash(page)).toBe('#/sources/observatory/port');
});

// ---- Mission Replay, from e2e-v2/interactions.spec.ts ----------------------------------------------------------------------------

const ROOM = '/investigation/INV-DEMO-7/replay';
const rp = (page: Page) => page.locator('[data-testid="replay-lens"]');

test('Replay: the scrubber, the stage buttons, previous and next move the cursor and the facts', async ({ page }) => {
  await open(page, `${ROOM}/R-1`);
  const pos = rp(page).locator('.kv2-pos');
  await expect(pos).toContainText('Event 1 of 7');
  await expect(rp(page).locator('.kv2-gap-mark')).toHaveCount(0);
  await expect(page.getByTestId('proposal')).toContainText('Not drafted yet');
  await rp(page).getByRole('button', { name: 'Next event' }).click();
  await expect(pos).toContainText('Event 2 of 7');
  await rp(page).locator('.kv2-stages li[data-stage="correlated"] .kv2-stage').click();
  await expect(pos).toContainText('Event 4 of 7');
  await rp(page).getByRole('button', { name: 'Next event' }).click();
  await expect(rp(page).locator('.kv2-gap-mark')).toBeVisible();
  await rp(page).locator('.kv2-range').focus();
  await page.keyboard.press('End');
  await expect(pos).toContainText('Event 7 of 7');
  await expect(page.getByTestId('proposal')).toContainText('Hold');
  await page.keyboard.press('Home');
  await expect(pos).toContainText('Event 1 of 7');
  await expect(rp(page).getByRole('button', { name: 'Previous event' })).toBeDisabled();
});

test('Replay: the story, hypotheses, evidence gaps and milestones follow the cursor', async ({ page }) => {
  await open(page, `${ROOM}/R-1`, { persona: 'technical' });
  await expect(rp(page).locator('.kv2-milestones li[data-state="done"]')).toHaveCount(1);
  await rp(page).getByRole('tab', { name: /Hypotheses/ }).click();
  await expect(rp(page).getByText('No hypothesis yet.')).toBeVisible();
  await rp(page).locator('.kv2-events li').nth(5).locator('button').click();
  await expect(rp(page).locator('.kv2-pos')).toContainText('Event 6 of 7');
  await expect(rp(page).locator('.kv2-hyps li')).toHaveCount(2);
  await expect(rp(page).locator('.kv2-forag')).toBeVisible();
  await rp(page).getByRole('tab', { name: /Evidence gaps/ }).click();
  await expect(page.locator('#rphold-panel')).toContainText('Runtime telemetry');
  await expect(page.locator('#rphold-panel')).toContainText('Catalog owner');
  await expect(rp(page).locator('.kv2-milestones li[data-state="progress"]')).toHaveCount(1);
  await expect(rp(page).locator('.kv2-milestones li[data-state="todo"]')).toHaveCount(2);
});

test('Replay: the inspector tabs show evidence, context and history', async ({ page }) => {
  await open(page, `${ROOM}/R-4`, { persona: 'technical' });
  await rp(page).getByRole('tab', { name: 'Context' }).click();
  await expect(page.locator('#rpinsp-panel')).toContainText('Retail Tower OS');
  await expect(page.locator('#rpinsp-panel')).toContainText('Unknown');
  await rp(page).getByRole('tab', { name: 'History' }).click();
  await expect(rp(page).locator('.kv2-hist li')).toHaveCount(4);
});

// ---- Agent Flight Deck, from e2e-v2/interactions.spec.ts -------------------------------------------------------------------------

const deck = (page: Page) => page.locator('[data-testid="agent-deck-lens"]');

test('Flight Deck: filters narrow the activity table and the count line follows', async ({ page }) => {
  await open(page, '/agents/deck');
  const rows = deck(page).locator('.kv2-missions tbody tr');
  const status = deck(page).locator('label.kv2-select', { hasText: 'Status' }).locator('select');
  await expect(rows).toHaveCount(5);
  await status.selectOption('waiting_review');
  await expect(rows).toHaveCount(1);
  await expect(deck(page).locator('.kv2-foot')).toContainText('Showing 1 of 5');
  await status.selectOption('idle');
  await expect(deck(page).getByText('No mission matches these filters.')).toBeVisible();
  await status.selectOption('all');
  await deck(page).getByRole('button', { name: /^Sensing/ }).click();
  await expect(rows).toHaveCount(2);
  await deck(page).locator('label.kv2-select', { hasText: 'Agent' }).locator('select').selectOption('AG-1');
  await expect(rows).toHaveCount(1);
});

test('Flight Deck: selecting a mission shows its detail, its evidence and whether it proposes anything', async ({ page }) => {
  await open(page, '/agents/deck', { persona: 'technical' });
  await expect(page.locator('#mission')).toContainText('Draft a proposed next step');
  await expect(page.getByTestId('deck-proposal')).toContainText('Hold');
  await deck(page).locator('.kv2-missions').getByRole('button', { name: /Test the likely cause/ }).click();
  await expect(page.locator('#mission')).toContainText('MSN-DEMO-4');
  await expect(page.getByTestId('deck-proposal')).toContainText('This mission proposes no action.');
  expect(await hash(page)).toBe('#/agents/deck/MSN-DEMO-4');
});

test('Flight Deck: counts come from the missions, and the jump buttons move to their section', async ({ page }) => {
  await open(page, '/agents/deck');
  await expect(page.getByTestId('active-missions')).toHaveText('5');
  await expect(page.locator('#kpi-review')).toContainText('1');
  await deck(page).getByRole('button', { name: 'Capabilities' }).click();
  await expect(page.locator('#caps-h')).toBeFocused();
});

test('Flight Deck: capabilities state their limits in words, never as scores', async ({ page }) => {
  await open(page, '/agents/deck');
  const caps = page.locator('#caps');
  await expect(caps).toContainText('3 of 6 sources readable');
  await expect(caps).toContainText('No write path to any source exists');
  await expect(caps).toContainText('no calibrated score');
  await expect(page.getByTestId('deck-proposal')).toContainText('Proposed, nothing executes');
});

// From structure.spec.ts "personas": the persona id rules on the three record-heavy lenses, in both languages.
for (const lang of LANGS) {
  test(`persona ids ${lang}: Nontechnical never sees run, PR, work-item or mission ids; Owner never sees run or PR ids; Technical sees them`, async ({ page }) => {
    const L = COPY[lang].persona;
    for (const route of [`${ROOM}/R-1`, '/agents/deck', '/sources/observatory']) {
      await open(page, route, { lang, persona: 'nontechnical' });
      expect(await page.locator('main').innerText(), `nontechnical ${route}`).not.toMatch(/DEMO-4471|DEMO-88|RT-DEMO-112|MSN-DEMO|integration-tests/);
      await page.getByRole('button', { name: L.owner, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      expect(await page.locator('main').innerText(), `owner ${route}`).not.toMatch(/DEMO-4471|DEMO-88|integration-tests/);
    }
    await open(page, `${ROOM}/R-1`, { lang, persona: 'technical' });
    await expect(page.locator('main')).toContainText('integration-tests');
    await open(page, '/agents/deck', { lang, persona: 'technical' });
    await expect(page.locator('main')).toContainText('MSN-DEMO-5');
  });
}
