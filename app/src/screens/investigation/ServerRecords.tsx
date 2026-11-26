import { useMemo } from 'react';
import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { hostCopy } from '../../i18n/host';
import { investigationReadView } from '../../view/investigationReadView';

/**
 * Server-shaped evidence (BACK-57, owner decision 2026-11-26): the records and decisions of a separate synthetic case, from the
 * committed GET /investigations/:id and GET /decisions fixtures through the src/api adapters. Nothing is requested. Read states
 * only, never a health word; always marked as demo data; no links. Owner and Technical only: Nontechnical gets no panel, Owner
 * gets no source reference and none of the server's free text (see investigationReadView).
 */
export function ServerRecords() {
  const { persona, lang, copy } = useApp();
  const s = hostCopy('INVESTIGATION', lang).serverRecords;
  const v = useMemo(() => investigationReadView(persona), [persona]);
  if (!v) return null;

  return (
    <Panel
      id="srv-records"
      title={s.title}
      tone="raised"
      testId="server-records"
      className="srv-records"
      aside={v.demo ? <span className="demo-mark" data-testid="server-records-demo">{s.demo}</span> : undefined}
    >
      <p className="srv-lede"><Text s={s.lede} /></p>
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
