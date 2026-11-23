// Shared by the lens specs (map, Source Observatory, Replay, Flight Deck, convergence): what must never reach a lay persona's screen, and
// the one way to read every place a restricted id could hide. One copy, so the matrix is changed once.
import type { Page } from '@playwright/test';
import { DOMAIN } from '../src/domain/fixture';

/** Evidence the canonical model withholds from lay personas. */
export const WITHHELD = Object.values(DOMAIN.evidence).filter((e) => e.visibility === 'technical');
/** Their ids and the ids of the observations behind them: two cues that a record exists. */
export const RESTRICTED: readonly string[] = [...WITHHELD.map((e) => e.id), ...WITHHELD.flatMap((e) => (e.observation ? [e.observation.id] : []))];

export const hash = (page: Page): Promise<string> => page.evaluate(() => window.location.hash);

/** True when `id` appears as a whole token (not inside DEMO-5 or E-50). */
export const hasId = (text: string, id: string): boolean => new RegExp(`(^|[^A-Za-z0-9-])${id}([^A-Za-z0-9-]|$)`).test(text);

/** True when any restricted id is present in the text, as a token or as a quoted JSON key. */
export const leaks = (text: string): readonly string[] => RESTRICTED.filter((id) => hasId(text, id) || text.includes(`"${id}"`));

/** Visible text, hidden text, the address, and every aria-label, title, alt, href and data-* value on the page. */
export const surface = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const out: string[] = [document.body.innerText, document.body.textContent ?? '', window.location.href];
    for (const el of document.querySelectorAll('*')) {
      for (const a of Array.from(el.attributes)) {
        if (a.name === 'aria-label' || a.name === 'title' || a.name === 'alt' || a.name === 'href' || a.name.startsWith('data-')) out.push(`${a.name}=${a.value}`);
      }
    }
    return out.join('\n');
  });
