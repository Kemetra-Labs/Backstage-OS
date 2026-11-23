// Shared by the per-lens scoping tests (Source Observatory, Agent Flight Deck): a lens must read its world only through
// authorizedWorld(WORLD, route.persona), never the unscoped fixture. One copy, so the rule is changed once. Test support only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';

const read = (relativeToScreens: string): string => readFileSync(join(__dirname, relativeToScreens), 'utf8');

/** `screen` and `lens` are paths relative to src/screens. */
export function expectWorldReadOnlyThroughAuthorizedWorld(screen: string, lens: string): void {
  const src = read(screen);
  const scoped = src.match(/authorizedWorld\(WORLD, route\.persona\)/g)?.length ?? 0;
  expect(scoped).toBeGreaterThan(0);
  // Every use of WORLD is the import or the argument of authorizedWorld(WORLD, route.persona): no screen path reads it unscoped.
  expect(src.match(/\bWORLD\b/g)?.length, 'WORLD may only be imported and passed to authorizedWorld').toBe(1 + scoped);
  expect(read(lens)).not.toMatch(/\bWORLD\b/);
}
