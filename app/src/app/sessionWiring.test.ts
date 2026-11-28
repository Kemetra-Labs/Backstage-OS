// BACK-127 review I3: the stateful wiring around the session store, rendered to static markup (node environment, no extra
// dependency): the draft hook, the live-read hook, and the pure rules the form and the records panel are built on.
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { formGate } from '../live/decisions';
import { hidesRecords, heldFor, SessionStore, type SessionSnapshot } from '../live/session';
import { SessionContext, useSessionDraft } from './SessionContext';
import { useLiveRead } from './useLiveRead';

const id = (n: string) => `{"user":{"id":"00000000-0000-4000-8000-0000000000${n}","role":"owner"}}`;
type Reply = readonly [number, string] | 'network';

async function storeWith(...replies: Reply[]) {
  const q = [...replies];
  const fetcher = vi.fn(async () => {
    const r = q.length > 1 ? q.shift()! : q[0]!;
    if (r === 'network') throw new TypeError('Failed to fetch');
    return new Response(r[1], { status: r[0] });
  });
  const store = new SessionStore(fetcher);
  await store.start();
  return store;
}

const html = (store: SessionStore, el: ReactElement) => renderToStaticMarkup(createElement(SessionContext.Provider, { value: store }, el));

function draftProbe(out: { set?: (v: string | undefined) => void }) {
  return function Probe() {
    const [draft, set] = useSessionDraft<string>('decision:a');
    out.set = set;
    return createElement('p', null, `draft=${draft ?? 'none'}`);
  };
}

describe('useSessionDraft (BACK-127)', () => {
  it('is hidden while locked, back after unlock, and writes are off while locked', async () => {
    const store = await storeWith([200, id('0a')], 'network', [200, id('0a')]);
    const out: { set?: (v: string | undefined) => void } = {};
    const Probe = draftProbe(out);
    store.setDraft('decision:a', 'typed');
    expect(html(store, createElement(Probe))).toContain('draft=typed');
    await store.recheck();
    expect(store.getSnapshot().locked).toBe(true);
    expect(html(store, createElement(Probe))).toContain('draft=none');
    out.set!('written while locked');
    expect(store.getDraft('decision:a')).toBe('typed'); // untouched, and still in the store
    await store.recheck();
    expect(html(store, createElement(Probe))).toContain('draft=typed');
  });

  it('is cleared when another user id signs in', async () => {
    const store = await storeWith([200, id('0a')], [200, id('0b')]);
    store.setDraft('decision:a', 'typed');
    await store.recheck();
    expect(html(store, createElement(draftProbe({})))).toContain('draft=none');
  });

  it('fixture mode (no store) keeps a plain local value', () => {
    expect(renderToStaticMarkup(createElement(draftProbe({})))).toContain('draft=none');
  });
});

describe('useLiveRead (BACK-127)', () => {
  const Probe = () => {
    const r = useLiveRead(async () => ({ status: 'ok', body: 1 }), 'p');
    return createElement('p', null, JSON.stringify(r));
  };

  it('a locked session reads as locked in words, not loading, and starts nothing', async () => {
    const store = await storeWith([200, id('0a')], 'network');
    const text = (e: ReactElement) => html(store, e).replace(/&quot;/g, '"');
    expect(text(createElement(Probe))).toContain('"loading"');
    await store.recheck();
    expect(text(createElement(Probe))).toContain('"failure":"locked"');
    expect(text(createElement(Probe))).not.toContain('"loading"');
  });

  it('a held answer is used only for the key it was read under: a late answer for an old key is ignored', () => {
    const read = { status: 'ok', body: 1 } as const;
    expect(heldFor({ key: 'p#1', read }, 'p#1')).toBe(read);
    expect(heldFor({ key: 'p#1', read }, 'p#1#locked')).toEqual({ status: 'loading' });
    expect(heldFor({ key: 'p#1', read }, 'p#2')).toEqual({ status: 'loading' });
    expect(heldFor(null, 'p#1')).toEqual({ status: 'loading' });
  });
});

describe('the records panel lock check and the form gate', () => {
  const snap = (status: SessionSnapshot['status'], locked = false, generation = 1): SessionSnapshot => ({ status, generation, signOutFailed: false, locked });

  it('hidesRecords: locked, signed out and ended hide the records; signed in and checking do not; fixture mode never', () => {
    expect(hidesRecords(snap('signedIn', true))).toBe(true);
    expect(hidesRecords(snap('signedOut'))).toBe(true);
    expect(hidesRecords(snap('ended', true))).toBe(true);
    expect(hidesRecords(snap('signedIn'))).toBe(false);
    expect(hidesRecords(snap('checking'))).toBe(false);
    expect(hidesRecords(null)).toBe(false);
  });

  it('formGate: locked wins; open only when this case was read for the current generation', () => {
    expect(formGate(null, null)).toBe('open');
    expect(formGate(snap('unavailable', true, 2), 2)).toBe('locked');
    expect(formGate(snap('signedIn', false, 2), 1)).toBe('rereading');
    expect(formGate(snap('signedIn', false, 2), null)).toBe('rereading');
    expect(formGate(snap('signedIn', false, 2), 2)).toBe('open');
  });
});
