// BACK-4: bounded real-browser smoke on BrowserStack (via browserstack-node-sdk + BrowserStack Local).
// Platforms live in browserstack.yml. Run: npm run test:browserstack  (needs BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY in env).
// Locally (no SDK) this file also runs on desktop Chrome: npx playwright test -c playwright.bstack.config.js
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests-bstack',
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8765' },
  webServer: { command: 'python -m http.server 8765 --bind 127.0.0.1', url: 'http://127.0.0.1:8765/', reuseExistingServer: true },
  projects: [{ name: 'bstack', use: { ...devices['Desktop Chrome'] } }],
});
