import { useApp } from '../app/AppContext';
import { Panel } from '../components/Panel';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBlock } from '../components/StateBlock';
import { Text } from '../components/Text';
import fixture from '../fixture/shadow-cognition.json';
import { hostCopy } from '../i18n/host';
import { readShadow } from '../view/shadowView';

const VIEW = readShadow(fixture);

/** A data value (a title, a reference or a code) shown as is: isolated, so it never reorders inside Arabic text. */
const Val = ({ v }: { readonly v: string }) => <bdi>{v}</bdi>;

/**
 * COG-07 (BACK-110): the read-only shadow view of the cognitive core. It shows committed, synthetic engine output
 * (src/fixture/shadow-cognition.json), makes no request, has no controls, and says unknown and not-verified in words.
 */
export function Shadow() {
  const { lang } = useApp();
  const c = hostCopy('SHADOW_COPY', lang);
  return (
    <>
      <ScreenHeader title={c.title} lede={<Text s={c.lede} />} />
      <p className="note" role="note" data-testid="shadow-marker"><Text s={c.marker} /></p>
      {VIEW.kind === 'invalid' ? (
        <StateBlock kind="unknown" title={c.invalid.title} body={c.invalid.body} />
      ) : (
        <>
          <p className="note" data-testid="shadow-versions"><Text s={c.versions(VIEW.versions.memory, VIEW.versions.retrieval, VIEW.versions.reasoning)} /></p>
          <Panel id="shadow-search" title={c.search.title} testId="shadow-search">
            <div className="table-scroll">
              <table className="data-table">
                <caption>{c.search.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{c.search.query}</th>
                    <th scope="col">{c.search.outcome}</th>
                    <th scope="col">{c.search.result}</th>
                    <th scope="col">{c.search.status}</th>
                    <th scope="col">{c.search.matchedBy}</th>
                  </tr>
                </thead>
                <tbody>
                  {VIEW.searches.flatMap((s) => {
                    const rows = s.hits.length ? s.hits : [null];
                    return rows.map((h, i) => (
                      <tr key={`${s.query}-${i}`} data-query={s.query} data-outcome={s.outcome} data-status={h?.status ?? 'none'}>
                        {i === 0 && <th scope="row" rowSpan={rows.length}><Val v={s.query} /></th>}
                        {i === 0 && <td rowSpan={rows.length}>{c.outcomes[s.outcome]}</td>}
                        {h ? (
                          <>
                            <td><Val v={h.title} /> <span className="note"><Val v={h.sourceRef} /></span></td>
                            <td data-dim="status">{c.statuses[h.status]}</td>
                            <td><Val v={h.tier} /></td>
                          </>
                        ) : (
                          <td colSpan={3}>{c.search.none}</td>
                        )}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel id="shadow-reasoning" title={c.reasoning.title} testId="shadow-reasoning">
            <p data-testid="shadow-kind" data-kind={VIEW.reasoning.kind}>{c.kinds[VIEW.reasoning.kind]}</p>
            <p className="note">{c.reasoning.approvalNote}</p>
            <div className="table-scroll">
              <table className="data-table">
                <caption>{c.reasoning.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{c.reasoning.task}</th>
                    <th scope="col">{c.reasoning.item}</th>
                    <th scope="col">{c.reasoning.state}</th>
                    <th scope="col">{c.reasoning.reasons}</th>
                  </tr>
                </thead>
                <tbody>
                  {VIEW.reasoning.tasks.map((t) => (
                    <tr key={t.id} data-task={t.id} data-state={t.state}>
                      <th scope="row"><Val v={t.id} /></th>
                      <td>{t.sourceRef === null ? c.reasoning.notVisible : <Val v={t.sourceRef} />}</td>
                      <td data-dim="state">{c.states[t.state]}</td>
                      <td>
                        <ul className="plain-list">
                          {t.reasons.map((r) => (
                            <li key={`${r.code}-${r.requirement ?? ''}`}>
                              <Val v={r.requirement ? `${r.code} (${r.requirement})` : r.code} />
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
