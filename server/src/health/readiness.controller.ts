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

// At most one probe query per pool is ever outstanding: a hung database cannot pile probes onto the shared pools.
const inflight = new WeakMap<object, Promise<boolean>>();

function probe(pool: { query(sql: string): Promise<unknown> }): Promise<boolean> {
  const running = inflight.get(pool);
  if (running) return running;
  const started = (async () => {
    try {
      await pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  })().finally(() => inflight.delete(pool));
  inflight.set(pool, started);
  return started;
}

async function selectOne(pool: { query(sql: string): Promise<unknown> }): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([probe(pool), timeout]);
  } finally {
    clearTimeout(timer);
  }
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
    const ready = db ? (await Promise.all([selectOne(db.appPool), selectOne(db.authPool)])).every(Boolean) : false;
    res.setHeader("cache-control", "no-store");
    res.status(ready ? 200 : 503);
    return { service: "kawalys-bff", ready };
  }
}
