// BACK-51 P2: what the session bar says in each state, in English and Arabic. Rendered to static markup (node environment): the
// view is prop-driven, so this holds whatever the build's live switch is.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppContext, type AppState } from '../app/AppContext';
import { hostCopy } from '../i18n/host';
import type { SessionSnapshot, SessionStatus } from '../live/session';
import { SessionBarView } from './SessionBar';

const STATUSES: readonly SessionStatus[] = ['checking', 'signedIn', 'signedOut', 'ended', 'unavailable', 'error'];

function render(status: SessionStatus, lang: 'en' | 'ar' = 'en', signOutFailed = false): string {
  const shell = hostCopy('SHELL', lang);
  const app = { lang, shell, copy: hostCopy('COPY', lang) } as unknown as AppState;
  const snapshot: SessionSnapshot = { status, generation: 1, signOutFailed };
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
  });

  it('a failed sign-out says so in words, and still offers sign-out', () => {
    const html = render('signedIn', 'en', true);
    expect(text(html)).toContain('Sign-out did not complete');
    expect(html).toContain('data-state="error"');
    expect(html).toContain('>Sign out</button>');
  });

  it('signed out links the lab sign-in in a new tab and offers Check again', () => {
    const html = render('signedOut');
    expect(text(html)).toContain('Not signed in');
    expect(html).toMatch(/<a [^>]*href="\/api\/auth\/lab"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(html).toContain('>Check again</button>');
    expect(html).not.toContain('>Sign out<');
  });

  it('ended says the session ended and that unsent work is kept, with the same way back', () => {
    const html = render('ended');
    expect(text(html)).toContain('Your session ended');
    expect(text(html)).toContain('Anything you have not sent on this page is kept.');
    expect(html).toContain('href="/api/auth/lab"');
    expect(html).toContain('>Check again</button>');
    expect(html).toContain('role="alert"');
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
