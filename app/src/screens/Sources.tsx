import { lazy, Suspense } from 'react';
import { useApp } from '../app/AppContext';
import { LensBoundary } from '../components/LensBoundary';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { hrefFor } from '../nav/routes';
import { affectedBy, productSources, providersInUse } from '../view/sourceView';
import '../styles/screens/sources.css';
import { DimensionsPanel } from './sources/DimensionsPanel';
import { IntegrationsPanel } from './sources/IntegrationsPanel';
import { ProductTable } from './sources/ProductTable';
import { StatePanel } from './sources/StatePanel';
import { hostCopy } from '../i18n/host';

// BACK-88: the Observatory is another view of this screen, loaded only when asked for (its code and sheets are a lazy chunk).
const SourceObservatoryLens = lazy(() => import('./SourceObservatoryLens'));

/**
 * Source health (demo only): connectivity and freshness per product. Target health lives on the product pages.
 * The Observatory view (`#/sources/observatory[/<provider>]`) adds the three-reading cards, the source timeline and the inspector
 * for the same sources; the tables stay the default view and are unchanged.
 */
export function Sources() {
  const { shell, lang, persona, copy: shared, world, route } = useApp();
  const copy = hostCopy('SOURCES_COPY', lang);
  const views = hostCopy('SOURCES_VIEW_COPY', lang);
  const observatory = route.name === 'sources' && route.view === 'observatory';
  const products = productSources(world);
  return (
    <>
      <ScreenHeader title={shell.nav.sources} lede={<Text s={copy.lede} />} />
      <nav className="view-switch" aria-label={views.label}>
        <a href={hrefFor({ name: 'sources' })} aria-current={observatory ? undefined : 'page'} data-view="tables">{views.tables}</a>
        <a href={hrefFor({ name: 'sources', view: 'observatory' })} aria-current={observatory ? 'page' : undefined} data-view="observatory">{views.observatory}</a>
      </nav>
      {observatory ? (
        <LensBoundary label="Source Observatory" fallback={<p className="note" role="status" data-testid="observatory-failed">{views.failed}</p>}>
          <Suspense fallback={<p className="note" role="status" data-testid="observatory-loading">{views.loading}</p>}>
            <SourceObservatoryLens />
          </Suspense>
        </LensBoundary>
      ) : (
        <>
          <DimensionsPanel copy={copy} persona={persona} />
          {products.map((p) => (
            <ProductTable key={p.id} product={p} copy={copy} shared={shared} lang={lang} persona={persona} />
          ))}
          <StatePanel
            copy={copy}
            shared={shared}
            unavailable={affectedBy(products, 'unavailable')}
            notConfigured={affectedBy(products, 'not_configured')}
          />
          <IntegrationsPanel copy={copy} shared={shared} persona={persona} providers={providersInUse(world)} />
        </>
      )}
    </>
  );
}
