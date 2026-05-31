// Task #426 — Playwright spec for the browser smoke suite.
//
// One test per journey defined in src/smoke/journeys.js. Each test loads
// the page, waits for the expected selector, takes a screenshot, and uses
// Playwright's built-in toHaveScreenshot() matcher (which delegates to
// pixelmatch under the hood). Baselines live under
// tests/smoke/baselines/<key>.png so the admin "Approve new baseline"
// button can overwrite a single file.
//
// Operators usually invoke the smoke suite via the admin button or the
// weekly cron (which both call src/smoke/runner.js directly). This spec
// is here so ad-hoc debugging via `npx playwright test tests/smoke` works
// without needing the bot process running.

let test, expect;
try {
  ({ test, expect } = require('@playwright/test'));
} catch (_) {
  // Without @playwright/test installed this file is a no-op — the real
  // entry point is src/smoke/runner.js which uses the `playwright`
  // package directly and writes results to Postgres.
  module.exports = {};
  return;
}

const { JOURNEYS } = require('../../src/smoke/journeys');

for (const j of JOURNEYS) {
  test(`${j.key} — ${j.label}`, async ({ page, request, baseURL }) => {
    // Superuser journeys need a real superuser session — the page reads
    // /api/admin/session-status (session-only) to decide whether to render.
    // POST the login on the page's own cookie jar so the subsequent
    // navigation carries it. Skipped (not failed) when SUPERUSER_PASSWORD
    // is unset so the suite still runs in environments without the secret.
    if (j.superuser) {
      const pw = process.env.SUPERUSER_PASSWORD;
      test.skip(!pw, 'SUPERUSER_PASSWORD not set — cannot exercise superuser journey');
      const login = await page.request.post((baseURL || '') + '/api/admin/superuser-login', {
        headers: { 'Content-Type': 'application/json' },
        data: { password: pw },
      });
      expect(login.ok(), 'superuser-login should succeed').toBeTruthy();
    }
    if (j.asJson) {
      const res = await request.get((baseURL || '') + j.path);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body).toBeTruthy();
      return;
    }
    const resp = await page.goto(j.path, { waitUntil: 'domcontentloaded' });
    expect(resp && resp.status() < 400).toBeTruthy();
    if (j.expect) {
      const selectors = j.expect.split(',').map(s => s.trim()).filter(Boolean);
      let matched = false;
      for (const sel of selectors) {
        if (await page.locator(sel).first().count() > 0) { matched = true; break; }
      }
      expect(matched, `expected one of: ${j.expect}`).toBeTruthy();
    }
    await expect(page).toHaveScreenshot(`${j.key}.png`, { maxDiffPixelRatio: 0.01 });
  });
}
