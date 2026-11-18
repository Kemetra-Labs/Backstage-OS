import { useApp } from '../../app/AppContext';
import { L } from '../../components/L';
import { Text } from '../../components/Text';
import { Timeline, type TimelineItem } from '../../components/Timeline';
import { HOME_COPY } from '../../i18n/screens/home';
import { hrefFor } from '../../nav/routes';
import type { HomeActivity } from '../../view/homeView';

const LIMIT = 6;

/** A short, newest-first timeline. Agent events are simulated; their own text says so and the actor line repeats it. */
export function Activity({ items }: { readonly items: readonly HomeActivity[] }) {
  const { lang } = useApp();
  const h = HOME_COPY[lang];
  const shown: readonly TimelineItem[] = items.slice(0, LIMIT).map((e) => ({
    id: e.id,
    minutesAgo: e.minutesAgo,
    truth: e.truth,
    title: <L t={e.text} />,
    meta: (
      <>
        {h.activity.actor[e.actor]} · <bdi dir="ltr">{e.projectName}</bdi>
        {e.investigationId && (
          <>
            {' '}
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'investigation', id: e.investigationId })}>
              <Text s={h.openCase(e.investigationId)} />
            </a>
          </>
        )}
      </>
    ),
  }));
  return (
    <>
      <p className="note"><Text s={h.activity.note} /></p>
      <Timeline items={shown} label={h.activity.title} />
    </>
  );
}
