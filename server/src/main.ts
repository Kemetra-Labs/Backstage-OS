import { createApp } from "./create-app";

async function main(): Promise<void> {
  const app = await createApp();
  // Loopback only: this synthetic service is never exposed on other interfaces.
  await app.listen(Number(process.env.KAWALYS_BFF_PORT ?? 8787), "127.0.0.1");
}

main().catch(() => {
  // Fixed message only: never print the error text.
  console.error("kawalys-bff failed to start");
  process.exitCode = 1;
});
