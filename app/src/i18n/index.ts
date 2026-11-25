// The one translation entry point for the host and the lenses (BACK-92 R7). Everything user-visible comes from here:
//   - keyed copy (the lens tables in ./lenses/): translate(key, lang, persona, vars), bound per view as useLens().t;
//   - host copy trees (./strings.ts, ./shell.ts, ./screens/*): one typed tree per language, read only through
//     hostCopy(name, lang). No file outside src/i18n imports a tree or indexes it by language (./host-copy.test.ts);
//   - one formatter for both (./format.ts): {braces} -> left-to-right isolates (segments), plain(), $name -> fill(), formatAge().
// The shared rules (EN/AR parity, balanced braces, Latin digits, Latin only inside isolates in Arabic) apply to every set listed
// in HOST_COPY and to TABLE, in ./copy-rules.test.ts.
import type { Copy } from './strings';
import type { ShellCopy } from './shell';

export { fill, formatAge, plain, segments, VAR, type Segment, type Vars } from './format';
export { TABLE, allCopy, pairOf, translate, type Entry, type K, type Pair, type Table } from './translate';
export type { Copy, ShellCopy };
export { HOST_COPY, hostCopy, type HostCopy, type HostCopyName } from './host';
