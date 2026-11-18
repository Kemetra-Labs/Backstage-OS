// Hash route for the V2 lab: #/<screen>?persona=&lang=&scope=&node=&src=&evt=&msn=
// Everything a reviewer can change lives in the URL, so a screenshot or a link reproduces the exact state.
import type { Lang, Persona, Provider } from '../../../contract/types';
import { SCREENS, type ScreenId } from '../types';

export const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];
const PROVIDERS: readonly Provider[] = ['github', 'jira', 'confluence', 'sentry', 'datadog', 'port'];

export interface Route {
  readonly screen: ScreenId;
  readonly persona: Persona;
  readonly lang: Lang;
  /** Map scope: a product or service node id, or 'all'. */
  readonly scope: string;
  /** Selected map node id. */
  readonly node: string | null;
  /** Selected source on the Observatory. */
  readonly src: Provider | null;
  /** Selected replay event id. */
  readonly evt: string | null;
  /** Selected deck mission id. */
  readonly msn: string | null;
}

export const DEFAULT_ROUTE: Route = {
  screen: 'mission-map', persona: 'owner', lang: 'en', scope: 'retail-tower', node: null, src: 'github', evt: null, msn: 'MSN-DEMO-5',
};

const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | null =>
  v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;

const ID = /^[A-Za-z0-9:_-]{1,40}$/;
const id = (v: string | null): string | null => (v !== null && ID.test(v) ? v : null);

/** Parses location. Query-string persona/lang seed the route; the hash wins. Anything invalid falls back to defaults. */
export function parseRoute(hash: string, search = ''): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', qs = ''] = raw.split('?');
  const h = new URLSearchParams(qs);
  const s = new URLSearchParams(search);
  const get = (k: string): string | null => h.get(k) ?? s.get(k);
  return {
    screen: pick(path, SCREENS) ?? DEFAULT_ROUTE.screen,
    persona: pick(get('persona'), PERSONAS) ?? DEFAULT_ROUTE.persona,
    lang: get('lang') === 'ar' ? 'ar' : 'en',
    scope: id(get('scope')) ?? DEFAULT_ROUTE.scope,
    node: id(get('node')),
    src: pick(get('src'), PROVIDERS) ?? DEFAULT_ROUTE.src,
    evt: id(get('evt')),
    msn: id(get('msn')) ?? DEFAULT_ROUTE.msn,
  };
}

/** Serialises persona and language always, and the rest only when it differs from the defaults. */
export function buildHash(r: Route): string {
  const q = new URLSearchParams();
  const d = DEFAULT_ROUTE;
  // Always written: the query string only seeds the first load and must never win over a later switch.
  q.set('persona', r.persona);
  q.set('lang', r.lang);
  if (r.scope !== d.scope) q.set('scope', r.scope);
  if (r.node) q.set('node', r.node);
  if (r.src && r.src !== d.src) q.set('src', r.src);
  if (r.evt) q.set('evt', r.evt);
  if (r.msn && r.msn !== d.msn) q.set('msn', r.msn);
  const qs = q.toString();
  return `#/${r.screen}${qs ? `?${qs}` : ''}`;
}
