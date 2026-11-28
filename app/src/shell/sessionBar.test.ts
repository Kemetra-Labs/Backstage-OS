// BACK-51 P2: what the session bar says in each state, in English and Arabic. Rendered to static markup (node environment): the
// view is prop-driven, so this holds whatever the build's live switch is.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppContext, type AppState } from '../app/AppContext';
import { hostCopy } from '../i18n/host';
import { SIGN_IN_PATH, type SessionSnapshot, type SessionStatus } from '../live/session';
import { SessionBarView } from './SessionBar';

const STATUSES: readonly SessionStatus[] = ['checking', 'signedIn', 'signedOut', 'ended', 'unavailable', 'error'];

function render(status: SessionStatus, lang: 'en' | 'ar' = 'en', signOutFailed = false): string {
  const shell = hostCopy('SHELL', lang);
  const app = { lang, shell, copy: hostCopy('COPY', lang) } as unknown as AppState;
  const locked = signOutFailed || status === 'ended' || status === 'unavailable' || status === 'error';
  const snapshot: SessionSnapshot = { status, generation: 1, signOutFailed, locked };
  const noop = () => undefined;
  return renderToStaticMarkup(createElement(AppContext.Provider, { value: app }, createElement(SessionBarView, { snapshot, onRecheck: noop, onSignOut: noop })));
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('SessionBarView', () => {
  it('says signed in as the owner, with a sign-out button, and never an id', () => {
    const html = render('signedIn');
    expect(text(html)).toContain('Signed in as the owner.');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Sign out<\/button>/);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(html).not.toContain('/api/auth/lab');
    expect(html).not.toContain(SIGN_IN_PATH);
  });

  it('a failed sign-out says so in words, and still offers sign-out', () => {
    const html = render('signedIn', 'en', true);
    expect(text(html)).toContain('Sign-out did not complete');
    expect(html).toContain('data-state="error"');
    expect(html).toContain('Try signing out again</button>');
  });

  it('signed out links the sign-in page in a new tab and offers Check again', () => {
    const html = render('signedOut');
    expect(text(html)).toContain('Not signed in');
    expect(SIGN_IN_PATH).toBe('/sign-in');
    expect(html).toMatch(/<a [^>]*href="\/sign-in"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(html).not.toContain('/api/auth/lab');
    expect(text(html)).not.toMatch(/lab/i);
    expect(html).toContain('>Check again</button>');
    expect(html).not.toContain('>Sign out<');
  });

  it('the sign-in link carries the current language: lang=ar for Arabic, none for English; still a new tab with noopener', () => {
    const ar = render('signedOut', 'ar');
    expect(ar).toMatch(/<a [^>]*href="\/sign-in\?lang=ar"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(render('signedOut', 'en')).toMatch(/<a [^>]*href="\/sign-in"[^>]*target="_blank"/);
  });

  it('ended says the session ended and that unsent work is kept, with the same way back', () => {
    const html = render('ended');
    expect(text(html)).toContain('Your session ended');
    expect(text(html)).toContain('Your unsent draft stays in this tab');
    expect(html).toContain(`href="${SIGN_IN_PATH}"`);
    expect(html).toMatch(/<a [^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(html).toContain('>Check again</button>');
    expect(html).not.toContain('role="alert"'); // focus moves to the notice instead: one announcement
    expect(render('signedOut')).not.toContain('role="alert"');
  });

  it('the bar can take focus, so sign-out does not drop it to the page', () => {
    expect(render('signedOut')).toContain('tabindex="-1"');
  });

  it('unavailable and error are unknown in words, never signed in or signed out', () => {
    for (const s of ['unavailable', 'error'] as const) {
      const t = text(render(s));
      expect(t, s).toContain('Sign-in status unknown');
      expect(t, s).not.toMatch(/Signed in as|Not signed in/);
      expect(render(s), s).toContain(`data-state="${s}"`);
      expect(render(s), s).toContain('>Check again</button>');
    }
  });

  it('checking is a loading status', () => {
    const html = render('checking');
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<button');
  });

  it('every state has its own Arabic copy (no English words left), and the region is labelled', () => {
    for (const s of STATUSES) {
      const en = render(s, 'en', s === 'signedIn');
      const ar = render(s, 'ar', s === 'signedIn');
      expect(ar, s).toContain('aria-label="الجلسة"');
      expect(en, s).toContain('aria-label="Session"');
      // Only the {Kawalys} token may stay Latin in Arabic.
      expect(text(ar).replace(/Kawalys/g, ''), s).not.toMatch(/[A-Za-z]{3,}/);
      expect(text(ar), s).not.toBe(text(en));
    }
  });
});

describe('SessionBarView locked notice (BACK-127 G, E)', () => {
  it('ended, unavailable and error each say what happened, that the screen is locked, and offer Sign in again and Check again', () => {
    for (const s of ['ended', 'unavailable', 'error'] as const) {
      const html = render(s);
      expect(text(html), s).toContain('This screen is locked');
      expect(html, s).toContain('data-locked="true"');
      expect(html, s).toContain('>Sign in again</a>');
      expect(html, s).toContain('>Check again</button>');
      expect(html, s).toMatch(/<a [^>]*href="\/sign-in"/);
      expect(html, s).not.toContain('role="alert"');
    }
  });

  it('Sign in again keeps the language, and nothing redirects by itself', () => {
    const html = render('unavailable', 'ar');
    expect(html).toMatch(/<a [^>]*href="\/sign-in\?lang=ar"/);
    expect(html).not.toMatch(/http-equiv|location\./i);
  });

  it('a failed sign-out stays locked with the unconfirmed-logout wording and a retry, not a sign-in link', () => {
    const html = render('signedIn', 'en', true);
    expect(text(html)).toContain('Sign-out did not complete');
    expect(text(html)).toContain('this screen stays locked');
    expect(text(html)).toContain('draft was cleared');
    expect(text(html)).not.toContain('Nothing is lost');
    expect(html).toContain('Try signing out again</button>');
    expect(html).not.toContain('Sign in again');
    expect(html).not.toContain('Signed in as the owner');
  });

  it('not locked: no locked notice and no data-locked mark', () => {
    for (const s of ['checking', 'signedIn', 'signedOut'] as const) {
      expect(render(s), s).not.toContain('data-locked="true"');
      expect(text(render(s)), s).not.toContain('This screen is locked');
    }
  });
});
