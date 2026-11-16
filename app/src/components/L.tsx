import { useApp } from '../app/AppContext';
import type { ByPersonaL10n, L10n } from '../contract/world';
import { Text } from './Text';

/** Bilingual fixture text in the current language, with {braces} isolated left to right. */
export function L({ t }: { readonly t: L10n }) {
  const { lang } = useApp();
  return <Text s={t[lang]} />;
}

/** Bilingual, per-persona fixture text. */
export function LP({ t }: { readonly t: ByPersonaL10n }) {
  const { lang, persona } = useApp();
  return <Text s={t[persona][lang]} />;
}
