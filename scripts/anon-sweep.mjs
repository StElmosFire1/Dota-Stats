// Task #857 — anonymous public-route sweep. Loads every public route in a
// fresh (logged-out) headless browser and reports blank screens, raw error
// text, and uncaught page errors.
import { chromium } from 'playwright';

const BASE = process.env.SWEEP_BASE || 'http://127.0.0.1:5000';
const ROUTES = [
  '/', '/how-it-works', '/leaderboard', '/live', '/matches', '/this-week',
  '/heroes', '/games', '/players', '/lootbox', '/collection', '/stats',
  '/positions', '/synergy', '/upload', '/seasons', '/player-tools',
  '/head-to-head', '/compare', '/draft', '/draft-assistant',
  '/heroes/draft-trainer', '/captain-mode', '/draft-stats', '/hero-breakdown',
  '/hero-position-meta', '/position-player-profiles', '/predictions',
  '/patch-notes', '/pickem', '/sponsorships', '/multikills', '/ward-map',
  '/records', '/pudge-stats', '/schedule', '/inhouse', '/social',
  '/player-network', '/benchmarks', '/insights', '/tournaments',
  '/hall-of-fame', '/join', '/api-docs', '/developers', '/coaches',
  '/group-sessions', '/games/endless', '/pro-replays', '/coach/premium',
];

const browser = await chromium.launch();
const results = [];
for (const route of ROUTES) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
  let status = null;
  try {
    const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
    status = resp ? resp.status() : null;
  } catch (e) {
    results.push({ route, problem: 'NAV FAIL: ' + String(e).slice(0, 120) });
    await ctx.close();
    continue;
  }
  await page.waitForTimeout(2000);
  const text = (await page.evaluate(() => document.body.innerText || '')).trim();
  const problems = [];
  if (pageErrors.length) problems.push('pageerror: ' + pageErrors.join(' | '));
  if (text.length < 30) problems.push(`BLANK (${text.length} chars): "${text.slice(0, 60)}"`);
  const rawErr = text.match(/(Failed to load|Request failed|Something went wrong|Error:|TypeError|undefined is not|Cannot read)/i);
  if (rawErr) {
    const idx = text.search(rawErr[0]);
    problems.push('rawtext: ...' + text.slice(Math.max(0, idx - 40), idx + 80).replace(/\n/g, ' '));
  }
  if (status && status >= 400) problems.push('HTTP ' + status);
  results.push({ route, problem: problems.length ? problems.join(' || ') : null });
  await ctx.close();
}
await browser.close();
for (const r of results) console.log(r.problem ? `FAIL ${r.route} :: ${r.problem}` : `ok   ${r.route}`);
