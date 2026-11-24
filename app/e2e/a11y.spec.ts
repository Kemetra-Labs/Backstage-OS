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
