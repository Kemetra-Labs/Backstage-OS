-- 0003_evidence.sql — projects, sources, source grants, investigations and typed evidence
-- (BACK-55 S3, gate A, 2026-11-23). Runs as kawalys_migrator, search_path = kawalys.
--
-- Foreign-key checks bypass RLS, so every reference between workspace tables is a
-- COMPOSITE key that includes workspace_id: a row can never point into another workspace.

CREATE FUNCTION refuse_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Portfolio items.
CREATE TABLE projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces (id),
  key           text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key),
  UNIQUE (workspace_id, id)
);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_scope ON projects
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON projects TO kawalys_app;
GRANT INSERT (workspace_id, key, name) ON projects TO kawalys_app;

-- One connected source, e.g. one GitHub repository (read-only).
CREATE TABLE sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  project_id      uuid NOT NULL,
  provider        text NOT NULL CHECK (provider = 'github'),
  -- GitHub owner/repo names are case-insensitive: stored lower-case so one repo is one source.
  external_ref    text NOT NULL CHECK (length(external_ref) BETWEEN 1 AND 300 AND external_ref = lower(external_ref)),
  classification  text NOT NULL DEFAULT 'internal' CHECK (classification IN ('internal', 'restricted')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, external_ref),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
);
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources FORCE ROW LEVEL SECURITY;
CREATE POLICY sources_scope ON sources
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON sources TO kawalys_app;
GRANT INSERT (workspace_id, project_id, provider, external_ref) ON sources TO kawalys_app;

-- A user's current permission to see one source's evidence. Revocation is one-way.
CREATE TABLE source_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  source_id     uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES users (id),
  granted_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  FOREIGN KEY (workspace_id, source_id) REFERENCES sources (workspace_id, id)
);
CREATE UNIQUE INDEX source_grants_one_active ON source_grants (source_id, user_id) WHERE revoked_at IS NULL;
ALTER TABLE source_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY source_grants_scope ON source_grants
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON source_grants TO kawalys_app;
GRANT INSERT (workspace_id, source_id, user_id) ON source_grants TO kawalys_app;
GRANT UPDATE (revoked_at) ON source_grants TO kawalys_app;

CREATE FUNCTION source_grants_revoke_once() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
     AND (to_jsonb(NEW) - 'revoked_at') = (to_jsonb(OLD) - 'revoked_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'source_grants: only a one-way revocation is permitted'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER source_grants_revoke_once BEFORE UPDATE ON source_grants
  FOR EACH ROW EXECUTE FUNCTION source_grants_revoke_once();
CREATE TRIGGER source_grants_no_delete BEFORE DELETE OR TRUNCATE ON source_grants
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
ALTER TABLE source_grants ENABLE ALWAYS TRIGGER source_grants_revoke_once;
ALTER TABLE source_grants ENABLE ALWAYS TRIGGER source_grants_no_delete;

CREATE TABLE investigations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  project_id    uuid NOT NULL,
  title         text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
);
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigations FORCE ROW LEVEL SECURITY;
CREATE POLICY investigations_scope ON investigations
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON investigations TO kawalys_app;
GRANT INSERT (workspace_id, project_id, title) ON investigations TO kawalys_app;

-- Typed evidence. Unknown is stored as state 'unknown', never dropped and never defaulted:
-- `state` has no default. A HumanDecision has no source and must belong to an investigation;
-- every other type comes from exactly one source. Append-only: corrections are new rows.
CREATE TABLE evidence (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  project_id        uuid NOT NULL,
  source_id         uuid,
  investigation_id  uuid,
  type              text NOT NULL CHECK (type IN ('Observation', 'Correlation', 'Hypothesis', 'HumanDecision')),
  state             text NOT NULL CHECK (state IN ('ok', 'stale', 'unknown', 'denied', 'error')),
  source_ref        text NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 500),
  observed_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  payload           jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  CHECK ((type = 'HumanDecision') = (source_id IS NULL)),
  CHECK (type <> 'HumanDecision' OR investigation_id IS NOT NULL),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id),
  -- Same project: a source or an investigation of another project cannot be referenced.
  FOREIGN KEY (workspace_id, project_id, source_id) REFERENCES sources (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id, investigation_id) REFERENCES investigations (workspace_id, project_id, id)
);
CREATE INDEX evidence_by_source ON evidence (workspace_id, source_id, observed_at DESC);
CREATE INDEX evidence_by_investigation ON evidence (workspace_id, investigation_id, observed_at DESC);
CREATE INDEX evidence_by_project ON evidence (workspace_id, project_id, observed_at DESC);
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_scope ON evidence
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON evidence TO kawalys_app;
GRANT INSERT (workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, payload)
  ON evidence TO kawalys_app;

CREATE TRIGGER evidence_append_only_row BEFORE UPDATE OR DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER evidence_append_only_stmt BEFORE UPDATE OR DELETE OR TRUNCATE ON evidence
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
ALTER TABLE evidence ENABLE ALWAYS TRIGGER evidence_append_only_row;
ALTER TABLE evidence ENABLE ALWAYS TRIGGER evidence_append_only_stmt;

-- What a HumanDecision cites, as rows (not inside the decision payload), so a reader is shown
-- a decision only if every cited row is visible to that reader: citations cannot reveal that
-- restricted evidence exists. Same workspace AND same project as the decision.
CREATE TABLE evidence_citations (
  workspace_id  uuid NOT NULL,
  project_id    uuid NOT NULL,
  decision_id   uuid NOT NULL,
  evidence_id   uuid NOT NULL,
  PRIMARY KEY (decision_id, evidence_id),
  CHECK (decision_id <> evidence_id),
  FOREIGN KEY (workspace_id, project_id, decision_id) REFERENCES evidence (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id, evidence_id) REFERENCES evidence (workspace_id, project_id, id)
);
CREATE INDEX evidence_citations_by_evidence ON evidence_citations (evidence_id);
ALTER TABLE evidence_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_citations FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_citations_scope ON evidence_citations
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON evidence_citations TO kawalys_app;
GRANT INSERT (workspace_id, project_id, decision_id, evidence_id) ON evidence_citations TO kawalys_app;
CREATE TRIGGER evidence_citations_append_only_row BEFORE UPDATE OR DELETE ON evidence_citations
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER evidence_citations_append_only_stmt BEFORE UPDATE OR DELETE OR TRUNCATE ON evidence_citations
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
ALTER TABLE evidence_citations ENABLE ALWAYS TRIGGER evidence_citations_append_only_row;
ALTER TABLE evidence_citations ENABLE ALWAYS TRIGGER evidence_citations_append_only_stmt;
