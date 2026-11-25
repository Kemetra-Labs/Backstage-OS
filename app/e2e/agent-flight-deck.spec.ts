// BACK-90: the V2 Agent Flight Deck as a read-only view of the existing Agents screen. One shell, one persona and language, one router
// (the hash); the selected mission is in the host route. The agents are simulated fixture rows: nothing runs, approves, stops or retries.
// A mission's event count is shown as not defined for every persona (the fixture does not say what it counts, and scoping it by
// subtraction would be an assumption and a cue). Restricted evidence stays undisclosed. Persona is a display switch on synthetic data,
// not authorization. Nothing is live.
import { expect, test, type Page } from '@playwright/test';
import { isForbiddenControlLabel } from '../src/contract/rules';
import { translate } from '../src/i18n/index';
import { WORLD } from '../src/fixture/world';
import { COPY } from '../src/i18n/strings';
import { LANGS, openRoute, PERSONAS, WIDTHS } from './helpers';
import { blurRadii, expectRenderedAA, waitForAnimationsSettled } from './lens-fidelity';
import { expectNoLeaks, RESTRICTED_IDS } from './leaks';
import { hash, openScreen } from './lens-helpers';

const MISSIONS = WORLD.missions;

const LAY = ['owner', 'nontechnical'] as const;
const lens = (page: Page) => page.locator('[data-testid="agent-deck-lens"]');
const missionButtons = (page: Page) => lens(page).locator('table.kv2-missions button[aria-pressed]');
const eventsCell = (page: Page, lang: 'en' | 'ar') => lens(page).locator('#mission .kv2-md-grid > div', { hasText: translate('deck.md.events', lang, 'technical') }).locator('dd');


test('the fixture has the restricted record and the missions this spec depends on', () => {
  expect(RESTRICTED_IDS).toContain('E-5');
  expect(MISSIONS.some((m) => m.evidence.includes('E-5'))).toBe(true);
  expect(MISSIONS.length).toBe(5);
});

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`Flight Deck view ${lang} @${width}px: one shell, one h1, no overflow, no console errors`, async ({ page }) => {
      const errors = await openRoute(page, '/agents/deck', { lang, persona: 'owner', width });
      await expect(lens(page)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      expect(await page.locator('main').count()).toBe(1);
      expect(await page.locator('.kv2-app, .kv2-top, .kv2-side, .kv2-skip').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('Agents: the roster stays the default view and the Flight Deck is another view of the same screen', async ({ page }) => {
  await openRoute(page, '/agents', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(lens(page)).toHaveCount(0);
  await expect(page.locator('.view-switch a[data-view="roster"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#sidenav a[data-nav="agents"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('.view-switch a[data-view="deck"]').click();
  await expect(lens(page)).toBeVisible();
  expect(await hash(page)).toBe('#/agents/deck');
  await expect(page.locator('.view-switch a[data-view="deck"]')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(lens(page)).toHaveCount(0);
});

test('Flight Deck: selecting a mission is a navigation; Back, Forward and a deep link restore it', async ({ page }) => {
  await openRoute(page, '/agents/deck', { lang: 'en', persona: 'technical', width: 1440 });
  const agentOf = async () => (await lens(page).locator('#mission .kv2-md-grid > div').first().locator('dd').innerText()).trim();
  const first = await agentOf();
  await missionButtons(page).nth(0).click();
  await expect.poll(() => hash(page)).toMatch(/^#\/agents\/deck\/MSN-DEMO-\d$/);
  const second = await hash(page);
  await missionButtons(page).nth(1).click();
  await expect.poll(() => hash(page)).not.toBe(second);
  await page.goBack();
  expect(await hash(page)).toBe(second);
  await page.goBack();
  expect(await hash(page)).toBe('#/agents/deck');
  await page.goForward();
  expect(await hash(page)).toBe(second);
  expect(first.length).toBeGreaterThan(0);
  await openRoute(page, '/agents/deck/MSN-DEMO-1', { lang: 'en', persona: 'owner', width: 1440 });
  // BACK-102: the agent is the roster's triage-scout (a proper name), with the role its missions give it.
  const agentCell = `triage-scout ${translate('deck.q.sensing', 'en', 'owner')}`;
  await expect(lens(page).locator('#mission .kv2-md-grid > div').first().locator('dd')).toHaveText(agentCell);
  await page.reload();
  await expect(lens(page).locator('#mission .kv2-md-grid > div').first().locator('dd')).toHaveText(agentCell);
  await page.getByRole('button', { name: COPY.en.persona.technical, exact: true }).click();
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await hash(page)).toBe('#/agents/deck/MSN-DEMO-1');
});

test('Flight Deck: an unknown view is not found', async ({ page }) => {
  await openRoute(page, '/agents/nope', { lang: 'en', persona: 'owner' });
  await expect(page.locator('h1')).toHaveText(/Page not found/);
});

for (const lang of LANGS) {
  test(`Flight Deck ${lang}: a mission's event count is not defined, for every persona and every mission, never a number`, async ({ page }) => {
    const unknown = translate('deck.md.events.unknown', lang, 'technical');
    for (const persona of PERSONAS) {
      for (const m of MISSIONS) {
        await openRoute(page, `/agents/deck/${m.id}`, { lang, persona, width: 1440 });
        const cell = eventsCell(page, lang);
        await expect(cell, `${persona} ${m.id}`).toHaveText(unknown);
        expect((await cell.innerText()).trim()).not.toMatch(/^\d+$/);
      }
    }
  });
}

test('Flight Deck: agents are simulated and nothing here acts on anything', async ({ page }) => {
  for (const persona of PERSONAS) {
    await openRoute(page, '/agents/deck', { lang: 'en', persona, width: 1440 });
    await expect(lens(page).locator('.kv2-sim')).toBeVisible();
    const labels = await lens(page).locator('button, a').evaluateAll((els) => els.map((e) => ((e.getAttribute('aria-label') ?? e.textContent) ?? '').trim()).filter(Boolean));
    for (const l of labels) expect(isForbiddenControlLabel(l), l).toBe(false);
    await expect(page.getByRole('button', { name: /\b(run|approve|stop|cancel|retry|execute|deploy|merge|release|start|restart)\b/i })).toHaveCount(0);
    expect(await lens(page).locator('input:not([type="checkbox"]), textarea').count()).toBe(0);
    // The page says "Nothing on this page is live": the negation is the right wording, any other use of the word is a claim.
    expect(await page.evaluate(() => /\blive\b/i.test(document.querySelector('main')!.innerText.replace(/not live|nothing on this page is live/gi, '')))).toBe(false);
  }
});

test('Journey: Agents Flight Deck to the audit trail (Replay) and back keeps the mission', async ({ page }) => {
  await openRoute(page, '/agents/deck/MSN-DEMO-3', { lang: 'en', persona: 'technical', width: 1440 });
  await page.getByRole('button', { name: 'Open the audit trail' }).click();
  await expect(page.locator('[data-testid="replay-lens"]')).toBeVisible();
  await page.goBack();
  expect(await hash(page)).toBe('#/agents/deck/MSN-DEMO-3');
  await expect(lens(page)).toBeVisible();
});

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`Flight Deck non-disclosure ${persona}/${lang}: no restricted id, observation or record on any mission, tab or filter`, async ({ page }) => {
      for (const m of MISSIONS) {
        await openRoute(page, `/agents/deck/${m.id}`, { lang, persona, width: 1440 });
        const scan = (label: string) => expectNoLeaks(page, `${persona}/${lang} ${m.id} ${label}`);
        await scan('load');
        const groups = lens(page).locator('.kv2-seg, [role="tablist"]');
        for (let g = 0; g < (await groups.count()); g += 1) {
          const buttons = groups.nth(g).locator('button');
          for (let i = 0; i < (await buttons.count()); i += 1) {
            await buttons.nth(i).click();
            await scan(`group ${g} button ${i}`);
          }
        }
      }
    });
  }
}

for (const lang of LANGS) {
  test(`Flight Deck non-disclosure switch ${lang}: technical, owner, technical, owner on one mission leaves nothing behind`, async ({ page }) => {
    await openRoute(page, '/agents/deck/MSN-DEMO-2', { lang, persona: 'technical', width: 1440 });
    const L = COPY[lang].persona;
    for (const p of ['technical', 'owner', 'technical', 'owner', 'nontechnical'] as const) {
      await page.getByRole('button', { name: L[p], exact: true }).click();
      await expect(lens(page)).toBeVisible();
      if (p !== 'technical') await expectNoLeaks(page, p);
      expect(await missionButtons(page).count(), `${p}: all missions stay listed`).toBe(MISSIONS.length);
    }
  });
}

test('Flight Deck: reduced motion plays no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/agents/deck', { lang: 'en', persona: 'owner', width: 1440 });
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});

// ---- BACK-92 R3 (M2): lab parity, ported from e2e-v2/fidelity.spec.ts. Truth in visuals: a satellite whose agent state is unknown or
// unavailable carries no glow; an observing one keeps it.
test('Flight Deck luminosity: agent satellites with an unknown state carry no glow; observing ones keep it', async ({ page }) => {
  await openScreen(page, '/agents/deck', { lang: 'en', persona: 'owner', width: 1440 });
  // The demo fleet has no drafting or idle agent today, so the last satellite is switched to the unknown tone in place to exercise
  // the stylesheet rule a real drafting or idle state would hit (STATUS_TONE in AgentFlightDeck.tsx), as the lab test did.
  await lens(page).locator('.kv2-sat').last().evaluate((e) => e.setAttribute('data-tone', 'unk'));
  const sats = await lens(page).locator('.kv2-sat').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-sat'), tone: e.getAttribute('data-tone'), shadow: getComputedStyle(e.querySelector('.kv2-sat-orb')!).boxShadow })));
  const unk = sats.filter((s) => s.tone === 'unk' || s.tone === 'bad');
  expect(unk.length).toBeGreaterThan(0);
  for (const s of unk) expect(blurRadii(s.shadow).every((b) => b === 0), `${s.id}: ${s.shadow}`).toBe(true);
  const ok = sats.filter((x) => x.tone === 'ok');
  expect(ok.length).toBeGreaterThan(0);
  for (const s of ok) expect(Math.max(...blurRadii(s.shadow)), `${s.id}`).toBeGreaterThan(0);
});

// BACK-92 R4 (from the retired e2e-v2/fidelity.spec.ts "contrast", which measured all four lab screens; R3 moved the map and the
// Observatory): text over the cosmos and glow of the Flight Deck signature panel keeps AA, read from rendered pixels.
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`Flight Deck contrast ${lang} @${width}px: text over the cosmos and glow keeps AA on rendered pixels`, async ({ page }) => {
      await openScreen(page, '/agents/deck', { lang, persona: 'owner', width });
      await expect(lens(page).locator('.kv2-fleet')).toBeVisible();
      await waitForAnimationsSettled(page);
      await expectRenderedAA(page, '.kv2-fleet', `flight deck ${lang} ${width}`);
    });
  }
}
