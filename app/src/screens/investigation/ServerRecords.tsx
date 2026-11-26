import { useMemo } from 'react';
import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { useLiveRead } from '../../app/useLiveRead';
import { LiveMark, LiveState } from '../../components/LiveState';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { hostCopy } from '../../i18n/host';
import { investigationReadView } from '../../view/investigationReadView';
import { investigationIdFrom, LIVE, readInvestigation } from '../../live/reads';

/**
 * Server-shaped evidence (BACK-57, owner decision 2026-11-26): the records and decisions of a separate case, from
 * GET /investigations/:id and GET /decisions through the src/api adapters. By default these are committed synthetic fixtures,
 * nothing is requested, and the panel is marked as demo data. In live mode (BACK-51 P1) the case is the one named by
 * `?investigation=<uuid>`, or with none the newest visible one (said in a note), read from the server and marked as such. Read states only, never a health word; no links. Owner and
 * Technical only: Nontechnical gets no panel and no request, Owner gets no source reference and none of the server's free text.
 */
export function ServerRecords() {
  const { persona, lang, copy, shell } = useApp();
  const s = hostCopy('INVESTIGATION', lang).serverRecords;
  const shown = persona !== 'nontechnical';
  const id = LIVE ? investigationIdFrom(window.location.search) : null;
  // Live mode: GET /api/investigations/:id and /api/decisions. Fixture mode, or Nontechnical: nothing is requested (live is null).
  const live = useLiveRead(LIVE && shown ? (signal) => readInvestigation(id, signal) : null, `${shown}:${id ?? ''}`);
  const v = useMemo(() => {
    if (!LIVE) return investigationReadView(persona);
    return live?.status === 'ok' ? investigationReadView(persona, live.body.investigation, live.body.decisions, new Date(), 'live') : null;
  }, [persona, live]);
  if (!shown) return null;
  if (!v) {
    return (
      <Panel id="srv-records" title={LIVE ? s.liveTitle : s.title} tone="raised" testId="server-records" className="srv-records" aside={<LiveMark testId="server-records-live" />}>
        <p className="srv-lede"><Text s={LIVE ? s.liveLede : s.lede} /></p>
        <LiveState state={!live || live.status === 'loading' ? 'loading' : live.status === 'failed' ? live.failure : 'error'} />
      </Panel>
    );
  }

  return (
    <Panel
      id="srv-records"
      title={LIVE ? s.liveTitle : s.title}
      tone="raised"
      testId="server-records"
      className="srv-records"
      aside={LIVE ? <LiveMark testId="server-records-live" /> : v.demo ? <span className="demo-mark" data-testid="server-records-demo">{s.demo}</span> : undefined}
    >
      <p className="srv-lede"><Text s={LIVE ? s.liveLede : s.lede} /></p>
      {live?.status === 'ok' && live.body.chosen === 'newest' && <p className="note srv-newest" data-testid="server-records-newest"><Text s={shell.live.newest} /></p>}
      {v.state === 'unreadable' && <StateBlock kind="error" title={s.unreadable.title} body={s.unreadable.body} />}
      {v.state === 'empty' && <StateBlock kind="empty" title={copy.noEvidence.title} body={copy.noEvidence.body} />}
      {v.state === 'ok' && (
        <>
          {v.incomplete && <p className="srv-incomplete">{s.incomplete}</p>}
          <section aria-labelledby="srv-records-ev" className="srv-group">
            <h3 id="srv-records-ev">{s.recordsTitle}</h3>
            {v.records.length === 0 ? <p className="note">{s.noRecords}</p> : (
              <ul className="rows srv-rows">
                {v.records.map((r) => (
                  <li key={r.id} data-testid="server-record" data-read={r.read}>
                    <span className="srv-state">
                      <TruthChip label={r.label} style="standard" copy={copy} />
                      <span className="srv-read" data-read={r.read}>{s.read[r.read]}</span>
                      {r.reason && <span className="srv-reason"> · {s.reason[r.reason]}</span>}
                      {r.ageMinutes !== null && <span className="srv-age"> · <Text s={s.age(r.ageMinutes)} /></span>}
                    </span>
                    {r.sourceRef && (
                      <dl className="kv srv-kv">
                        <dt>{s.source}</dt>
                        <dd><bdi dir="ltr" className="srv-ref">{r.sourceRef}</bdi></dd>
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="srv-records-dec" className="srv-group">
            <h3 id="srv-records-dec">{s.decisionsTitle}</h3>
            {v.decisions.length === 0 ? <p className="note">{s.noDecisions}</p> : (
              <ul className="rows srv-rows">
                {v.decisions.map((d) => (
                  <li key={d.id} data-testid="server-decision" data-label={d.label}>
                    <span className="srv-state">
                      <TruthChip label={d.label} style="standard" copy={copy} />
                      <span className="srv-creator" data-creator={d.creator}>{s.creator[d.creator]}</span>
                      {d.ageMinutes !== null && <span className="srv-age"> · <Text s={s.recordedAge(d.ageMinutes)} /></span>}
                    </span>
                    {d.label === 'proposed' && <p className="note srv-note">{s.proposedNote}</p>}
                    {d.text && (
                      <dl className="kv srv-kv">
                        <dt>{s.decisionText}</dt>
                        <dd><bdi dir="ltr" lang="en" className="srv-ref">{d.text}</bdi></dd>
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Panel>
  );
}
