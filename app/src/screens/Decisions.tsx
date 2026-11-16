import { Text } from '../components/Text';
import { useMemo, useState } from 'react';
import { WORLD } from '../fixture/world';
import { PROJECT_FILTERS, inboxView, type ProjectFilter } from '../view/decisionView';
import { projectById } from '../view/world';
import { Panel } from '../components/Panel';
import { ScreenHeader } from '../components/ScreenHeader';
import { Segmented } from '../components/Segmented';
import { StateBlock } from '../components/StateBlock';
import { DecisionRowItem } from './decisions/DecisionRowItem';
import { Notice } from './decisions/Notice';
import { useDecisionsUi } from './decisions/useDecisionsUi';
import '../styles/screens/decisions.css';

/** Decision Inbox (BACK-13): pending proposals and one clearly separate synthetic historical record. Display only. */
export function Decisions() {
  const { persona, lang, shell, c } = useDecisionsUi();
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const view = useMemo(() => inboxView(WORLD, filter, persona, lang), [filter, persona, lang]);
  const options = PROJECT_FILTERS.map((f) =>
    f === 'all'
      ? { value: f, label: c.filterAll }
      : { value: f, label: projectById(WORLD, f)?.name ?? f, lang: 'en' },
  );

  return (
    <div className="dec-screen" data-screen="decisions">
      <ScreenHeader title={shell.nav.decisions} lede={<Text s={c.lede} />} />
      <Notice />
      <Segmented label={c.filterLabel} value={filter} options={options} onChange={setFilter} />

      <Panel id="dec-pending" title={c.pendingTitle} aside={c.pendingCount(view.pending.length)} testId="dec-pending">
        {view.pending.length === 0 ? <StateBlock kind="empty" /> : (
          <ul className="rows dec-list">
            {view.pending.map((r) => <DecisionRowItem key={r.id} row={r} historical={false} />)}
          </ul>
        )}
      </Panel>

      <Panel id="dec-historical" title={c.historicalTitle} tone="raised" className="dec-historical" testId="dec-historical">
        <p className="note">{c.historicalNote}</p>
        {view.historical.length === 0 ? <p>{c.historicalNone}</p> : (
          <ul className="rows dec-list">
            {view.historical.map((r) => <DecisionRowItem key={r.id} row={r} historical />)}
          </ul>
        )}
      </Panel>
    </div>
  );
}
