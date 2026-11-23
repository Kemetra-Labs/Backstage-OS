import { createApp } from "./create-app";
import { ConfigError, loadRuntimeConfig } from "./config/runtime-config";
import { buildRealModeDeps } from "./real-mode";

async function main(): Promise<void> {
  // No KAWALYS_* real-mode variable: synthetic routes only (no auth, no database).
  const config = loadRuntimeConfig(process.env);
  const real = config ? await buildRealModeDeps(config) : undefined;
  const app = await createApp([], { auth: real?.auth, evidence: real?.evidence });
  // Loopback only until a host is approved (gate D).
  await app.listen(Number(process.env.KAWALYS_BFF_PORT ?? 8787), "127.0.0.1");
}

main().catch((err: unknown) => {
  // Configuration and role-check messages name variables and roles only; anything else
  // gets a fixed message so no connection detail or secret is printed.
  const safe = err instanceof ConfigError || (err instanceof Error && err.message.startsWith("runtime role check:"));
  console.error(safe ? `kawalys-bff failed to start: ${(err as Error).message}` : "kawalys-bff failed to start");
  process.exitCode = 1;
});
