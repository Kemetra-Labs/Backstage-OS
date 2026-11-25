import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { L } from '../components/L';
import { ScreenHeader } from '../components/ScreenHeader';
import type { WorldComponent, WorldProject } from '../contract/world';
import { hrefFor } from '../nav/routes';
import { DEFAULT_FILTERS, deliveryRows, risksFor, sourceRows, type Filters } from '../view/projectView';
import { componentById, projectById, triadOf } from '../view/world';
import '../styles/screens/project.css';
import { ComponentPanel } from './project/ComponentPanel';
import { DeliveryPanel } from './project/DeliveryPanel';
import { MapPanel, type ViewMode } from './project/MapPanel';
import { ProjectNotFound } from './project/ProjectNotFound';
import { RisksPanel } from './project/RisksPanel';
import { StatusPanel } from './project/StatusPanel';
import { useNarrow } from './project/useNarrow';
import { hostCopy } from '../i18n/host';

interface Props {
  readonly projectId: string;
  readonly componentId?: string;
}

/** Project Intelligence (BACK-12): dependency map, selected component, CI evidence, risks and unknowns. */
export function Project({ projectId, componentId }: Props) {
  const { world } = useApp();
  const project = projectById(world, projectId);
  if (!project) return <ProjectNotFound projectId={projectId} />;
  const component = componentId === undefined ? undefined : componentById(project, componentId);
  if (componentId !== undefined && !component) {
    return <ProjectNotFound projectId={projectId} componentId={componentId} projectName={project.name} />;
  }
  // Keyed by product so filters and the view mode reset when another product opens.
  return <ProjectBody key={project.id} project={project} component={component} />;
}

function ProjectBody({ project, component }: { readonly project: WorldProject; readonly component: WorldComponent | undefined }) {
  const { lang, persona, shell } = useApp();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<ViewMode>('map');
  const narrow = useNarrow();
  const t = hostCopy('PROJECT_COPY', lang);
  const projectHref = hrefFor({ name: 'project', projectId: project.id });
  const crumbs = [
    { label: shell.nav.portfolio, href: hrefFor({ name: 'portfolio' }) },
    component ? { label: `{${project.name}}`, href: projectHref } : { label: `{${project.name}}` },
    ...(component ? [{ label: `{${component.name}}` }] : []),
  ];

  return (
    <>
      <ScreenHeader
        title={t.h1(project.name)}
        crumbs={crumbs}
        lede={<L t={project.summary} />}
        meta={
          <>
            <li><bdi dir="ltr">{project.id}</bdi></li>
            {lang === 'ar' && <li><bdi dir="ltr">{project.name}</bdi></li>}
            <li>{project.components.length === 0 ? t.noComponents : t.componentsCount(project.components.length)}</li>
          </>
        }
      />
      <StatusPanel triad={triadOf(project.health)} sources={sourceRows(project)} />
      <div className="grid-main-side proj-main" data-persona={persona}>
        <MapPanel
          project={project}
          selectedId={component?.id}
          filters={filters}
          onFilters={setFilters}
          mode={mode}
          onMode={setMode}
          narrow={narrow}
        />
        <ComponentPanel project={project} component={component} />
      </div>
      <div className="grid-2">
        <DeliveryPanel rows={deliveryRows(project, persona, lang)} />
        <RisksPanel projectId={project.id} risks={risksFor(project)} hasComponents={project.components.length > 0} />
      </div>
    </>
  );
}
