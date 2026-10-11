import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { entries, surfaces, OUT, slug } from './inventory.mjs';
import { notes } from './notes.mjs';

const BASE = 'https://oceinhouse.gg';
if (process.env.GUIDE_AUTHORIZE_ADMIN !== '1') throw Error('Set GUIDE_AUTHORIZE_ADMIN=1 only after the owner explicitly authorizes this capture run.');
const subset = process.env.GUIDE_ONLY?.split(',');
fs.mkdirSync(`${OUT}/main/media`, { recursive: true });
fs.mkdirSync(`${OUT}/private/media`, { recursive: true });
const browser = await chromium.launch();
const options = { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' };
const anon = await browser.newContext(options);
const admin = await browser.newContext(options);
// This is the existing automation auth route, explicitly authorized by the owner.
// No credential or storageState is written to disk or console.
const login = await admin.request.post(`${BASE}/api/admin/superuser-login`, {
  headers: { 'x-superuser-key': process.env.SUPERUSER_PASSWORD || '' }, data: {}, timeout: 25000,
});
const elevated = login.status() === 200;
console.log(`Authorized automation login HTTP ${login.status()}`);
const blocked = { public: 0, private: 0 };
for (const [context, key] of [[anon, 'public'], [admin, 'private']]) {
  await context.route('**/*', async route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      blocked[key]++;
      return route.abort('blockedbyclient');
    }
    // Existing, owner-authorized machine authentication for read-only API
    // requests; never forward it to an external origin or into page JavaScript.
    if (key === 'private' && new URL(request.url()).origin === BASE && new URL(request.url()).pathname.startsWith('/api/'))
      return route.continue({ headers: { ...request.headers(), 'x-superuser-key': process.env.SUPERUSER_PASSWORD || '' } });
    return route.continue();
  });
}
const norm = s => s.replace(/\s+/g, ' ').trim();
async function dismiss(page) {
  for (const name of [/^Dismiss$/i, /^Not now$/i, /^Skip$/i]) {
    const button = page.getByRole('button', { name }).first();
    if (await button.isVisible().catch(() => false)) await button.click({ timeout: 1500 }).catch(() => {});
  }
}
async function navigate(page, route) {
  const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);
  await dismiss(page);
  await page.locator('.loading').first().waitFor({ state: 'hidden', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(300);
  return response?.status();
}

// Representative records are discovered only from public links. Missing records
// are tracked as gaps, rather than substituting invented IDs or private records.
const links = new Set();
const probe = await anon.newPage();
for (const route of ['/', '/matches', '/players', '/coaches', '/tournaments', '/teams', '/leagues', '/seasons', '/games']) {
  await navigate(probe, route).catch(() => {});
  for (const href of await probe.locator('a[href^="/"]').evaluateAll(els => els.map(e => e.getAttribute('href')))) links.add(href);
}
await probe.close();
const find = re => [...links].find(l => re.test(l));
const match = find(/^\/match\/[^/?#]+$/)?.split('/')[2];
const player = find(/^\/player\/\d+$/)?.split('/')[2];
const playerB = [...links].find(l => /^\/player\/\d+$/.test(l) && l.split('/')[2] !== player)?.split('/')[2];
const samples = {
  matchId: match, accountId: player, heroId: '14', lobbyId: 'current',
  playerA: player, playerB, other: player,
};
const gameLinks = [...links].filter(l => /^\/games\/[^/?#]+$/.test(l));
const sourceGameFile = 'src/games/service.js';
function representative(entry) {
  let route = entry.routes[0].path;
  if (entry.component === 'WrappedSlideshow') route = entry.routes.find(r => r.path === '/wrapped/:accountId').path;
  if (entry.component === 'GamePlay') return gameLinks[0] || null;
  if (route.includes(':id')) {
    const prefix = route.split('/:id')[0];
    const known = [...links].find(l => l.startsWith(prefix + '/') && l.split('/').length === 3 && !l.includes('?') && !l.endsWith('/new'));
    if (!known) return null;
    route = route.replace(':id', known.split('/')[2]);
  }
  for (const [param, value] of Object.entries(samples)) {
    if (route.includes(`:${param}`)) {
      if (!value) return null;
      route = route.replace(`:${param}`, value);
    }
  }
  return route.includes(':') ? null : route;
}

// Conservative visual redaction: retain only text found literally in the page
// source, mask dynamic text, all input values, images and canvas data. Redaction
// rectangles are drawn before capture; unredacted private pixels are never saved.
async function redact(page, entry) {
  const text = [fs.readFileSync(entry.source, 'utf8'), fs.readFileSync('web/src/App.jsx', 'utf8')].join('\n');
  return page.evaluate(({ source }) => {
    document.querySelectorAll('[data-guide-mask]').forEach(el => el.remove());
    const normalized = source.replace(/\s+/g, ' ');
    const rects = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,[data-guide-mask]')) continue;
      const value = node.textContent.replace(/\s+/g, ' ').trim();
      if (!value) continue;
      const sensitive = /(?:\d{1,3}\.){3}\d{1,3}|[\w.+-]+@[\w.-]+\.\w+|(?:sk_|pk_|whsec_|Bearer\s)|https?:\/\/|\b\d{9,}\b/.test(value);
      if (sensitive || !normalized.includes(value) || /^\d[\d.,% $:/-]*$/.test(value)) {
        const range = document.createRange(); range.selectNodeContents(node);
        for (const r of range.getClientRects()) if (r.width && r.height) rects.push({ x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
      }
    }
    document.querySelectorAll('input,textarea,select,img,canvas,video,iframe,pre,code,svg').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) rects.push({ x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
    });
    for (const r of rects) {
      const el = document.createElement('div'); el.dataset.guideMask = '1';
      Object.assign(el.style, { position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, background: '#263344', border: '1px solid #637185', zIndex: '2147483646', pointerEvents: 'none' });
      document.body.appendChild(el);
    }
    return rects.length;
  }, { source: text });
}
async function capture(page, entry, state, suffix = '') {
  const family = entry.private ? 'private' : 'main';
  const filename = `${entry.id}-${slug(state)}${suffix}.jpg`;
  const masks = entry.private ? await redact(page, entry) : await page.evaluate(() => {
    // Public pages can contain operational addresses too. Mask such text before
    // saving, without hiding normal public player handles or match statistics.
    let count = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n; (n = walker.nextNode());) if (n.parentElement && !n.parentElement.closest('script,style,[data-guide-mask]') && /(?:\d{1,3}\.){3}\d{1,3}|[\w.+-]+@[\w.-]+\.\w+|(?:sk_live_|sk_test_|whsec_)[A-Za-z0-9]+/.test(n.textContent)) nodes.push(n);
    for (const n of nodes) {
      const range = document.createRange(); range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        const el = document.createElement('div'); el.dataset.guideMask = '1';
        Object.assign(el.style, { position:'absolute', left:`${r.x+scrollX}px`, top:`${r.y+scrollY}px`, width:`${r.width}px`, height:`${r.height}px`, background:'#263344', zIndex:'2147483646', pointerEvents:'none' });
        document.body.appendChild(el); count++;
      }
    }
    return count;
  });
  const callouts = await page.evaluate(({ isPrivate }) => {
    const selectors = isPrivate ? 'h1,h2,.ap-nav-item.active' : 'h1,h2,main select,main input,main [role="tab"],main button,.page-title,[role="dialog"] h2';
    const found = [];
    for (const el of document.querySelectorAll(selectors)) {
      if (el.closest('nav,header,footer')) continue;
      const r = el.getBoundingClientRect();
      const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 100);
      if (r.width < 1 || r.height < 1 || r.top < 65 || r.top > innerHeight - 40 || !label || found.some(f => Math.abs(f.y-r.y)<35)) continue;
      found.push({ label, x: Math.max(18, Math.min(innerWidth-18, r.left-17)), y: Math.max(18, r.top + Math.min(r.height/2, 20)) });
      if (found.length === 3) break;
    }
    return found;
  }, { isPrivate: entry.private });
  if (entry.private) {
    const text = fs.readFileSync(entry.source, 'utf8').replace(/\s+/g, ' ');
    for (const c of callouts) if (!text.includes(c.label)) c.label = 'Restricted page heading (content redacted)';
  }
  if (!callouts.length) callouts.push({ label: 'Current page state — see the observation below', x: 24, y: 145 });
  const buffer = await page.screenshot({ type: 'jpeg', quality: 85, timeout: 15000 });
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  callouts.forEach((c, i) => {
    ctx.beginPath(); ctx.arc(c.x, c.y, 15, 0, Math.PI * 2); ctx.fillStyle = '#ffdb6e'; ctx.fill();
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#111827'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${i + 1}`, c.x, c.y);
    c.id = `${entry.id}-${slug(state)}${suffix}-c${i + 1}`;
  });
  fs.writeFileSync(`${OUT}/${family}/media/${filename}`, canvas.toBuffer('image/jpeg', 85));
  const record = { file: `media/${filename}`, state, url: page.url(), capturedAt: new Date().toISOString(), role: entry.private ? (elevated ? 'automation superuser; no Steam player identity' : 'anonymous (elevation unavailable)') : 'anonymous',
    environment: 'live production; deployed revision not independently verified', sourceRevision: entry.sourceRevision,
    viewport: page.viewportSize(), scrollY: await page.evaluate(() => scrollY), masks, callouts };
  entry.captures.push(record);
  return record;
}
function classify(text, route, page, errors) {
  if (errors.length) return 'browser-error';
  if (new URL(page.url()).pathname === '/' && route !== '/') return 'redirected-home';
  if (/Loading (?:player|match|replay|profile|data)[.…]/i.test(text)) return 'loading-at-deadline';
  if (/sign in.*(?:required|manage|access|view|continue|your)|must.*(?:sign|logged)|please.*sign/i.test(text)) return 'sign-in-required';
  if (/failed to load|something went wrong|request failed|not found|error loading/i.test(text)) return 'error-or-missing-data';
  if (/not enough data|no .{0,35}(?:yet|found|available)|nothing here|waiting for/i.test(text)) return 'empty-or-waiting';
  if (/unlock.*pro|requires? pro|upgrade to pro/i.test(text)) return 'entitlement-gated';
  if (text.trim().length < 30) return 'blank-or-transparent';
  return 'rendered';
}
async function runEntry(entry) {
  entry.captures = [];
  entry.notes = notes[entry.component];
  const route = representative(entry);
  entry.representative = route;
  if (!route) { entry.status = 'no-safe-representative'; entry.observation = 'No suitable public record link was available in the sampled index pages. The route and intended workflow are verified from source; no invented record was substituted.'; return; }
  const page = await (entry.private ? admin : anon).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.name));
  page.on('dialog', dialog => dialog.dismiss());
  try {
    entry.http = await navigate(page, route);
    const text = await page.locator('body').innerText();
    entry.sensitivePublicTextDetected = !entry.private && /(?:\d{1,3}\.){3}\d{1,3}|[\w.+-]+@[\w.-]+\.\w+|(?:sk_live_|sk_test_|whsec_)[A-Za-z0-9]+/.test(text);
    entry.status = classify(text, route, page, errors);
    entry.observation = `Browser observed: ${entry.status.replaceAll('-', ' ')}. HTTP ${entry.http}; ${errors.length} uncaught browser error(s). This is a read-only capture, not an end-to-end workflow test.`;
    entry.visibleHeadings = entry.private ? [] : (await page.locator('h1,h2,h3').allTextContents()).slice(0, 50).map(norm);
    await capture(page, entry, 'default');
    // Readable viewport crops rather than a huge, illegible full-page image.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    let offsets = height > 1600 ? [850, Math.min(height - 1000, 1800)] : [];
    if (['MatchDetail', 'ReplayViewer', 'PlayerProfile'].includes(entry.component)) {
      offsets = await page.locator('h2,h3').evaluateAll(els => els.map(el => Math.max(0, el.getBoundingClientRect().top + scrollY - 90)).filter(y => y > 700).slice(0, 14));
    }
    for (const [i, offset] of [...new Set(offsets)].entries()) {
      await page.evaluate(y => scrollTo(0, y), offset); await page.waitForTimeout(200);
      await capture(page, entry, 'section', `-${i + 1}`);
    }
    for (const tab of entry.tabs) {
      if (entry.component === 'AdminPanel') {
        await page.evaluate(() => localStorage.removeItem('admin_active_tab'));
        await navigate(page, route);
      }
      await page.evaluate(() => { document.querySelectorAll('[data-guide-mask]').forEach(e => e.remove()); scrollTo(0, 0); });
      const name = tab.label.replace(/^[^\p{L}\p{N}]+/u, '').trim().replaceAll('&amp;', '&');
      const locator = entry.component === 'AdminPanel'
        ? page.locator('.ap-nav-item').filter({ hasText: name }).first()
        : page.getByRole('tab', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).or(page.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })).first();
      if (!await locator.isVisible().catch(() => false)) { tab.status = 'not-visible-in-current-role-or-state'; continue; }
      await locator.click({ timeout: 2500 }); await page.waitForTimeout(1400);
      const tabText = await page.locator('body').innerText();
      tab.status = /You must be logged in as superuser|Admin panel crashed/.test(tabText) ? 'captured-access-or-error-state' : 'captured';
      await capture(page, entry, `tab-${tab.key}`);
      if (entry.component === 'AdminPanel') {
        await page.evaluate(() => scrollTo(0, 800)); await page.waitForTimeout(100);
        await capture(page, entry, `tab-${tab.key}`, '-detail');
      }
    }
    if (entry.component === 'GamePlay') {
      for (const game of gameLinks) {
        await navigate(page, game);
        if (game !== route) await capture(page, entry, `game-${game.split('/').pop()}`);
        const endless = page.getByRole('button', { name: /^Endless$/i });
        if (await endless.isVisible().catch(()=>false)) {
          await endless.click(); await page.waitForTimeout(1000);
          await capture(page, entry, `game-${game.split('/').pop()}-endless`);
        }
      }
    }
    if (['Home','MatchList','Heroes','Inhouse','PlayerProfile','Games','Settings','AdminPanel','ReplayViewer'].includes(entry.component)) {
      await page.setViewportSize({ width: 390, height: 844 });
      await navigate(page, route);
      await capture(page, entry, 'mobile');
    }
    for (const section of entry.sections) {
      section.status = entry.visibleHeadings?.some(h => h.includes(section.label)) ? 'heading-observed-content-not-exhaustively-tested' : 'source-only-or-unavailable-for-this-record';
    }
  } catch (error) {
    entry.status = 'capture-interrupted';
    entry.observation = `Capture interrupted (${error.name}). Existing screenshots are partial evidence only; the remaining states are not visually verified.`;
  } finally { await page.close(); }
  console.log(`${entry.id}: ${entry.status}, ${entry.captures.length} captures`);
}
const previous = fs.existsSync(`${OUT}/evidence.json`) ? JSON.parse(fs.readFileSync(`${OUT}/evidence.json`)) : null;
let queue = entries.filter(e => !subset || subset.includes(e.component));
// Two workers keep the live site load low. All mutation requests are blocked.
await Promise.all([0, 1].map(async () => {
  for (let entry; (entry = queue.shift());) {
    await runEntry(entry);
    fs.writeFileSync(`${OUT}/evidence.partial.json`, JSON.stringify({ entries, surfaces }, null, 2));
  }
}));
if (subset && previous) for (let i = 0; i < entries.length; i++) {
  if (!subset.includes(entries[i].component)) entries[i] = previous.entries.find(e => e.id === entries[i].id) || entries[i];
}
if (process.env.GUIDE_SURFACES === '1') {
  const home = entries.find(e=>e.component==='Home');
  const page = await anon.newPage();
  const extra = [];
  const save = async (state, surface) => {
    const c = await capture(page, home, state);
    home.captures.pop(); extra.push(c);
    const s = surfaces.find(s=>s[0]===surface);
    if (s) s[6] = `Browser-observed in the annotated “${state}” screenshot below.`;
  };
  await navigate(page, '/');
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('welcome_modal_dismissed_')) localStorage.removeItem(key);
  });
  await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1800);
  if (await page.getByRole('dialog').count()) await save('welcome-announcement','welcome');
  await dismiss(page);
  const trust = page.getByRole('button', { name:/Why is signing in with Steam safe/i }).or(page.getByRole('link', { name:/Why is signing in with Steam safe/i })).first();
  if (await trust.isVisible().catch(()=>false)) { await trust.click(); await page.waitForTimeout(200); await save('steam-trust','trust'); await page.keyboard.press('Escape'); }
  await page.getByRole('button', { name:/Search \(press/ }).click({timeout:2000}).catch(()=>{});
  if (await page.getByRole('dialog').count()) { await save('global-search','search'); await page.keyboard.press('Escape'); }
  const stats = page.getByRole('button', { name:/^Stats/ }).first();
  if (await stats.isVisible().catch(()=>false)) { await stats.hover(); await page.waitForTimeout(100); await save('navigation-dropdown','navigation'); await page.mouse.move(10,400); }
  const season = page.locator('select').first();
  if (await season.isVisible().catch(()=>false)) {
    await save('season-selector','season-selector');
  }
  await page.setViewportSize({width:390,height:844}); await navigate(page,'/');
  await save('mobile-navigation','navigation');
  home.extraCaptures = extra;
  await page.close();
}
const evidence = { base: BASE, capturedAt: new Date().toISOString(), elevated, blockedMutationRequests: blocked, samplesDiscovered: { match: !!match, player: !!player, games: gameLinks.length }, entries, surfaces };
fs.writeFileSync(`${OUT}/evidence.json`, JSON.stringify(evidence, null, 2));
await browser.close();
console.log('Capture complete; no browser session persisted.');
