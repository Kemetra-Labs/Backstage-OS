import { Panel } from '../../components/Panel';
import { useDecisionsUi } from './useDecisionsUi';

/** What a real approval flow would need. It states that none of it exists here. */
export function FuturePanel() {
  const { c } = useDecisionsUi();
  return (
    <Panel id="dec-future" title={c.future.title} className="dec-future" testId="dec-future">
      <p>{c.future.lead}</p>
      <ul className="dec-needs">
        {c.future.needs.map((n) => <li key={n}>{n}</li>)}
      </ul>
      <p className="note">{c.future.closing}</p>
    </Panel>
  );
}
