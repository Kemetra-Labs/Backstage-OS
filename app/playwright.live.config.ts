// Live end-to-end suite (BACK-51 P4): the React app built in live mode (VITE_KAWALYS_LIVE=1) against the real BFF, which a
// test-only entry (server/test/e2e/serve-e2e.ts) starts on a disposable Testcontainers Postgres with a fake token verifier.
// Why a separate config: the default build is fixture-only and makes no request, so this suite needs its own build (into
// dist-live/, never dist/) and its own servers. The default playwright.config.ts has testDir ./e2e and never picks up e2e-live/.
// Chromium only: the live path is the same code in every engine (the default e2e suite covers webkit), and a second browser
// would double a run that starts a database container. Needs Docker running.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { SEED_FILE } from './e2e-live/helpers';

fs.mkdirSync(path.dirname(SEED_FILE), { recursive: true });

export default defineConfig({
  testDir: './e2e-live',
  outputDir: './test-results/live-artifacts', // not test-results/e2e-live, so Playwright's output cleanup never removes the seed file
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // the server state (decisions) is shared across tests, and parallel workers gave false timeouts on Windows
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      // cwd must be server/: migrations resolve from process.cwd(). The server writes SEED_FILE before it listens.
      command: 'npm run e2e:serve',
      cwd: '../server',
      url: 'http://127.0.0.1:8787/process', // public, 200; there is no /health
      timeout: 240_000, // Testcontainers starts Postgres first (about 30-60 s)
      reuseExistingServer: false,
      // SIGTERM lets serve-e2e.ts stop its Postgres container. Windows does not deliver signals, so there the Testcontainers
      // reaper (ryuk) is what removes the container; running with TESTCONTAINERS_RYUK_DISABLED=true leaves it behind.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
      env: { KAWALYS_E2E_SEED_FILE: SEED_FILE },
    },
    {
      command: 'npx vite build --outDir dist-live && npx vite preview --outDir dist-live',
      url: 'http://127.0.0.1:4178/',
      timeout: 120_000,
      reuseExistingServer: false,
      env: { VITE_KAWALYS_LIVE: '1' },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
