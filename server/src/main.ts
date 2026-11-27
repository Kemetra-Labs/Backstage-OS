import { AuthConfigError } from "./auth/auth.config";
import { bindHost } from "./config/bind-host";
import { ConfigError, loadDatabaseConfig } from "./config/database-config";
import { createApp } from "./create-app";
import { openDatabase } from "./db/open-database";

async function main(): Promise<void> {
  const host = bindHost(process.env);
  // No KAWALYS_DATABASE_URL_*: in-memory sessions and no evidence routes. Set: both logins are checked first.
  const dbConfig = loadDatabaseConfig(process.env);
  const database = dbConfig ? await openDatabase(dbConfig) : undefined;
  const app = await createApp([], {}, { database });
  // Loopback unless KAWALYS_BFF_HOST says otherwise (0.0.0.0 only inside the pilot container, behind the private proxy network).
  await app.listen(Number(process.env.KAWALYS_BFF_PORT ?? 8787), host);
}

main().catch((e: unknown) => {
  // Fixed message only: never print the error text. The exceptions are configuration and role-check errors,
  // whose messages name variables and roles, never values, so the operator can fix the environment.
  const nameOnly =
    e instanceof AuthConfigError || e instanceof ConfigError || (e instanceof Error && e.message.startsWith("runtime role check:"));
  if (nameOnly) console.error((e as Error).message);
  console.error("kawalys-bff failed to start");
  process.exitCode = 1;
});
