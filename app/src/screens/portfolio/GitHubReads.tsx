import { useMemo } from 'react';
import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import type { CountView } from '../../contract/rules';
import { hostCopy } from '../../i18n/host';
import { githubReadViewFor, type GitHubSourceRow } from '../../view/githubReadView';

/**
 * The latest GitHub read of each connected repository (BACK-57), from the synthetic GET /portfolio fixture.
 * Read states only (current, stale, not read yet, unknown, unavailable): never a health word, and always
 * marked as demo data while every source is synthetic. No links: synthetic sources are never followed.
 * BACK-62: an empty or unreadable answer is said in words (StateBlock), never a blank panel and never healthy.
 */
export function GitHubReads() {
  const { lang } = useApp();
  const g = hostCopy('PORTFOLIO_COPY', lang).github;
  const notRead = hostCopy('PORTFOLIO_COPY', lang).fields.notRead;
  // The committed synthetic body, or a forced failure form of it (review seed ?github=error|denied|timeout|malformed|empty).
  const v = useMemo(() => githubReadViewFor(window.location.search), []);

  const count = (c: CountView) => (c.kind === 'notRead' ? notRead : c.kind === 'atLeast' ? <Text s={g.atLeast(c.value)} /> : <bdi dir="ltr">{c.value}</bdi>);

  const status = (s: GitHubSourceRow) => (
    <>
      <span className="pf-gh-status" data-read={s.status}>{g.status[s.status]}</span>
      {s.failure && <span className="pf-gh-failure"> · <Text s={g.failure[s.failure]} /></span>}
      {s.ageMinutes !== null && <span className="pf-gh-age"> · <Text s={g.age(s.ageMinutes)} /></span>}
    </>
  );

  return (
    <Panel id="pf-github" title={<Text s={g.title} />} tone="raised" testId="portfolio-github" aside={v.demo ? <span className="demo" data-testid="github-demo">{g.demo}</span> : undefined}>
      <p className="pf-gh-lede">{g.lede}</p>
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
    </Panel>
  );
}
