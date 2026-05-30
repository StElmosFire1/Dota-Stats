const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://oceinhouse.gg';
const OUT = path.join(__dirname, '..', 'docs', 'clone-evidence', '2026-05-30-one-tooth', 'screenshots');

const PAGES = [
  ['home', '/'],
  ['standings', '/leaderboard'],
  ['matches', '/matches'],
  ['players', '/players'],
  ['heroes', '/heroes'],
  ['hero-meta', '/hero-position-meta'],
  ['synergy', '/synergy'],
  ['positions', '/positions'],
  ['records', '/records'],
  ['compare', '/compare'],
  ['draft-ai', '/draft-assistant'],
  ['hall-of-fame', '/hall-of-fame'],
  ['overview', '/stats'],
  ['play', '/inhouse'],
  ['join', '/join'],
  ['upload', '/upload'],
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  async function dismissModal(page) {
    try {
      const btn = page.getByRole('button', { name: /dismiss/i }).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(800);
      }
    } catch (_) {}
  }
  const results = [];
  for (const [key, route] of PAGES) {
    const page = await ctx.newPage();
    const url = BASE + route;
    let status = 'ok';
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      const code = resp ? resp.status() : 0;
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) {}
      await page.waitForTimeout(2500);
      await dismissModal(page);
      await page.waitForTimeout(1500);
      const file = path.join(OUT, `ours-${key}.jpg`);
      await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 80 });
      status = `HTTP ${code} -> ours-${key}.jpg`;
    } catch (e) {
      status = `ERROR ${e.message.split('\n')[0]}`;
    }
    results.push(`${key.padEnd(14)} ${route.padEnd(22)} ${status}`);
    console.log(results[results.length - 1]);
    await page.close();
  }
  await browser.close();
  console.log('\n=== DONE ===');
})();
