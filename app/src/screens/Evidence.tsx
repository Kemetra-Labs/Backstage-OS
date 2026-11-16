// STUB (M1 foundation): replaced by the screen implementation.
import { useApp } from '../app/AppContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBlock } from '../components/StateBlock';

export function Evidence({ id, from }: { readonly id: string; readonly from?: string }) {
  void [id, from];
  const { shell } = useApp();
  return (
    <>
      <ScreenHeader title={shell.nav.investigation} />
      <StateBlock kind="loading" />
    </>
  );
}
