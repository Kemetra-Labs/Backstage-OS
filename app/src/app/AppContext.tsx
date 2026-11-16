import { createContext, useContext } from 'react';
import type { Lang, Persona } from '../contract/types';
import type { Copy } from '../i18n/strings';
import type { ShellCopy } from '../i18n/shell';
import type { Route } from '../nav/routes';

/** App-wide demo state. Persona is a presentation switch only, never authorization (ADR-03). */
export interface AppState {
  readonly persona: Persona;
  readonly lang: Lang;
  /** S1 copy (truth labels, provider names, health words): shared by every screen. */
  readonly copy: Copy;
  readonly shell: ShellCopy;
  readonly route: Route;
  readonly setPersona: (p: Persona) => void;
  readonly setLang: (l: Lang) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp() outside <AppContext.Provider>');
  return ctx;
}
