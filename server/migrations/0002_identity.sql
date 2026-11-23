-- 0002_identity.sql — single-owner binding and sign-in grants (BACK-56 S2, gate A, 2026-11-23).
-- Runs as kawalys_migrator with search_path = kawalys (set by the runner).

-- At most ONE owner in the Personal Alpha. The singleton primary key makes the first
-- binding race-safe: a concurrent second binding fails with a unique violation and its
-- whole sign-in transaction (user + identity link) rolls back. Teams later replace this
-- table with invitations and memberships; evidence contracts do not change.
-- owner_workspace_id is a pointer, not a scope key (so it is not named workspace_id), and not a foreign key: the workspace row is created afterwards, under RLS,
-- by the runtime role in the workspace's own context.
CREATE TABLE owner_binding (
  singleton     boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id       uuid NOT NULL UNIQUE REFERENCES users (id),
  owner_workspace_id uuid NOT NULL UNIQUE,
  bound_email   text NOT NULL CHECK (bound_email <> '' AND bound_email = lower(bound_email)),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- kawalys_auth: sign-in and session lookup only. No workspace table, no DELETE, no UPDATE
-- of users, identity links or the binding; on sessions only activity and revocation.
GRANT SELECT, INSERT ON users TO kawalys_auth;
GRANT SELECT, INSERT ON external_identity_links TO kawalys_auth;
GRANT SELECT, INSERT ON owner_binding TO kawalys_auth;
-- Even a compromised kawalys_auth login cannot mint a long session, un-revoke one, or push
-- activity into the future: created_at is not insertable (database default), so this CHECK
-- caps every session at 24 h; the trigger makes revocation one-way and activity <= now().
ALTER TABLE sessions ADD CONSTRAINT sessions_lifetime_cap
  CHECK (absolute_expires_at <= created_at + interval '24 hours');
CREATE FUNCTION sessions_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'sessions: revocation is one-way' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.last_seen_at > pg_catalog.now() THEN
    RAISE EXCEPTION 'sessions: activity cannot be in the future' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sessions_guard BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION sessions_guard();
ALTER TABLE sessions ENABLE ALWAYS TRIGGER sessions_guard;

GRANT SELECT ON sessions TO kawalys_auth;
GRANT INSERT (user_id, credential_hash, absolute_expires_at) ON sessions TO kawalys_auth;
GRANT UPDATE (last_seen_at, revoked_at) ON sessions TO kawalys_auth;
