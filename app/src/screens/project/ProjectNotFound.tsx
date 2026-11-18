import { useApp } from '../../app/AppContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { PROJECT_COPY } from '../../i18n/screens/project';
import { hrefFor } from '../../nav/routes';

interface Props {
  readonly projectId: string;
  readonly componentId?: string;
  /** Present when the product exists but the component does not. */
  readonly projectName?: string;
}

/** Neutral error: unknown ids are said plainly, with links back. Never a guess at what was meant. */
export function ProjectNotFound({ projectId, componentId, projectName }: Props) {
  const { lang, shell } = useApp();
  const t = PROJECT_COPY[lang].notFound;
  const missingComponent = projectName !== undefined && componentId !== undefined;
  return (
    <>
      <ScreenHeader title={shell.nav.project} />
      <div data-testid="project-error">
        <StateBlock
          kind="error"
          title={missingComponent ? t.componentTitle : t.projectTitle}
          body={missingComponent ? t.componentBody(componentId) : t.projectBody(projectId)}
        >
          <ul className="proj-links">
            <li><a className="btn btn-quiet btn-link" href={hrefFor({ name: 'portfolio' })}>{t.openPortfolio}</a></li>
            {missingComponent && (
              <li>
                <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'project', projectId })}>
                  <Text s={t.viewProject(projectName)} />
                </a>
              </li>
            )}
          </ul>
        </StateBlock>
      </div>
    </>
  );
}
