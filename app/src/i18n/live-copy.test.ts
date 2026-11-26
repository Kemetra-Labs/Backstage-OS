// BACK-51 P1: live-mode copy. A live build must never say that nothing is live, and every live state exists in EN and AR.
import { describe, expect, it } from 'vitest';
import { SHELL } from './shell';

describe('live copy (BACK-51 P1)', () => {
  it('has the same states in EN and AR, each with a title and a body', () => {
    expect(Object.keys(SHELL.ar.live.states).sort()).toEqual(Object.keys(SHELL.en.live.states).sort());
    for (const lang of ['en', 'ar'] as const)
      for (const s of Object.values(SHELL[lang].live.states)) expect(s.title && s.body, lang).toMatch(/\S/);
  });

  it('the live footer replaces the "nothing here is live" one and says what is live', () => {
    expect(SHELL.en.live.footer).toMatch(/\S/);
    expect(SHELL.ar.live.footer).toMatch(/\S/);
    expect(SHELL.en.live.footer).not.toMatch(/nothing here is live|synthetic data only/i);
    expect(SHELL.en.live.footer).toMatch(/live mode/i);
    expect(SHELL.ar.live.footer).not.toBe(SHELL.ar.footer);
  });

  it('no live state uses a healthy word', () => {
    for (const lang of ['en', 'ar'] as const)
      for (const s of Object.values(SHELL[lang].live.states)) expect(`${s.title} ${s.body}`).not.toMatch(/\bhealthy\b(?<!not healthy)|all good|operational/i);
  });
});
