// STUB (M1 foundation): replaced by the screen implementation.
import { useApp } from '../app/AppContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBlock } from '../components/StateBlock';

export function DecisionDetail({ id }: { readonly id: string }) {
  void [id];
  const { shell } = useApp();
  return (
    <>
      <ScreenHeader title={shell.nav.decisions} />
      <StateBlock kind="loading" />
    </>
  );
}
