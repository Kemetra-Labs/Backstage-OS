import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Panel } from '../components/Panel';
import { ScreenHeader } from '../components/ScreenHeader';
import { Segmented } from '../components/Segmented';
import { PORTFOLIO_COPY } from '../i18n/screens/portfolio';
import { portfolioView, type ProductFilter } from '../view/portfolioView';
import '../styles/screens/portfolio.css';
import { AttentionEvidence } from './portfolio/AttentionEvidence';
import { ProductEntry } from './portfolio/ProductEntry';

/** Portfolio / Mission Overview (BACK-11): one entry per product and an evidence-linked attention list. */
export function Portfolio() {
  const { shell, lang, persona, world } = useApp();
  const c = PORTFOLIO_COPY[lang];
  const [filter, setFilter] = useState<ProductFilter>('all');
  const v = useMemo(() => portfolioView(world, persona, lang, filter), [world, persona, lang, filter]);
  return (
    <>
      <ScreenHeader title={shell.nav.portfolio} lede={c.lede[persona]} />
      <Segmented<ProductFilter>
        label={c.filter.label}
        value={filter}
        onChange={setFilter}
        options={v.options.map((o) => (o.name ? { value: o.value, label: o.name, lang: 'en' } : { value: o.value, label: c.filter.all }))}
      />
      <section className="pf-products" aria-label={c.productsTitle}>
        {v.products.map((p) => <ProductEntry key={p.id} entry={p} />)}
      </section>
      <Panel id="pf-attention" title={c.attentionList.title} tone="raised" testId="portfolio-attention">
        <AttentionEvidence items={v.attention} empty={v.attentionEmpty} />
      </Panel>
    </>
  );
}
