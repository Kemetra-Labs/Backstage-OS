import '../styles/screens/investigation.css';
import { useApp } from '../app/AppContext';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { WORLD } from '../fixture/world';
import { investigationById } from '../view/world';
import { InvestigationRoom } from './InvestigationRoom';
import { CaseNotFound, SummaryRoom } from './investigation/SummaryRoom';

/** INV-DEMO-7 has the full room (BACK-6). Other known cases get a summary room; unknown ids an error state. */
export function InvestigationRoute({ id }: { readonly id: string }) {
  const { persona, lang, copy } = useApp();
  const inv = investigationById(WORLD, id);
  if (!inv) return <CaseNotFound id={id} />;
  if (inv.fullRoom && id === INV_DEMO_7.id) return <InvestigationRoom persona={persona} lang={lang} copy={copy} />;
  return <SummaryRoom id={id} />;
}
