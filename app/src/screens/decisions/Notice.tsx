import { Text } from '../../components/Text';
import { useDecisionsUi } from './useDecisionsUi';

/** Persistent explanation, shown as text only. It is not a control and never offers one. */
export function Notice() {
  const { c } = useDecisionsUi();
  return (
    <aside className="dec-notice" aria-label={c.notice.title} data-testid="dec-notice">
      <p className="dec-notice-title">{c.notice.title}</p>
      <p><Text s={c.notice.body} /></p>
    </aside>
  );
}
