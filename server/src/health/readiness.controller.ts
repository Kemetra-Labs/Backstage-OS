import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { KawalysDatabase } from "../create-app";
import { Public } from "../auth/public.decorator";

export const READINESS_DATABASE = "KAWALYS_READINESS_DATABASE";
const CHECK_TIMEOUT_MS = 2000;

/** The one thing used from the platform response (express types are not a dependency). */
interface StatusSetter {
  status(code: number): unknown;
}

async function selectOne(pool: { query(sql: string): Promise<unknown> }): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([pool.query("SELECT 1").then(() => true, () => false), timeout]);
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
    res.status(ready ? 200 : 503);
    return { service: "kawalys-bff", ready };
  }
}
