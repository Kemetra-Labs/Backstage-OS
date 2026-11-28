import { useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useSession } from '../../app/SessionContext';
import { Panel } from '../../components/Panel';
import { useLiveRead } from '../../app/useLiveRead';
import { LiveMark, LiveState } from '../../components/LiveState';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { hostCopy } from '../../i18n/host';
import { investigationReadView, type RecordRow } from '../../view/investigationReadView';
import { investigationIdOf } from '../../live/decisions';
import { investigationIdFrom, LIVE, readInvestigation } from '../../live/reads';
import { hidesRecords } from '../../live/session';
import { RecordDecision } from './RecordDecision';

/**
 * Server-shaped evidence (BACK-57, owner decision 2026-11-26): the records and decisions of a separate case, from
 * GET /investigations/:id and GET /decisions through the src/api adapters. By default these are committed synthetic fixtures,
 * nothing is requested, and the panel is marked as demo data. In live mode (BACK-51 P1) the case is the one named by
 * `?investigation=<uuid>`, or with none the newest visible one (said in a note), read from the server and marked as such. Read states only, never a health word; no links. Owner and
 * Technical only: Nontechnical gets no panel and no request, Owner gets no source reference and none of the server's free text.
 */
export function ServerRecords() {
  // Live mode (BACK-51 P3): ticks after a decision is recorded, so the decision list is read again.
  const [refresh, setRefresh] = useState(0);
  // The case last read, kept while a re-read runs (or fails) so the decision form and its confirmation do not unmount.
  const lastCase = useRef<{ id: string; records: readonly RecordRow[] } | null>(null);
  // Whether the case was the newest one (no id in the address): said in a note, also after a re-read pinned to that case.
  const fromNewest = useRef(false);
  // The session generation for which the case was last read while unlocked (BACK-127): the form's draft returns only after that.
  const readGeneration = useRef<number | null>(null);
  const session = useSession();
  const { persona, lang, copy, shell } = useApp();
  const s = hostCopy('INVESTIGATION', lang).serverRecords;
  const shown = persona !== 'nontechnical';
  const id = LIVE ? investigationIdFrom(window.location.search) : null;
  // Live mode: GET /api/investigations/:id and /api/decisions. Fixture mode, or Nontechnical: nothing is requested (live is null).
  // After a decision the same case is read again: "newest" is not resolved a second time, which could land on another case.
  const named = refresh > 0 && lastCase.current ? lastCase.current.id : id;
  const live = useLiveRead(LIVE && shown ? (signal) => readInvestigation(named, signal) : null, `${shown}:${id ?? ''}:${refresh}`);
  const v = useMemo(() => {
    if (!LIVE) return investigationReadView(persona);
    return live?.status === 'ok' ? investigationReadView(persona, live.body.investigation, live.body.decisions, new Date(), 'live') : null;
  }, [persona, live]);
  if (!shown) return null;
  // The decision form (BACK-51 P3, live mode): once a case has been read it stays through re-reads, also a failed one, so a
  // "Decision recorded" confirmation never vanishes. While the session is signed out or ended its record rows are dropped (no
  // panel keeps the owner's data then); the draft and the reason submit is off stay.
  if (LIVE) {
    // Locked (BACK-127) hides the records like signed out or ended does; the form shows its locked state.
    const out = hidesRecords(session);
    if (out) {
      if (lastCase.current) lastCase.current = { id: lastCase.current.id, records: [] };
    } else if (live?.status === 'ok' && v && v.state !== 'unreadable') {
      const caseId = investigationIdOf(live.body.investigation);
      lastCase.current = caseId === null ? null : { id: caseId, records: v.records };
      if (caseId !== null) readGeneration.current = session?.generation ?? null;
      if (live.body.chosen === 'newest' && refresh === 0) fromNewest.current = true;
    }
  }
  const form = LIVE && lastCase.current
    ? <RecordDecision key={lastCase.current.id} investigationId={lastCase.current.id} records={lastCase.current.records} technical={persona === 'technical'} readGeneration={readGeneration.current} onSubmitted={() => setRefresh((n) => n + 1)} />
    : null;
  if (!v) {
    return (
      <>
      <Panel id="srv-records" title={LIVE ? s.liveTitle : s.title} tone="raised" testId="server-records" className="srv-records" aside={<LiveMark testId="server-records-live" />}>
        <p className="srv-lede"><Text s={LIVE ? s.liveLede : s.lede} /></p>
        <LiveState state={!live || live.status === 'loading' ? 'loading' : live.status === 'failed' ? live.failure : 'error'} />
      </Panel>
      {form}
      </>
    );
  }

  return (
    <>
    <Panel
      id="srv-records"
      title={LIVE ? s.liveTitle : s.title}
      tone="raised"
      testId="server-records"
      className="srv-records"
      aside={LIVE ? <LiveMark testId="server-records-live" /> : v.demo ? <span className="demo-mark" data-testid="server-records-demo">{s.demo}</span> : undefined}
    >
      <p className="srv-lede"><Text s={LIVE ? s.liveLede : s.lede} /></p>
      {live?.status === 'ok' && (live.body.chosen === 'newest' || fromNewest.current) && <p className="note srv-newest" data-testid="server-records-newest"><Text s={shell.live.newest} /></p>}
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
    {form}
    </>
  );
}
