import { Panel } from '../../components/Panel';
import { StateBlock } from '../../components/StateBlock';
import type { SourcesCopy } from '../../i18n/screens/sources';
import type { Copy } from '../../i18n/strings';
import type { Affected } from '../../view/sourceView';

interface Props {
  readonly copy: SourcesCopy;
  readonly shared: Copy;
  readonly unavailable: readonly Affected[];
  readonly notConfigured: readonly Affected[];
}

const list = (a: readonly Affected[], shared: Copy, sep: string): string =>
  a.map((x) => `{${x.product}} {${shared.provider[x.provider]}}`).join(sep);

/** The two states that are never OK, said in words with who is affected. */
export function StatePanel({ copy, shared, unavailable, notConfigured }: Props) {
  if (unavailable.length === 0 && notConfigured.length === 0) return null;
  return (
    <Panel id="sources-states" title={copy.stateHeading} testId="states">
      <div className="state-grid">
        {unavailable.length > 0 && (
          <StateBlock kind="unavailable" body={copy.stateBlock.unavailable(list(unavailable, shared, copy.affectedSep))} />
        )}
        {notConfigured.length > 0 && (
          <StateBlock kind="not_configured" body={copy.stateBlock.not_configured(list(notConfigured, shared, copy.affectedSep))} />
        )}
      </div>
    </Panel>
  );
}
