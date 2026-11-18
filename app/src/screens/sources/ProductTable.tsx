import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import type { Lang, Persona } from '../../contract/types';
import type { SourcesCopy } from '../../i18n/screens/sources';
import { formatAge } from '../../i18n/segments';
import type { Copy } from '../../i18n/strings';
import type { ProductSources } from '../../view/sourceView';

interface Props {
  readonly product: ProductSources;
  readonly copy: SourcesCopy;
  readonly shared: Copy;
  readonly lang: Lang;
  readonly persona: Persona;
}

/** One product: a table of its source bindings with a summary row. Never shows a health verdict. */
export function ProductTable({ product, copy, shared, lang, persona }: Props) {
  const t = copy.table;
  return (
    <Panel
      id={`sources-${product.id}`}
      title={<Text s={`{${product.name}}`} />}
      aside={<span data-summary={product.id}>{copy.summary(product.summary)}</span>}
      testId={`product-${product.id}`}
    >
      <div className="table-scroll">
        <table className="data-table source-table" data-product={product.id}>
          <caption><Text s={t.caption(product.name)} /></caption>
          <thead>
            <tr>
              <th scope="col">{t.provider}</th>
              <th scope="col">{t.connectivity}</th>
              <th scope="col">{t.freshness}</th>
              <th scope="col">{t.observation}</th>
              <th scope="col"><Text s={t.ttl} /></th>
              <th scope="col">{t.marker}</th>
            </tr>
          </thead>
          <tbody>
            {product.rows.map((r) => (
              <tr key={r.provider} data-provider={r.provider} data-connectivity={r.connectivity} data-freshness={r.freshness}>
                <th scope="row"><Text s={`{${shared.provider[r.provider]}}`} /></th>
                <td className={`src-conn src-conn-${r.connectivity}`} data-dim="connectivity">{shared.connectivity[r.connectivity]}</td>
                <td className={`src-fresh src-fresh-${r.freshness}`} data-dim="freshness">{shared.freshness[r.freshness]}</td>
                <td data-dim="observation">{formatAge(r.ageMinutes, lang)}</td>
                <td data-dim="ttl">
                  {r.ttlMinutes}
                  {persona === 'technical' && <span className="note"> ({t.ttlSeconds(r.ttlSeconds)})</span>}
                </td>
                <td data-dim="marker">{r.synthetic ? <span className="src-marker">{t.synthetic}</span> : null}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-summary-row={product.id}>
              <th scope="row">{t.summaryRow}</th>
              <td colSpan={5}>{copy.summary(product.summary)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}
