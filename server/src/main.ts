import { createApp } from "./create-app";

async function main(): Promise<void> {
  const app = await createApp();
  // Loopback only: this synthetic service is never exposed on other interfaces.
  await app.listen(Number(process.env.KAWALYS_BFF_PORT ?? 8787), "127.0.0.1");
}

void main();
