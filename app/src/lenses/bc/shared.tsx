// Small pieces shared by the B+C pilot components: icon maps, copy keys, and the status words.
import type { Connectivity, Freshness, Health, Provider } from '../../contract/types';
import type { IconName } from '../components/Icon';
import { useLens } from '../useLens';
import type { K } from '../../i18n';
import type { NodeChipKind } from '../logic/evidence';
import type { WorldNode } from '../types';

export const NODE_ICON: Readonly<Record<string, IconName>> = {
  'retail-tower': 'layers', khepri: 'cube', 'stock-sync': 'bolt', pos: 'grid', inventory: 'db', github: 'code', jira: 'board',
  sentry: 'radar', port: 'book', 'seshat-bi': 'chart',
};
export const PROV_ICON: Readonly<Record<Provider, IconName>> = {
  github: 'code', jira: 'board', sentry: 'radar', port: 'book', datadog: 'pulse', confluence: 'doc',
};
export const PROV_INITIAL: Readonly<Record<Provider, string>> = { github: 'G', jira: 'J', sentry: 'S', datadog: 'D', confluence: 'C', port: 'P' };

export const ND = (id: string): K => `map.nd.${id}` as K;
/** The overview description of a node. An authorized world may swap it for a generic one (see authorizedWorld). */
export const NL = (node: Pick<WorldNode, 'id' | 'descKey'>): K => (node.descKey ?? `map.nl.${node.id}`) as K;

/** The one status word a node chip shows, in sentence case. Unknown never reads as healthy. */
export function useChipText(): (k: NodeChipKind) => string {
  const { copy, t } = useLens();
  return (k) => {
    switch (k) {
      case 'check': return t('ns.checkFailing');
      case 'healthy': return copy.health.healthy;
      case 'degraded': return copy.health.degraded;
      case 'down': return copy.health.down;
      case 'unavailable': return t('bc.chip.unavailable');
      case 'notset': return t('bc.chip.notset');
      case 'stale': return t('chip.stale');
      default: return copy.health.unknown;
    }
  };
}

export interface StatusWords {
  readonly connectivity: (c: Connectivity) => string;
  readonly freshness: (f: Freshness) => string;
  readonly health: (h: Health) => string;
}

/** Sentence-case words for the three source axes. They are kept apart and never combined. */
export function useStatusWords(): StatusWords {
  const { copy, t } = useLens();
  return {
    connectivity: (c) => t(`obs.c.${c}` as K),
    freshness: (f) => (f === 'current' ? t('bc.f.current') : f === 'stale' ? t('chip.stale') : t('unknown')),
    health: (h) => (h === 'unknown' ? t('unknown') : copy.health[h]),
  };
}
