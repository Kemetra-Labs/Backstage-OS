import { useApp } from '../app/AppContext';
import { useLiveRead } from '../app/useLiveRead';
import { LiveMark, LiveState } from '../components/LiveState';
import { Panel } from '../components/Panel';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBlock } from '../components/StateBlock';
import { Text } from '../components/Text';
import fixture from '../fixture/shadow-cognition.json';
import type { ShadowCopy } from '../i18n/screens/shadow';
import { hostCopy } from '../i18n/host';
import { LIVE, projectIdFrom, readCognitionSearches, searchQueriesFrom } from '../live/reads';
import { readLiveSearches, readShadow, type ShadowSearch, type ShadowTask } from '../view/shadowView';

const VIEW = readShadow(fixture);

/** A data value (a title, a reference or a code) shown as is: isolated, so it never reorders inside Arabic text. */
const Val = ({ v }: { readonly v: string }) => <bdi>{v}</bdi>;

function SearchPanel({ c, searches }: { readonly c: ShadowCopy; readonly searches: readonly ShadowSearch[] }) {
  return (
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
            {searches.flatMap((s, si) => {
              const rows = s.hits.length ? s.hits : [null];
              return rows.map((h, i) => (
                <tr key={`${si}-${i}`} data-query={s.query} data-outcome={s.outcome} data-status={h?.status ?? 'none'}>
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
  );
}

function ReasoningPanel({ c, kind, tasks }: { readonly c: ShadowCopy; readonly kind: keyof ShadowCopy['kinds']; readonly tasks: readonly ShadowTask[] }) {
  return (
    <Panel id="shadow-reasoning" title={c.reasoning.title} testId="shadow-reasoning">
      <p data-testid="shadow-kind" data-kind={kind}>{c.kinds[kind]}</p>
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
            {tasks.map((t) => (
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
  );
}

/** Fixture mode: committed synthetic engine output, labelled as shadow. No request. */
function FixtureShadow({ c }: { readonly c: ShadowCopy }) {
  return (
    <>
      <ScreenHeader title={c.title} lede={<Text s={c.lede} />} />
      <p className="note" role="note" data-testid="shadow-marker"><Text s={c.marker} /></p>
      {VIEW.kind === 'invalid' ? (
        <StateBlock kind="unknown" title={c.invalid.title} body={c.invalid.body} />
      ) : (
        <>
          <p className="note" data-testid="shadow-versions"><Text s={c.versions(VIEW.versions.memory, VIEW.versions.retrieval, VIEW.versions.reasoning)} /></p>
          <SearchPanel c={c} searches={VIEW.searches} />
          <ReasoningPanel c={c} kind={VIEW.reasoning.kind} tasks={VIEW.reasoning.tasks} />
        </>
      )}
    </>
  );
}

/** Live mode (owner decision 2026-11-27): search only, for `?project=` and `?q=` in the address. Never mixed with the fixture. */
function LiveShadow({ c }: { readonly c: ShadowCopy }) {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const projectId = projectIdFrom(search);
  const queries = searchQueriesFrom(search);
  const ready = projectId !== null && queries.length > 0;
  const read = useLiveRead(ready ? (signal) => readCognitionSearches(projectId, queries, signal) : null, `shadow:${projectId ?? ''}:${queries.join('\u0000')}`);
  const view = read?.status === 'ok' ? readLiveSearches(read.body) : null;
  return (
    <>
      <ScreenHeader title={c.title} lede={<Text s={c.live.lede} />} />
      <p className="note" data-testid="shadow-marker"><LiveMark testId="shadow-live-mark" /></p>
      {projectId === null ? (
        <StateBlock kind="unknown" title={c.live.noProject.title} body={c.live.noProject.body} />
      ) : queries.length === 0 ? (
        <StateBlock kind="unknown" title={c.live.noQuery.title} body={c.live.noQuery.body} />
      ) : !read || read.status === 'loading' ? (
        <LiveState state="loading" />
      ) : read.status === 'failed' ? (
        <LiveState state={read.failure} />
      ) : view?.kind !== 'ok' ? (
        <StateBlock kind="unknown" title={c.invalid.title} body={c.invalid.body} />
      ) : (
        <SearchPanel c={c} searches={view.searches} />
      )}
      <Panel id="shadow-reasoning" title={c.reasoning.title} testId="shadow-reasoning">
        <p className="note" data-testid="shadow-reasoning-not-live">{c.live.reasoning}</p>
      </Panel>
    </>
  );
}

/**
 * COG-07 (BACK-110): the read-only shadow view of the cognitive core. The default build shows committed synthetic engine output
 * and makes no request. A live build (VITE_KAWALYS_LIVE=1) reads the live search for the project in the address instead. No controls.
 */
export function Shadow() {
  const { lang } = useApp();
  const c = hostCopy('SHADOW_COPY', lang);
  return LIVE ? <LiveShadow c={c} /> : <FixtureShadow c={c} />;
}
