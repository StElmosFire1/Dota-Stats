import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.CAP_BASE || 'http://localhost:5000';
const OUT = path.join(__dirname, '..', 'screenshots');

const PAGES = [
  ['home', '/'],
  ['draft', '/admin/draft-sandbox'],  // beat 3 — captain-pick board (superuser-only diagnostic)
  ['inhouse', '/inhouse'],
  ['leaderboard', '/leaderboard'],
  ['hall', '/hall-of-fame'],
  ['matches', '/matches'],
];

async function dismissModal(page) {
  try {
    const btn = page.getByRole('button', { name: /dismiss/i }).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
  } catch (_) {}
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1.5,
});

// Superuser session so admin-only pages (e.g. the draft sandbox) render.
// SUPERUSER_PASSWORD is read from the env only; never logged or committed.
if (process.env.SUPERUSER_PASSWORD) {
  const login = await ctx.request.post(BASE + '/api/admin/superuser-login', {
    headers: { 'Content-Type': 'application/json' },
    data: { password: process.env.SUPERUSER_PASSWORD },
  });
  console.log(`superuser-login HTTP ${login.status()}`);
} else {
  console.log('superuser-login SKIPPED (SUPERUSER_PASSWORD unset) — admin pages will not render');
}

for (const [key, route] of PAGES) {
  const page = await ctx.newPage();
  const url = BASE + route;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    const code = resp ? resp.status() : 0;
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) {}
    await page.waitForTimeout(2500);
    await dismissModal(page);
    await page.waitForTimeout(1200);
    const file = path.join(OUT, `tall_${key}.png`);
    await page.screenshot({ path: file, fullPage: true, type: 'png' });
    const dims = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    console.log(`${key.padEnd(12)} HTTP ${code} -> tall_${key}.png  (${dims.w}x${dims.h})`);
  } catch (e) {
    console.log(`${key.padEnd(12)} ERROR ${e.message.split('\n')[0]}`);
  }
  await page.close();
}
await browser.close();
console.log('=== DONE ===');
