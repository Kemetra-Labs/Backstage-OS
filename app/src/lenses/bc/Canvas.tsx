// The immersive map: three orbit ellipses by kind, classified links, and one native button per system.
// The canvas is always left-to-right; text inside the cards follows the language.
import type { CSSProperties, KeyboardEvent, MutableRefObject } from 'react';
import { Icon } from '../components/Icon';
import { Lt, Tx } from '../components/ui';
import { useV2 } from '../context';
import { DEFAULT_BEND, HUB_ID, LINK_BEND } from '../fixtures/orbit-layout';
import { type K } from '../../i18n';
import { curve, edgeStale, isIncident } from '../logic/bc';
import { nodeChip } from '../logic/evidence';
import { nextByDirection, type Dir } from '../logic/graph';
import { BC_CANVAS, ORBIT_RADII, ORBITS, orbitOf, type Point } from '../logic/orbit';
import { sourceStatus, type SourceStatus } from '../logic/status';
import type { World, WorldEdge, WorldNode } from '../types';
import { Ring, StatusChip } from './atoms';
import { ND, NODE_ICON, useChipText } from './shared';

/** Orb size is by kind only (never by data): hub 124, product and project 58, service 52. */
const ORB: Readonly<Record<WorldNode['kind'], number>> = { product: 58, project: 58, service: 52 };
const HUB_ORB = 124;
// First-load orbit timing (ms): orbits draw first, then the nodes settle inward orbit by orbit. Never more than 10 at once.
const DRAW_DELAY: Readonly<Record<string, number>> = { inner: 0, middle: 50, outer: 100 };
const SETTLE_DELAY: Readonly<Record<string, number>> = { inner: 360, middle: 440, outer: 520 };

interface CanvasProps {
  readonly w: World;
  readonly points: Readonly<Record<string, Point>>;
  readonly sel: string;
  readonly active: ReadonlySet<string>;
  readonly onSelect: (id: string) => void;
  readonly nodeRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  /** First-load orbit: only on the very first render of a page session, and never under reduced motion. */
  readonly intro: boolean;
}

const bendOf = (e: WorldEdge): number => (e.cls === 'group' ? 0 : LINK_BEND[e.id] ?? DEFAULT_BEND);

function Edge({ e, a, b, dim, hl, stale }: { readonly e: WorldEdge; readonly a: Point; readonly b: Point; readonly dim: boolean; readonly hl: boolean; readonly stale: boolean }) {
  const c = curve(a, b, bendOf(e));
  return (
    <g className="kv2-bc-edge" data-id={e.id} data-cls={e.cls} data-truth={e.truth} data-stale={stale || undefined} data-dim={dim || undefined} data-hl={hl || undefined}>
      {e.truth === 'observed' && <path className="kv2-bc-glow" d={c.d} />}
      <path d={c.d} />
    </g>
  );
}

/** The truth marker at a link's midpoint. It is HTML, not SVG: the SVG stretches with the canvas (preserveAspectRatio none), which
 * would squash a circle or diamond on a phone. Position uses the same canvas fractions and --pad inset as the node buttons. */
function Marker({ e, a, b, dim, hl, stale }: { readonly e: WorldEdge; readonly a: Point; readonly b: Point; readonly dim: boolean; readonly hl: boolean; readonly stale: boolean }) {
  if (e.cls === 'group' || e.truth === 'unknown') return null;
  const c = curve(a, b, bendOf(e));
  const style = { '--fx': (c.mx / BC_CANVAS.w).toFixed(4), '--fy': (c.my / BC_CANVAS.h).toFixed(4) } as CSSProperties;
  return (
    <span
      className="kv2-bc-mk"
      style={style}
      data-edge={e.id}
      data-truth={e.truth}
      data-shape={e.truth === 'hypothesis' ? 'diamond' : 'circle'}
      data-stale={stale || undefined}
      data-dim={dim || undefined}
      data-hl={hl || undefined}
      aria-hidden="true"
    />
  );
}

interface NodeProps {
  readonly n: WorldNode;
  readonly w: World;
  readonly p: Point;
  readonly selected: boolean;
  readonly dim: boolean;
  readonly onSelect: (id: string) => void;
  readonly refFn: (el: HTMLButtonElement | null) => void;
  readonly intro: boolean;
}

function Node({ n, w, p, selected, dim, onSelect, refFn, intro }: NodeProps) {
  const { t } = useV2();
  const chipText = useChipText();
  const chip = nodeChip(n, w.sources);
  const hub = n.id === HUB_ID;
  const meta = n.provider ? w.sources.find((s) => s.provider === n.provider) : undefined;
  const st: SourceStatus | null = meta ? sourceStatus(meta, w.now) : null;
  const card = hub || selected ? 'full' : n.kind === 'service' ? 'read' : 'min';
  const text = chipText(chip.kind);
  const desc = card === 'full' ? t(ND(n.id)) : null;
  const read = card !== 'min' && st ? (st.ageMinutes === null ? t('bc.never') : t('obs.read.age', { a: st.ageMinutes, m: st.ttlMinutes })) : null;
  const dx = (p.x - BC_CANVAS.cx) / BC_CANVAS.w;
  const dy = (p.y - BC_CANVAS.cy) / BC_CANVAS.w;
  // Position is a fraction of the canvas; the stylesheet turns it into left/top and may inset it on narrow screens.
  // --orb-d is the desktop orb size; the stylesheet picks the real --orb from it (an inline --orb could not be overridden on phones).
  const style = {
    '--fx': (p.x / BC_CANVAS.w).toFixed(4),
    '--fy': (p.y / BC_CANVAS.h).toFixed(4),
    '--orb-d': `${hub ? HUB_ORB : ORB[n.kind]}px`,
    ...(intro ? { '--vx': (dx * 4).toFixed(2), '--vy': (dy * 4).toFixed(2), '--delay': `${SETTLE_DELAY[orbitOf(n)]}ms` } : {}),
  } as CSSProperties;
  return (
    <button
      ref={refFn}
      type="button"
      className="kv2-bc-node"
      style={style}
      data-node={n.id}
      data-kind={n.kind}
      data-tone={chip.tone}
      data-hub={hub || undefined}
      data-selected={selected || undefined}
      data-dim={dim || undefined}
      data-intro={intro || undefined}
      aria-pressed={selected}
      // No aria-label: the name is computed from the card, so it always holds exactly the words on screen, in order (WCAG 2.5.3
      // Label in Name, axe, BACK-91). The card's narrow-canvas CSS hides the description and read age with display:none, which
      // drops them from the name too; the status chip of an unselected node is only visually hidden (bc.css), so the status is
      // always in the name. The kind follows as visually hidden text, as in the list view (Tables.tsx).
      onClick={() => onSelect(n.id)}
    >
      <span className="kv2-bc-orbw">
        {n.kind === 'service' && <Ring s={st} />}
        <span className="kv2-bc-orb"><Icon name={NODE_ICON[n.id] ?? 'cube'} size={hub ? 40 : Math.round(ORB[n.kind] * 0.46)} /></span>
      </span>
      <span className="kv2-bc-card">
        <b><Lt>{n.title}</Lt></b>
        {desc && <small><Tx s={desc} /></small>}
        <StatusChip tone={chip.tone}><Tx s={text} /></StatusChip>
        {read && <span className="kv2-bc-cardread">{read}</span>}
      </span>
      <span className="kv2-sr">{t('bc.sep')}{t(`kind.${n.kind}` as K)}</span>
    </button>
  );
}

export function Canvas({ w, points, sel, active, onSelect, nodeRefs, intro }: CanvasProps) {
  const { t } = useV2();
  const edges = w.edges;
  const edgeStates = edges.map((e) => {
    const own = isIncident(e, sel);
    return { e, hl: own, stale: edgeStale(e, w), dim: !active.has(e.a) || !active.has(e.b) || !own };
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as Record<string, Dir | undefined>)[e.key];
    const cur = (document.activeElement as HTMLElement | null)?.dataset.node;
    if (!dir || !cur) return;
    e.preventDefault();
    const placed = w.nodes.map((n) => ({ ...n, x: points[n.id]!.x, y: points[n.id]!.y }));
    const next = nextByDirection(cur, dir, placed);
    if (next) nodeRefs.current[next]?.focus();
  };

  return (
    <div className="kv2-bc-canvas" role="group" aria-label={t('map.canvas.label')} onKeyDown={onKeyDown} data-testid="bc-canvas" data-intro={intro || undefined}>
      <svg className="kv2-bc-svg" viewBox={`0 0 ${BC_CANVAS.w} ${BC_CANVAS.h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {ORBITS.map((o) => (
          <ellipse key={o} className={`kv2-bc-orbit kv2-bc-orbit-${o}`} cx={BC_CANVAS.cx} cy={BC_CANVAS.cy} rx={ORBIT_RADII[o].rx} ry={ORBIT_RADII[o].ry} data-orbit={o} />
        ))}
        {intro && ORBITS.map((o) => (
          <ellipse key={`draw-${o}`} className="kv2-bc-draw" pathLength={1} cx={BC_CANVAS.cx} cy={BC_CANVAS.cy} rx={ORBIT_RADII[o].rx} ry={ORBIT_RADII[o].ry} style={{ animationDelay: `${DRAW_DELAY[o]}ms` }} />
        ))}
        {edgeStates.map(({ e, ...st }) => <Edge key={e.id} e={e} a={points[e.a]!} b={points[e.b]!} {...st} />)}
        {/* One-shot trace along the selected node's own links. Keyed by the selection so it replays on every change. */}
        {edges.filter((e) => isIncident(e, sel)).map((e) => (
          <path key={`${sel}:${e.id}`} className="kv2-bc-trace" pathLength={1} d={curve(points[e.a]!, points[e.b]!, bendOf(e)).d} data-rev={e.b === sel || undefined} />
        ))}
      </svg>
      {edgeStates.map(({ e, ...st }) => <Marker key={e.id} e={e} a={points[e.a]!} b={points[e.b]!} {...st} />)}
      {w.nodes.map((n) => (
        <Node
          key={n.id}
          n={n}
          w={w}
          p={points[n.id]!}
          selected={sel === n.id}
          dim={!active.has(n.id)}
          onSelect={onSelect}
          intro={intro}
          refFn={(el) => { nodeRefs.current[n.id] = el; }}
        />
      ))}
    </div>
  );
}
