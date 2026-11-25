import { useApp } from '../../app/AppContext';
import { hostCopy } from '../../i18n/host';

/** Everything the decision screens read from the app: persona, language, shared copy and screen copy. */
export function useDecisionsUi() {
  const { persona, lang, copy, shell } = useApp();
  return {
    persona,
    lang,
    copy,
    shell,
    c: hostCopy('DECISIONS_COPY', lang),
    style: persona === 'nontechnical' ? ('plain' as const) : ('standard' as const),
  };
}
