import '../styles/screens/investigation.css';
import { useApp } from '../app/AppContext';
import { investigationById } from '../view/world';
import { InvestigationRoom } from './InvestigationRoom';
import { CaseNotFound, SummaryRoom } from './investigation/SummaryRoom';

/** INV-DEMO-7 has the full room (BACK-6). Other known cases get a summary room; unknown ids an error state. */
export function InvestigationRoute({ id }: { readonly id: string }) {
  const { persona, lang, copy, world, investigation } = useApp();
  const inv = investigationById(world, id);
  if (!inv) return <CaseNotFound id={id} />;
  if (inv.fullRoom && id === investigation.id) return <InvestigationRoom persona={persona} lang={lang} copy={copy} />;
  return <SummaryRoom id={id} />;
}
