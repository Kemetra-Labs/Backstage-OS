// Claude Code cloud sessions (BACK-101). The container ships a Chromium build that does not match the
// @playwright/test version pinned here, so the default config cannot launch a browser. This config reuses
// playwright.config.ts and only points chromium at the preinstalled binary (PW_CHROMIUM_PATH overrides it).
// WebKit is not available there; CI still runs chromium and webkit with playwright.config.ts.
//   npx vite build && npx playwright test -c playwright.cloud.config.ts --trace off
import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

const executablePath = process.env['PW_CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium';

export default defineConfig({
  ...base,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } }],
});
