// Shell search targets, built from the world a viewer is authorized to see. BACK-66: the list is derived from the projection, so a
// replay row or mission the persona may not read is never offered, labelled, counted or announced by the search box.
import type { Provider } from '../../../contract/types';
import { plain, type K } from '../i18n/t';
import type { ScreenId, World } from '../types';
import type { Route } from './route';

export interface Hit {
  readonly id: string;
  readonly label: string;
  readonly kind: K;
  readonly screen: ScreenId;
  readonly patch: Partial<Route>;
}

export function buildHits(w: World, t: (key: K) => string, provider: Readonly<Record<Provider, string>>): readonly Hit[] {
  const out: Hit[] = [];
  for (const n of w.nodes) out.push({ id: `n-${n.id}`, label: n.title, kind: `kind.${n.kind}` as K, screen: 'mission-map', patch: { node: n.id } });
  for (const s of w.sources) out.push({ id: `s-${s.provider}`, label: provider[s.provider], kind: 'kind.source', screen: 'source-observatory', patch: { src: s.provider } });
  for (const e of w.replay) out.push({ id: `r-${e.id}`, label: `${e.id} ${plain(t(e.key as K))}`, kind: 'kind.evidence', screen: 'mission-replay', patch: { evt: e.id } });
  for (const m of w.missions) out.push({ id: `m-${m.id}`, label: `${m.id} ${plain(t(m.key as K))}`, kind: 'kind.mission', screen: 'agent-flight-deck', patch: { msn: m.id } });
  return out;
}
