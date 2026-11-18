import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang, Persona } from '../contract/types';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { formatAge } from '../i18n/segments';
import type { Copy } from '../i18n/strings';
import { viewFor } from '../view/viewFor';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { EvidenceList } from '../components/EvidenceList';
import { Ledger } from '../components/Ledger';
import { StageMap } from '../components/StageMap';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Text } from '../components/Text';
import { WORLD } from '../fixture/world';
import { INVESTIGATION } from '../i18n/screens/investigation';
import { hrefFor } from '../nav/routes';
import { crumbTrail } from '../view/investigationView';
import { investigationById } from '../view/world';
import { RoomExtras } from './investigation/RoomExtras';

interface Props {
  readonly persona: Persona;
  readonly lang: Lang;
  readonly copy: Copy;
}

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Investigation Room (Blueprint v4 §3) in the C2 layout: a stage for the map and a ledger for the facts.
 * Everything shown comes from the persona view; the screen never reads the fixture fields itself.
 */
export function InvestigationRoom({ persona, lang, copy }: Props) {
  const view = viewFor(persona, INV_DEMO_7);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const opener = useRef<HTMLButtonElement | null>(null);
  const proposalRef = useRef<HTMLParagraphElement>(null);

  // The proposal text changes with persona and language, so an earlier "Copied" no longer applies.
  useEffect(() => { setCopyState('idle'); }, [persona, lang]);

  const open = useCallback((id: string, el: HTMLButtonElement) => { opener.current = el; setOpenId(id); }, []);
  const close = useCallback(() => { setOpenId(null); }, []);
  // Return focus after the drawer has unmounted and removed `inert` from the page; focusing earlier would be ignored.
  useEffect(() => {
    if (openId === null && opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [openId]);

  const copyProposal = async () => {
    const text = proposalRef.current?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const { meta } = view;
  const summary = investigationById(WORLD, meta.id);
  const explorerText = INVESTIGATION[lang].openExplorer;
  // Portfolio and the product are links; the case itself is the current page.
  const crumbHrefs = [
    hrefFor({ name: 'portfolio' }),
    summary ? hrefFor({ name: 'project', projectId: summary.projectId, componentId: summary.componentId }) : undefined,
    undefined,
  ];
  const stage = <StageMap nodes={view.nodes} persona={persona} copy={copy} lang={lang} />;
  const ledger = <Ledger view={view} copy={copy} lang={lang} />;
  const item = view.evidence.find((e) => e.id === openId);
  const label = (k: 'unknown' | 'proposed') => (view.labelStyle === 'plain' ? copy.plainLabel[k] : copy.label[k]);

  return (
    <>
      <Breadcrumbs items={crumbTrail(copy.crumbs, crumbHrefs)} />
      <h1>{copy.h1}</h1>
      <div className="case">
        <p className="case-title"><Text s={copy.caseTitle[persona]} /></p>
        <ul className="meta">
          <li><bdi dir="ltr">{meta.id}</bdi></li>
          <li><bdi dir="ltr">{meta.product}</bdi></li>
          {meta.component && <li><bdi dir="ltr">{meta.component}</bdi></li>}
          {meta.environment && <li><Text s={copy.env[meta.environment]} /></li>}
          <li>{copy.started} {formatAge(meta.startedMinutesAgo, lang)}</li>
        </ul>
      </div>

      <div className="c2">
        {view.stageFirst ? <>{stage}{ledger}</> : <>{ledger}{stage}</>}
      </div>

      <EvidenceList items={view.evidence} persona={persona} labelStyle={view.labelStyle} copy={copy} lang={lang} onOpen={open} />

      {view.impact === 'unknown' && (
        <section className="impact" aria-labelledby="impact-title">
          <h2 id="impact-title">{copy.impactTitle}</h2>
          <p><span className="truth truth-unknown" data-truth="unknown">{label('unknown')}</span></p>
          <p><strong>{copy.customerImpact}:</strong> <Text s={copy.impactUnknown[persona]} /></p>
        </section>
      )}

      <section className="proposal" aria-labelledby="proposal-title">
        <h2 id="proposal-title">{copy.proposalTitle}</h2>
        <span className="truth truth-proposed" data-truth="proposed">{label('proposed')}</span>
        <p ref={proposalRef} className="proposal-text"><Text s={copy.proposal[persona]} /></p>
        <p className="note"><Text s={copy.decidedIn[persona]} /></p>
        <p className="note">{copy.noActions}</p>
        <div className="proposal-actions">
          <button type="button" className="btn" onClick={copyProposal}>{copy.copyProposal}</button>
          <span role="status" aria-live="polite" className="note">
            {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
          </span>
        </div>
      </section>

      <RoomExtras id={meta.id} />

      {item && (
        <EvidenceDrawer
          item={item}
          persona={persona}
          labelStyle={view.labelStyle}
          copy={copy}
          lang={lang}
          onClose={close}
          explorer={{ href: hrefFor({ name: 'evidence', id: item.id, from: meta.id }), label: explorerText }}
        />
      )}
    </>
  );
}
