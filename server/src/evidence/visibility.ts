// One definition of project visibility (BACK-50 server slice), shared by the portfolio, the
// investigation routes and the decision write path. A project, and everything that belongs to it,
// is visible to a user exactly when that user holds an active grant on at least one of its sources.
// The workspace boundary is enforced separately by forced RLS.

/**
 * SQL predicate: the user in parameter `user` (default `$1`) holds an active grant on a source of the
 * project whose id is the SQL expression `projectIdExpr` (for example `p.id` or `i.project_id`).
 * Both arguments are SQL fragments chosen by the caller, never user input.
 */
export const PROJECT_VISIBLE = (projectIdExpr: string, user = '$1'): string =>
  `EXISTS (SELECT 1 FROM sources vs
             JOIN source_grants vg ON vg.source_id = vs.id AND vg.user_id = ${user} AND vg.revoked_at IS NULL
            WHERE vs.project_id = ${projectIdExpr})`;
