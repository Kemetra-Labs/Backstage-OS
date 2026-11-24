// Evidence inspector of the B+C pilot: Overview, Evidence, Sources. Persona rules are the same as V2's inspector:
// restricted evidence reveals only that it exists (EvidenceItem and evidenceView do that, never this file).
import { EvidenceItem } from '../components/evidence';
import { Icon } from '../components/Icon';
import { Age, Lt, Provider_, T, TabBar, TruthChip, Tx } from '../components/ui';
import { useLens, type LensState } from '../useLens';
import type { K } from '../../i18n';
import { evidenceOf, evidenceView, nodeChip } from '../logic/evidence';
import { linkCounts, neighbours } from '../logic/graph';
import { sourceStatus } from '../logic/status';
import type { World, WorldNode } from '../types';
import type { BcTab } from '../logic/bc';
import { AgeBar, StatusChip } from './atoms';
import { ND, NL, NODE_ICON, PROV_ICON, useChipText, useStatusWords } from './shared';

interface Props {
  readonly w: World;
  readonly node: WorldNode;
  readonly tab: BcTab;
  readonly setTab: (t: BcTab) => void;
  readonly isScope: boolean;
  readonly onOpen: LensState['open'];
}

function Head({ node, w, isScope }: { readonly node: WorldNode; readonly w: World; readonly isScope: boolean }) {
  const chipText = useChipText();
  const chip = nodeChip(node, w.sources);
  return (
    <header className="kv2-insp-head">
      <span className="kv2-orb" data-tone={chip.tone}><Icon name={NODE_ICON[node.id] ?? 'cube'} size={26} /></span>
      <div>
        <h2 aria-live="polite"><Lt>{node.title}</Lt></h2>
        <p><T k={`kind.${node.kind}` as K} /> <span aria-hidden="true">/</span> <T k={ND(node.id)} /></p>
        <StatusChip tone={chip.tone}><Tx s={chipText(chip.kind)} /></StatusChip>
      </div>
      {isScope && <span className="kv2-chip kv2-chip-focus"><T k="map.focus" /></span>}
    </header>
  );
}

export function Inspector({ w, node, tab, setTab, isScope, onOpen }: Props) {
  const { route, t } = useLens();
  const words = useStatusWords();
  const refs = evidenceOf(w, node.evidence);
  const nb = neighbours(node.id, w.edges).map((id) => w.nodes.find((n) => n.id === id)!);
  const lc = linkCounts(node.id, w);
  const total = lc.observed + lc.correlated + lc.hypothesis + lc.unknown;
  // A provider is listed only if this persona may read the evidence that names it: restricted records contribute none.
  const providers = [...new Set([...(node.provider ? [node.provider] : []), ...refs.flatMap((r) => { const p = evidenceView(r, route.persona).provider; return p ? [p] : []; })])];
  const hasReplay = node.evidence.some((id) => ['E-1', 'E-2', 'E-3'].includes(id));

  let body;
  if (tab === 'evidence') {
    body = (
      <>
        <Head node={node} w={w} isScope={isScope} />
        {refs.length === 0 ? <p className="kv2-empty"><T k="map.signals.none" /></p> : <ul className="kv2-ev-list">{refs.map((r) => <li key={r.id}><EvidenceItem evidence={r} /></li>)}</ul>}
      </>
    );
  } else if (tab === 'sources') {
    body = (
      <>
        <Head node={node} w={w} isScope={isScope} />
        {providers.length === 0 ? <p className="kv2-empty"><T k="map.signals.none" /></p> : (
          <ul className="kv2-bc-srcrows">
            {providers.map((p) => {
              const s = sourceStatus(w.sources.find((m) => m.provider === p)!, w.now);
              return (
                <li key={p} data-conn={s.connectivity} data-fresh={s.freshness}>
                  <button type="button" className="kv2-linkbtn kv2-bc-prov" onClick={() => onOpen('source-observatory', { src: p })}><Icon name={PROV_ICON[p]} size={16} /><Provider_ p={p} /></button>
                  <span>
                    <span className="kv2-bc-words">{words.connectivity(s.connectivity)}, {words.freshness(s.freshness)}</span>
                    <AgeBar s={s} nums={false} />
                  </span>
                  <span className="kv2-bc-words"><Age minutes={s.ageMinutes} /></span>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  } else {
    body = (
      <>
        <Head node={node} w={w} isScope={isScope} />
        <p className="kv2-insp-desc"><T k={NL(node)} /></p>
        <dl className="kv2-stats">
          <div><dt><T k="map.stat.projects" /></dt><dd>{nb.filter((n) => n.kind === 'project').length}</dd></div>
          <div><dt><T k="map.stat.services" /></dt><dd>{nb.filter((n) => n.kind === 'service').length}</dd></div>
          <div><dt><T k="map.stat.linked" /></dt><dd>{nb.length}</dd></div>
        </dl>
        <section className="kv2-insp-sec" aria-labelledby="bc-sig-h">
          <h3 id="bc-sig-h"><Icon name="pulse" size={16} /><T k="map.signals" /><small><T k="map.signals.sub" /></small></h3>
          {refs.length === 0 ? <p className="kv2-empty"><T k="map.signals.none" /></p> : (
            <ul className="kv2-ev-list">{refs.slice(0, 2).map((r) => <li key={r.id}><EvidenceItem evidence={r} compact onSelect={() => setTab('evidence')} /></li>)}</ul>
          )}
        </section>
        <section className="kv2-insp-sec" aria-labelledby="bc-lnk-h">
          <h3 id="bc-lnk-h"><Icon name="network" size={16} /><T k="map.links" /></h3>
          {total === 0 ? <p className="kv2-empty"><T k="map.links.none" /></p> : (
            <ul className="kv2-linkbars">
              {(['observed', 'correlated', 'hypothesis', 'unknown'] as const).map((k) => (
                <li key={k} data-truth={k}>
                  <span><TruthChip label={k} /></span>
                  <span className="kv2-bar" role="img" aria-label={t('map.m.sources.of', { n: lc[k], of: total })}><span style={{ inlineSize: `${(lc[k] / total) * 100}%` }} /></span>
                  <b>{lc[k]}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="kv2-insp-actions">
          {hasReplay && <button type="button" className="kv2-btn" onClick={() => onOpen('mission-replay')}><Icon name="play" size={15} /><T k="map.open.replay" /></button>}
          {node.provider && <button type="button" className="kv2-btn" onClick={() => onOpen('source-observatory', { src: node.provider })}><Icon name="db" size={15} /><T k="map.open.source" /></button>}
        </div>
      </>
    );
  }

  return (
    <aside className="kv2-bc-insp" aria-label={t('map.tab.label')} data-testid="inspector">
      <TabBar
        label={t('map.tab.label')}
        idPrefix="bcinsp"
        value={tab}
        onChange={setTab}
        options={[{ value: 'overview', label: t('map.tab.overview') }, { value: 'evidence', label: t('tab.evidence') }, { value: 'sources', label: t('tab.sources') }]}
      />
      {/* tabIndex 0: the panel can overflow and scroll, so it must be reachable by keyboard (WAI-ARIA tabs pattern; axe, BACK-91). */}
      <div role="tabpanel" id="bcinsp-panel" tabIndex={0} aria-labelledby={`bcinsp-tab-${tab}`} className="kv2-bc-insp-body">{body}</div>
    </aside>
  );
}
