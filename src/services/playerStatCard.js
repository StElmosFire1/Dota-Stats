// Task #447 — Embeddable player stat card generator.
//
// Renders a PNG version of the embed widget for static embeds (Twitter
// cards, Discord previews, blog images). Two size variants:
//   - 'tall'  → 240×320 (matches the iframe `tall` variant)
//   - 'wide'  → 480×120 (matches the iframe `wide` variant)
// Themes: 'light' / 'dark' (dark is the default).
//
// 5-minute in-memory buffer cache keyed by (steamId, variant, theme,
// signature of stats) — mirrors the cache shape used by profileOgCard.js.

let canvas = null;
try { canvas = require('@napi-rs/canvas'); } catch (_) { canvas = null; }

const { heroImageUrl } = require('./profileOgCard');
const path = require('path');
const fs = require('fs');

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const FETCH_TIMEOUT_MS = 6000;
const LOGO_PATH = path.join(__dirname, '../../web/public/oa-logo.png');

const _cache = new Map();
const _imgCache = new Map();
let _logoImg = null;
let _logoTried = false;

async function _loadLogo() {
  if (_logoTried) return _logoImg;
  _logoTried = true;
  if (!canvas) return null;
  try {
    if (fs.existsSync(LOGO_PATH)) {
      _logoImg = await canvas.loadImage(fs.readFileSync(LOGO_PATH));
    }
  } catch (_) { _logoImg = null; }
  return _logoImg;
}

async function _loadImage(url) {
  if (!url || !canvas) return null;
  const cached = _imgCache.get(url);
  if (cached) return cached;
  try {
    const fetch = require('node-fetch');
    const r = await fetch(url, { timeout: FETCH_TIMEOUT_MS });
    if (!r.ok) return null;
    const buf = await r.buffer();
    const img = await canvas.loadImage(buf);
    if (_imgCache.size >= CACHE_MAX) {
      const k = _imgCache.keys().next().value;
      if (k) _imgCache.delete(k);
    }
    _imgCache.set(url, img);
    return img;
  } catch (_) { return null; }
}

function normalizeRecent(r) {
  if (!r) return '';
  if (Array.isArray(r)) return r.join('');
  return String(r);
}

function cacheKey(opts) {
  return [
    opts.variant || 'tall',
    opts.theme || 'dark',
    opts.steamId || '',
    opts.displayName || '',
    opts.mmr ?? '',
    opts.tierName || '',
    opts.wins ?? '',
    opts.losses ?? '',
    normalizeRecent(opts.recent),
    opts.heroId || '',
    opts.heroName || '',
    opts.avatarUrl || '',
  ].join('|');
}

function drawAvatar(ctx, img, cx, cy, r, ringColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // cover-fit square avatar into the circle
  const size = r * 2;
  const ir = img.width / img.height;
  let dw, dh, dx, dy;
  if (ir >= 1) { dh = size; dw = size * ir; dx = cx - dw / 2; dy = cy - r; }
  else { dw = size; dh = size / ir; dx = cx - r; dy = cy - dh / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = ringColor;
  ctx.stroke();
}

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return hit.buf;
}
function cacheSet(key, buf) {
  if (_cache.size >= CACHE_MAX) {
    const k = _cache.keys().next().value;
    if (k) _cache.delete(k);
  }
  _cache.set(key, { buf, t: Date.now() });
}

function palette(theme) {
  if (theme === 'light') {
    return {
      bg: '#f5efe2',
      bgAccent: '#e6ddc7',
      text: '#0d1424',
      textMuted: '#3b4250',
      brass: '#a8884d',
      win: '#2e7d32',
      loss: '#c62828',
    };
  }
  return {
    bg: '#0d1424',
    bgAccent: '#1a2440',
    text: '#f5efe2',
    textMuted: '#a8b0c0',
    brass: '#c5a975',
    win: '#4ade80',
    loss: '#f87171',
  };
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const cr = w / h;
  let dw, dh, dx, dy;
  if (ir > cr) { dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y; }
  else { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function truncate(ctx, text, maxW) {
  let s = String(text || '');
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

async function renderTall(opts) {
  const W = 240, H = 320;
  const c = palette(opts.theme);
  const cv = canvas.createCanvas(W, H);
  const ctx = cv.getContext('2d');

  // Backdrop
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  const heroImg = await _loadImage(heroImageUrl(opts.heroId, opts.heroName));
  if (heroImg) {
    ctx.save();
    ctx.globalAlpha = opts.theme === 'light' ? 0.28 : 0.45;
    drawCover(ctx, heroImg, 0, 0, W, 140);
    ctx.restore();
    const grad = ctx.createLinearGradient(0, 0, 0, 140);
    grad.addColorStop(0, opts.theme === 'light' ? 'rgba(245,239,226,0.1)' : 'rgba(13,20,36,0.2)');
    grad.addColorStop(1, opts.theme === 'light' ? 'rgba(245,239,226,0.95)' : 'rgba(13,20,36,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 140);
  }

  // Brass top stripe
  ctx.fillStyle = c.brass;
  ctx.fillRect(0, 0, W, 4);

  // Eyebrow
  ctx.fillStyle = c.brass;
  ctx.font = '700 11px Inter, Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('OCE INHOUSE', 14, 14);

  // Tier name top-right
  if (opts.tierName) {
    ctx.font = '600 11px Inter, Arial, sans-serif';
    ctx.fillStyle = c.textMuted;
    const t = truncate(ctx, opts.tierName, 110);
    const tw = ctx.measureText(t).width;
    ctx.fillText(t, W - 14 - tw, 14);
  }

  // Avatar (top-right circle) — fetched via OpenDota and passed through.
  if (opts.avatarUrl) {
    const av = await _loadImage(opts.avatarUrl);
    if (av) drawAvatar(ctx, av, W - 14 - 24, 72 + 24, 24, c.brass);
  }

  // Display name (1–2 lines)
  ctx.fillStyle = c.text;
  ctx.font = '800 20px Inter, Arial, sans-serif';
  ctx.fillText(truncate(ctx, opts.displayName || 'Player', W - 28), 14, 116);

  // MMR row
  if (Number.isFinite(opts.mmr)) {
    ctx.fillStyle = c.brass;
    ctx.font = '800 36px Inter, Arial, sans-serif';
    ctx.fillText(String(opts.mmr), 14, 146);
    const mmrW = ctx.measureText(String(opts.mmr)).width;
    ctx.fillStyle = c.textMuted;
    ctx.font = '600 12px Inter, Arial, sans-serif';
    ctx.fillText('MMR', 14 + mmrW + 6, 168);
  }

  // W / L line
  const wins = Number(opts.wins) || 0;
  const losses = Number(opts.losses) || 0;
  const total = wins + losses;
  const wr = total > 0 ? Math.round((wins / total) * 100) : null;
  ctx.fillStyle = c.text;
  ctx.font = '600 13px Inter, Arial, sans-serif';
  const wlLine = `${wins}W ${losses}L${wr != null ? ` · ${wr}% WR` : ''}`;
  ctx.fillText(wlLine, 14, 194);

  // Last 10 dots
  ctx.fillStyle = c.textMuted;
  ctx.font = '600 10px Inter, Arial, sans-serif';
  ctx.fillText('LAST 10', 14, 220);
  const recent = (opts.recent || []).slice(0, 10);
  const dotR = 7, gap = 4, startX = 14;
  for (let i = 0; i < 10; i++) {
    const ch = recent[i];
    ctx.beginPath();
    ctx.arc(startX + dotR + i * (dotR * 2 + gap), 248, dotR, 0, Math.PI * 2);
    if (ch === 'W') ctx.fillStyle = c.win;
    else if (ch === 'L') ctx.fillStyle = c.loss;
    else ctx.fillStyle = opts.theme === 'light' ? '#d1d5db' : '#3b4250';
    ctx.fill();
  }

  // Signature hero footer
  if (opts.heroDisplayName) {
    ctx.fillStyle = c.textMuted;
    ctx.font = '600 10px Inter, Arial, sans-serif';
    ctx.fillText('SIGNATURE', 14, 270);
    ctx.fillStyle = c.text;
    ctx.font = '700 13px Inter, Arial, sans-serif';
    ctx.fillText(truncate(ctx, opts.heroDisplayName, W - 28), 14, 284);
  }

  // Powered-by line
  ctx.fillStyle = c.brass;
  ctx.font = '500 9px Inter, Arial, sans-serif';
  const pb = 'powered by oceinhouse.gg';
  const pbW = ctx.measureText(pb).width;
  ctx.fillText(pb, (W - pbW) / 2, H - 14);

  return cv.encode('png');
}

async function renderWide(opts) {
  const W = 480, H = 120;
  const c = palette(opts.theme);
  const cv = canvas.createCanvas(W, H);
  const ctx = cv.getContext('2d');

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  const heroImg = await _loadImage(heroImageUrl(opts.heroId, opts.heroName));
  if (heroImg) {
    ctx.save();
    ctx.globalAlpha = opts.theme === 'light' ? 0.22 : 0.4;
    drawCover(ctx, heroImg, 0, 0, 200, H);
    ctx.restore();
    const grad = ctx.createLinearGradient(0, 0, 220, 0);
    grad.addColorStop(0, opts.theme === 'light' ? 'rgba(245,239,226,0.0)' : 'rgba(13,20,36,0.15)');
    grad.addColorStop(1, opts.theme === 'light' ? 'rgba(245,239,226,0.95)' : 'rgba(13,20,36,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 220, H);
  }

  // Brass left stripe
  ctx.fillStyle = c.brass;
  ctx.fillRect(0, 0, 4, H);

  // Avatar (left circle) — fetched via OpenDota.
  let leftPad = 16;
  if (opts.avatarUrl) {
    const av = await _loadImage(opts.avatarUrl);
    if (av) {
      drawAvatar(ctx, av, 14 + 28, H / 2, 28, c.brass);
      leftPad = 14 + 28 * 2 + 12;
    }
  }

  // Eyebrow
  ctx.fillStyle = c.brass;
  ctx.font = '700 10px Inter, Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('OCE INHOUSE', leftPad, 12);

  // Name
  ctx.fillStyle = c.text;
  ctx.font = '800 20px Inter, Arial, sans-serif';
  ctx.fillText(truncate(ctx, opts.displayName || 'Player', 280 - (leftPad - 16)), leftPad, 28);

  // MMR + tier inline
  let y = 58;
  ctx.font = '800 22px Inter, Arial, sans-serif';
  ctx.fillStyle = c.brass;
  let x = leftPad;
  if (Number.isFinite(opts.mmr)) {
    const t = String(opts.mmr);
    ctx.fillText(t, x, y);
    x += ctx.measureText(t).width + 6;
    ctx.font = '600 11px Inter, Arial, sans-serif';
    ctx.fillStyle = c.textMuted;
    ctx.fillText('MMR', x, y + 8);
    x += ctx.measureText('MMR').width + 14;
  }
  if (opts.tierName) {
    ctx.font = '600 12px Inter, Arial, sans-serif';
    ctx.fillStyle = c.textMuted;
    ctx.fillText(truncate(ctx, opts.tierName, 200 - (x - leftPad)), x, y + 8);
  }

  // W/L line
  const wins = Number(opts.wins) || 0;
  const losses = Number(opts.losses) || 0;
  const total = wins + losses;
  const wr = total > 0 ? Math.round((wins / total) * 100) : null;
  ctx.fillStyle = c.text;
  ctx.font = '600 12px Inter, Arial, sans-serif';
  ctx.fillText(`${wins}W ${losses}L${wr != null ? ` · ${wr}% WR` : ''}`, leftPad, 92);

  // Right side: last 10 dots + signature hero
  ctx.fillStyle = c.textMuted;
  ctx.font = '600 9px Inter, Arial, sans-serif';
  ctx.fillText('LAST 10', W - 16 - ctx.measureText('LAST 10').width, 12);
  const recent = (opts.recent || []).slice(0, 10);
  const dotR = 6, gap = 3;
  const rowW = 10 * (dotR * 2 + gap) - gap;
  const startX = W - 16 - rowW;
  for (let i = 0; i < 10; i++) {
    const ch = recent[i];
    ctx.beginPath();
    ctx.arc(startX + dotR + i * (dotR * 2 + gap), 36, dotR, 0, Math.PI * 2);
    if (ch === 'W') ctx.fillStyle = c.win;
    else if (ch === 'L') ctx.fillStyle = c.loss;
    else ctx.fillStyle = opts.theme === 'light' ? '#d1d5db' : '#3b4250';
    ctx.fill();
  }
  if (opts.heroDisplayName) {
    ctx.fillStyle = c.textMuted;
    ctx.font = '600 9px Inter, Arial, sans-serif';
    const eyebrow = 'SIGNATURE';
    ctx.fillText(eyebrow, W - 16 - ctx.measureText(eyebrow).width, 58);
    ctx.fillStyle = c.text;
    ctx.font = '700 13px Inter, Arial, sans-serif';
    const hero = truncate(ctx, opts.heroDisplayName, 200);
    ctx.fillText(hero, W - 16 - ctx.measureText(hero).width, 72);
  }

  // Powered-by bottom-right
  ctx.fillStyle = c.brass;
  ctx.font = '500 9px Inter, Arial, sans-serif';
  const pb = 'powered by oceinhouse.gg';
  ctx.fillText(pb, W - 16 - ctx.measureText(pb).width, H - 14);

  return cv.encode('png');
}

async function generatePlayerStatCard(opts = {}) {
  if (!canvas) return null;
  const variant = opts.variant === 'wide' ? 'wide' : 'tall';
  const theme = opts.theme === 'light' ? 'light' : 'dark';
  const key = cacheKey({ ...opts, variant, theme });
  const cached = cacheGet(key);
  if (cached) return cached;
  const buf = variant === 'wide'
    ? await renderWide({ ...opts, theme })
    : await renderTall({ ...opts, theme });
  cacheSet(key, buf);
  return buf;
}

function clearCache() { _cache.clear(); }

module.exports = { generatePlayerStatCard, clearCache, CACHE_TTL_MS };
