# Kawalys SQL migrations (BACK-55)

Applied by `src/db/migrate.ts` as `kawalys_migrator`, in name order, into schema `kawalys`.

- Name: `NNNN_snake_name.sql`. Never edit an applied file: the runner stops on a checksum change. Add a new file instead.
- Every table carries `workspace_id` with RLS **enabled and FORCED** and a policy that uses `current_workspace_id()`, unless it is listed in `GLOBAL_TABLES` of `test/db/rls-coverage.invariant.spec.ts` with a reason. The invariant test enforces this.
- Grant the runtime role (`kawalys_app`) only the privileges a feature needs, table by table.
- Roles and the schema are created beforehand by `src/db/provision.ts` (operator step, admin login), not here.
