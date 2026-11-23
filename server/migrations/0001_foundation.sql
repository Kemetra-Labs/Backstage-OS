-- 0001_foundation.sql — Kawalys database foundation (BACK-55 S1, gate A, 2026-11-23).
-- Runs as kawalys_migrator with search_path = kawalys (set by the runner).
-- Personal Alpha: one owner, one workspace. Identifiers and the workspace scope stay
-- stable so teams can be added later without rewriting evidence contracts.

-- The single source of the workspace scope. An unset or empty GUC yields NULL, and
-- `workspace_id = NULL` matches nothing: no context means no rows (fail closed).
-- Names are schema-qualified so the body cannot resolve to anything in schema kawalys. No
-- SET search_path clause: that would stop the function from being inlined into policies.
CREATE FUNCTION current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(pg_catalog.current_setting('app.current_workspace', true), '')::pg_catalog.uuid $$;
GRANT EXECUTE ON FUNCTION current_workspace_id() TO kawalys_app;

-- Global identity tables (no workspace scope; see GLOBAL_TABLES in the invariant test).
-- No runtime grant here: the sign-in lookup role and its grants arrive with BACK-56.
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE external_identity_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key  text NOT NULL CHECK (provider_key <> ''),
  issuer        text NOT NULL CHECK (issuer <> ''),
  subject       text NOT NULL CHECK (subject <> ''),
  user_id       uuid NOT NULL REFERENCES users (id),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz,
  UNIQUE (provider_key, issuer, subject)
);

-- Opaque session cookie stored only as a SHA-256 hash.
CREATE TABLE sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id),
  credential_hash      bytea NOT NULL UNIQUE CHECK (octet_length(credential_hash) = 32),
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at  timestamptz NOT NULL,
  revoked_at           timestamptz
);

-- Workspace-scoped tables: RLS ENABLED + FORCED, policies use current_workspace_id().
CREATE TABLE workspaces (
  id             uuid PRIMARY KEY,
  owner_user_id  uuid NOT NULL REFERENCES users (id),
  kind           text NOT NULL DEFAULT 'personal' CHECK (kind = 'personal'),
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspaces_scope ON workspaces
  USING (id = current_workspace_id()) WITH CHECK (id = current_workspace_id());
GRANT SELECT, INSERT ON workspaces TO kawalys_app;

-- Team-ready shape; the alpha allows only the owner role and no API writes other members.
CREATE TABLE memberships (
  workspace_id  uuid NOT NULL REFERENCES workspaces (id),
  user_id       uuid NOT NULL REFERENCES users (id),
  role          text NOT NULL CHECK (role = 'owner'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_scope ON memberships
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
GRANT SELECT, INSERT ON memberships TO kawalys_app;

-- Append-only audit. Ids, codes and labels only in metadata: never raw source content or secrets.
CREATE TABLE audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces (id),
  actor_user_id  uuid REFERENCES users (id),
  action         text NOT NULL CHECK (action <> ''),
  target_type    text NOT NULL CHECK (target_type <> ''),
  target_id      uuid NOT NULL,
  request_id     text CHECK (request_id ~ '^[A-Za-z0-9-]{8,64}$'),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_workspace_time ON audit_events (workspace_id, occurred_at DESC);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_scope ON audit_events
  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
-- Column-level INSERT: the database alone sets id and occurred_at (no backdating).
GRANT SELECT ON audit_events TO kawalys_app;
GRANT INSERT (workspace_id, actor_user_id, action, target_type, target_id, request_id, metadata)
  ON audit_events TO kawalys_app;

-- Adapted from Retail Tower services/backend-core/packages/db/drizzle/0034_audit_events_append_only.sql
-- at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c (Apache-2.0); see server/THIRD_PARTY.md.
-- Kawalys changes: no retention-marking and no FK SET NULL exceptions (no retention policy is
-- accepted yet); statement-level UPDATE/DELETE trigger too (fires even when no row matches);
-- triggers ENABLE ALWAYS, so session_replication_role = replica does not skip them.
-- Every UPDATE, DELETE and TRUNCATE is refused for every role through DML.
-- Limit: the table OWNER (kawalys_migrator) and superusers can still DISABLE/DROP the triggers
-- or drop the table with DDL. That is a migration-review concern, plus a future external
-- audit sink; it is not something RLS or triggers can prevent.
CREATE FUNCTION audit_events_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER audit_events_append_only_row
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER audit_events_append_only_stmt
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER audit_events_append_only_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_append_only_row;
ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_append_only_stmt;
ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_append_only_truncate;
