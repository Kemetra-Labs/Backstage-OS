import { useApp } from '../../app/AppContext';
import { DECISIONS_COPY } from '../../i18n/screens/decisions';

/** Everything the decision screens read from the app: persona, language, shared copy and screen copy. */
export function useDecisionsUi() {
  const { persona, lang, copy, shell } = useApp();
  return {
    persona,
    lang,
    copy,
    shell,
    c: DECISIONS_COPY[lang],
    style: persona === 'nontechnical' ? ('plain' as const) : ('standard' as const),
  };
}
