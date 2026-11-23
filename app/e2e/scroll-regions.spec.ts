// BACK-33 (SonarCloud S6845, "tabIndex on a non-interactive element"): the live lens tables sit in scrollable regions with tabIndex={0}
// and role="region". That is the keyboard route into a region that scrolls sideways (WCAG 2.1.1, and the axe rule
// scrollable-region-focusable). e2e-v2/bc.spec.ts already holds this evidence for the three tables in bc/Tables.tsx; this holds it for
// the other live regions: the Flight Deck mission table, the Source Observatory table view and the replay time table. For each: it is
// a named region, Tab from the control before it lands on it, and when it overflows the arrow key scrolls it. Overflow is forced with
// the same 200% text sizing the lab spec uses, so the scroll is exercised rather than skipped. Chromium only: Safari tabs to links and
// buttons only with its Tab-to-links option, so WebKit is recorded as skipped, not passed. This is automated evidence, not a manual
// keyboard or screen-reader pass (BACK-32).
import { expect, test, type Page } from '@playwright/test';
import { LANGS, openRoute } from './helpers';

const TEXT_200 = ':root{--kv2-t-xs:22px;--kv2-t-sm:24px;--kv2-t-md:27px;--kv2-t-lg:30px;--kv2-t-xl:36px;--kv2-t-2xl:46px;--kv2-t-3xl:72px}.kv2-table{font-size:26px}.kv2-table thead th{font-size:24px}';

const REGIONS = [
  { id: 'agent-deck missions', route: '/agents/deck', lens: '[data-testid="agent-deck-lens"]', region: '[data-testid="agent-deck-lens"] .kv2-table-wrap', setup: async () => undefined },
  {
    id: 'observatory table view', route: '/sources/observatory', lens: '[data-testid="source-observatory-lens"]', region: '[data-testid="source-observatory-lens"] .kv2-table-wrap',
    // The view switch is a two-button group in the panel head: cards first, table second.
    setup: async (page: Page) => { await page.locator('[data-testid="source-observatory-lens"] .kv2-panel-head .kv2-seg button').nth(1).click(); },
  },
  { id: 'replay time table', route: '/investigation/INV-DEMO-7/replay', lens: '[data-testid="replay-lens"]', region: '[data-testid="replay-time-basis"] .kv2-table-wrap', setup: async () => undefined },
] as const;

for (const lang of LANGS) {
  for (const r of REGIONS) {
    test(`scroll region ${r.id} ${lang}: a named region, reachable by Tab, and the arrow key scrolls it`, async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'Safari tabs to links and buttons only with the Tab-to-links option');
      await openRoute(page, r.route, { lang, persona: 'owner', width: 320 });
      await expect(page.locator(r.lens)).toBeVisible(); // the lens is lazy: the h1 is up before its chunk loads
      await page.addStyleTag({ content: TEXT_200 });
      await r.setup(page);
      const el = page.locator(r.region);
      await expect(el).toHaveCount(1);
      await expect(el).toHaveAttribute('tabindex', '0');
      await expect(el).toHaveRole('region');
      await expect(el).toHaveAccessibleName(/\S/);
      // Known starting focus: the last tabbable control before the region in document order.
      const startedFrom = await el.evaluate((region) => {
        const tabbable = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')]
          .filter((e) => !e.hasAttribute('disabled') && e.tabIndex >= 0 && !e.closest('[hidden], [inert]') && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0);
        const before = tabbable.filter((e) => e !== region && (e.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).pop();
        before?.focus();
        return before ? before.tagName.toLowerCase() : null;
      });
      expect(startedFrom, 'a control precedes the region').not.toBeNull();
      await page.keyboard.press('Tab');
      expect(await el.evaluate((region) => document.activeElement === region), `Tab from <${startedFrom}> lands on the region`).toBe(true);
      const m = await el.evaluate((region) => ({ sw: region.scrollWidth, cw: region.clientWidth }));
      expect(m.sw, `overflows at 200% text and 320 px (${m.sw}/${m.cw}), so the scroll is exercised`).toBeGreaterThan(m.cw);
      const before = await el.evaluate((region) => region.scrollLeft);
      await page.keyboard.press(lang === 'en' ? 'ArrowRight' : 'ArrowLeft');
      await expect.poll(() => el.evaluate((region) => region.scrollLeft), { message: 'the arrow key scrolls the region' }).not.toBe(before);
    });
  }
}
