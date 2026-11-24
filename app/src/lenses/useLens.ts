// BACK-92 R7: how a lens component reads its state. It reads the host's one authority (`useApp()`: persona, language, route) and
// derives the lens value from it (src/bridge/lensState.ts); every change a lens asks for is a host navigation (src/screens/hostNav.ts).
// No provider, no context and no state of its own, so nothing here can drift from the host. Persona is a display switch, not
// authorization; each lens still reads only authorizedWorld(WORLD, route.persona).
import { useMemo } from 'react';
import { useApp } from '../app/AppContext';
import { toLensState, type LensState } from '../bridge/lensState';
import { navigate, replace } from '../screens/hostNav';

export type { LensState };

export function useLens(): LensState {
  const { persona, lang, route } = useApp();
  return useMemo(() => toLensState({ persona, lang, route }, { navigate, replace }), [persona, lang, route]);
}
