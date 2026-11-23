// Boot-time check of the runtime database login (BACK-55). The service must refuse to start
// when its credentials could bypass row-level security or escalate.
// REFERENCE: Retail Tower services/backend-core/docs/operations/database-roles.md,
// "Boot-time verification" (RT-212, RT-357) at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c.
// Messages are fixed and name only roles; never connection strings or passwords.
import type pg from 'pg';

interface RoleFacts {
  session_user: string;
  current_user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolreplication: boolean;
  member_of: string[];
  owns_objects: boolean;
  workspace_default: boolean;
}

const FACTS_SQL = `
  SELECT session_user::text AS session_user, current_user::text AS current_user,
         r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication,
         COALESCE((SELECT array_agg(g.rolname::text ORDER BY g.rolname)
                     FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
                    WHERE m.member = r.oid), '{}') AS member_of,
         EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid
                   AND c.relnamespace NOT IN (SELECT oid FROM pg_namespace WHERE nspname LIKE 'pg\\_%' OR nspname = 'information_schema'))
         OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid)
         OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.proowner = r.oid)
         OR EXISTS (SELECT 1 FROM pg_type t WHERE t.typowner = r.oid)
         OR EXISTS (SELECT 1 FROM pg_database d WHERE d.datname = current_database() AND d.datdba = r.oid) AS owns_objects,
         EXISTS (SELECT 1 FROM pg_db_role_setting s, unnest(s.setconfig) AS cfg
                  WHERE s.setrole IN (0, r.oid)
                    AND s.setdatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
                    AND cfg LIKE 'app.current\\_workspace=%') AS workspace_default
    FROM pg_roles r WHERE r.rolname = current_user`;

export async function verifyRuntimeRole(pool: pg.Pool, expectedRole: string): Promise<void> {
  const { rows } = await pool.query<RoleFacts>(FACTS_SQL);
  const f = rows[0];
  if (!f) throw new Error('runtime role check: role not found');
  const fail = (why: string) => {
    throw new Error(`runtime role check: ${why}`);
  };
  // A login that switched role (options=-c role=...) could RESET ROLE back to its own privileges.
  if (f.session_user !== f.current_user) fail('session_user differs from current_user');
  if (f.current_user !== expectedRole) fail(`expected role ${expectedRole}`);
  if (f.rolsuper) fail(`${expectedRole} is a superuser`);
  if (f.rolbypassrls) fail(`${expectedRole} has BYPASSRLS`);
  if (f.rolcreaterole) fail(`${expectedRole} has CREATEROLE`);
  if (f.rolcreatedb) fail(`${expectedRole} has CREATEDB`);
  if (f.rolreplication) fail(`${expectedRole} has REPLICATION`);
  // NOINHERIT does not stop SET ROLE; any membership (e.g. the migrator, pg_read_all_data) is refused.
  if (f.member_of.length > 0) fail(`${expectedRole} is a member of ${f.member_of.join(', ')}`);
  // An owner is exempt from RLS unless FORCE is set and can alter or drop its objects.
  if (f.owns_objects) fail(`${expectedRole} owns schema objects`);
  // A stored default would give every connection a workspace and break fail-closed.
  if (f.workspace_default) fail('a stored default exists for app.current_workspace');
}
