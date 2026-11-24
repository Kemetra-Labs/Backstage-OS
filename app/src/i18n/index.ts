// The one translation entry point for the host and the lenses (BACK-92 R7). Everything user-visible comes from here:
//   - keyed copy (the lens tables in ./lenses/): translate(key, lang, persona, vars), bound per view as useV2().t;
//   - host copy trees (./strings.ts, ./shell.ts, ./screens/*): one typed tree per language, read as SET[lang];
//   - one formatter for both (./format.ts): {braces} -> left-to-right isolates (segments), plain(), $name -> fill(), formatAge().
// The shared rules (EN/AR parity, balanced braces, Latin digits, Latin only inside isolates in Arabic) apply to every set listed
// in HOST_COPY and to TABLE, in ./copy-rules.test.ts.
import { COPY, type Copy } from './strings';
import { SHELL, type ShellCopy } from './shell';
import { AGENTS_COPY } from './screens/agents';
import { DECISIONS_COPY } from './screens/decisions';
import { EVIDENCE } from './screens/evidence';
import { HOME_COPY } from './screens/home';
import { INVESTIGATION } from './screens/investigation';
import { AGENTS_VIEW_COPY, MAP_LENS_COPY, REPLAY_VIEW_COPY, SOURCES_VIEW_COPY } from './screens/map';
import { PORTFOLIO_COPY } from './screens/portfolio';
import { PROJECT_COPY } from './screens/project';
import { SOURCES_COPY } from './screens/sources';

export { fill, formatAge, plain, segments, VAR, type Segment, type Vars } from './format';
export { TABLE, allCopy, pairOf, translate, type Entry, type K, type Pair, type Table } from './translate';
export {
  AGENTS_COPY, AGENTS_VIEW_COPY, COPY, DECISIONS_COPY, EVIDENCE, HOME_COPY, INVESTIGATION, MAP_LENS_COPY, PORTFOLIO_COPY, PROJECT_COPY,
  REPLAY_VIEW_COPY, SHELL, SOURCES_COPY, SOURCES_VIEW_COPY, type Copy, type ShellCopy,
};

/** Every host copy tree, by name. A new tree is added here so the shared copy rules and the no-change snapshot cover it. */
export const HOST_COPY = {
  COPY, SHELL, AGENTS_COPY, DECISIONS_COPY, EVIDENCE, HOME_COPY, INVESTIGATION, AGENTS_VIEW_COPY, MAP_LENS_COPY, REPLAY_VIEW_COPY,
  SOURCES_VIEW_COPY, PORTFOLIO_COPY, PROJECT_COPY, SOURCES_COPY,
} as const;
