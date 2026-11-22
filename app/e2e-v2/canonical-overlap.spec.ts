// BACK-83 (V2 side): the INV-DEMO-7 overlap on the B+C Mission Map is what the canonical model says, per persona and language.
// Expectations come from src/domain (scopeFixture then toV2NodeFacts), never from a second copy in this file. Persona is a
// display switch on synthetic data, not authorization: no server-side enforcement is claimed.
import { expect, test, type Page } from '@playwright/test';
import { DOMAIN } from '../src/domain/fixture';
import { scopeFixture } from '../src/domain/scope';
import type { ComponentId } from '../src/domain/types';
import { toV2NodeFacts } from '../src/domain/toV2';
import { WORLD } from '../src/design-lab/v2/fixtures/world';
import { authorizedWorld } from '../src/design-lab/v2/logic/authorize';
import { nodeChip } from '../src/design-lab/v2/logic/evidence';
import type { WorldNode } from '../src/design-lab/v2/types';
import { loadBc } from './bc-helpers';
import { LANGS, PERSONAS } from './helpers';

const LAY = ['owner', 'nontechnical'] as const;
const WITHHELD_IDS = Object.values(DOMAIN.evidence).filter((e) => e.visibility === 'technical').map((e) => e.id);
const WITHHELD_OBSERVATIONS = Object.values(DOMAIN.evidence)
  .filter((e) => e.visibility === 'technical' && e.observation).map((e) => e.observation!.id);
const WITHHELD_ONLY = DOMAIN.components.filter((c) => c.basis.length > 0 && c.basis.every((id) => WITHHELD_IDS.includes(id)));

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

/** The V2 node as the canonical scoped fixture says it is: layout and copy keys from V2, facts from the domain. */
const canonicalNode = (persona: (typeof PERSONAS)[number], id: ComponentId): WorldNode => {
  const base = WORLD.nodes.find((n) => n.id === id)!;
  return { ...base, ...toV2NodeFacts(scopeFixture(DOMAIN, persona), id) };
};

for (const lang of LANGS) {
  for (const persona of PERSONAS) {
    test(`V2 map ${persona}/${lang}: each overlap node shows the tone the canonical facts give`, async ({ page }) => {
      await loadBc(page, { lang, persona, view: 'map' });
      const sources = authorizedWorld(WORLD, persona).sources;
      for (const c of DOMAIN.components) {
        const chip = nodeChip(canonicalNode(persona, c.id), sources);
        await expect(page.locator(`[data-node="${c.id}"]`), `${c.id} tone`).toHaveAttribute('data-tone', chip.tone);
      }
    });
  }
}

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`V2 withheld-only ${persona}/${lang}: inventory is never healthy and nothing hints at the withheld record`, async ({ page }) => {
      for (const c of WITHHELD_ONLY) {
        for (const tab of ['evidence', 'overview'] as const) {
          await loadBc(page, { lang, persona, view: 'map', node: c.id, tab });
          const chip = nodeChip(canonicalNode(persona, c.id), authorizedWorld(WORLD, persona).sources);
          expect(chip.kind, `${c.id} chip kind`).not.toBe('healthy');
          await expect(page.locator(`[data-node="${c.id}"]`)).not.toHaveAttribute('data-tone', 'ok');
          const text = await surface(page);
          for (const token of [...WITHHELD_IDS, ...WITHHELD_OBSERVATIONS]) {
            expect(text.includes(token), `${persona}/${lang}/${tab} ${c.id}: "${token}"`).toBe(false);
          }
        }
      }
    });
  }
}
