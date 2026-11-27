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

describe('newest-investigation fallback copy (BACK-51 P1)', () => {
  it('says the newest visible case is shown and how to open another, in EN and AR', () => {
    for (const lang of ['en', 'ar'] as const) expect(SHELL[lang].live.newest, lang).toContain('{?investigation=}');
    expect(SHELL.en.live.newest).toMatch(/newest/i);
  });

  it('nothing to show no longer reads as "you forgot the address": the server listed no case this session can see', () => {
    expect(SHELL.en.live.states.notChosen.title).toBe('No investigation to show');
    expect(SHELL.en.live.states.notChosen.body).toMatch(/no investigation this session can see/i);
  });
});

describe('sign-in page copy (D3(a))', () => {
  const keys = ['title', 'working', 'refused', 'unavailable', 'unconfigured', 'retry', 'back'] as const;

  it('has every string in EN and AR, and Arabic has no English words left (only the {Kawalys} token may stay Latin)', () => {
    for (const k of keys) {
      const en = SHELL.en.live.signIn[k];
      const ar = SHELL.ar.live.signIn[k];
      const flat = (v: unknown): string => (typeof v === 'string' ? v : Object.values(v as Record<string, string>).join(' '));
      expect(flat(en), k).toMatch(/\S/);
      expect(flat(ar), k).toMatch(/\S/);
      expect(flat(ar).replace(/Kawalys/g, ''), k).not.toMatch(/[A-Za-z]{3,}/);
      expect(flat(ar), k).not.toBe(flat(en));
    }
    expect(Object.keys(SHELL.ar.live.signIn).sort()).toEqual(Object.keys(SHELL.en.live.signIn).sort());
  });

  it('the neutral messages name no cause, status code or token, and the unreachable one differs from the refused one', () => {
    for (const lang of ['en', 'ar'] as const) {
      const c = SHELL[lang].live.signIn;
      for (const m of [c.refused, c.unavailable, c.unconfigured]) {
        const text = `${m.title} ${m.body}`;
        expect(text, lang).not.toMatch(/\b(?:401|403|404|429|500|502|503)\b|token|jwt|expired|expire|invalid|denied|not allowed|not the owner|wrong|email|rate|limit|timeout|descope|cookie/i);
      }
      expect(c.refused.title, lang).not.toBe(c.unavailable.title);
      expect(c.refused.body, lang).not.toBe(c.unavailable.body);
    }
    expect(SHELL.en.live.signIn.unavailable.body).toMatch(/try again/i);
    expect(SHELL.en.live.signIn.refused.title).toMatch(/could not sign in/i);
    expect(SHELL.en.live.signIn.unconfigured.title).toMatch(/not (?:set up|configured)/i);
  });
});
