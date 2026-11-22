import { Text } from '../components/Text';
import { useMemo } from 'react';
import { useApp } from '../app/AppContext';
import { Panel } from '../components/Panel';
import { ScreenHeader } from '../components/ScreenHeader';
import { HOME_COPY } from '../i18n/screens/home';
import { hrefFor } from '../nav/routes';
import { homeView, type HomeSignals } from '../view/homeView';
import '../styles/screens/home.css';
import { Activity } from './home/Activity';
import { AttentionList } from './home/AttentionList';
import { InvestigationPreviews, ProposalPreviews } from './home/SideLists';
import { SourceHealth } from './home/SourceHealth';

function Signals({ s }: { readonly s: HomeSignals }) {
  const { lang } = useApp();
  const h = HOME_COPY[lang];
  const items = [
    { key: 'products', value: s.products, tone: '', note: null },
    { key: 'attention', value: s.productsNeedingAttention, tone: s.productsNeedingAttention > 0 ? 'hot' : '', note: h.ofTotal(s.products) },
    { key: 'investigations', value: s.openInvestigations, tone: '', note: null },
    { key: 'proposals', value: s.proposedDecisions, tone: '', note: null },
    { key: 'sources', value: s.sourcesNotCurrent.notCurrent, tone: s.sourcesNotCurrent.notCurrent > 0 ? 'warn' : '', note: h.ofTotal(s.sourcesNotCurrent.total) },
  ] as const;
  return (
    <dl className="home-signals" aria-label={h.signalsLabel} data-testid="home-signals">
      {items.map((i) => (
        <div key={i.key} className={`home-signal${i.tone ? ` home-signal-${i.tone}` : ''}`} data-signal={i.key}>
          <dt>{h.signal[i.key]}</dt>
          <dd>
            <span className="home-signal-value">{i.value}</span>
            {i.note && <span className="home-signal-note"><Text s={i.note} /></span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Command Home (BACK-1): one executive read of the whole mission control. Every number comes from world. */
export function Home() {
  const { shell, lang, persona, world } = useApp();
  const h = HOME_COPY[lang];
  const v = useMemo(() => homeView(world, persona), [world, persona]);
  return (
    <>
      <ScreenHeader title={shell.nav.home} lede={h.lede[persona]} />
      <Signals s={v.signals} />
      <div className="home-grid">
        <Panel id="home-attention" title={h.attention.title} tone="raised" className="home-attention" testId="home-attention">
          <AttentionList items={v.attention} />
        </Panel>
        <div className="home-side">
          <Panel id="home-investigations" title={h.investigations.title} testId="home-investigations">
            <InvestigationPreviews items={v.investigations} />
          </Panel>
          <Panel id="home-proposals" title={h.proposals.title} testId="home-proposals">
            <p className="note"><Text s={h.proposals.note} /></p>
            <ProposalPreviews items={v.decisions} />
          </Panel>
        </div>
      </div>
      <div className="grid-2">
        <Panel
          id="home-sources"
          title={h.sourceHealth.title}
          testId="home-sources"
          aside={<a className="btn btn-quiet btn-link" href={hrefFor({ name: 'sources' })}>{h.sourceHealth.open}</a>}
        >
          <SourceHealth items={v.sourceHealth} />
        </Panel>
        <Panel id="home-activity" title={h.activity.title} testId="home-activity">
          <Activity items={v.activity} />
        </Panel>
      </div>
    </>
  );
}
