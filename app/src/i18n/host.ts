// Host copy trees and their one lookup, hostCopy() (BACK-92 R7). Kept apart from ./translate.ts so an eager screen that reads host
// copy does not pull the lens tables (lazy chunks) into the main bundle. Re-exported from ./index.ts.
import type { Lang } from '../contract/types';
import { COPY } from './strings';
import { SHELL } from './shell';
import { AGENTS_COPY } from './screens/agents';
import { DECISIONS_COPY } from './screens/decisions';
import { EVIDENCE } from './screens/evidence';
import { HOME_COPY } from './screens/home';
import { INVESTIGATION } from './screens/investigation';
import { AGENTS_VIEW_COPY, MAP_LENS_COPY, REPLAY_VIEW_COPY, SOURCES_VIEW_COPY } from './screens/map';
import { PORTFOLIO_COPY } from './screens/portfolio';
import { PROJECT_COPY } from './screens/project';
import { SOURCES_COPY } from './screens/sources';

/** Every host copy tree, by name. A new tree is added here so the shared copy rules and the no-change snapshot cover it. */
export const HOST_COPY = {
  COPY, SHELL, AGENTS_COPY, DECISIONS_COPY, EVIDENCE, HOME_COPY, INVESTIGATION, AGENTS_VIEW_COPY, MAP_LENS_COPY, REPLAY_VIEW_COPY,
  SOURCES_VIEW_COPY, PORTFOLIO_COPY, PROJECT_COPY, SOURCES_COPY,
} as const;

export type HostCopyName = keyof typeof HOST_COPY;
export type HostCopy<N extends HostCopyName> = (typeof HOST_COPY)[N][Lang];

/** The host copy tree `name` in `lang`: the one lookup for host copy, as translate() is for keyed copy. */
export function hostCopy<N extends HostCopyName>(name: N, lang: Lang): HostCopy<N> {
  return HOST_COPY[name][lang];
}
