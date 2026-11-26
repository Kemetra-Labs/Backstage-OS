import { useMemo } from 'react';
import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { LiveMark, LiveState } from '../../components/LiveState';
import { StateBlock } from '../../components/StateBlock';
import { useLiveRead } from '../../app/useLiveRead';
import { Text } from '../../components/Text';
import type { CountView } from '../../contract/rules';
import { hostCopy } from '../../i18n/host';
import { githubReadViewFor, type GitHubSourceRow } from '../../view/githubReadView';
import { LIVE, readPortfolio } from '../../live/reads';

/**
 * The latest GitHub read of each connected repository (BACK-57), from GET /portfolio: the committed synthetic fixture by
 * default, marked as demo data; in live mode (BACK-51 P1) the server's answer, marked as read from the server.
 * Read states only (current, stale, not read yet, unknown, unavailable): never a health word. No links.
 * BACK-62: an empty or unreadable answer is said in words (StateBlock), never a blank panel and never healthy.
 * A live read that fails, or is still loading, is said in words too (LiveState).
 */
export function GitHubReads() {
  const { lang } = useApp();
  const g = hostCopy('PORTFOLIO_COPY', lang).github;
  const notRead = hostCopy('PORTFOLIO_COPY', lang).fields.notRead;
  // Live mode: GET /api/portfolio. Fixture mode: nothing is requested (live is null).
  const live = useLiveRead(LIVE ? readPortfolio : null, 'portfolio');
  // Fixture: the committed synthetic body, or a forced failure form of it (review seed ?github=error|denied|timeout|malformed|empty).
  // Live: the fetched body, aged against the real clock; the review seed is ignored.
  const v = useMemo(
    () => (LIVE ? (live?.status === 'ok' ? githubReadViewFor('', new Date(), 'live', live.body) : null) : githubReadViewFor(window.location.search)),
    [live],
  );

  const count = (c: CountView) => (c.kind === 'notRead' ? notRead : c.kind === 'atLeast' ? <Text s={g.atLeast(c.value)} /> : <bdi dir="ltr">{c.value}</bdi>);

  const status = (s: GitHubSourceRow) => (
    <>
      <span className="pf-gh-status" data-read={s.status}>{g.status[s.status]}</span>
      {s.failure && <span className="pf-gh-failure"> · <Text s={g.failure[s.failure]} /></span>}
      {s.ageMinutes !== null && <span className="pf-gh-age"> · <Text s={g.age(s.ageMinutes)} /></span>}
    </>
  );

  return (
    <Panel
      id="pf-github"
      title={<Text s={g.title} />}
      tone="raised"
      testId="portfolio-github"
      aside={LIVE ? <LiveMark testId="github-live" /> : v?.demo ? <span className="demo" data-testid="github-demo">{g.demo}</span> : undefined}
    >
      <p className="pf-gh-lede">{g.lede}</p>
      {live && live.status !== 'ok' && <LiveState state={live.status === 'loading' ? 'loading' : live.failure} />}
      {v && (
        <>
          {v.state === 'unreadable' && <StateBlock kind="error" title={g.unreadable.title} body={g.unreadable.body} />}
          {v.state === 'empty' && <StateBlock kind="empty" title={g.empty.title} body={g.empty.body} />}
          {v.state === 'ok' && v.incomplete && <p className="pf-gh-incomplete" role="status">{g.incomplete}</p>}
          {v.projects.map((p) => (
            <section key={p.id} className="pf-gh-project" aria-labelledby={`pf-gh-${p.id}`} data-testid={`github-project-${p.id}`}>
              <h3 id={`pf-gh-${p.id}`}><bdi dir="ltr">{p.name}</bdi></h3>
              {p.sources.length === 0 && <p className="pf-gh-none" data-read="unknown">{g.noSources}</p>}
              {p.sources.length > 0 && <ul className="rows">
                {p.sources.map((s) => (
                  <li key={s.id} data-testid={`github-source-${s.id}`} data-read={s.status}>
                    <bdi dir="ltr" className="pf-gh-ref">{s.externalRef}</bdi>
                    <span className="pf-gh-state">{status(s)}</span>
                    <dl className="kv pf-gh-counts">
                      <dt>{g.pullRequests}</dt>
                      <dd data-count="pullRequests">{count(s.pullRequests)}</dd>
                      <dt>{g.issues}</dt>
                      <dd data-count="issues">{count(s.issues)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>}
            </section>
          ))}
        </>
      )}
    </Panel>
  );
}
