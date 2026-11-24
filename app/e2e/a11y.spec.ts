// BACK-91: automated accessibility scan (axe-core, WCAG 2.0/2.1/2.2 A and AA rules) of the unified AppShell.
// Every route of the one shell, the four lens views included, in English and Arabic (RTL), for each persona.
// Automated rules only: axe cannot judge reading order, meaning, keyboard flow or screen-reader output, so this does NOT
// replace the manual NVDA/VoiceOver, native Arabic and real-device checks (BACK-31, BACK-32), which stay NOT RUN.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { LANGS, PERSONAS } from './helpers';
import { SCREENS, openScreen } from './lens-helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    for (const route of SCREENS) {
      test(`axe ${lang} ${persona} ${route}`, async ({ page }, info) => {
        await openScreen(page, route, { lang, persona });
        // The map's first-load intro fades nodes in; scan the page at rest so results do not depend on timing.
        await expect(page.locator('[data-intro]')).toHaveCount(0, { timeout: 10_000 });
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const found = violations.map((v) => ({
          rule: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
        }));
        await info.attach('axe-violations.json', { body: JSON.stringify({ lang, persona, route, found }, null, 2), contentType: 'application/json' });
        expect(found, `axe violations on ${route} (${lang}, ${persona})`).toEqual([]);
      });
    }
  }
}

// BACK-92 R3 (M17, from e2e-v2/structure.spec.ts "keyboard focus is always visible on interactive elements"): Tab through each lens
// view, shell included, and every stop shows a focus indicator (an outline or a focus shadow). A map node draws its ring on its orb or
// card, and a select or search field on its labelled wrapper, as in the lab. axe cannot judge this: it does not move focus.
const LENSES = ['/map', '/sources/observatory', '/investigation/INV-DEMO-7/replay', '/agents/deck'] as const;

for (const route of LENSES) {
  test(`keyboard focus is visible on every Tab stop of ${route}`, async ({ page }) => {
    await openScreen(page, route, { lang: 'en', persona: 'technical', width: 1440 });
    await expect(page.locator('[data-intro]')).toHaveCount(0, { timeout: 10_000 });
    const missing: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 250; i += 1) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const shows = (e: Element) => {
          const cs = getComputedStyle(e);
          return (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') || cs.boxShadow !== 'none';
        };
        const inner = el.matches('.kv2-bc-node, .kv2-node') ? [...el.querySelectorAll('.kv2-bc-orb, .kv2-bc-card, .kv2-orb, .kv2-node-card')] : [];
        const wrap = el.closest('.kv2-search, .kv2-select');
        const ok = shows(el) || inner.some(shows) || (wrap !== null && shows(wrap));
        const path: string[] = [];
        for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) path.push(`${e.tagName}:${[...(e.parentElement?.children ?? [])].indexOf(e)}`);
        return { ok, key: path.join('<'), html: el.outerHTML.slice(0, 100) };
      });
      if (!r) continue;
      if (seen.has(r.key)) break; // focus came round to a stop it already visited: the whole page has been walked
      seen.add(r.key);
      if (!r.ok) missing.push(r.html);
    }
    expect(seen.size, 'Tab walked the page').toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
}
