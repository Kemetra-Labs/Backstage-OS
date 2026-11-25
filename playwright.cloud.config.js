// @ts-check
// Claude Code cloud sessions (BACK-101). The container's preinstalled Chromium does not match the pinned
// @playwright/test, so this reuses playwright.config.js and points chromium at that binary
// (PW_CHROMIUM_PATH overrides it). WebKit is not available there; CI runs both with playwright.config.js.
//   npx playwright test -c playwright.cloud.config.js --trace off
const { defineConfig, devices } = require('@playwright/test');
const base = require('./playwright.config');

const executablePath = process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium';

module.exports = defineConfig({
  ...base,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } }],
});
