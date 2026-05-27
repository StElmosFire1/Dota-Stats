// Task #426 — Playwright config for the browser smoke suite.
// Single Chromium runner; cross-browser matrix + mobile viewport are out of
// scope per the task. The programmatic runner at src/smoke/runner.js is the
// production entry point (cron + admin button + post-merge hook all call
// it); this config exists so an operator can also invoke the suite via
// `npx playwright test tests/smoke` for ad-hoc debugging.
const { defineConfig, devices } = (() => {
  try { return require('@playwright/test'); }
  catch (_) { return { defineConfig: (x) => x, devices: {} }; }
})();

module.exports = defineConfig({
  testDir: 'tests/smoke',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium', use: { ...(devices['Desktop Chrome'] || {}) } },
  ],
});
