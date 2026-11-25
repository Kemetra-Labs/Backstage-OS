// Legend, orbit key, the three source readings, and the signal timeline of the B+C pilot.
import { Icon } from '../components/Icon';
import { Provider_, T } from '../components/ui';
import { useLens } from '../useLens';
import type { K } from '../../i18n';
import { bcFigures, formatAt, type Axis } from '../logic/bc';
import { sourceStatus } from '../logic/status';
import type { World } from '../../contract/world';
import { Pips } from './atoms';

/** A swatch drawn in CSS (a line pattern and a marker shape), so the legend adds no SVG nodes to the screen. */
const Swatch = ({ truth }: { readonly truth: string }) => <i className="kv2-bc-lg" data-t={truth} aria-hidden="true" />;

/** How we know a link, drawn the way the map draws it: pattern and marker shape, not colour alone. */
export function Legend() {
  const { copy, t } = useLens();
  return (
    <ul className="kv2-bc-legend" aria-label={t('map.legend.title')}>
      <li><Swatch truth="observed" />{copy.label.observed}</li>
      <li><Swatch truth="correlated" />{copy.label.correlated}</li>
      <li><Swatch truth="hypothesis" />{copy.label.hypothesis}</li>
      <li><Swatch truth="unknown" />{copy.label.unknown}</li>
      <li><Swatch truth="stale" />{t('bc.legend.stale')}</li>
      <li><Swatch truth="group" />{t('bc.legend.group')}</li>
      <li><i className="kv2-bc-rk" aria-hidden="true" />{t('bc.legend.ring')}</li>
    </ul>
  );
}

/** States that orbit is the kind of system, not importance, and how many of each there are (counts of nodes by kind). */
export function OrbitKey({ w }: { readonly w: World }) {
  const { t } = useLens();
  const f = bcFigures(w);
  const items: ReadonlyArray<readonly [K, K, number]> = [
    ['bc.orbit.inner', 'map.f.products', f.products],
    ['bc.orbit.middle', 'map.f.projects', f.projects],
    ['bc.orbit.outer', 'map.f.services', f.services],
  ];
  return (
    <p className="kv2-bc-orbitkey">
      <span>{t('bc.orbit.sub')}:</span>
      {items.map(([orbit, kind, n]) => <span key={orbit}>{t(orbit)}: <b>{t(kind)} {n}</b></span>)}
    </p>
  );
}

/** The three readings as three independent counters with one pip per source. There is deliberately no combined figure. */
export function ReadingsPanel({ w }: { readonly w: World }) {
  const { t } = useLens();
  const f = bcFigures(w);
  const statuses = w.sources.map((s) => sourceStatus(s, w.now));
  const rows: ReadonlyArray<{ readonly axis: Axis; readonly head: K; readonly unit: K; readonly n: number; readonly sub: string; readonly icon: 'pulse' | 'clock' | 'target' }> = [
    { axis: 'connectivity', head: 'obs.read.conn', unit: 'obs.pin.conn.unit', n: f.reachable.n, sub: t('obs.pin.conn.sub', { u: f.unavailable, c: f.notSet }), icon: 'pulse' },
    { axis: 'freshness', head: 'obs.read.fresh', unit: 'obs.pin.fresh.unit', n: f.current.n, sub: t('obs.pin.fresh.sub', { s: f.stale, k: f.notSet }), icon: 'clock' },
    { axis: 'health', head: 'obs.read.health', unit: 'obs.pin.health.unit', n: f.healthy.n, sub: t('obs.pin.health.sub', { n: f.sourceTotal - f.healthy.n }), icon: 'target' },
  ];
  return (
    <section className="kv2-bc-readings" aria-label={t('bc.readings.label', { n: f.sourceTotal })} data-testid="bc-readings">
      <h2><Icon name="target" size={15} /><T k="obs.readings" /><small><T k="obs.readings.sub" /></small></h2>
      {rows.map((r) => (
        <div key={r.axis} className="kv2-bc-read" data-axis={r.axis}>
          <div className="kv2-bc-read-h"><Icon name={r.icon} size={15} /><span><T k={r.head} /></span></div>
          <div className="kv2-bc-read-n"><strong>{r.n}</strong>{' '}<span>{t('bc.of', { of: f.sourceTotal, unit: t(r.unit) })}</span></div>
          <Pips axis={r.axis} statuses={statuses} />
          <small>{r.sub}</small>
        </div>
      ))}
    </section>
  );
}

/** The six source events in order, not to time scale. Marker tone and fill carry the event's tone. */
export function Timeline({ w }: { readonly w: World }) {
  const { route } = useLens();
  return (
    <section className="kv2-bc-tl" aria-labelledby="bc-tl-h" data-testid="bc-timeline">
      <h2 id="bc-tl-h"><Icon name="clock" size={15} /><T k="obs.tl" /><small><T k="bc.tl.sub" /></small></h2>
      <ol>
        {w.sourceTimeline.map((e) => (
          <li key={e.id} data-tone={e.tone}>
            <i aria-hidden="true" />
            <time className="kv2-ltr" dateTime={e.at}>{formatAt(e.at, w.now, route.lang)}</time>
            <b><Provider_ p={e.provider} /></b>
            <span><T k={e.key as K} /></span>
          </li>
        ))}
      </ol>
    </section>
  );
}
