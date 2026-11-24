// Screen D. Agent Flight Deck: oversight of SIMULATED agents. Everything here is fixture data. There is no approval,
// execution, deployment or write control anywhere: proposals are text a person reads.
import { useState } from 'react';
import { EvidenceItem } from '../components/evidence';
import { Icon, type IconName } from '../components/Icon';
import { Age, Cosmos, Kpi, Lt, Panel, T, ToneChip, TruthChip, Tx } from '../components/ui';
import { useLens } from '../useLens';
import { WORLD } from '../fixtures/world';
import type { K } from '../../i18n';
import { authorizedWorld } from '../logic/authorize';
import { STATUS_ORDER, deckCounts, filterMissions } from '../logic/deck';
import { evidenceOf } from '../logic/evidence';
import { hhmm, sourceCounts, sourceStatus, type Tone } from '../logic/status';
import type { AgentStatus, Mission, MissionKind } from '../types';

const STATUS_TONE: Readonly<Record<AgentStatus, Tone>> = { observing: 'ok', analyzing: 'warn', drafting: 'unk', waiting_review: 'warn', idle: 'unk' };
const HUMAN_TONE = { monitoring: 'unk', reviewing: 'ok', needs_review: 'warn' } as const;
const statusKey = (s: AgentStatus): K => `deck.st.${s}` as K;
const SECTIONS = [
  { id: 'fleet', key: 'deck.jump.fleet' },
  { id: 'activity', key: 'deck.jump.activity' },
  { id: 'mission', key: 'deck.jump.mission' },
  { id: 'caps', key: 'deck.jump.cap' },
  { id: 'oversight', key: 'deck.jump.oversight' },
  { id: 'audit', key: 'deck.jump.audit' },
] as const satisfies readonly { id: string; key: K }[];

const SATS: readonly { readonly id: string; readonly key: K; readonly icon: IconName; readonly agents: readonly string[] }[] = [
  { id: 'correlate', key: 'deck.sat.correlate', icon: 'network', agents: ['AG-3'] },
  { id: 'hypothesis', key: 'deck.sat.hypothesis', icon: 'bulb', agents: ['AG-4'] },
  { id: 'sense', key: 'deck.sat.sense', icon: 'chart', agents: ['AG-1', 'AG-2'] },
  { id: 'proposal', key: 'deck.sat.proposal', icon: 'doc', agents: ['AG-5'] },
];

/**
 * `embedded`: shown inside a host screen that already has the page's h1, so the title is an h2 and the pilot chip is left out.
 * A mission's `events` figure is shown as not defined, embedded or standalone: the fixture does not say what it counts (owner
 * decision, BACK-90), and a figure scoped by subtracting withheld references would differ by persona and so be a cue. The field itself
 * stays in the type and the fixture for now; its removal is a separate, audited change.
 */
export function AgentFlightDeck({ embedded = false }: { readonly embedded?: boolean } = {}) {
  const H = embedded ? 'h2' : 'h1';
  const { route, go, open, t, copy } = useLens();
  const w = authorizedWorld(WORLD, route.persona);
  const persona = route.persona;
  const showIds = persona !== 'nontechnical';
  const counts = deckCounts(w);
  const [agent, setAgent] = useState<string>('all');
  const [status, setStatus] = useState<AgentStatus | 'all'>('all');
  const [kind, setKind] = useState<MissionKind | 'all'>('all');
  const rows = filterMissions(w.missions, { agent, status }).filter((m) => kind === 'all' || m.kind === kind);
  const sel = w.missions.find((m) => m.id === route.msn) ?? w.missions[0]!;
  const agentOf = (m: Mission) => w.agents.find((a) => a.id === m.agent)!;
  const srcStatuses = w.sources.map((s) => sourceStatus(s, w.now));
  const sc = sourceCounts(srcStatuses);
  const review = w.missions.filter((m) => m.human === 'needs_review');
  const reviewing = w.missions.filter((m) => m.human === 'reviewing');
  const proposals = w.missions.filter((m) => m.kind === 'proposal').length;
  const byKind = (k: MissionKind) => w.missions.filter((m) => m.kind === k).length;

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    document.getElementById(`${id}-h`)?.focus({ preventScroll: true });
  };

  const satStatus = (agents: readonly string[]): AgentStatus => {
    const m = w.missions.find((x) => agents.includes(x.agent));
    return m ? m.status : 'idle';
  };

  return (
    <div className="kv2-screen kv2-deck">
      <div className="kv2-col-main">
        <header className="kv2-head">
          <div className="kv2-head-title">
            <p className="kv2-eyebrow"><T k="deck.eyebrow" /></p>
            <H><T k="nav.deck" />{!embedded && <span className="kv2-chip kv2-chip-outline"><T k="map.concept" /></span>}</H>
            <p className="kv2-lede"><T k="deck.lede" /></p>
          </div>
          <div className="kv2-kpis">
            <Kpi icon="agent" value={counts.agents} label={<T k="deck.kpi.agents" />} />
            <Kpi icon="layers" value={counts.active} label={<T k="deck.kpi.active" />} />
            <Kpi icon="alert" value={counts.needsReview} label={<T k="deck.kpi.review" />} tone="warn" id="kpi-review" />
            <Kpi icon="doc" value={proposals} label={<T k="deck.kpi.proposals" />} />
          </div>
        </header>

        <p className="kv2-sim" role="note"><Icon name="info" size={16} /><T k="sim.banner" /></p>

        <div className="kv2-jump" role="group" aria-label={t('deck.jump.label')}>
          {SECTIONS.map((s) => <button key={s.id} type="button" onClick={() => jump(s.id)}><T k={s.key} /></button>)}
        </div>

        <Panel id="fleet" className="kv2-fleet" title={t('deck.fleet')} sub={t('deck.fleet.sub')} icon="agent">
          <Cosmos horizon={false} />
          <div className="kv2-fleet-body">
            <div className="kv2-fleet-count">
              <p><T k="deck.fleet.n" /></p>
              <strong data-testid="active-missions">{counts.active}</strong>
              <ul>
                {STATUS_ORDER.filter((s) => counts.byStatus[s] > 0).map((s) => (
                  <li key={s} data-tone={STATUS_TONE[s]}><i aria-hidden="true" /><b>{counts.byStatus[s]}</b><span><T k={statusKey(s)} /></span></li>
                ))}
              </ul>
            </div>
            <div className="kv2-fleet-orbit" data-testid="fleet-orbit">
              <i className="kv2-ring-a" aria-hidden="true" />
              <i className="kv2-ring-b" aria-hidden="true" />
              <div className="kv2-core"><span><Icon name="layers" size={40} /></span><b><T k="deck.core" /></b><small><T k="deck.core.sub" /> <Lt>Retail Tower OS</Lt></small></div>
              {SATS.map((s) => {
                const st = satStatus(s.agents);
                return (
                  <div key={s.id} className="kv2-sat" data-sat={s.id} data-tone={STATUS_TONE[st]}>
                    <span className="kv2-sat-orb"><Icon name={s.icon} size={22} /></span>
                    <b><T k={s.key} /></b>
                    <ToneChip tone={STATUS_TONE[st]}><T k={statusKey(st)} /></ToneChip>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel id="activity" title={t('deck.activity')} sub={t('deck.activity.sub')} icon="pulse">
          <div className="kv2-filters">
            <label className="kv2-select"><span><T k="deck.f.agent" /></span>
              <select value={agent} onChange={(e) => setAgent(e.target.value)}>
                <option value="all">{t('deck.f.all.agents')}</option>
                {w.agents.map((a) => <option key={a.id} value={a.id}>{t(a.key as K)}</option>)}
              </select><Icon name="chevron" size={14} />
            </label>
            <label className="kv2-select"><span><T k="deck.f.status" /></span>
              <select value={status} onChange={(e) => setStatus(e.target.value as AgentStatus | 'all')}>
                <option value="all">{t('deck.f.all.status')}</option>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{t(statusKey(s))}</option>)}
              </select><Icon name="chevron" size={14} />
            </label>
            <label className="kv2-select"><span><T k="deck.f.kind" /></span>
              <select value={kind} onChange={(e) => setKind(e.target.value as MissionKind | 'all')}>
                <option value="all">{t('deck.f.all.kind')}</option>
                <option value="sensing">{t('deck.q.sensing')}</option>
                <option value="analysis">{t('deck.q.analysis')}</option>
                <option value="proposal">{t('deck.q.proposal')}</option>
              </select><Icon name="chevron" size={14} />
            </label>
          </div>
          <div className="kv2-table-wrap" tabIndex={0} role="region" aria-label={t('deck.cap.mission')}>
            <table className="kv2-table kv2-missions">
              <caption className="kv2-sr"><T k="deck.cap.mission" /></caption>
              <thead>
                <tr>
                  <th scope="col"><T k="deck.th.mission" /></th><th scope="col"><T k="deck.th.status" /></th>
                  <th scope="col"><T k="deck.th.focus" /></th><th scope="col"><T k="deck.th.basis" /></th><th scope="col"><T k="deck.th.human" /></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} data-selected={sel.id === m.id || undefined} data-human={m.human}>
                    <th scope="row">
                      <button type="button" aria-pressed={sel.id === m.id} onClick={() => go({ msn: m.id })}><T k={m.key as K} /></button>
                      <small><T k={agentOf(m).key as K} />{showIds && <> <Lt>{m.id}</Lt></>}</small>
                    </th>
                    <td><ToneChip tone={STATUS_TONE[m.status]}><T k={statusKey(m.status)} /></ToneChip></td>
                    <td className="kv2-focus"><T k={`${m.key}.focus` as K} /></td>
                    <td><TruthChip label={m.label} /></td>
                    <td><ToneChip tone={HUMAN_TONE[m.human]}><T k={`deck.h.${m.human}` as K} /></ToneChip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="kv2-empty"><T k="deck.none" /></p>}
          <p className="kv2-foot"><T k="deck.showing" v={{ n: rows.length, of: w.missions.length }} /> <T k="deck.updated" v={{ c: `{${hhmm(w.now)}}` }} /></p>
        </Panel>

        <Panel id="mission" title={t('deck.md')} icon="target" actions={showIds ? <Lt>{sel.id}</Lt> : undefined}>
          <div className="kv2-md">
            <div className="kv2-md-main">
              <h3><T k={sel.key as K} /></h3>
              <p className="kv2-md-focus"><T k={`${sel.key}.focus` as K} /></p>
              <dl className="kv2-md-grid">
                <div><dt><T k="deck.md.agent" /></dt><dd><T k={agentOf(sel).key as K} /></dd></div>
                <div><dt><T k="deck.th.status" /></dt><dd><ToneChip tone={STATUS_TONE[sel.status]}><T k={statusKey(sel.status)} /></ToneChip></dd></div>
                <div><dt><T k="deck.md.started" /></dt><dd><Age minutes={sel.startedMinutesAgo} /></dd></div>
                <div><dt><T k="deck.md.events" /></dt><dd><T k="deck.md.events.unknown" /></dd></div>
                <div><dt><T k="deck.md.human" /></dt><dd><ToneChip tone={HUMAN_TONE[sel.human]}><T k={`deck.h.${sel.human}` as K} /></ToneChip></dd></div>
                <div><dt><T k="deck.th.basis" /></dt><dd><TruthChip label={sel.label} /></dd></div>
              </dl>
            </div>
            <div className="kv2-md-side">
              <h4><T k="deck.md.evidence" /></h4>
              <ul className="kv2-ev-list">{evidenceOf(w, sel.evidence).map((e) => <li key={e.id}><EvidenceItem evidence={e} /></li>)}</ul>
              <div className="kv2-prop" data-testid="deck-proposal" data-has={sel.kind === 'proposal' || undefined}>
                <p className="kv2-prop-k"><T k="deck.prop.title" /><span className="kv2-chip" data-truth="proposed"><Icon name="doc" size={11} /><T k="deck.prop.badge" /></span></p>
                {sel.kind === 'proposal' ? <p><Tx s={copy.proposal[persona]} /></p> : <p className="kv2-muted"><T k="deck.prop.none" /></p>}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="kv2-deck-side">
        <Panel id="queues" title={t('deck.q')} sub={t('deck.q.sub')} icon="layers">
          <ul className="kv2-queues">
            {(['sensing', 'analysis', 'proposal'] as const).map((k) => (
              <li key={k}>
                <button type="button" aria-pressed={kind === k} onClick={() => setKind(kind === k ? 'all' : k)}>
                  <Icon name={k === 'sensing' ? 'chart' : k === 'analysis' ? 'bulb' : 'doc'} size={18} />
                  <span><T k={`deck.q.${k}` as K} /></span><b>{byKind(k)}</b><Icon name="chevron" size={14} className="kv2-ev-go" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel id="oversight" title={t('deck.o')} sub={t('deck.o.sub')} icon="users">
          <div className="kv2-stat3">
            <div data-tone="warn"><strong>{counts.needsReview}</strong><span><T k="deck.h.needs_review" /></span></div>
            <div><strong>{counts.reviewing}</strong><span><T k="deck.h.reviewing" /></span></div>
            <div><strong>{counts.monitoring}</strong><span><T k="deck.h.monitoring" /></span></div>
          </div>
          {review.length + reviewing.length === 0 ? <p className="kv2-empty"><T k="deck.o.none" /></p> : (
            <ul className="kv2-ovr">
              {[...review, ...reviewing].map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => go({ msn: m.id })}><Icon name="doc" size={16} /><span><T k={m.key as K} />{showIds && <small><Lt>{m.id}</Lt></small>}</span><Icon name="chevron" size={14} className="kv2-ev-go" /></button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="caps" title={t('deck.cap')} sub={t('deck.cap.sub')} icon="shield">
          <ul className="kv2-caps">
            <li data-tone="warn"><b><T k="deck.cap.sense" /></b><ToneChip tone="warn"><T k="deck.cs.limited" /></ToneChip><small><T k="deck.cap.sense.n" v={{ n: sc.reachable.n, of: sc.reachable.of }} /></small></li>
            <li><b><T k="deck.cap.correlate" /></b><ToneChip tone="ok"><T k="deck.cs.available" /></ToneChip><small><T k="deck.cap.correlate.n" /></small></li>
            <li><b><T k="deck.cap.hypothesize" /></b><ToneChip tone="ok"><T k="deck.cs.available" /></ToneChip><small><T k="deck.cap.hypothesize.n" /></small></li>
            <li><b><T k="deck.cap.propose" /></b><ToneChip tone="unk"><T k="deck.cs.display" /></ToneChip><small><T k="deck.cap.propose.n" /></small></li>
            <li><b><T k="deck.cap.write" /></b><ToneChip tone="unk" icon="lock"><T k="deck.cs.none" /></ToneChip><small><T k="deck.cap.write.n" /></small></li>
          </ul>
        </Panel>

        <Panel id="audit" title={t('deck.audit')} sub={t('deck.audit.sub')} icon="shield">
          <div className="kv2-stat3 kv2-stat2">
            <div><strong>{w.sources.length}</strong><span><T k="deck.audit.sources" /></span></div>
            <div><strong>{w.replay.length}</strong><span><T k="deck.audit.events" /></span></div>
          </div>
          <p className="kv2-insp-sub"><T k="deck.audit.basis" /></p>
          <button type="button" className="kv2-btn" onClick={() => open('mission-replay')}><Icon name="play" size={15} /><T k="deck.audit.open" /></button>
        </Panel>
      </div>

      <section className="kv2-panel kv2-insight" aria-labelledby="insight-h">
        <span className="kv2-insight-icon"><Icon name="bolt" size={26} /></span>
        <h2 id="insight-h"><T k="deck.insight" /></h2>
        <p><T k="deck.insight.text" /></p>
      </section>
    </div>
  );
}
