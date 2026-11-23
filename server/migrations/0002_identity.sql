-- 0002_identity.sql — durable owner identity and sessions for the #76 auth layer
-- (BACK-56 on BACK-55, gate A, 2026-11-23). Runs as kawalys_migrator, search_path = kawalys.
--
-- The owner is the ONE identity configured by KAWALYS_DESCOPE_PROJECT_ID + KAWALYS_OWNER_SUBJECT
-- (auth.config.ts). The database never decides who the owner is; it gives that configured identity a
-- stable local user id, a personal workspace, and sessions that survive a restart.

-- At most ONE owner. The singleton primary key makes the first binding race-safe; if the configured
-- owner later changes, the new identity cannot bind (fail closed) until an operator moves the binding.
-- owner_workspace_id is a pointer, not a scope key (so it is not named workspace_id), and not a foreign
-- key: the workspace row is created afterwards, under RLS, by the runtime role in its own context.
CREATE TABLE owner_binding (
  singleton           boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id             uuid NOT NULL UNIQUE REFERENCES users (id),
  owner_workspace_id  uuid NOT NULL UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Sessions record the verified provider triple they were issued for; the global guard rechecks it
-- against the configured owner on every request.
ALTER TABLE sessions
  ADD COLUMN provider_key text NOT NULL CHECK (provider_key <> ''),
  ADD COLUMN issuer       text NOT NULL CHECK (issuer <> ''),
  ADD COLUMN subject      text NOT NULL CHECK (subject <> '');

-- Even a compromised kawalys_auth login cannot mint a long session, un-revoke one, or push activity into
-- the future: created_at is not insertable (database default), so this CHECK caps every session at the
-- 24 h configuration maximum (plus a small clock-skew margin); the trigger makes revocation one-way and
-- keeps activity <= now().
ALTER TABLE sessions ADD CONSTRAINT sessions_lifetime_cap
  CHECK (absolute_expires_at <= created_at + interval '24 hours 5 minutes');
CREATE FUNCTION sessions_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'sessions: revocation is one-way' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- On INSERT too: a future last_seen_at would make the idle timeout never fire.
  IF NEW.last_seen_at > pg_catalog.now() THEN
    RAISE EXCEPTION 'sessions: activity cannot be in the future' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sessions_guard BEFORE INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION sessions_guard();
ALTER TABLE sessions ENABLE ALWAYS TRIGGER sessions_guard;

-- kawalys_auth: identity and session tables only. No workspace table, no DELETE, no UPDATE of users,
-- identity links or the binding; on sessions only activity and revocation.
GRANT SELECT, INSERT ON users TO kawalys_auth;
GRANT SELECT, INSERT ON external_identity_links TO kawalys_auth;
GRANT SELECT, INSERT ON owner_binding TO kawalys_auth;
GRANT SELECT ON sessions TO kawalys_auth;
GRANT INSERT (user_id, credential_hash, absolute_expires_at, last_seen_at, provider_key, issuer, subject)
  ON sessions TO kawalys_auth;
GRANT UPDATE (last_seen_at, revoked_at) ON sessions TO kawalys_auth;
