-- 0006_learning.sql — COG-05 episodes and lessons (BACK-108 D7, decided 2026-11-27 under owner
-- delegation). Runs as kawalys_migrator, search_path = kawalys. No role changes.
--
-- Storage only: nothing in src writes or reads these tables yet, and activation stays blocked (D6)
-- until BACK-45 approval evidence and real outcomes exist. The pure rules live in src/learning.
-- Same patterns as 0003: forced workspace RLS, composite foreign keys that include workspace_id and
-- project_id (foreign-key checks bypass RLS, so a row can never point into another workspace or
-- project), column-level INSERT grants, and append-only rows (corrections are new rows).

-- An episode: what happened after a decision was acted on. It exists only through its citations of
-- the decision and outcome evidence (O1); a reader sees it only if every cited row is visible.
CREATE TABLE learning_episodes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL,
  project_id         uuid NOT NULL,
  applicability_key  text NOT NULL CHECK (length(applicability_key) BETWEEN 1 AND 200),
  outcome            text NOT NULL CHECK (outcome IN ('success', 'failure')),
  label              text NOT NULL CHECK (label IN ('observation', 'correlation', 'hypothesis')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
);
ALTER TABLE learning_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_episodes FORCE ROW LEVEL SECURITY;
CREATE POLICY learning_episodes_scope ON learning_episodes
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
-- Reads by applicability key (migration review).
CREATE INDEX learning_episodes_by_key ON learning_episodes (workspace_id, project_id, applicability_key, created_at DESC);
GRANT SELECT ON learning_episodes TO kawalys_app;
GRANT INSERT (workspace_id, project_id, applicability_key, outcome, label) ON learning_episodes TO kawalys_app;

CREATE TABLE learning_episode_citations (
  workspace_id  uuid NOT NULL,
  project_id    uuid NOT NULL,
  episode_id    uuid NOT NULL,
  evidence_id   uuid NOT NULL,
  role          text NOT NULL CHECK (role IN ('decision', 'outcome')),
  PRIMARY KEY (episode_id, evidence_id, role),
  FOREIGN KEY (workspace_id, project_id, episode_id) REFERENCES learning_episodes (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id, evidence_id) REFERENCES evidence (workspace_id, project_id, id)
);
CREATE INDEX learning_episode_citations_by_evidence ON learning_episode_citations (evidence_id);
ALTER TABLE learning_episode_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_episode_citations FORCE ROW LEVEL SECURITY;
CREATE POLICY learning_episode_citations_scope ON learning_episode_citations
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON learning_episode_citations TO kawalys_app;
GRANT INSERT (workspace_id, project_id, episode_id, evidence_id, role) ON learning_episode_citations TO kawalys_app;

-- One version of a lesson: an append-only hash chain per applicability key (O3). Version 1 has no
-- previous hash and every later version cites one. Owner-only review (O5) is enforced where a
-- lesson is written, which is not built yet (D6).
CREATE TABLE learning_lessons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL,
  project_id         uuid NOT NULL,
  applicability_key  text NOT NULL CHECK (length(applicability_key) BETWEEN 1 AND 200),
  version            integer NOT NULL CHECK (version >= 1),
  previous_hash      text CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  kind               text NOT NULL CHECK (kind IN ('approved', 'rolled-back')),
  reviewer_user_id   uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  content            jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 65536),
  hash               text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  CHECK ((version = 1) = (previous_hash IS NULL)),
  UNIQUE (workspace_id, project_id, applicability_key, version),
  UNIQUE (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id),
  -- The reviewer must be a member of this workspace, not just any user (migration review).
  FOREIGN KEY (workspace_id, reviewer_user_id) REFERENCES memberships (workspace_id, user_id)
);
ALTER TABLE learning_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_lessons FORCE ROW LEVEL SECURITY;
CREATE POLICY learning_lessons_scope ON learning_lessons
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON learning_lessons TO kawalys_app;
GRANT INSERT (workspace_id, project_id, applicability_key, version, previous_hash, kind, reviewer_user_id, content, hash)
  ON learning_lessons TO kawalys_app;

-- What a lesson version cites, as rows, so it is suspended when any cited row is hidden (O4).
CREATE TABLE learning_lesson_citations (
  workspace_id  uuid NOT NULL,
  project_id    uuid NOT NULL,
  lesson_id     uuid NOT NULL,
  evidence_id   uuid NOT NULL,
  PRIMARY KEY (lesson_id, evidence_id),
  FOREIGN KEY (workspace_id, project_id, lesson_id) REFERENCES learning_lessons (workspace_id, project_id, id),
  FOREIGN KEY (workspace_id, project_id, evidence_id) REFERENCES evidence (workspace_id, project_id, id)
);
CREATE INDEX learning_lesson_citations_by_evidence ON learning_lesson_citations (evidence_id);
ALTER TABLE learning_lesson_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_lesson_citations FORCE ROW LEVEL SECURITY;
CREATE POLICY learning_lesson_citations_scope ON learning_lesson_citations
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT ON learning_lesson_citations TO kawalys_app;
GRANT INSERT (workspace_id, project_id, lesson_id, evidence_id) ON learning_lesson_citations TO kawalys_app;

-- Append-only, also for a superuser and under session_replication_role = replica.
CREATE TRIGGER learning_episodes_append_only_row BEFORE UPDATE OR DELETE ON learning_episodes
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER learning_episodes_append_only_stmt BEFORE UPDATE OR DELETE OR TRUNCATE ON learning_episodes
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER learning_episode_citations_append_only_row BEFORE UPDATE OR DELETE ON learning_episode_citations
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER learning_episode_citations_append_only_stmt BEFORE UPDATE OR DELETE OR TRUNCATE ON learning_episode_citations
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER learning_lessons_append_only_row BEFORE UPDATE OR DELETE ON learning_lessons
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER learning_lessons_append_only_stmt BEFORE UPDATE OR DELETE OR TRUNCATE ON learning_lessons
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER learning_lesson_citations_append_only_row BEFORE UPDATE OR DELETE ON learning_lesson_citations
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER learning_lesson_citations_append_only_stmt BEFORE UPDATE OR DELETE OR TRUNCATE ON learning_lesson_citations
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
ALTER TABLE learning_episodes ENABLE ALWAYS TRIGGER learning_episodes_append_only_row;
ALTER TABLE learning_episodes ENABLE ALWAYS TRIGGER learning_episodes_append_only_stmt;
ALTER TABLE learning_episode_citations ENABLE ALWAYS TRIGGER learning_episode_citations_append_only_row;
ALTER TABLE learning_episode_citations ENABLE ALWAYS TRIGGER learning_episode_citations_append_only_stmt;
ALTER TABLE learning_lessons ENABLE ALWAYS TRIGGER learning_lessons_append_only_row;
ALTER TABLE learning_lessons ENABLE ALWAYS TRIGGER learning_lessons_append_only_stmt;
ALTER TABLE learning_lesson_citations ENABLE ALWAYS TRIGGER learning_lesson_citations_append_only_row;
ALTER TABLE learning_lesson_citations ENABLE ALWAYS TRIGGER learning_lesson_citations_append_only_stmt;
