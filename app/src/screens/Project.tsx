// STUB (M1 foundation): replaced by the screen implementation.
import { useApp } from '../app/AppContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBlock } from '../components/StateBlock';

export function Project({ projectId, componentId }: { readonly projectId: string; readonly componentId?: string }) {
  void [projectId, componentId];
  const { shell } = useApp();
  return (
    <>
      <ScreenHeader title={shell.nav.project} />
      <StateBlock kind="loading" />
    </>
  );
}
