// The sign-in page (D3(a), option B). Live mode only: App.tsx mounts it on the path /sign-in when LIVE, and the default (fixture) build
// never reaches it. Descope runs the magic-link flow in its web component, which is loaded by a dynamic import() here and nowhere else
// (src/live/live.guard.test.ts), so the fixture build ships no Descope code. On the component's `success` event the page exchanges the
// session JWT once (completeSignIn: POST /api/auth/session, then the SDK logout so no Descope token stays in the browser) and returns
// to "/". The Kawalys session cookie is the only session. The rules are in src/live/signInFlow.ts; this file only wires them to React.
//
// The magic link returns here with a token in the query (?t=...): this page never rewrites the URL, so the component can read it.
import { useEffect, useRef, useState, type Ref } from 'react';
import { Text } from '../components/Text';
import type { Lang } from '../contract/types';
import { hostCopy } from '../i18n/host';
import { SIGN_IN_PATH } from './session';
import { createDescopeElement } from './descopeElement';
import type { DescopeSdkLike } from './signIn';
import { clearDescopeStorage, descopeLocale, loadDescopeComponent, makeExchange, makeSignInEvents, pathWithLang, signInView, type StorageLike } from './signInFlow';

type Phase = 'flow' | 'working' | 'refused' | 'unavailable';

/** Optional ?lang=ar, as everywhere else in the app (the magic link return carries none: the page then opens in English). */
function initialLang(): Lang {
  return new URLSearchParams(window.location.search).get('lang') === 'ar' ? 'ar' : 'en';
}

/** The Descope SDK the component holds, or a logout that does nothing when the element has none (nothing to log out of). */
function sdkOf(el: HTMLElement | null): DescopeSdkLike {
  const sdk = (el as { readonly sdk?: { readonly logout?: unknown } } | null)?.sdk;
  return typeof sdk?.logout === 'function' ? (sdk as DescopeSdkLike) : { logout: () => undefined };
}

/** The browser's two storages; one that throws on access (blocked site data) is left out. */
function browserStorages(): StorageLike[] {
  const found: StorageLike[] = [];
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      found.push(window[name]);
    } catch {
      // Blocked storage: nothing persisted there to clear.
    }
  }
  return found;
}

interface NoticeProps {
  readonly kind: string;
  readonly title: string;
  readonly body?: string;
  readonly role?: 'alert' | 'status';
  /** Set on the failure message so focus can move to it when the flow it replaces disappears. */
  readonly regionRef?: Ref<HTMLDivElement>;
}

function Notice({ kind, title, body, role, regionRef }: NoticeProps) {
  // No aria-busy here: it would never flip back to false, and the status region is replaced, not updated.
  return (
    <div role={role} ref={regionRef} tabIndex={regionRef ? -1 : undefined}>
      <div className={`state-block state-${kind}`} data-state={kind}>
        <p className="state-title"><Text s={title} /></p>
        {body !== undefined && <p className="note"><Text s={body} /></p>}
      </div>
    </div>
  );
}

export function SignInPage({ projectId }: { readonly projectId: string | undefined }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [phase, setPhase] = useState<Phase>('flow');
  const [loaded, setLoaded] = useState(false);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  elRef.current = el;
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const c = hostCopy('SHELL', lang).live.signIn;
  const view = signInView(projectId);
  const flowProject = view.kind === 'flow' ? view.projectId : null;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `Kawalys · ${c.title.replace(/[{}]/g, '')}`;
  }, [lang, c.title]);

  // Load the component only for a valid project id. A failed load (offline, a blocked chunk) is the neutral "unreachable" message.
  useEffect(() => {
    if (flowProject === null) return;
    // A session the SDK persisted earlier (another visit, a failed logout) must not be there when the component starts.
    clearDescopeStorage(browserStorages());
    let cancelled = false;
    // loadDescopeComponent switches off the SDK's token persistence before the element exists (and fails closed if it cannot).
    loadDescopeComponent(() => import('@descope/web-component')).then(
      () => { if (!cancelled) setLoaded(true); },
      () => { if (!cancelled) setPhase('unavailable'); },
    );
    return () => { cancelled = true; };
  }, [flowProject]);

  // The element is created here, not in JSX: React 19 assigns a JSX prop as a DOM property when the element has one, and
  // <descope-wc> defines `locale` as a getter only, so `locale={...}` threw and blanked the page (live incident 2026-11-27).
  // Every attribute is set before the element is connected; BaseDescopeWc.js observes `locale` (an unpublished locale falls back
  // to the flow's default screens, getHtmlFilenameWithLocale).
  useEffect(() => {
    if (host === null || flowProject === null) return;
    const node = createDescopeElement(document, flowProject, descopeLocale(langRef.current));
    host.appendChild(node);
    setEl(node);
    return () => { node.remove(); setEl(null); };
  }, [host, flowProject]);

  // A later language switch updates the attribute (the component restarts the flow, as before).
  useEffect(() => { el?.setAttribute('locale', descopeLocale(lang)); }, [el, lang]);

  // One handler pair for the page's life (StrictMode re-runs effects, not this), so a second `success` can never exchange again.
  const handler = useRef<ReturnType<typeof makeSignInEvents> | null>(null);
  // goHome reads the language at call time (the page can be switched to Arabic while the flow runs).
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;
  if (handler.current === null) {
    handler.current = makeSignInEvents({
      exchange: (jwt) => {
        setPhase('working');
        return makeExchange({ getSdk: () => sdkOf(elRef.current), storages: browserStorages() })(jwt);
      },
      onOutcome: (outcome) => { if (outcome !== 'signedIn') setPhase(outcome); },
      goHome: () => window.location.replace(pathWithLang('/', langRef.current)),
    });
  }

  // The flow (where focus was) is hidden when the failure replaces it: move focus to the message, so it is read and "Start again" is next.
  const failure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === 'refused' || phase === 'unavailable') failure.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (el === null) return;
    const onSuccess = (e: Event) => { void handler.current?.onSuccess(e as CustomEvent); };
    const onError = (e: Event) => { void handler.current?.onError(e as CustomEvent); };
    // `ready` is the component's "first screen shown" event (web-component README "ready"; dispatched in DescopeWc.js). Without it
    // (or success/error) within SIGN_IN_READY_MS the page shows the neutral unavailable state: the component can stay blank silently.
    const onReady = () => { handler.current?.onReady(); };
    el.addEventListener('success', onSuccess);
    el.addEventListener('error', onError);
    el.addEventListener('ready', onReady);
    const disarm = handler.current?.arm();
    return () => {
      disarm?.();
      el.removeEventListener('success', onSuccess);
      el.removeEventListener('error', onError);
      el.removeEventListener('ready', onReady);
    };
  }, [el]);

  // The restart and the way back keep the language, but never the magic-link token: a spent token must not be reused.
  const restart = () => window.location.assign(pathWithLang(SIGN_IN_PATH, lang));
  const other: Lang = lang === 'ar' ? 'en' : 'ar';
  const body = (() => {
    if (view.kind === 'unconfigured') return <Notice kind="not_configured" title={c.unconfigured.title} body={c.unconfigured.body} />;
    if (phase === 'refused' || phase === 'unavailable') {
      const m = c[phase];
      return (
        <>
          <Notice kind={phase === 'unavailable' ? 'unavailable' : 'error'} title={m.title} body={m.body} role="alert" regionRef={failure} />
          <p className="session-actions"><button type="button" className="btn btn-quiet" onClick={restart}>{c.retry}</button></p>
        </>
      );
    }
    return (
      <>
        {phase === 'working' && <Notice kind="loading" title={c.working} role="status" />}
        {loaded && (
          <div hidden={phase === 'working'}>
            <div ref={setHost} />
          </div>
        )}
      </>
    );
  })();

  return (
    <main className="signin-page" data-testid="sign-in-page" data-phase={phase}>
      <header className="signin-head">
        <h1><Text s={c.title} /></h1>
        <button type="button" className="btn btn-quiet" lang={other} onClick={() => setLang(other)}>{other === 'ar' ? 'العربية' : 'English'}</button>
      </header>
      {body}
      <p className="note"><a className="btn btn-quiet btn-link" href={pathWithLang('/', lang)}><Text s={c.back} /></a></p>
    </main>
  );
}
