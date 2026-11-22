import { useApp } from '../../app/AppContext';
import { summaryFor } from '../../view/investigationView';
import { ContextPanel, DecisionPanel, MissingPanel } from './panels';
import { TimelinePanel } from './TimelinePanel';

/**
 * Sections below the S1 room (BACK-6): timeline, missing evidence, proposed decision and context. They add no health,
 * fact or source elements, so the room's own truth assertions keep counting exactly what they counted before.
 */
export function RoomExtras({ id }: { readonly id: string }) {
  const { persona, world } = useApp();
  const s = summaryFor(world, id, persona);
  if (!s) return null;
  return (
    <>
      <TimelinePanel investigationId={id} evidence={s.investigation.evidence} />
      <div className="grid-2">
        <MissingPanel missing={s.investigation.missing} />
        <DecisionPanel decision={s.decision} />
      </div>
      <ContextPanel project={s.project} component={s.component} />
    </>
  );
}
