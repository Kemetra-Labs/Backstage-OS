// Screen C. Mission Replay: a deterministic, synthetic replay of INV-DEMO-7. Playback only moves a cursor over fixed
// events and changes what the screen shows. It executes nothing and calls no source or agent.
import { useEffect, useMemo, useRef, useState } from 'react';
import { INV_DEMO_7 } from '../../fixture/inv-demo-7';
import { EvidenceItem } from '../components/evidence';
import { Icon, type IconName } from '../components/Icon';
import { Cosmos, Kpi, Lt, Panel, Provider_, Seg, T, TabBar, ToneChip, TruthChip, Tx } from '../components/ui';
import { SourceRows } from '../components/SourceRows';
import { useLens } from '../useLens';
import { WORLD } from '../../fixture/world';
import { plain, type K } from '../../i18n';
import { authorizedWorld } from '../../view/authorize';
import { SPEEDS, STEP_MS, advance, gapsAt, indexAt, milestonesAt, msOfIndex, stageAt, totalMs, type Speed } from '../logic/replay';
import { sourceStatus } from '../logic/status';
import { STAGES, type ReplayEvent, type ReplayStage } from '../../contract/world';

const STAGE_ICON: Readonly<Record<ReplayStage, IconName>> = { observed: 'eye', ingested: 'layers', correlated: 'network', hypothesis: 'bulb', proposed: 'doc' };
const STAGE_KEY: Readonly<Record<ReplayStage, K>> = {
  observed: 'rp.st.observed', ingested: 'rp.st.ingested', correlated: 'rp.st.correlated', hypothesis: 'rp.st.hypothesis', proposed: 'rp.st.proposed',
};
const MS_KEY = { signal: 'rp.ms.signal', evidence: 'rp.ms.evidence', validate: 'rp.ms.validate', decide: 'rp.ms.decide', close: 'rp.ms.close' } as const satisfies Record<string, K>;
const rank = (s: ReplayStage) => STAGES.indexOf(s);
type InspTab = 'evidence' | 'context' | 'history';
type HoldTab = 'cor' | 'hyp' | 'gap';

/** `embedded`: shown inside a host screen that already has the page's h1, so the title is an h2 and the pilot chip is left out. */
export function MissionReplay({ embedded = false }: { readonly embedded?: boolean } = {}) {
  const H = embedded ? 'h2' : 'h1';
  const { route, go, t, copy } = useLens();
  const w = authorizedWorld(WORLD, route.persona);
  const events = w.replay;
  const n = events.length;
  const persona = route.persona;
  // The investigation's evidence, as far as this persona may read it. The count, the list and the gap total all come from this one
  // list, so a withheld record is never counted or listed (BACK-66).
  const readable = useMemo(() => INV_DEMO_7.evidence.filter((e) => w.evidence[e.id] !== undefined), [w]);

  const startIdx = Math.max(0, events.findIndex((e) => e.id === route.evt));
  const [ms, setMs] = useState(() => msOfIndex(route.evt ? startIdx : 5));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [tab, setTab] = useState<InspTab>('evidence');
  const [hold, setHold] = useState<HoldTab>('cor');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const msRef = useRef(ms);
  msRef.current = ms;
  // The last event id this screen wrote to the URL, so an outside change of evt can be told from our own.
  const written = useRef<string | null>(route.evt);

  const idx = indexAt(ms, events);
  const ev = events[idx] as ReplayEvent;
  const stage = stageAt(idx, events);

  // Virtual clock: 100 ms ticks advance the cursor by speed x 100 replay-ms. Pure view state.
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      const r = advance(msRef.current, 100, speed, events);
      setMs(r.ms);
      if (r.ended) setPlaying(false);
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, speed, events]);

  // Keep the URL in step with the event the cursor is on, without adding history entries.
  useEffect(() => {
    if (route.evt !== ev.id) { written.current = ev.id; go({ evt: ev.id }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  // An outside change of evt (search result, shared link) moves the cursor.
  useEffect(() => {
    if (!route.evt || route.evt === written.current) return;
    const i = events.findIndex((e) => e.id === route.evt);
    if (i < 0) return;
    written.current = route.evt;
    setPlaying(false);
    setMs(msOfIndex(i));
  }, [route.evt, events]);

  const jump = (i: number) => { setPlaying(false); setMs(msOfIndex(Math.min(n - 1, Math.max(0, i)))); };
  const restart = () => { setMs(0); setPlaying(true); };
  const atEnd = ms >= totalMs(events);
  const togglePlay = () => { if (atEnd) setMs(0); setPlaying((p) => !p); };

  const firstOf = (s: ReplayStage) => events.findIndex((e) => e.stage === s);
  const gaps = gapsAt(idx, events);
  const milestones = useMemo(() => milestonesAt(idx, events), [idx, events]);
  // A stage or label with no remaining row is never reached. Using -1 would make `idx >= x` true from the first row and show
  // that stage's content (hypotheses, the proposal, a gap item) before anything supports it, which the scoped world can now cause.
  const reachedAt = (i: number): number => (i < 0 ? Number.POSITIVE_INFINITY : i);
  const hypIdx = reachedAt(firstOf('hypothesis'));
  const proposedIdx = reachedAt(firstOf('proposed'));
  const ingestedIdx = reachedAt(firstOf('ingested'));
  const corIdx = reachedAt(events.findIndex((e) => e.label === 'correlated'));
  const introducedAt = (id: string): number => {
    const i = events.findIndex((e) => e.evidence === id);
    return i >= 0 ? i : ingestedIdx;
  };
  const gapCount = readable.filter((e) => e.notReadReason).length;
  const statuses = w.sources.map((m) => sourceStatus(m, w.now));
  const pos = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const posText = t('rp.pos', { i: idx + 1, n, c: `{${ev.clock}}` });

  const copyProposal = async () => {
    try {
      await navigator.clipboard.writeText(plain(copy.proposal[persona]));
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };

  return (
    <div className="kv2-screen kv2-replay">
      <div className="kv2-col-main">
        <header className="kv2-head">
          <div className="kv2-head-title">
            <p className="kv2-eyebrow"><T k="rp.eyebrow" /></p>
            <H><T k="nav.replay" />{!embedded && <span className="kv2-chip kv2-chip-outline"><T k="map.concept" /></span>}</H>
            <p className="kv2-lede"><T k="rp.lede" /></p>
          </div>
          <div className="kv2-kpis">
            <Kpi icon="layers" value={STAGES.length} label={<T k="rp.kpi.stages" />} />
            <Kpi icon="link" value={readable.length} label={<T k="rp.kpi.evidence" />} />
            <Kpi icon="alert" value={gapCount} label={<T k="rp.kpi.gaps" />} tone="warn" id="kpi-gaps" />
            <Kpi icon="doc" value={1} label={<T k="rp.kpi.proposals" />} />
          </div>
        </header>

        <div className="kv2-toolbar kv2-rp-bar">
          <div className="kv2-rp-chips">
            <span className="kv2-pill"><Icon name="flag" size={15} /><span className="kv2-pill-k"><T k="rp.inv" /></span><Lt>{INV_DEMO_7.id}</Lt></span>
            <span className="kv2-pill kv2-pill-wide"><Lt>{INV_DEMO_7.product}</Lt><Tx s={copy.caseTitle[persona]} /></span>
          </div>
          <div className="kv2-toolbar-end">
            <button type="button" className="kv2-btn kv2-btn-primary" onClick={restart}><Icon name="play" size={16} /><T k="rp.restart" /></button>
            <Seg label={t('rp.speed')} value={String(speed) as `${Speed}`} onChange={(v) => setSpeed(Number(v) as Speed)} options={SPEEDS.map((s) => ({ value: String(s) as `${Speed}`, label: <Lt>{`${s}x`}</Lt> }))} className="kv2-seg-compact" />
          </div>
        </div>

        <section className="kv2-panel kv2-stage-panel" aria-label={t('rp.stage.label')}>
          <Cosmos horizon={false} />
          <div className="kv2-orbits" aria-hidden="true"><i /><i /><i /></div>
          <ol className="kv2-stages" data-testid="stages">
            {STAGES.map((s) => {
              const reached = rank(s) <= rank(stage);
              const fi = firstOf(s);
              // A stage with no remaining row (every row of it rested on a withheld record) is not shown, rather than shown empty.
              if (fi < 0) return null;
              return (
                <li key={s} data-reached={reached || undefined} data-current={s === stage || undefined} data-stage={s}>
                  <button type="button" className="kv2-stage" onClick={() => jump(fi)} aria-current={s === stage ? 'step' : undefined}>
                    <span className="kv2-stage-orb"><Icon name={STAGE_ICON[s]} size={30} /></span>
                    <b><T k={STAGE_KEY[s]} /></b>
                    <small><Lt>{events[fi]!.clock}</Lt></small>
                    <TruthChip label={s === 'ingested' ? 'observed' : s} />
                  </button>
                </li>
              );
            })}
          </ol>
          {gaps.length > 0 && (
            <div className="kv2-gap-mark" role="note">
              <Icon name="alert" size={16} />
              <span><strong><T k="rp.gap" /></strong><small><T k="rp.gap.sub" /></small></span>
            </div>
          )}

          <div className="kv2-scrub">
            <div className="kv2-transport">
              <button type="button" className="kv2-round" onClick={() => jump(idx - 1)} aria-label={t('rp.prev')} disabled={idx === 0}><Icon name="prev" size={18} /></button>
              <button type="button" className="kv2-round kv2-round-lg" onClick={togglePlay} aria-label={playing ? t('rp.pause') : t('rp.play')} aria-pressed={playing}><Icon name={playing ? 'pause' : 'play'} size={22} /></button>
              <button type="button" className="kv2-round" onClick={() => jump(idx + 1)} aria-label={t('rp.next')} disabled={idx >= n - 1}><Icon name="next" size={18} /></button>
            </div>
            <div className="kv2-track">
              <div className="kv2-ticks" aria-hidden="true">
                {events.map((e, i) => <span key={e.id} data-kind={e.kind} data-past={i <= idx || undefined} style={{ insetInlineStart: `${pos(i)}%` }}><i /><small>{e.clock}</small></span>)}
              </div>
              <input
                type="range"
                className="kv2-range"
                min={0}
                max={totalMs(events)}
                step={STEP_MS / 10}
                value={ms}
                style={{ ['--p' as string]: `${(ms / Math.max(1, totalMs(events))) * 100}%` }}
                onChange={(e) => { setPlaying(false); setMs(Number(e.target.value)); }}
                aria-label={t('rp.scrub')}
                aria-valuetext={plain(posText)}
              />
              <p className="kv2-scrub-note"><T k="rp.scrub.note" /></p>
            </div>
            <p className="kv2-pos" aria-live="polite"><Tx s={posText} /></p>
          </div>
        </section>

        <div className="kv2-rp-grid">
          <Panel id="story" title={t('rp.story')} icon="list" actions={<span className="kv2-muted"><T k="rp.story.count" v={{ n }} /></span>} className="kv2-story">
            <ol className="kv2-events" data-testid="story">
              {events.map((e, i) => (
                <li key={e.id} data-future={i > idx || undefined} data-current={i === idx || undefined} data-gap={e.kind === 'gap' || undefined}>
                  <button type="button" onClick={() => jump(i)} aria-current={i === idx ? 'step' : undefined}>
                    <span className="kv2-ev-orb"><Icon name={e.kind === 'gap' ? 'alert' : STAGE_ICON[e.stage]} size={18} /></span>
                    <span className="kv2-ev-text">
                      <span className="kv2-ev-line"><Lt>{e.clock}</Lt><TruthChip label={e.label} /></span>
                      <span><T k={e.key as K} /></span>
                      {i > idx && <small><T k="rp.story.future" /></small>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Panel>

          <div className="kv2-rp-center">
            <Panel id="facts" title={t('rp.facts')} sub={<T k="rp.facts.as" v={{ c: `{${ev.clock}}` }} />} icon="eye" actions={<span className="kv2-chip" data-truth="observed"><Icon name="check" size={11} /><T k="rp.facts.badge" /></span>}>
              <p className="kv2-fact-text"><Tx s={copy.facts.observed[persona]} /></p>
              <dl className="kv2-fact-grid">
                <div><dt><T k="rp.f.source" /></dt><dd><Provider_ p="github" /></dd></div>
                <div><dt><T k="rp.f.check" /></dt><dd><T k="rp.f.checkv" /></dd></div>
                {persona !== 'nontechnical' && <div><dt><T k="rp.f.branch" /></dt><dd><Lt>main</Lt></dd></div>}
                <div><dt><T k="rp.f.result" /></dt><dd><ToneChip tone="bad"><T k="rp.f.failed" /></ToneChip></dd></div>
              </dl>
            </Panel>

            <Panel id="holds" title={t('rp.tab.label')} icon="bulb">
              <TabBar
                label={t('rp.tab.label')}
                idPrefix="rphold"
                value={hold}
                onChange={setHold}
                options={[
                  { value: 'cor', label: <>{t('rp.tab.cor')} <span className="kv2-count">{idx >= corIdx ? 1 : 0}</span></> },
                  { value: 'hyp', label: <>{t('rp.tab.hyp')} <span className="kv2-count">{idx >= hypIdx ? 2 : 0}</span></> },
                  { value: 'gap', label: <>{t('rp.tab.gap')} <span className="kv2-count">{(gaps.length > 0 ? 1 : 0) + (idx >= ingestedIdx ? 1 : 0)}</span></> },
                ]}
              />
              <div role="tabpanel" id="rphold-panel" aria-labelledby={`rphold-tab-${hold}`} className="kv2-hold">
                {hold === 'cor' && (idx < corIdx ? <p className="kv2-empty"><T k="rp.cor.none" /></p> : (
                  <div className="kv2-cor">
                    <EvidenceItem evidence={w.evidence['E-3']!} />
                    {persona === 'technical' && <p className="kv2-rule"><b><T k="rp.cor.rule" /></b><T k="edge.commitKey" /></p>}
                  </div>
                ))}
                {hold === 'hyp' && (idx < hypIdx ? <p className="kv2-empty"><T k="rp.hyp.none" /></p> : (
                  <ul className="kv2-hyps">
                    <li>
                      <span className="kv2-hyp-id"><T k="rp.hyp.h1" /></span>
                      <p><Tx s={copy.facts.hypothesis[persona]} /></p>
                      <span className="kv2-hyp-meta"><TruthChip label="hypothesis" />{copy.confidence}: {copy.level.medium}{persona === 'technical' && <> ({copy.noScore})</>}</span>
                      {persona === 'technical' && (
                        <dl className="kv2-forag">
                          <div><dt>{copy.forLabel}</dt><dd><Tx s={copy.forText} /></dd></div>
                          <div><dt>{copy.againstLabel}</dt><dd><Tx s={copy.againstText} /></dd></div>
                        </dl>
                      )}
                    </li>
                    <li>
                      <span className="kv2-hyp-id"><T k="rp.hyp.h2" /></span>
                      <p><T k="rp.hyp.h2.text" /></p>
                      <span className="kv2-hyp-meta"><ToneChip tone="unk"><T k="rp.hyp.unconfirmed" /></ToneChip>{copy.confidence}: {copy.level.low}</span>
                    </li>
                  </ul>
                ))}
                {hold === 'gap' && (gaps.length === 0 && idx < ingestedIdx ? <p className="kv2-empty"><T k="rp.gap.none" /></p> : (
                  <ul className="kv2-ev-list">
                    {gaps.length > 0 && <li><EvidenceItem evidence={w.evidence['E-6']!} /></li>}
                    {idx >= ingestedIdx && <li><EvidenceItem evidence={w.evidence['E-7']!} /></li>}
                  </ul>
                ))}
              </div>
            </Panel>

            <Panel id="milestones" title={t('rp.ms')} icon="flag" actions={<span className="kv2-muted"><T k="rp.ms.outcome" />: <ToneChip tone="warn"><T k="rp.ms.inprogress" /></ToneChip></span>}>
              <ol className="kv2-milestones">
                {milestones.map((m) => (
                  <li key={m.key} data-state={m.state}>
                    <span className="kv2-ms-dot">{m.state === 'done' ? <Icon name="check" size={14} /> : null}</span>
                    <b><T k={MS_KEY[m.key]} /></b>
                    <small>{m.at ? <Lt>{m.at}</Lt> : <T k={m.state === 'progress' ? 'rp.ms.progress' : 'rp.ms.todo'} />}</small>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        </div>
      </div>

      <aside className="kv2-panel kv2-inspector" aria-label={t('rp.t.label')} data-testid="inspector">
        <TabBar
          label={t('rp.t.label')}
          idPrefix="rpinsp"
          value={tab}
          onChange={setTab}
          options={[{ value: 'evidence', label: t('rp.t.evidence') }, { value: 'context', label: t('rp.t.context') }, { value: 'history', label: t('rp.t.history') }]}
        />
        <div role="tabpanel" id="rpinsp-panel" aria-labelledby={`rpinsp-tab-${tab}`} className="kv2-insp-body">
          {tab === 'evidence' && (
            <>
              <section className="kv2-selected" aria-labelledby="sel-h">
                <p className="kv2-sel-k"><span id="sel-h"><T k="rp.sel" /></span><ToneChip tone="warn"><Lt>{ev.id}</Lt></ToneChip></p>
                <h2><T k={ev.key as K} /></h2>
                <p className="kv2-sel-meta"><TruthChip label={ev.label} /><span><T k="rp.sel.stage" />: <T k={STAGE_KEY[ev.stage]} /></span><span><T k="rp.sel.at" /> <Lt>{ev.clock}</Lt></span></p>
              </section>
              <section className="kv2-insp-sec" aria-labelledby="evl-h">
                <h3 id="evl-h"><Icon name="link" size={16} /><T k="rp.ev.title" /> <span className="kv2-count">{readable.length}</span></h3>
                <ul className="kv2-ev-list">
                  {readable.map((e) => {
                    const future = introducedAt(e.id) > idx;
                    return (
                      <li key={e.id} data-future={future || undefined}>
                        <EvidenceItem evidence={e} selected={ev.evidence === e.id} />
                        {future && <small className="kv2-future"><T k="rp.ev.future" /></small>}
                      </li>
                    );
                  })}
                </ul>
              </section>
              <section className="kv2-insp-sec" aria-labelledby="src-h">
                <h3 id="src-h"><Icon name="db" size={16} /><T k="rp.src" /></h3>
                <p className="kv2-insp-sub"><T k="rp.src.sub" /></p>
                <SourceRows items={statuses} narrow />
              </section>
            </>
          )}
          {tab === 'context' && (
            <section className="kv2-insp-sec" aria-labelledby="ctx-h">
              <h3 id="ctx-h"><Icon name="layers" size={16} /><T k="rp.ctx" /></h3>
              <dl className="kv2-prov">
                <div><dt><T k="rp.ctx.mission" /></dt><dd><Lt>{INV_DEMO_7.product}</Lt></dd></div>
                <div><dt><T k="rp.ctx.impact" /></dt><dd><Tx s={copy.impactUnknown[persona]} /></dd></div>
                <div><dt><T k="rp.ctx.systems" /></dt><dd><Lt>stock-sync, inventory, CI</Lt></dd></div>
                <div><dt><T k="rp.ctx.env" /></dt><dd><Tx s={copy.env[INV_DEMO_7.environment]} /></dd></div>
                <div><dt><T k="rp.ctx.window" /></dt><dd><Lt>{`${events[0]!.clock} - ${events[n - 1]!.clock}`}</Lt></dd></div>
              </dl>
            </section>
          )}
          {tab === 'history' && (
            <section className="kv2-insp-sec">
              {idx < 0 ? <p className="kv2-empty"><T k="rp.hist.none" /></p> : (
                <ol className="kv2-hist">
                  {events.slice(0, idx + 1).map((e) => (
                    <li key={e.id}><Lt>{e.clock}</Lt><TruthChip label={e.label} /><span><T k={e.key as K} /></span></li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      </aside>

      <section className="kv2-panel kv2-impact" aria-labelledby="imp-h">
        <h2 id="imp-h"><Icon name="pulse" size={22} /><T k="rp.impact" /></h2>
        <dl className="kv2-impact-cells">
          <div><dt><T k="rp.imp.observed" /></dt><dd><ToneChip tone="warn"><T k="rp.imp.observed.v" /></ToneChip></dd></div>
          <div><dt><T k="rp.imp.customer" /></dt><dd><ToneChip tone="unk"><T k="rp.imp.customer.v" /></ToneChip></dd></div>
          <div><dt><T k="rp.imp.blast" /></dt><dd><ToneChip tone="unk"><T k="rp.imp.blast.v" /></ToneChip></dd></div>
        </dl>
        <div className="kv2-next" data-testid="proposal">
          <Icon name="info" size={20} />
          <div>
            <p className="kv2-next-k"><T k="rp.imp.next" /><TruthChip label="proposed" /></p>
            <p>{idx >= proposedIdx ? <Tx s={copy.proposal[persona]} /> : <T k="rp.next.before" />}</p>
            <p className="kv2-next-note"><T k="rp.prop.note" /> {copy.noActions}</p>
          </div>
          {idx >= proposedIdx && (
            <div className="kv2-next-act">
              <button type="button" className="kv2-btn" onClick={() => void copyProposal()}><Icon name="doc" size={15} />{copy.copyProposal}</button>
              <span aria-live="polite" className="kv2-muted">{copied === 'ok' ? copy.copied : copied === 'fail' ? copy.copyFailed : ''}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
