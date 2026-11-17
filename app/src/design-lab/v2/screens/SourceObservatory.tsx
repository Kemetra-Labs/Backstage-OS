// Screen B. Source Observatory: connectivity, evidence freshness and target health, shown as three independent readings.
import { useMemo, useState } from 'react';
import type { Provider } from '../../../contract/types';
import { EvidenceItem } from '../components/evidence';
import { Icon, type IconName } from '../components/Icon';
import { Age, Cosmos, Kpi, Lt, Panel, Provider_, Seg, T, TabBar, ToneChip } from '../components/ui';
import { useV2 } from '../context';
import { WORLD } from '../fixtures/world';
import type { K } from '../i18n/t';
import { evidenceOf } from '../logic/evidence';
import { hhmm, sourceCounts, sourceStatus, type SourceStatus, type Tone } from '../logic/status';
import type { SourceAxis, SourceEvent, SourceKind, SourceMeta } from '../types';

const ICON: Readonly<Record<Provider, IconName>> = { github: 'code', jira: 'board', sentry: 'radar', datadog: 'pulse', confluence: 'book', port: 'db' };
type KindFilter = 'all' | SourceKind;
type AxisFilter = 'all' | SourceAxis;
type Tab = 'details' | 'evidence' | 'provenance';

const connTone = (s: SourceStatus): Tone => (s.connectivity === 'reachable' ? 'ok' : s.connectivity === 'unavailable' ? 'bad' : 'unk');
const freshTone = (s: SourceStatus): Tone => (s.freshness === 'current' ? 'ok' : s.freshness === 'stale' ? 'warn' : 'unk');
const healthTone = (s: SourceStatus): Tone => (s.health === 'healthy' ? 'ok' : s.health === 'degraded' ? 'warn' : s.health === 'down' ? 'bad' : 'unk');

function Ring({ s }: { readonly s: SourceStatus }) {
  const { t } = useV2();
  const r = 19;
  const c = 2 * Math.PI * r;
  const none = s.ageMinutes === null;
  const frac = none ? 0 : Math.min(1, s.used);
  return (
    <span className="kv2-ring" data-tone={none ? 'unk' : s.used > 1 ? 'warn' : 'ok'}>
      <svg viewBox="0 0 48 48" width="52" height="52" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r={r} className="kv2-ring-bg" />
        <circle cx="24" cy="24" r={r} className="kv2-ring-fg" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 24 24)" />
      </svg>
      <span className="kv2-ring-label">
        {none ? <small>{t('obs.ring.none')}</small> : <><b>{s.ageMinutes! >= 60 ? Math.round(s.ageMinutes! / 60) : s.ageMinutes}</b>{s.ageMinutes! >= 60 ? t('obs.unit.h') : t('obs.unit.min')}</>}
      </span>
    </span>
  );
}

function ReadRow({ icon, label, tone, children }: { readonly icon: IconName; readonly label: string; readonly tone: Tone; readonly children: React.ReactNode }) {
  return (
    <li data-tone={tone}>
      <span className="kv2-read-label"><Icon name={icon} size={15} />{label}</span>
      <span className="kv2-read-val"><i aria-hidden="true" />{children}</span>
    </li>
  );
}

function SourceCard({ m, s, selected, onSelect }: { readonly m: SourceMeta; readonly s: SourceStatus; readonly selected: boolean; readonly onSelect: () => void }) {
  const { t, copy } = useV2();
  const chip: { tone: Tone; text: string } =
    s.connectivity === 'unavailable' ? { tone: 'bad', text: copy.connectivity.unavailable }
      : s.connectivity === 'not_configured' ? { tone: 'unk', text: copy.connectivity.not_configured }
        : s.freshness === 'stale' ? { tone: 'warn', text: t('chip.stale') } : { tone: 'ok', text: copy.connectivity.reachable };
  return (
    <button type="button" className="kv2-scard" aria-pressed={selected} onClick={onSelect} data-provider={m.provider} data-conn={s.connectivity} data-fresh={s.freshness} data-health={s.health}>
      <span className="kv2-scard-top">
        <span className="kv2-scard-icon"><Icon name={ICON[m.provider]} size={24} /></span>
        <span className="kv2-scard-name"><b><Provider_ p={m.provider} /></b><ToneChip tone={chip.tone}>{chip.text}</ToneChip></span>
        <Ring s={s} />
      </span>
      <ul className="kv2-reads">
        <ReadRow icon="link" label={t('obs.card.conn')} tone={connTone(s)}>{t(`obs.c.${s.connectivity}` as K)}</ReadRow>
        <ReadRow icon="layers" label={t('obs.card.fresh')} tone={freshTone(s)}><Age minutes={s.ageMinutes} /></ReadRow>
        <ReadRow icon="pulse" label={t('obs.card.health')} tone={healthTone(s)}>{copy.health[s.health]}</ReadRow>
      </ul>
    </button>
  );
}

function Pin({ icon, name, n, of, unit, sub }: { readonly icon: IconName; readonly name: string; readonly n: number; readonly of: number; readonly unit: string; readonly sub: React.ReactNode }) {
  const { t } = useV2();
  return (
    <div className="kv2-pin">
      <span className="kv2-pin-head"><i><Icon name={icon} size={22} /></i><span className="kv2-pin-stem" aria-hidden="true" /></span>
      <span className="kv2-pin-text">
        <span className="kv2-pin-name">{name}</span>
        <strong>{t('map.m.sources.of', { n, of })}</strong>
        <span>{unit}</span>
        <small>{sub}</small>
      </span>
    </div>
  );
}

const AXIS_KEY: Readonly<Record<AxisFilter, K>> = { all: 'obs.tl.f.all', connectivity: 'obs.tl.f.conn', freshness: 'obs.tl.f.fresh', health: 'obs.tl.f.health', incident: 'obs.tl.f.inc' };
const AXES: readonly AxisFilter[] = ['all', 'connectivity', 'freshness', 'health', 'incident'];

export function SourceObservatory() {
  const { route, go, t, copy } = useV2();
  const w = WORLD;
  const [kind, setKind] = useState<KindFilter>('all');
  const [axis, setAxis] = useState<AxisFilter>('all');
  const [mode, setMode] = useState<'cards' | 'table'>('cards');
  const [tab, setTab] = useState<Tab>('details');
  const statuses = useMemo(() => w.sources.map((m) => ({ m, s: sourceStatus(m, w.now) })), [w]);
  const counts = sourceCounts(statuses.map((x) => x.s));
  const visible = statuses.filter((x) => kind === 'all' || x.m.kind === kind);
  const sel = statuses.find((x) => x.m.provider === route.src) ?? statuses[0]!;
  const unreadFresh = statuses.filter((x) => x.s.freshness === 'unknown').length;
  const stale = statuses.filter((x) => x.s.freshness === 'stale').length;
  const unavailable = statuses.filter((x) => x.s.connectivity === 'unavailable').length;
  const notSet = statuses.filter((x) => x.s.connectivity === 'not_configured').length;
  const events = [...w.sourceEvents].sort((a, b) => a.at.localeCompare(b.at));
  const shown = events.filter((e) => axis === 'all' || e.axis === axis);
  const countOf = (a: AxisFilter) => (a === 'all' ? events.length : events.filter((e) => e.axis === a).length);
  const select = (p: Provider) => go({ src: p });

  return (
    <div className="kv2-screen kv2-obs">
      <div className="kv2-col-main">
        <header className="kv2-head">
          <div className="kv2-head-title">
            <p className="kv2-eyebrow"><T k="obs.eyebrow" /></p>
            <h1><T k="nav.obs" /><span className="kv2-chip kv2-chip-outline"><T k="map.concept" /></span></h1>
            <p className="kv2-lede"><T k="obs.lede" /></p>
          </div>
          <div className="kv2-kpis">
            <Kpi icon="db" value={statuses.length} label={<T k="obs.kpi.sources" />} />
            <Kpi icon="link" value={statuses.filter((x) => x.m.kind === 'integration').length} label={<T k="obs.kpi.integrations" />} />
            <Kpi icon="alert" value={counts.issues} label={<T k="obs.kpi.issues" />} tone="warn" id="kpi-issues" />
          </div>
        </header>

        <div className="kv2-toolbar">
          <Seg
            label={t('obs.f.label')}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: t('obs.f.all'), count: statuses.length },
              { value: 'integration', label: t('obs.f.integrations'), count: statuses.filter((x) => x.m.kind === 'integration').length },
              { value: 'data', label: t('obs.f.data'), count: statuses.filter((x) => x.m.kind === 'data').length },
            ]}
          />
          <p className="kv2-scope-note"><T k="scope.title" />: <Lt>Retail Tower OS</Lt></p>
        </div>

        <Panel id="posture" className="kv2-posture" title={t('obs.posture')} sub={t('obs.posture.sub')} icon="radar">
          <Cosmos />
          <div className="kv2-pins">
            <Pin icon="link" name={t('obs.pin.conn')} n={counts.reachable.n} of={counts.reachable.of} unit={t('obs.pin.conn.unit')} sub={t('obs.pin.conn.sub', { u: unavailable, c: notSet })} />
            <Pin icon="layers" name={t('obs.pin.fresh')} n={counts.current.n} of={counts.current.of} unit={t('obs.pin.fresh.unit')} sub={t('obs.pin.fresh.sub', { s: stale, k: unreadFresh })} />
            <Pin icon="pulse" name={t('obs.pin.health')} n={counts.healthy.n} of={counts.healthy.of} unit={t('obs.pin.health.unit')} sub={t('obs.pin.health.sub', { n: statuses.length - counts.healthy.n })} />
          </div>
        </Panel>

        <Panel
          id="sources"
          title={t('obs.list')}
          sub={t('obs.list.sub')}
          icon="layers"
          actions={<Seg label={t('map.view.label')} value={mode} onChange={setMode} options={[{ value: 'cards', label: t('view.cards'), icon: 'grid' }, { value: 'table', label: t('view.table'), icon: 'list' }]} />}
        >
          {mode === 'cards' ? (
            <div className="kv2-scards">
              {visible.map(({ m, s }) => <SourceCard key={m.provider} m={m} s={s} selected={sel.m.provider === m.provider} onSelect={() => select(m.provider)} />)}
            </div>
          ) : (
            <div className="kv2-table-wrap" tabIndex={0} role="region" aria-label={t('obs.cap')}>
              <table className="kv2-table">
                <caption className="kv2-sr"><T k="obs.cap" /></caption>
                <thead>
                  <tr>
                    <th scope="col"><T k="obs.th.source" /></th><th scope="col"><T k="obs.th.kind" /></th><th scope="col"><T k="obs.card.conn" /></th>
                    <th scope="col"><T k="obs.card.fresh" /></th><th scope="col"><T k="obs.card.health" /></th><th scope="col"><T k="obs.th.read" /></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ m, s }) => (
                    <tr key={m.provider} data-selected={sel.m.provider === m.provider || undefined}>
                      <th scope="row"><button type="button" aria-pressed={sel.m.provider === m.provider} onClick={() => select(m.provider)}><Provider_ p={m.provider} /></button></th>
                      <td><T k={m.kind === 'integration' ? 'kind.integration' : 'kind.data'} /></td>
                      <td><ToneChip tone={connTone(s)}>{copy.connectivity[s.connectivity]}</ToneChip></td>
                      <td><ToneChip tone={freshTone(s)}>{copy.freshness[s.freshness]}</ToneChip></td>
                      <td><ToneChip tone={healthTone(s)}>{copy.health[s.health]}</ToneChip></td>
                      <td>{s.readAt ? <><Lt>{`${s.readAt.slice(5, 10)} ${hhmm(s.readAt)}`}</Lt> <Age minutes={s.ageMinutes} /></> : <T k="obs.last.never" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <aside className="kv2-panel kv2-inspector" aria-label={t('kind.source')} data-testid="inspector">
        <TabBar
          label={t('kind.source')}
          idPrefix="obsinsp"
          value={tab}
          onChange={setTab}
          options={[{ value: 'details', label: t('tab.details') }, { value: 'evidence', label: t('tab.evidence') }, { value: 'provenance', label: t('tab.provenance') }]}
        />
        <div role="tabpanel" id="obsinsp-panel" aria-labelledby={`obsinsp-tab-${tab}`} className="kv2-insp-body">
          <SourceInspector m={sel.m} s={sel.s} tab={tab} />
        </div>
      </aside>

      <section className="kv2-panel kv2-timeline" aria-labelledby="tl-h">
        <header className="kv2-panel-head">
          <span className="kv2-panel-icon"><Icon name="pulse" size={20} /></span>
          <div className="kv2-panel-titles">
            <h2 id="tl-h"><T k="obs.tl" /></h2>
            <p><T k="obs.tl.sub" /> <T k="obs.tl.window" v={{ a: `{${events[0]!.at.slice(5, 10)} ${hhmm(events[0]!.at)}}`, b: `{${w.now.slice(5, 10)} ${hhmm(w.now)}}` }} /></p>
          </div>
          <Seg
            label={t('obs.tl.f.label')}
            value={axis}
            onChange={setAxis}
            options={AXES.map((a) => ({ value: a, label: t(AXIS_KEY[a]), count: countOf(a) }))}
          />
        </header>
        {shown.length === 0 ? <p className="kv2-empty"><T k="obs.tl.empty" /></p> : (
          <ol className="kv2-tl">
            {shown.map((e: SourceEvent) => (
              <li key={e.id} data-tone={e.tone} data-selected={route.src === e.provider || undefined}>
                <time dateTime={e.at}><Lt>{`${e.at.slice(5, 10)} ${hhmm(e.at)}`}</Lt></time>
                <i className="kv2-tl-dot" aria-hidden="true" />
                <button type="button" className="kv2-tl-card" onClick={() => select(e.provider)} aria-pressed={route.src === e.provider}>
                  <Icon name={e.tone === 'ok' ? 'check' : e.tone === 'warn' ? 'alert' : 'info'} size={20} />
                  <span><b><Provider_ p={e.provider} /></b><small><T k={e.key as K} /></small></span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function SourceInspector({ m, s, tab }: { readonly m: SourceMeta; readonly s: SourceStatus; readonly tab: Tab }) {
  const { t, copy } = useV2();
  const w = WORLD;
  const head = (
    <header className="kv2-insp-head">
      <span className="kv2-orb" data-tone={s.connectivity === 'unavailable' ? 'bad' : s.freshness === 'stale' ? 'warn' : 'ok'}><Icon name={ICON[m.provider]} size={28} /></span>
      <div>
        <h2 aria-live="polite"><Provider_ p={m.provider} /></h2>
        <p><T k={m.kind === 'integration' ? 'kind.integration' : 'kind.data'} /></p>
        <ToneChip tone={connTone(s)}>{copy.connectivity[s.connectivity]}</ToneChip>
      </div>
    </header>
  );
  const prov = (
    <dl className="kv2-prov">
      <div><dt><T k="obs.prov.type" /></dt><dd><T k={m.kind === 'integration' ? 'kind.integration' : 'kind.data'} /></dd></div>
      <div><dt><T k="obs.prov.scope" /></dt><dd><T k={`obs.scope.${m.provider}` as K} /></dd></div>
      <div><dt><T k="obs.prov.target" /></dt><dd><Lt>{m.target}</Lt></dd></div>
      <div><dt><T k="obs.prov.owner" /></dt><dd><T k="obs.owner" /></dd></div>
      <div><dt><T k="obs.prov.data" /></dt><dd><T k="obs.prov.synth" /></dd></div>
    </dl>
  );

  if (tab === 'evidence') {
    const refs = evidenceOf(w, Object.keys(w.evidenceById)).filter((e) => e.observation?.source.provider === m.provider);
    return (
      <>
        {head}
        {refs.length === 0 ? <p className="kv2-empty"><T k="obs.ev.none" /></p> : <ul className="kv2-ev-list">{refs.map((r) => <li key={r.id}><EvidenceItem evidence={r} /></li>)}</ul>}
      </>
    );
  }
  if (tab === 'provenance') {
    return <>{head}<section className="kv2-insp-sec">{prov}</section></>;
  }
  return (
    <>
      {head}
      <p className="kv2-insp-desc"><T k={`obs.desc.${m.provider}` as K} /></p>
      <section className="kv2-insp-sec" aria-labelledby="rd-h">
        <h3 id="rd-h"><Icon name="layers" size={16} /><T k="obs.readings" /><small><T k="obs.readings.sub" /></small></h3>
        <ul className="kv2-reads kv2-reads-insp">
          <ReadRow icon="link" label={t('obs.read.conn')} tone={connTone(s)}>{t(`obs.c.${s.connectivity}` as K)}</ReadRow>
          <ReadRow icon="layers" label={t('obs.read.fresh')} tone={freshTone(s)}>{copy.freshness[s.freshness]}</ReadRow>
          <ReadRow icon="pulse" label={t('obs.read.health')} tone={healthTone(s)}>{copy.health[s.health]}</ReadRow>
        </ul>
        <p className="kv2-insp-sub"><T k="obs.read.health.why" /></p>
      </section>
      <div className="kv2-two">
        <div>
          <span><T k="obs.last" /></span>
          <strong>{s.ageMinutes === null ? <T k="obs.last.never" /> : <Age minutes={s.ageMinutes} />}</strong>
          {s.readAt && <small><Lt>{`${s.readAt.slice(5, 10)} ${hhmm(s.readAt)}`}</Lt></small>}
        </div>
        <div>
          <span><T k="obs.target" /></span>
          <strong><T k="obs.target.v" v={{ n: s.ttlMinutes }} /></strong>
          {s.ageMinutes !== null && <span className="kv2-bar" role="img" aria-label={t('obs.read.age', { a: s.ageMinutes, m: s.ttlMinutes })} data-over={s.used > 1 || undefined}><span style={{ inlineSize: `${Math.min(1, s.used) * 100}%` }} /></span>}
        </div>
      </div>
      <section className="kv2-insp-sec" aria-labelledby="pv-h">
        <h3 id="pv-h"><Icon name="shield" size={16} /><T k="tab.provenance" /></h3>
        {prov}
      </section>
    </>
  );
}
