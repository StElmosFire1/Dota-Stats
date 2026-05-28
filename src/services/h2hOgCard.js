// Task #442 — Open Graph card generator for the Head-to-Head page
// (`/h2h/:a/:b`). Renders a 1200×630 PNG with both players' display names
// on either side, the H2H scoreline in the middle, and each player's top
// hero portrait as a faded backdrop slab. Falls back to a logo-only card
// when canvas is unavailable. Same in-memory cache shape as
// `profileOgCard.js`.

let canvas = null;
try { canvas = require('@napi-rs/canvas'); } catch (_) { canvas = null; }

const path = require('path');
const fs = require('fs');
const { heroImageUrl } = require('./profileOgCard');

const W = 1200;
const H = 630;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const FETCH_TIMEOUT_MS = 6000;
const LOGO_PATH = path.join(__dirname, '../../web/public/oa-logo.png');

const _cache = new Map();
const _heroImgCache = new Map();
let _logoImg = null;
let _logoTried = false;

async function _loadHeroImage(url) {
  if (!url || !canvas) return null;
  const cached = _heroImgCache.get(url);
  if (cached) return cached;
  try {
    const fetch = require('node-fetch');
    const r = await fetch(url, { timeout: FETCH_TIMEOUT_MS });
    if (!r.ok) return null;
    const buf = await r.buffer();
    const img = await canvas.loadImage(buf);
    if (_heroImgCache.size >= CACHE_MAX) {
      const k = _heroImgCache.keys().next().value;
      if (k) _heroImgCache.delete(k);
    }
    _heroImgCache.set(url, img);
    return img;
  } catch (_) { return null; }
}

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

function _drawSlab(ctx, img, x, y, w, h, side) {
  // Cover-fill within the slab rect.
  const ir = img.width / img.height;
  const cr = w / h;
  let dw, dh, dx, dy;
  if (ir > cr) { dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y; }
  else { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2; }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = 0.5;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  // Side gradient so the scoreboard panel reads cleanly.
  const grad = side === 'left'
    ? ctx.createLinearGradient(x + w, y, x, y)
    : ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, 'rgba(13, 20, 36, 0.95)');
  grad.addColorStop(0.6, 'rgba(13, 20, 36, 0.45)');
  grad.addColorStop(1, 'rgba(13, 20, 36, 0.1)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

function _truncate(ctx, text, maxWidth) {
  let s = String(text || '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function _cacheKey(opts) {
  return [
    opts.aName || '', opts.bName || '',
    opts.aWins || 0, opts.bWins || 0,
    opts.aHeroId || '', opts.bHeroId || '',
    opts.aHeroName || '', opts.bHeroName || '',
  ].join('|');
}

function _cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return hit.buf;
}

function _cacheSet(key, buf) {
  if (_cache.size >= CACHE_MAX) {
    const k = _cache.keys().next().value;
    if (k) _cache.delete(k);
  }
  _cache.set(key, { buf, t: Date.now() });
}

async function generateH2HOgCard(opts = {}) {
  if (!canvas) return null;
  const key = _cacheKey(opts);
  const cached = _cacheGet(key);
  if (cached) return cached;

  const aName = _trimName(opts.aName);
  const bName = _trimName(opts.bName);
  const aWins = Number.isFinite(opts.aWins) ? opts.aWins : 0;
  const bWins = Number.isFinite(opts.bWins) ? opts.bWins : 0;

  const [aHero, bHero, logoImg] = await Promise.all([
    _loadHeroImage(heroImageUrl(opts.aHeroId, opts.aHeroName)),
    _loadHeroImage(heroImageUrl(opts.bHeroId, opts.bHeroName)),
    _loadLogo(),
  ]);

  const cv = canvas.createCanvas(W, H);
  const ctx = cv.getContext('2d');

  // Backdrop.
  ctx.fillStyle = '#0d1424';
  ctx.fillRect(0, 0, W, H);

  // Left slab (Player A — radiant-leaning teal).
  if (aHero) _drawSlab(ctx, aHero, 0, 0, W / 2, H, 'left');
  else {
    const g = ctx.createLinearGradient(0, 0, W / 2, H);
    g.addColorStop(0, '#0d1424'); g.addColorStop(1, '#1a3a3a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W / 2, H);
  }
  // Right slab (Player B — dire-leaning maroon).
  if (bHero) _drawSlab(ctx, bHero, W / 2, 0, W / 2, H, 'right');
  else {
    const g = ctx.createLinearGradient(W / 2, 0, W, H);
    g.addColorStop(0, '#0d1424'); g.addColorStop(1, '#3a1a1a');
    ctx.fillStyle = g; ctx.fillRect(W / 2, 0, W / 2, H);
  }

  // Center divider — brass bar.
  ctx.fillStyle = '#c5a975';
  ctx.fillRect(W / 2 - 3, 60, 6, H - 120);

  // Eyebrow.
  ctx.fillStyle = '#c5a975';
  ctx.font = '600 22px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('OCE INHOUSE · HEAD-TO-HEAD', 60, 50);

  // Player A name (left aligned).
  ctx.fillStyle = '#f5efe2';
  ctx.font = '800 56px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText(_truncate(ctx, aName, W / 2 - 100), 60, 110);

  // Player B name (right aligned).
  ctx.textAlign = 'right';
  ctx.fillText(_truncate(ctx, bName, W / 2 - 100), W - 60, 110);

  // Scoreline — huge numerals, brass dash.
  const aColor = aWins > bWins ? '#22c55e' : aWins < bWins ? '#ef4444' : '#f5efe2';
  const bColor = bWins > aWins ? '#22c55e' : bWins < aWins ? '#ef4444' : '#f5efe2';
  ctx.font = '900 220px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';

  const aStr = String(aWins);
  const bStr = String(bWins);
  const dash = '–';
  const aw = ctx.measureText(aStr).width;
  const dw = ctx.measureText(dash).width;
  const gap = 40;
  const totalW = aw + gap + dw + gap + ctx.measureText(bStr).width;
  const startX = (W - totalW) / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = aColor;
  ctx.fillText(aStr, startX, H / 2 + 10);
  ctx.fillStyle = '#c5a975';
  ctx.fillText(dash, startX + aw + gap, H / 2 + 10);
  ctx.fillStyle = bColor;
  ctx.fillText(bStr, startX + aw + gap + dw + gap, H / 2 + 10);

  // Subtitle.
  const total = aWins + bWins;
  const subtitle = total > 0
    ? `${total} match${total === 1 ? '' : 'es'} · all-time`
    : 'No recorded meetings yet';
  ctx.font = '600 28px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(245, 239, 226, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(subtitle, W / 2, H - 130);

  // Footer.
  ctx.font = '500 22px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#c5a975';
  ctx.textAlign = 'left';
  ctx.fillText('oceinhouse.gg', 60, H - 60);
  if (logoImg) {
    const lh = 48;
    const lw = logoImg.width * (lh / logoImg.height);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(logoImg, W - lw - 60, H - 70, lw, lh);
    ctx.globalAlpha = 1;
  }

  const buf = await cv.encode('png');
  _cacheSet(key, buf);
  return buf;
}

function _trimName(s) {
  return String(s || 'Player').slice(0, 32);
}

function clearCache() { _cache.clear(); }

module.exports = {
  generateH2HOgCard,
  clearCache,
  CARD_WIDTH: W,
  CARD_HEIGHT: H,
};
