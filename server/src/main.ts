import { AuthConfigError } from "./auth/auth.config";
import { createApp } from "./create-app";

async function main(): Promise<void> {
  const app = await createApp();
  // Loopback only: this synthetic service is never exposed on other interfaces.
  await app.listen(Number(process.env.KAWALYS_BFF_PORT ?? 8787), "127.0.0.1");
}

main().catch((e: unknown) => {
  // Fixed message only: never print the error text. The one exception is a configuration error, whose message
  // names the variable and never its value, so the operator can fix the environment.
  if (e instanceof AuthConfigError) console.error(e.message);
  console.error("kawalys-bff failed to start");
  process.exitCode = 1;
});
