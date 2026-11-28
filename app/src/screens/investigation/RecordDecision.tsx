import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useSession, useSessionDraft, useSessionStore } from '../../app/SessionContext';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { hostCopy } from '../../i18n/host';
import type { StateKind } from '../../i18n/shell';
import {
  answerStillCurrent, createSubmitGuard, DECISION_MAX, draftProblems, EMPTY_DRAFT, formGate, planSubmit, pruneForReshow, RATIONALE_MAX, settleAnswer, submitDecision, withoutSubmitKey, withSubmitKey, type DecisionDraft, type DraftProblem, type SubmitResult,
} from '../../live/decisions';
import type { SessionStatus } from '../../live/session';
import type { RecordRow } from '../../view/investigationReadView';

/** What the form can show after a submit: the server's answer, or (nothing sent) a ticked record that left the list. */
export type FormResult = SubmitResult | 'citationsChanged';

/**
 * open: the form. locked: the session is locked, so no draft text, record or control is shown (BACK-127). rereading: unlocked, but
 * the case has not been read again for this sign-in, so the draft stays hidden until it has (and is pruned to what that read lists).
 */
export type FormGate = 'open' | 'locked' | 'rereading';

export interface RecordDecisionViewProps {
  readonly gate: FormGate;
  readonly draft: DecisionDraft;
  /** The records of this case that can be cited. */
  readonly records: readonly RecordRow[];
  /** Technical also sees each record's source reference. */
  readonly technical: boolean;
  readonly sessionStatus: SessionStatus;
  readonly submitting: boolean;
  /** After a submit attempt: blank fields are named too. A broken limit is always named. */
  readonly showProblems: boolean;
  readonly result: FormResult | null;
  readonly onChange: (d: DecisionDraft) => void;
  readonly onSubmit: () => void;
}

/** Problems that are always said (the owner is mid-typing past a limit); blank fields wait for a submit attempt. */
const ALWAYS: readonly DraftProblem[] = ['decisionTooLong', 'rationaleTooLong', 'tooManyEvidence', 'unstorable'];

const RESULT_KIND: Readonly<Record<Exclude<FormResult, 'recorded'>, StateKind>> = {
  citationsChanged: 'unknown',
  idempotency_conflict: 'error',
  invalid: 'error',
  not_found: 'unknown',
  rate_limited: 'error',
  unavailable: 'unavailable',
  error: 'error',
};

/**
 * The decision form (BACK-51 P3, live mode), in words for every state. Prop-driven so it renders anywhere. It records what a
 * person decided and never says approved. While the session is not signed in the draft stays and submit is off, with the
 * reason; a failed or unconfirmed send keeps the draft and says so. No record id is shown.
 */
export function RecordDecisionView({ gate, draft, records, technical, sessionStatus, submitting, showProblems, result, onChange, onSubmit }: RecordDecisionViewProps) {
  const { lang, copy } = useApp();
  const c = hostCopy('INVESTIGATION', lang).recordDecision;
  const s = hostCopy('INVESTIGATION', lang).serverRecords;
  if (gate !== 'open') {
    // Nothing of the draft, the records or any control while locked, and nothing until the case is read again after unlocking.
    return (
      <section className="rec-decision" aria-labelledby="rd-title" data-testid="record-decision" data-gate={gate}>
        <h3 id="rd-title">{c.title}</h3>
        {gate === 'locked' ? <StateBlock kind="unknown" title={c.locked.title} body={c.locked.body} /> : <p className="note" role="status">{c.rereading}</p>}
      </section>
    );
  }
  const all = draftProblems(draft);
  const shown = all.filter((p) => showProblems || ALWAYS.includes(p));
  const bad = (a: DraftProblem, b: DraftProblem) => shown.includes(a) || shown.includes(b);
  const canSubmit = sessionStatus === 'signedIn' && !submitting;
  const toggle = (id: string) =>
    onChange({ ...draft, evidenceIds: draft.evidenceIds.includes(id) ? draft.evidenceIds.filter((x) => x !== id) : [...draft.evidenceIds, id] });

  return (
    <section className="rec-decision" aria-labelledby="rd-title" data-testid="record-decision" data-gate="open">
      <h3 id="rd-title">{c.title}</h3>
      <p className="note"><Text s={c.lede} /></p>
      <form noValidate aria-busy={submitting ? 'true' : undefined} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <div className="rd-field">
          <label htmlFor="rd-decision">{c.decisionLabel}</label>
          <textarea
            id="rd-decision"
            rows={3}
            value={draft.decision}
            readOnly={submitting}
            onChange={(e) => onChange({ ...draft, decision: e.target.value })}
            aria-invalid={bad('decisionBlank', 'decisionTooLong') ? 'true' : undefined}
            aria-describedby="rd-decision-count rd-errors"
          />
          <p id="rd-decision-count" className="rd-count"><Text s={c.counter(draft.decision.length, DECISION_MAX)} /></p>
        </div>
        <div className="rd-field">
          <label htmlFor="rd-rationale">{c.rationaleLabel}</label>
          <textarea
            id="rd-rationale"
            rows={5}
            value={draft.rationale}
            readOnly={submitting}
            onChange={(e) => onChange({ ...draft, rationale: e.target.value })}
            aria-invalid={bad('rationaleBlank', 'rationaleTooLong') ? 'true' : undefined}
            aria-describedby="rd-rationale-count rd-errors"
          />
          <p id="rd-rationale-count" className="rd-count"><Text s={c.counter(draft.rationale.length, RATIONALE_MAX)} /></p>
        </div>
        <fieldset className="rd-evidence">
          <legend>{c.evidenceLegend}</legend>
          <p className="note">{c.evidenceHint}</p>
          {records.length === 0 ? <p className="note">{c.evidenceNone}</p> : (
            <ul className="rows rd-rows">
              {records.map((r, i) => (
                <li key={r.id}>
                  <label className="rd-pick">
                    <input type="checkbox" checked={draft.evidenceIds.includes(r.id)} disabled={submitting} onChange={() => toggle(r.id)} />
                    <span className="rd-pos"><Text s={c.record(i + 1)} /></span>
                    <TruthChip label={r.label} style="standard" copy={copy} />
                    <span className="srv-read">{s.read[r.read]}</span>
                    {r.ageMinutes !== null && <span className="srv-age"> · <Text s={s.age(r.ageMinutes)} /></span>}
                    {technical && r.sourceRef && <span> · <bdi dir="ltr" className="srv-ref">{r.sourceRef}</bdi></span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div id="rd-errors" aria-live="polite">
          {shown.length > 0 && <ul className="rd-errors">{shown.map((p) => <li key={p}>{c.problems[p]}</li>)}</ul>}
        </div>
        {sessionStatus !== 'signedIn' && <p className="note rd-session">{c.needSession[sessionStatus]}</p>}
        <p className="rd-actions">
          <button type="submit" className="btn" disabled={!canSubmit}>{submitting ? c.submitting : c.submit}</button>
        </p>
      </form>
      {/* Always in the page, so a screen reader announces the text when it is filled in. */}
      <div role="status">
        {result === 'recorded' && (
          <div className="rd-result rd-ok">
            <p className="state-title">{c.result.recorded.title}</p>
            <p className="note">{c.result.recorded.body}</p>
          </div>
        )}
      </div>
      {result !== null && result !== 'recorded' && (
        <div role="alert" className="rd-result">
          <StateBlock kind={RESULT_KIND[result]} title={c.result[result].title} body={c.result[result].body} />
        </div>
      )}
    </section>
  );
}

/**
 * The decision form wired to the live session and the in-memory draft (useSessionDraft, key `decision:<investigationId>`): the
 * draft survives a session that ends and the sign-in after it, and is cleared only by a recorded decision or an explicit sign-out.
 * One submit at a time (D5 (a)); a not_found is reported to the session, which decides signed out versus a hidden case.
 */
export function RecordDecision({ investigationId, records, technical, readGeneration, onSubmitted }: {
  readonly investigationId: string;
  readonly records: readonly RecordRow[];
  readonly technical: boolean;
  /** The session generation for which this case was last read successfully while unlocked; null if never. The draft returns only for the current one. */
  readonly readGeneration: number | null;
  /** The decision list should be read again: after a recorded decision, and after an answer where it may have been recorded anyway. */
  readonly onSubmitted: () => void;
}) {
  const store = useSessionStore();
  const session = useSession();
  const [draft, setDraft] = useSessionDraft<DecisionDraft>(`decision:${investigationId}`);
  const [guard] = useState(createSubmitGuard);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FormResult | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const current = draft ?? EMPTY_DRAFT;
  const gate: FormGate = formGate(session, readGeneration);
  const open = gate === 'open';

  // Re-show (BACK-127): when the draft comes back after a lock, prune its ticked records to the fresh read and say so if one left.
  useEffect(() => {
    if (!open) return;
    const pruned = pruneForReshow(draft, records.map((r) => r.id));
    if (pruned.changed) setDraft(pruned.draft);
    setResult(pruned.changed ? 'citationsChanged' : null);
    // On the gate opening only: later list changes are handled at submit (planSubmit), as before.
  }, [open]);

  const submit = () => {
    if (!open || session?.status !== 'signedIn' || session.locked) return;
    const started = session.generation;
    const plan = planSubmit(current, records.map((r) => r.id));
    if (plan.kind === 'problems') {
      setShowProblems(true);
      return;
    }
    if (plan.kind === 'citationsChanged') {
      // A ticked record left the list: prune it and send nothing, so the owner sees the change first.
      setDraft(plan.sendable);
      setResult('citationsChanged');
      return;
    }
    void guard.run(async () => {
      setSubmitting(true);
      try {
        // BACK-172 G4: one key per attempt, kept with the draft; a retry after an unknown outcome sends the same key, so the
        // server answers with the first decision instead of recording a second one. Any edit drops it (onChange below).
        const keyed = withSubmitKey(plan.sendable);
        setDraft(keyed);
        const r = await submitDecision(investigationId, keyed);
        // An answer that lands after the session locked or signed in again shows nothing and leaves the draft as it was (BACK-127).
        const out = settleAnswer(r, answerStillCurrent(started, store?.getSnapshot() ?? null));
        if (out.show !== null) setResult(out.show);
        if (out.clearDraft) {
          setDraft(undefined);
          setShowProblems(false);
        }
        // The key was used for a different request: nothing was recorded; the next attempt starts a new one.
        if (out.show === 'idempotency_conflict') setDraft(withoutSubmitKey(keyed));
        if (out.reportNotFound) store?.reportNotFound();
        if (out.refreshList) onSubmitted();
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <RecordDecisionView
      gate={gate}
      draft={current}
      records={records}
      technical={technical}
      sessionStatus={session?.status ?? 'checking'}
      submitting={submitting}
      showProblems={showProblems}
      result={result === 'not_found' && session?.status !== 'signedIn' ? null : result}
      onChange={(d) => { setDraft(withoutSubmitKey(d)); setResult(null); }}
      onSubmit={submit}
    />
  );
}
