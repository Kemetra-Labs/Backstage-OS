import { useApp } from '../../app/AppContext';
import { DepGraph, DepTable, type GraphNode } from '../../components/DepGraph';
import { Panel } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { StateBlock } from '../../components/StateBlock';
import { DepFlow } from '../../components/flow/DepFlow';
import { Text } from '../../components/Text';
import type { WorldProject } from '../../contract/world';
import { hostCopy } from '../../i18n/host';
import { hrefFor } from '../../nav/routes';
import { rendererFrom } from '../../view/rendererFlag';
import {
  layersOf, mapFor, segLabel, type EnvFilter, type Filters, type LayerFilter,
} from '../../view/projectView';

export type ViewMode = 'map' | 'table';

interface Props {
  readonly project: WorldProject;
  readonly selectedId: string | undefined;
  readonly filters: Filters;
  readonly onFilters: (f: Filters) => void;
  readonly mode: ViewMode;
  readonly onMode: (m: ViewMode) => void;
  /** Under 640 px the table replaces the map and the view toggle is hidden. */
  readonly narrow: boolean;
}

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly lang?: string;
}

export function MapPanel({ project, selectedId, filters, onFilters, mode, onMode, narrow }: Props) {
  const { copy, lang, persona, shell } = useApp();
  const pc = hostCopy('PROJECT_COPY', lang);
  const t = pc.map;
  const layerWords = pc.layer[persona === 'nontechnical' ? 'plain' : 'standard'];
  const model = mapFor(project, filters);
  const effective: ViewMode = narrow ? 'table' : mode;
  const empty = project.components.length === 0;

  // Selecting an already selected node clears the selection. The selection lives in the URL.
  const select = (id: string) => {
    window.location.hash = hrefFor(
      id === selectedId ? { name: 'project', projectId: project.id } : { name: 'project', projectId: project.id, componentId: id },
    );
  };

  const clear = () => { window.location.hash = hrefFor({ name: 'project', projectId: project.id }); };
  // BACK-82: ?renderer=flow opts into the React Flow map; without it, or on any failure, DepGraph is drawn.
  const renderer = rendererFrom(window.location.search);

  const nodes: readonly GraphNode[] = model.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    col: n.col,
    row: n.row,
    triad: n.triad,
    checkFailing: n.checkFailing,
    sub: (
      <>
        {layerWords[n.layer]}
        {persona === 'technical' && <> · <Text s={copy.env[n.environment]} /></>}
        {n.investigationId && <> · <Text s={t.caseOn(n.investigationId)} /></>}
      </>
    ),
  }));

  const envOptions: readonly Option<EnvFilter>[] = [
    { value: 'all', label: t.all },
    ...project.environments.map((e): Option<EnvFilter> => ({ value: e, ...segLabel(copy.env[e]) })),
  ];
  const layerOptions: readonly Option<LayerFilter>[] = [
    { value: 'all', label: t.all },
    ...layersOf(project).map((l): Option<LayerFilter> => ({ value: l, label: layerWords[l] })),
  ];
  const modeOptions: readonly Option<ViewMode>[] = [
    { value: 'map', label: t.viewMap },
    { value: 'table', label: t.viewTable },
  ];

  return (
    <Panel id="proj-map" title={t.title} testId="map-panel">
      {!empty && (
        <div className="proj-controls" role="group" aria-label={t.filters}>
          <Segmented label={t.environment} value={filters.env} options={envOptions} onChange={(env) => onFilters({ ...filters, env })} />
          <Segmented label={t.layer} value={filters.layer} options={layerOptions} onChange={(layer) => onFilters({ ...filters, layer })} />
          {!narrow && <Segmented label={t.view} value={mode} options={modeOptions} onChange={onMode} />}
        </div>
      )}
      {narrow && !empty && <p className="note">{t.narrowNote}</p>}

      {empty && (
        <div data-testid="map-empty">
          <StateBlock kind="empty" body={t.emptyBody}>
            <ul className="proj-links">
              <li><a className="btn btn-quiet btn-link" href={hrefFor({ name: 'portfolio' })}>{pc.notFound.openPortfolio}</a></li>
            </ul>
          </StateBlock>
        </div>
      )}

      {!empty && model.nodes.length === 0 && (
        <StateBlock kind="empty" title={t.noMatchTitle} body={t.noMatchBody}>
          <button type="button" className="btn btn-quiet" onClick={() => onFilters({ env: 'all', layer: 'all' })}>{t.clearFilters}</button>
        </StateBlock>
      )}

      {model.nodes.length > 0 && effective === 'map' && (
        <>
          {renderer === 'flow'
            ? <DepFlow nodes={nodes} edges={model.edges} selectedId={selectedId ?? null} onSelect={select} onClear={clear} label={t.label} />
            : <DepGraph nodes={nodes} edges={model.edges} selectedId={selectedId ?? null} onSelect={select} label={t.label} />}
          <details className="proj-details">
            <summary>{shell.map.tableCaption}</summary>
            <DepTable nodes={nodes} edges={model.edges} />
          </details>
        </>
      )}

      {model.nodes.length > 0 && effective === 'table' && (
        <div className="proj-table-view" data-testid="table-view">
          <h3 className="proj-sub">{t.componentsList}</h3>
          <ul className="proj-list" aria-label={t.componentsList}>
            {model.nodes.map((n) => (
              <li key={n.id} data-component={n.id}>
                <a
                  className="proj-comp-link"
                  href={hrefFor({ name: 'project', projectId: project.id, componentId: n.id })}
                  aria-current={n.id === selectedId ? 'true' : undefined}
                >
                  <bdi dir="ltr" className="ltr">{n.name}</bdi>
                </a>
                <span className="proj-comp-meta">
                  {copy.health[n.triad.health]} · {layerWords[n.layer]}
                  {n.checkFailing && <> · <Text s={copy.checkFailing[persona]} /></>}
                  {n.id === selectedId && <> · {t.selectedMark}</>}
                </span>
              </li>
            ))}
          </ul>
          <DepTable nodes={nodes} edges={model.edges} />
        </div>
      )}
    </Panel>
  );
}
