-- 0004_decision_audit.sql — the decision creator lookup gets an index, and a HumanDecision cannot
-- commit without its decision.recorded audit row (BACK-100, owner approved 2026-11-26).
-- Runs as kawalys_migrator, search_path = kawalys. No role or grant changes.

-- Serves the creator lookup of EvidenceRepository.recentDecisions (BACK-59):
--   WHERE workspace_id = current_workspace_id()   -- the forced RLS policy
--     AND target_type = 'evidence' AND target_id = <decision id> AND action = 'decision.recorded'
--   ORDER BY occurred_at, id LIMIT 1
-- Equality columns first, then the sort columns, so the first matching entry is the answer.
CREATE INDEX audit_events_by_target
  ON audit_events (workspace_id, target_type, target_id, action, occurred_at, id);

-- At commit, every HumanDecision row needs its decision.recorded audit row (same workspace, target
-- id = the decision id). recordDecision() inserts the evidence row first and the audit row later in
-- the same transaction, so the check is DEFERRABLE INITIALLY DEFERRED: it runs at COMMIT, when both
-- rows exist.
--
-- SECURITY INVOKER (the default), on purpose: the check runs as the inserting role under the same
-- forced RLS. It can only see audit rows of the current workspace context, which is the context the
-- evidence row itself had to satisfy (WITH CHECK). A missing context, or a context switched to another
-- workspace before commit, hides the audit row, so the insert is refused: it fails closed, never open.
-- kawalys_app already holds SELECT on audit_events, so no definer rights are needed.
-- The table is schema-qualified and search_path is pinned, so nothing in the caller's path (a
-- temporary table named audit_events, say) can stand in for it.
CREATE FUNCTION evidence_decision_has_audit() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM kawalys.audit_events a
     WHERE a.workspace_id = NEW.workspace_id
       AND a.target_type = 'evidence'
       AND a.target_id = NEW.id
       AND a.action = 'decision.recorded'
  ) THEN
    RAISE EXCEPTION 'evidence: a HumanDecision needs its decision.recorded audit row'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER evidence_decision_audited
  AFTER INSERT ON evidence
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.type = 'HumanDecision')
  EXECUTE FUNCTION evidence_decision_has_audit();
-- Like the append-only triggers: it also fires with session_replication_role = replica.
ALTER TABLE evidence ENABLE ALWAYS TRIGGER evidence_decision_audited;
