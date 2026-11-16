import { useApp } from '../app/AppContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { WORLD } from '../fixture/world';
import { SOURCES_COPY } from '../i18n/screens/sources';
import { affectedBy, productSources, providersInUse } from '../view/sourceView';
import '../styles/screens/sources.css';
import { DimensionsPanel } from './sources/DimensionsPanel';
import { IntegrationsPanel } from './sources/IntegrationsPanel';
import { ProductTable } from './sources/ProductTable';
import { StatePanel } from './sources/StatePanel';

/** Source health (demo only): connectivity and freshness per product. Target health lives on the product pages. */
export function Sources() {
  const { shell, lang, persona, copy: shared } = useApp();
  const copy = SOURCES_COPY[lang];
  const products = productSources(WORLD);
  return (
    <>
      <ScreenHeader title={shell.nav.sources} lede={<Text s={copy.lede} />} />
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
      <IntegrationsPanel copy={copy} shared={shared} persona={persona} providers={providersInUse(WORLD)} />
    </>
  );
}
