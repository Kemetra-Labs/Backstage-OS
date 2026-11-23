// BACK-83 (V1 side): the INV-DEMO-7 overlap on the Project map is what the canonical model says, per persona and language.
// Expectations come from src/domain (scopeFixture then toV1Nodes), never from a second copy in this file. Persona is a display
// switch on synthetic data, not authorization: no server-side enforcement is claimed.
import { expect, test, type Page } from '@playwright/test';
import { DOMAIN } from '../src/domain/fixture';
import { scopeFixture } from '../src/domain/scope';
import { toV1Nodes } from '../src/domain/toV1';
import { COPY } from '../src/i18n/strings';
import { triadOf } from '../src/view/world';
import { LANGS, openRoute, PERSONAS } from './helpers';

const LAY = ['owner', 'nontechnical'] as const;

/** Evidence the canonical model withholds from lay personas. */
const WITHHELD_IDS = Object.values(DOMAIN.evidence).filter((e) => e.visibility === 'technical').map((e) => e.id);
/** Observation ids behind those records: a second cue that the record exists. */
const WITHHELD_OBSERVATIONS = Object.values(DOMAIN.evidence)
  .filter((e) => e.visibility === 'technical' && e.observation).map((e) => e.observation!.id);
/** Components whose whole claim rests on withheld evidence: the withheld-only scenario, found from the canonical record. */
const WITHHELD_ONLY = DOMAIN.components.filter((c) => c.basis.length > 0 && c.basis.every((id) => WITHHELD_IDS.includes(id)));

/** Visible text, hidden text and every aria-label, title, alt and data-* value on the page. */
const surface = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [document.body.innerText, document.body.textContent ?? ''];
    for (const el of document.querySelectorAll('*')) {
      for (const a of Array.from(el.attributes)) {
        if (a.name === 'aria-label' || a.name === 'title' || a.name === 'alt' || a.name.startsWith('data-')) out.push(`${a.name}=${a.value}`);
      }
    }
    return out.join('\n');
  });

test('the canonical fixture has the withheld-only scenario this spec depends on', () => {
  expect(WITHHELD_IDS).toContain('E-5');
  expect(WITHHELD_ONLY.map((c) => c.id)).toEqual(['inventory']);
});

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`V1 project map ${persona}/${lang}: each overlap component shows the canonical health and failing check`, async ({ page }) => {
      await openRoute(page, '/project/RT', { lang, persona });
      const scoped = toV1Nodes(scopeFixture(DOMAIN, persona));
      expect(scoped.map((n) => n.id)).toEqual(['pos', 'stock-sync', 'inventory']);
      for (const n of scoped) {
        const health = triadOf(n.state).health;
        const label = page.locator(`[data-node="${n.id}"] .dg-health`);
        await expect(label, `${n.id} health`).toHaveAttribute('data-health', health);
        await expect(label, `${n.id} label`).toHaveText(COPY[lang].health[health]);
        await expect(page.locator(`[data-node="${n.id}"] .dg-check`), `${n.id} check`).toHaveCount(n.check === 'failing' ? 1 : 0);
      }
    });
  }
}

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`V1 withheld-only ${persona}/${lang}: the inventory claim is unknown and nothing hints at the withheld record`, async ({ page }) => {
      for (const c of WITHHELD_ONLY) {
        await openRoute(page, `/project/RT/${c.id}`, { lang, persona });
        const label = page.locator(`[data-node="${c.id}"] .dg-health`);
        await expect(label).toHaveAttribute('data-health', 'unknown');
        await expect(label).not.toHaveAttribute('data-health', 'healthy');
        const text = await surface(page);
        for (const token of [...WITHHELD_IDS, ...WITHHELD_OBSERVATIONS]) {
          expect(text.includes(token), `${persona}/${lang} ${c.id}: "${token}"`).toBe(false);
        }
        await expect(page.locator(WITHHELD_IDS.map((id) => `[data-evidence="${id}"], [data-evidence-row="${id}"]`).join(', '))).toHaveCount(0);
      }
    });
  }
}

test('V1 withheld-only, Technical positive control: the same component shows its canonical evidence', async ({ page }) => {
  for (const c of WITHHELD_ONLY) {
    await openRoute(page, `/project/RT/${c.id}`, { persona: 'technical' });
    for (const id of c.evidence) await expect(page.locator(`[data-evidence="${id}"]`), id).toHaveCount(1);
  }
});

// BACK-84: the scoped canonical fixture is decided per persona at runtime, so a switch on the same page must follow it in both
// directions and leave nothing behind (no cached Technical world shown to Owner, no Owner world shown to Technical).
test('V1 same-page persona switch on the withheld-only deep link: Technical, Owner, Technical, Owner', async ({ page }) => {
  const [c] = WITHHELD_ONLY;
  expect(c).toBeDefined();
  await openRoute(page, `/project/RT/${c!.id}`, { persona: 'technical' });
  for (const id of c!.evidence) await expect(page.locator(`[data-evidence="${id}"]`), `technical ${id}`).toHaveCount(1);
  for (const round of ['Owner', 'Technical', 'Owner'] as const) {
    await page.getByRole('button', { name: round, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`persona=${round.toLowerCase()}`));
    const label = page.locator(`[data-node="${c!.id}"] .dg-health`);
    if (round === 'Technical') {
      for (const id of c!.evidence) await expect(page.locator(`[data-evidence="${id}"]`), `technical ${id}`).toHaveCount(1);
    } else {
      await expect(label).toHaveAttribute('data-health', 'unknown');
      await expect(page.locator(WITHHELD_IDS.map((id) => `[data-evidence="${id}"], [data-evidence-row="${id}"]`).join(', '))).toHaveCount(0);
      const text = await surface(page);
      for (const token of [...WITHHELD_IDS, ...WITHHELD_OBSERVATIONS]) expect(text.includes(token), `${round}: "${token}"`).toBe(false);
    }
  }
});
