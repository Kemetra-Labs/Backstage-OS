import { useApp } from '../app/AppContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBlock } from '../components/StateBlock';
import { InvestigationRoom } from './InvestigationRoom';

/** INV-DEMO-7 has the full room (BACK-6). Other cases: summary view (implemented in M2). */
export function InvestigationRoute({ id }: { readonly id: string }) {
  const { persona, lang, copy, shell } = useApp();
  if (id === 'INV-DEMO-7') return <InvestigationRoom persona={persona} lang={lang} copy={copy} />;
  return (
    <>
      <ScreenHeader title={shell.nav.investigation} />
      <StateBlock kind="loading" />
    </>
  );
}
