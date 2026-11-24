// BACK-89: the three times of the replay, kept apart (src/bridge/replayTime.ts). Rendered inside the Replay lens, so it reads the same
// host-derived persona and language as the replay itself and only the persona's authorized world. Read-only. Synthetic data only.
import { useApp } from '../app/AppContext';
import { replayTimeRows, type OrderStatus } from '../bridge/replayTime';
import { Lt, Tx } from '../lenses/components/ui';
import { useLens } from '../lenses/useLens';
import { WORLD } from '../lenses/fixtures/world';
import { authorizedWorld } from '../lenses/logic/authorize';
import type { K } from '../i18n';
import { REPLAY_VIEW_COPY } from '../i18n/screens/map';

const hhmm = (iso: string): string => `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;

export function ReplayTimeBasis() {
  const { lang } = useApp();
  const { route, t } = useLens();
  const copy = REPLAY_VIEW_COPY[lang].basis;
  const rows = replayTimeRows(authorizedWorld(WORLD, route.persona));
  const events = new Map(authorizedWorld(WORLD, route.persona).replay.map((e) => [e.id, e.key]));
  const label: Readonly<Record<OrderStatus, string>> = { consistent: copy.consistent, uncertain: copy.uncertain, unknown: copy.unknown };
  return (
    <section className="kv2-panel kv2-rtb" aria-labelledby="rtb-h" data-testid="replay-time-basis">
      <header className="kv2-panel-head">
        <div className="kv2-panel-titles">
          <h2 id="rtb-h">{copy.title}</h2>
          <p><Tx s={copy.intro} /></p>
        </div>
      </header>
      <div className="kv2-table-wrap" tabIndex={0} role="region" aria-label={copy.caption}>
        <table className="kv2-table">
          <caption className="kv2-sr">{copy.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.step}</th><th scope="col">{copy.event}</th><th scope="col"><Tx s={copy.processed} /></th>
              <th scope="col">{copy.observed}</th><th scope="col">{copy.order}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-order={r.order}>
                <td><Lt>{r.step}</Lt></td>
                <th scope="row"><Tx s={t(events.get(r.id) as K)} /></th>
                <td><Lt>{r.processedAt}</Lt></td>
                <td>{r.observedAt ? <Lt>{hhmm(r.observedAt)}</Lt> : copy.notEvidenced}</td>
                <td>{label[r.order]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="kv2-insp-sub">{copy.occurred}</p>
    </section>
  );
}
