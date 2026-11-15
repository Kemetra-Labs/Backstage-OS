// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Static prototype served over a real HTTP origin (BACK-4: not set_content).
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  workers: 1, // python http.server + parallel workers gave spurious load timeouts on Windows
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:8765', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'python -m http.server 8765 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8765/',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Opt-in: `PW_FIREFOX=1 npx playwright test`. Firefox failed to launch on the BACK-4 Windows machine (spawn UNKNOWN).
    ...(process.env.PW_FIREFOX ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }] : []),
  ],
});
