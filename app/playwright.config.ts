// Playwright for the S1 slice. app/ pins its own @playwright/test (1.65.1, the same version the prototype suite uses).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1, // parallel workers against local servers gave false timeouts on Windows (see repo CLAUDE.md)
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npx vite preview',
    url: 'http://127.0.0.1:4178/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
