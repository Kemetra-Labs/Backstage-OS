// Playwright for the V2 visual lab. Own port (4279) and own build output so it never collides with the V1 suite.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-v2',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1, // see repo CLAUDE.md: parallel workers against local servers gave false timeouts on Windows
  reporter: [['list']],
  // Own output folder: the V1 suite clears test-results/ when it starts, and CI uploads app/test-results/ on failure.
  outputDir: 'test-results/v2',
  use: { baseURL: 'http://127.0.0.1:4279', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npx vite preview --config vite.v2.config.ts',
    url: 'http://127.0.0.1:4279/v2.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
