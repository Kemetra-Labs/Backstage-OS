// BACK-90, owner decision A: a mission's `events` figure is NOT DEFINED by the synthetic fixture. Nothing shows it, nothing derives a count
// from it, and nothing subtracts withheld evidence references from it (a figure that differs by persona would hint that a record is hidden).
// The field stays in the type and the fixture for now; its removal is a separate, audited change (option D). These guards read the source
// because the screen has no DOM unit environment; the rendered wording is checked in the browser (e2e/agent-flight-deck.spec.ts and
// e2e/lens-nondisclosure.spec.ts). Persona is a display switch on synthetic data, not authorization.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE } from '../i18n/t';

const source = (relative: string): string => readFileSync(join(__dirname, relative), 'utf8');
/** Source with comments and string literals removed, so a comment or a translation key such as deck.md.events cannot trip a guard. */
const code = (relative: string): string =>
  source(relative).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, '""');

describe('mission events are not defined (owner decision, BACK-90)', () => {
  it('the Flight Deck screen never reads a mission events figure', () => {
    expect(code('../screens/AgentFlightDeck.tsx')).not.toMatch(/\.events\b/);
  });

  it('the scoping never recomputes or reads a mission events figure from the evidence it withholds', () => {
    expect(code('./authorize.ts')).not.toMatch(/\bevents\b/);
  });

  it('the deck logic derives its counts from missions and statuses, never from an events figure', () => {
    expect(code('./deck.ts')).not.toMatch(/\.events\b/);
  });

  it('the undefined wording exists in both languages and carries no digit, so it cannot read as a count', () => {
    for (const lang of [0, 1] as const) {
      const text = TABLE['deck.md.events.unknown'][lang];
      expect(text.length, `lang ${lang}`).toBeGreaterThan(0);
      expect(text, `lang ${lang}`).not.toMatch(/[0-9٠-٩]/);
    }
  });
});
