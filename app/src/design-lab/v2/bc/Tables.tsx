// C's accessible ledger, source-readings matrix and links table, shared by the pilot's List view.
// Same systems, sources and links as the map; selecting a row selects the node everywhere.
import { Icon } from '../components/Icon';
import { Lt, Provider_, T, TruthChip, Tx } from '../components/ui';
import { useV2 } from '../context';
import type { K } from '../i18n/t';
import { bcFigures, edgeRestricted, edgeStale } from '../logic/bc';
import { nodeChip } from '../logic/evidence';
import { sourceStatus } from '../logic/status';
import type { World } from '../types';
import { AgeBar, StatusChip } from './atoms';
import { NODE_ICON, PROV_ICON, useChipText, useStatusWords } from './shared';

const KINDS = ['product', 'project', 'service'] as const;

// Each table sits in a scrollable `role="region"` wrapper with tabIndex={0} on purpose: a scroll container that cannot take
// focus is unreachable by keyboard (WCAG 2.1.1). It is the same pattern V2's own list view uses. Static analysers flag
// tabIndex on a non-interactive element (Sonar S6845); here the region is the keyboard-scrollable control.

interface RowProps {
  readonly w: World;
  readonly active: ReadonlySet<string>;
}

/** One row per system, grouped products, projects, services. The row is a native button; kind is for assistive technology only. */
export function Ledger({ w, active, sel, onSelect }: RowProps & { readonly sel: string; readonly onSelect: (id: string) => void }) {
  const { t } = useV2();
  const chipText = useChipText();
  const rows = KINDS.flatMap((k) => w.nodes.filter((n) => n.kind === k && active.has(n.id)));
  return (
    <div className="kv2-table-wrap" tabIndex={0} role="region" aria-label={t('bc.ledger')}>
      <table className="kv2-table kv2-bc-ledger">
        <caption className="kv2-sr"><T k="bc.ledger" /></caption>
        <thead>
          <tr>
            <th scope="col"><T k="bc.th.system" /></th>
            <th scope="col"><T k="map.th.status" /></th>
            <th scope="col" className="kv2-bc-num"><T k="map.th.evidence" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3}><T k="bc.list.empty" /></td></tr>}
          {rows.map((n) => {
            const chip = nodeChip(n, w.sources);
            return (
              <tr key={n.id} data-kind={n.kind} data-selected={sel === n.id || undefined}>
                <th scope="row">
                  <button type="button" data-node={n.id} aria-pressed={sel === n.id} onClick={() => onSelect(n.id)}>
                    <span className="kv2-bc-mini" data-tone={chip.tone}><Icon name={NODE_ICON[n.id] ?? 'cube'} size={15} /></span>
                    <span><b><Lt>{n.title}</Lt></b><span className="kv2-sr">, <T k={`kind.${n.kind}` as K} /></span></span>
                  </button>
                </th>
                <td><StatusChip tone={chip.tone}><Tx s={chipText(chip.kind)} /></StatusChip></td>
                <td className="kv2-bc-num">{n.evidence.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One row per source (six, including the two with no node). The three column headings carry the three counters. */
export function Matrix({ w }: { readonly w: World }) {
  const { t } = useV2();
  const words = useStatusWords();
  const f = bcFigures(w);
  const rows = w.sources.map((s) => sourceStatus(s, w.now));
  const head = (key: K, n: number, unit: K) => (
    <th scope="col">
      <span className="kv2-bc-th"><T k={key} /></span>
      <span className="kv2-bc-count"><b>{n}</b> {t('bc.of', { of: f.sourceTotal, unit: t(unit) })}</span>
    </th>
  );
  const connTone = (c: string) => (c === 'reachable' ? 'ok' : c === 'unavailable' ? 'bad' : 'unk');
  const healthTone = (h: string) => (h === 'healthy' ? 'ok' : h === 'degraded' ? 'warn' : h === 'down' ? 'bad' : 'unk');
  return (
    <div className="kv2-table-wrap" tabIndex={0} role="region" aria-label={t('bc.matrix')}>
      <table className="kv2-table kv2-bc-matrix">
        <caption className="kv2-sr"><T k="bc.matrix" /></caption>
        <thead>
          <tr>
            <th scope="col"><span className="kv2-bc-th"><T k="obs.th.source" /></span></th>
            {head('obs.read.conn', f.reachable.n, 'obs.pin.conn.unit')}
            {head('obs.read.fresh', f.current.n, 'obs.pin.fresh.unit')}
            {head('obs.read.health', f.healthy.n, 'obs.pin.health.unit')}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.provider} data-source={s.provider} data-conn={s.connectivity} data-fresh={s.freshness}>
              <th scope="row"><span className="kv2-bc-prov"><Icon name={PROV_ICON[s.provider]} size={15} /><Provider_ p={s.provider} /></span></th>
              <td data-label={t('obs.read.conn')}><StatusChip tone={connTone(s.connectivity)}>{words.connectivity(s.connectivity)}</StatusChip></td>
              <td data-label={t('obs.read.fresh')}><AgeBar s={s} compact /></td>
              <td data-label={t('obs.read.health')}><StatusChip tone={healthTone(s.health)}>{words.health(s.health)}</StatusChip></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** From, To, how we know, and the basis. A stale link says so; restricted evidence reveals only that it exists. */
export function LinksTable({ w, active }: RowProps) {
  const { route, t } = useV2();
  const title = (id: string): string => w.nodes.find((n) => n.id === id)?.title ?? id;
  const edges = w.edges.filter((e) => active.has(e.a) && active.has(e.b));
  return (
    <div className="kv2-table-wrap" tabIndex={0} role="region" aria-label={t('map.cap.links')}>
      <table className="kv2-table kv2-bc-links">
        <caption className="kv2-sr"><T k="map.cap.links" /></caption>
        <thead>
          <tr>
            <th scope="col"><T k="map.th.from" /></th>
            <th scope="col"><T k="map.th.to" /></th>
            <th scope="col"><T k="map.th.how" /></th>
            <th scope="col"><T k="map.th.basis" /></th>
          </tr>
        </thead>
        <tbody>
          {edges.length === 0 && <tr><td colSpan={4}><T k="bc.links.empty" /></td></tr>}
          {edges.map((e) => (
            <tr key={e.id} data-link={e.id} data-truth={e.cls === 'group' ? 'group' : e.truth}>
              <td data-label={t('map.th.from')}><Lt>{title(e.a)}</Lt></td>
              <td data-label={t('map.th.to')}><Lt>{title(e.b)}</Lt></td>
              <td data-label={t('map.th.how')}>{e.cls === 'group' ? <StatusChip tone="unk"><T k="map.part" /></StatusChip> : <TruthChip label={e.truth} />}</td>
              <td data-label={t('map.th.basis')}>
                {edgeRestricted(e, route.persona, w) ? <T k="edge.restricted" /> : <T k={e.basisKey as K} />}
                {edgeStale(e, w) && <> <span className="kv2-chip" data-tone="warn" data-stale-chip>{t('chip.stale')}</span></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
