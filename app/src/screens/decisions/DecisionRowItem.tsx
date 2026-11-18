import { formatAge } from '../../i18n/segments';
import { hrefFor } from '../../nav/routes';
import type { DecisionRow } from '../../view/decisionView';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { useDecisionsUi } from './useDecisionsUi';

/** One inbox row. The title is plain text; the link label is neutral so no fixture wording sits inside a control. */
export function DecisionRowItem({ row, historical }: { readonly row: DecisionRow; readonly historical: boolean }) {
  const { lang, copy, shell, c, style } = useDecisionsUi();
  const e = row.evidence;
  return (
    <li className="dec-row" data-decision={row.id}>
      <div className="dec-row-head">
        <bdi dir="ltr" className="dec-id">{row.id}</bdi>
        <TruthChip label={row.label} style={style} copy={copy} />
        <span className={`sev sev-${row.priority}`}>{c.priority}: {shell.severity[row.priority]}</span>
      </div>
      <p className="dec-title"><Text s={row.title} /></p>
      <ul className="meta">
        <li>{c.project}: <Text s={`{${row.projectName}}`} /></li>
        <li>{c.age} {formatAge(row.ageMinutes, lang)}</li>
      </ul>
      <p className="note" data-part="evidence"><Text s={c.evidenceSummary(e.read, e.notRead, e.restricted, copy.freshness[e.worst])} /></p>
      <p className="note" data-part="unknowns">{c.unknownsLine(row.unknownsCount)}</p>
      <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'decision', id: row.id })}>
        <Text s={historical ? c.openRecord(row.id) : c.openProposal(row.id)} />
      </a>
    </li>
  );
}
