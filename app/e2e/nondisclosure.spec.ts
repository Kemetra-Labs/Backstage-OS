// BACK-73: V1 non-disclosure. For Owner and Nontechnical, Technical-only evidence (E-5, E-12, E-23) and the placeholder that
// used to stand in for it must not be detectable anywhere: page text, hidden text, aria-label, title, alt, data-* values.
// Persona is a display switch on synthetic demo data, not authorization (no server-side enforcement is claimed).
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/i18n/strings';
import { LANGS, openRoute } from './helpers';

const LAY = ['owner', 'nontechnical'] as const;
const ROUTES = [
  '/', '/portfolio', '/project/RT', '/project/RT/inventory', '/project/RT/payments',
  '/investigation/INV-DEMO-7', '/investigation/INV-DEMO-9', '/decisions', '/evidence/E-1',
  '/decisions/DEC-DEMO-5', '/project/KH', '/project/KH/khepri-api', '/sources', '/agents',
] as const;
/** Technical positive controls: where a withheld id is shown to Technical, so the lay-persona absence checks are not vacuous. */
const TECH_SEES: ReadonlyArray<readonly [string, string]> = [
  ['/project/RT/inventory', 'E-5'], ['/investigation/INV-DEMO-7', 'E-5'], ['/evidence/E-1', 'E-5'],
  ['/project/RT/payments', 'E-12'], ['/portfolio', 'E-12'], ['/investigation/INV-DEMO-9', 'E-23'],
];
const IDS = ['E-5', 'E-12', 'E-23'] as const;

const forbidden = (lang: 'en' | 'ar') => [...IDS, 'Restricted to Technical', COPY.ar.restricted, COPY.en.restricted, COPY[lang].restricted];

/** Visible text, hidden text and every aria-label, title, alt and data-* attribute value on the page. */
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

for (const lang of LANGS) {
  for (const persona of LAY) {
    for (const route of ROUTES) {
      test(`nondisclosure ${lang}/${persona} ${route}: no withheld id, placeholder or restricted copy anywhere in the DOM`, async ({ page }) => {
        await openRoute(page, route, { lang, persona });
        const text = await surface(page);
        for (const token of forbidden(lang)) expect(text.includes(token), `${persona}/${lang} ${route}: "${token}"`).toBe(false);
        await expect(page.locator('[data-state="error"]'), `${route} is not an error page`).toHaveCount(0);
      });
    }
  }
}

for (const [route, token] of TECH_SEES) {
  test(`nondisclosure positive control: Technical sees ${token} on ${route}`, async ({ page }) => {
    await openRoute(page, route, { persona: 'technical' });
    expect(await surface(page)).toContain(token);
  });
}

// The INV-DEMO-9 hypothesis used to state E-23's deploy/timing correlation to every persona.
for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`nondisclosure ${lang}/${persona} INV-DEMO-9: hypothesis does not state the withheld deploy/timing correlation`, async ({ page }) => {
      await openRoute(page, '/investigation/INV-DEMO-9', { lang, persona });
      // Scoped to the hypothesis and impact panels: DEC-DEMO-5's own neutral wording legitimately says "staging deploys".
      const text = [await page.getByTestId('summary-hypothesis').innerText(), await page.getByTestId('summary-impact').innerText()].join('\n');
      expect(text).not.toMatch(/deploy|recent change|timing|عملية نشر|تغيير حديث|التوقيت/i);
    });
  }
}

const notFoundState = (page: Page) =>
  page.evaluate(() => ({
    h1: (document.querySelector('h1')?.textContent ?? '').replace(/E-\d+/g, 'E-N'),
    states: Array.from(document.querySelectorAll('[data-state]')).map((e) => `${e.getAttribute('data-state')}|${(e.textContent ?? '').replace(/E-\d+/g, 'E-N')}`),
    links: Array.from(document.querySelectorAll('main a')).map((a) => a.getAttribute('href')),
    buttons: document.querySelectorAll('main button').length,
  }));

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`nondisclosure ${lang}/${persona}: a direct route to E-12 is the same not-found state as an unknown id`, async ({ page }) => {
      await openRoute(page, '/evidence/E-999', { lang, persona });
      await expect(page.locator('h1')).toContainText('E-999');
      const unknown = await notFoundState(page);
      expect(unknown.states.some((s) => s.startsWith('error|'))).toBe(true);
      for (const id of ['E-12', 'E-5', 'E-23']) {
        await openRoute(page, `/evidence/${id}`, { lang, persona });
        await expect(page.locator('h1')).toContainText(id); // not a stale render of the previous id
        expect(await notFoundState(page), `${persona}/${lang} ${id}`).toEqual(unknown);
        // The heading echoes the id the visitor typed (as it does for E-999); everything else must not name a withheld record.
        const text = (await surface(page)).split(id).join('');
        for (const token of forbidden(lang)) expect(text.includes(token), `${id}: "${token}"`).toBe(false);
      }
    });
  }
}

test('nondisclosure: Technical on INV-DEMO-7 shows E-5; switching to Owner on the same page removes it at once', async ({ page }) => {
  await openRoute(page, '/investigation/INV-DEMO-7', { persona: 'technical' });
  await expect(page.locator('[data-evidence="E-5"]')).toHaveCount(1);
  expect(await surface(page)).toContain('E-5');
  await page.getByRole('button', { name: 'Owner', exact: true }).click();
  await expect(page).toHaveURL(/persona=owner/);
  await expect(page.locator('[data-evidence="E-5"]')).toHaveCount(0);
  const text = await surface(page);
  for (const token of forbidden('en')) expect(text.includes(token), `after switch: "${token}"`).toBe(false);
  await page.getByRole('button', { name: 'Technical', exact: true }).click();
  await expect(page.locator('[data-evidence="E-5"]')).toHaveCount(1);
});
