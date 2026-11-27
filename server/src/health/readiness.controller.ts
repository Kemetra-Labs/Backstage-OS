import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { KawalysDatabase } from "../create-app";
import { Public } from "../auth/public.decorator";

export const READINESS_DATABASE = "KAWALYS_READINESS_DATABASE";
const CHECK_TIMEOUT_MS = 2000;

/** The one thing used from the platform response (express types are not a dependency). */
interface StatusSetter {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

type Queryable = { query(sql: string): Promise<{ rows: Array<{ ok?: unknown }> }> };

// Each runtime role must reach the schema objects it needs at run time, not merely connect. Names are fully
// qualified (schema "kawalys"), so the check does not depend on search_path. has_table_privilege reads the catalog
// only: it returns no data and is not subject to row security. A missing table gives NULL, which counts as false.
const SCHEMA_CHECK = {
  app: `SELECT COALESCE(bool_and(COALESCE(has_table_privilege(current_user, to_regclass(t), 'SELECT'), false)), false) AS ok
        FROM unnest(ARRAY['kawalys.projects', 'kawalys.evidence']) AS t`,
  auth: `SELECT COALESCE(bool_and(COALESCE(has_table_privilege(current_user, to_regclass(t), 'SELECT'), false)), false) AS ok
         FROM unnest(ARRAY['kawalys.sessions', 'kawalys.users']) AS t`,
} as const;
type Role = keyof typeof SCHEMA_CHECK;

// One bounded result per pool and role. While a query is outstanding every caller shares the same promise, so a
// hung database neither piles queries onto the pool nor adds handlers to the stuck query: the single handler is
// attached when the query is issued. After the 2 s bound the shared result is false; the entry is removed only
// when the underlying query settles, so a stuck query keeps answering "not ready" without a new query.
const probes: Record<Role, WeakMap<object, Promise<boolean>>> = { app: new WeakMap(), auth: new WeakMap() };

function probe(role: Role, pool: Queryable): Promise<boolean> {
  const shared = probes[role].get(pool);
  if (shared) return shared;
  let timer: NodeJS.Timeout | undefined;
  const query: Promise<boolean> = Promise.resolve()
    .then(() => pool.query(SCHEMA_CHECK[role]))
    .then(
      (r) => r.rows[0]?.ok === true,
      () => false,
    );
  const bounded = Promise.race([
    query,
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
      timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
  probes[role].set(pool, bounded);
  void query.finally(() => {
    if (probes[role].get(pool) === bounded) probes[role].delete(pool);
  });
  return bounded;
}

@Controller("health")
export class ReadinessController {
  constructor(@Inject(READINESS_DATABASE) private readonly database: KawalysDatabase | undefined) {}

  // Public on purpose: the container healthcheck has no session. The body is only a ready flag: no error text,
  // no pool names, no timings. Not ready is the default: without a database the pilot is not ready.
  @Public()
  @Get()
  async get(@Res({ passthrough: true }) res: StatusSetter) {
    const db = this.database;
    const ready = db ? (await Promise.all([probe("app", db.appPool), probe("auth", db.authPool)])).every(Boolean) : false;
    res.setHeader("cache-control", "no-store");
    res.status(ready ? 200 : 503);
    return { service: "kawalys-bff", ready };
  }
}
