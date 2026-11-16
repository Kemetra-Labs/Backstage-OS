import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Lang, Persona } from '../contract/types';
import { formatAge } from '../i18n/segments';
import type { Copy } from '../i18n/strings';
import type { EvidenceView } from '../view/viewFor';
import { evidenceTitle, statusLine } from './EvidenceList';
import { Text } from './Text';
import { TruthChip } from './TruthChip';

interface Props {
  readonly item: EvidenceView;
  readonly persona: Persona;
  readonly labelStyle: 'standard' | 'plain';
  readonly copy: Copy;
  readonly lang: Lang;
  readonly onClose: () => void;
}

const FOCUSABLE = 'button, [href], [tabindex]:not([tabindex="-1"])';
/** Everything behind the dialog. The dialog is portalled to <body>, outside #root, so it is never made inert itself. */
const BACKGROUND = '#root';

/**
 * Evidence detail as a modal dialog: focus moves in, Tab and Shift+Tab stay inside (also when focus has drifted to the
 * page body), the page behind is inert, and Esc or Close return focus to the opener (handled by the caller).
 */
export function EvidenceDrawer({ item, persona, labelStyle, copy, lang, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const d = copy.drawer;

  useEffect(() => {
    const background = document.querySelector(BACKGROUND);
    background?.setAttribute('inert', '');
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const els = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = els[0];
      const last = els[els.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!panel.current.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      background?.removeAttribute('inert');
    };
  }, [onClose]);

  const row = (k: string, v: ReactNode) => (<><dt>{k}</dt><dd>{v}</dd></>);
  const readable = !item.restricted && !item.notReadReason;

  return createPortal(
    // The backdrop is not clickable: a click handler on a non-interactive element is unreachable by keyboard
    // (Sonar S6848). Esc and the Close button close the drawer.
    <div className="scrim">
      <div
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        lang={lang}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="drawer-head">
          <h2 id="drawer-title"><Text s={d.title(item.id)} /></h2>
          <button ref={closeBtn} type="button" className="btn" onClick={onClose}>{d.close}</button>
        </div>
        <TruthChip label={item.label} style={labelStyle} copy={copy} />
        <p className="drawer-text"><Text s={evidenceTitle(copy, item, persona)} /></p>
        <dl className="drawer-fields">
          {!readable && row(d.status, <Text s={statusLine(item, copy, lang)} />)}
          {item.provider && row(d.source, <bdi dir="ltr">{copy.provider[item.provider]}</bdi>)}
          {readable && row(d.freshness, `${copy.freshness[item.freshness]} · ${formatAge(item.ageMinutes, lang)}`)}
          {item.observedAt && row(d.observedAt, <bdi dir="ltr" className="ltr">{item.observedAt}</bdi>)}
          {item.ingestedAt && row(d.ingestedAt, <bdi dir="ltr" className="ltr">{item.ingestedAt}</bdi>)}
          {item.environment && row(d.environment, <Text s={copy.env[item.environment]} />)}
          {item.externalId && row(d.id, <bdi dir="ltr" className="ltr">{item.externalId}</bdi>)}
          {/* Rules are source data written in English; isolate them inside Arabic. */}
          {item.rule && row(d.rule, <bdi dir="ltr">{item.rule}</bdi>)}
          {item.url && row(d.link, item.inert
            ? <><bdi dir="ltr" className="ltr inert-link">{item.url}</bdi> <span className="note">({d.inertNote})</span></>
            : <a href={item.url} target="_blank" rel="noopener noreferrer"><bdi dir="ltr" className="ltr">{item.url}</bdi></a>)}
        </dl>
        {item.rawOutput && (
          <>
            <h3 className="raw-title">{d.raw}</h3>
            <pre className="raw" dir="ltr">{item.rawOutput}</pre>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
