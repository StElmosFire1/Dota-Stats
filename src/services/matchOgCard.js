// Task #268 — Open Graph card generator for shared `/match/<id>` links.
// Mirrors the per-player card shape from src/services/profileOgCard.js: a
// 1200×630 PNG built with @napi-rs/canvas, cached in-memory keyed by a
// stable signature of the inputs. The card layers the top-fragger's hero
// portrait behind a dark gradient, then prints the winning side, score,
// duration, MVP, and top-fragger KDA on top.
//
// Falls back to a logo-only card when @napi-rs/canvas is unavailable or
// when the hero portrait fetch fails. Callers should fall back to the
// static OA logo if this returns null.

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
      const firstKey = _heroImgCache.keys().next().value;
      if (firstKey) _heroImgCache.delete(firstKey);
    }
    _heroImgCache.set(url, img);
    return img;
  } catch (_) {
    return null;
  }
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

function _drawCoverFill(ctx, img) {
  const ir = img.width / img.height;
  const cr = W / H;
  let dw, dh, dx, dy;
  if (ir > cr) {
    dh = H;
    dw = H * ir;
    dx = (W - dw) / 2;
    dy = 0;
  } else {
    dw = W;
    dh = W / ir;
    dx = 0;
    dy = (H - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function _truncate(ctx, text, maxWidth) {
  let s = String(text || '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

function _cacheKey(opts) {
  return [
    opts.matchId || '',
    opts.radiantWin ? 'R' : 'D',
    opts.radiantScore ?? '',
    opts.direScore ?? '',
    opts.durationSeconds ?? '',
    opts.mvpName || '',
    opts.topFraggerName || '',
    opts.topFraggerKills ?? '',
    opts.topFraggerDeaths ?? '',
    opts.topFraggerAssists ?? '',
    opts.topFraggerHeroId || '',
    opts.topFraggerHeroName || '',
    opts.mvpHeroDisplayName || '',
  ].join('|');
}

function _cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return hit.buf;
}

function _cacheSet(key, buf) {
  if (_cache.size >= CACHE_MAX) {
    const firstKey = _cache.keys().next().value;
    if (firstKey) _cache.delete(firstKey);
  }
  _cache.set(key, { buf, t: Date.now() });
}

function _formatDuration(seconds) {
  const s = parseInt(seconds, 10);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Public API. Returns a PNG Buffer (1200×630) or null if canvas is
// unavailable. Callers should fall back to the static OA logo in that case.
async function generateMatchOgCard(opts = {}) {
  if (!canvas) return null;
  const key = _cacheKey(opts);
  const cached = _cacheGet(key);
  if (cached) return cached;

  const heroImg = await _loadHeroImage(
    heroImageUrl(opts.topFraggerHeroId, opts.topFraggerHeroName)
  );
  const logoImg = await _loadLogo();

  const cv = canvas.createCanvas(W, H);
  const ctx = cv.getContext('2d');

  // Backdrop: ink-navy.
  ctx.fillStyle = '#0d1424';
  ctx.fillRect(0, 0, W, H);

  if (heroImg) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    _drawCoverFill(ctx, heroImg);
    ctx.restore();

    // Left-to-right gradient so the text side stays readable.
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(13, 20, 36, 0.95)');
    grad.addColorStop(0.55, 'rgba(13, 20, 36, 0.75)');
    grad.addColorStop(1, 'rgba(13, 20, 36, 0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Bottom shadow for the footer line.
    const grad2 = ctx.createLinearGradient(0, H - 220, 0, H);
    grad2.addColorStop(0, 'rgba(13, 20, 36, 0)');
    grad2.addColorStop(1, 'rgba(13, 20, 36, 0.85)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, H - 220, W, 220);
  } else {
    // No hero — diagonal accent + centred logo.
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0d1424');
    grad.addColorStop(1, '#1a2440');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    if (logoImg) {
      const lh = 220;
      const lw = logoImg.width * (lh / logoImg.height);
      ctx.globalAlpha = 0.18;
      ctx.drawImage(logoImg, (W - lw) / 2, 80, lw, lh);
      ctx.globalAlpha = 1;
    }
  }

  // Side-tinted brass accent rule. Use the winning team's tint so the
  // bar reinforces the result at a glance.
  const winnerColor = opts.radiantWin ? '#5fb878' : '#d35858';
  ctx.fillStyle = winnerColor;
  ctx.fillRect(60, 110, 6, H - 220);

  // Eyebrow row: site + match id.
  ctx.fillStyle = '#c5a975';
  ctx.font = '600 26px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'top';
  const eyebrow = opts.matchId
    ? `OCE INHOUSE · MATCH #${opts.matchId}`
    : 'OCE INHOUSE';
  ctx.fillText(eyebrow, 100, 110);

  // Result headline.
  const resultText = opts.radiantWin ? 'RADIANT VICTORY' : 'DIRE VICTORY';
  ctx.fillStyle = winnerColor;
  ctx.font = '800 78px "Playfair Display", Georgia, serif';
  ctx.fillText(resultText, 100, 156);

  // Score line: "29 — 18".
  const rs = Number.isFinite(opts.radiantScore) ? opts.radiantScore : null;
  const ds = Number.isFinite(opts.direScore) ? opts.direScore : null;
  let scoreY = 252;
  if (rs != null && ds != null) {
    ctx.fillStyle = '#f5efe2';
    ctx.font = '800 120px Oswald, "Helvetica Neue", Arial, sans-serif';
    const score = `${rs} — ${ds}`;
    ctx.fillText(score, 100, scoreY);
    scoreY += 140;
  } else {
    scoreY += 24;
  }

  // Stat strip pills.
  const stats = [];
  const dur = _formatDuration(opts.durationSeconds);
  if (dur) stats.push(`⏱ ${dur}`);
  if (opts.mvpName) {
    const mvpSuffix = opts.mvpHeroDisplayName ? ` · ${opts.mvpHeroDisplayName}` : '';
    stats.push(`MVP: ${opts.mvpName}${mvpSuffix}`);
  }
  if (opts.topFraggerName
      && Number.isFinite(opts.topFraggerKills)
      && Number.isFinite(opts.topFraggerDeaths)
      && Number.isFinite(opts.topFraggerAssists)) {
    const kda = `${opts.topFraggerKills}/${opts.topFraggerDeaths}/${opts.topFraggerAssists}`;
    stats.push(`Top: ${opts.topFraggerName} ${kda}`);
  }

  if (stats.length) {
    const stripY = Math.max(scoreY + 8, H - 200);
    ctx.font = '600 30px Inter, "Helvetica Neue", Arial, sans-serif';
    let cx = 100;
    let cy = stripY;
    const maxRight = W - 80;
    for (let i = 0; i < stats.length; i++) {
      let text = stats[i];
      const padX = 22;
      const padY = 12;
      // Ensure the pill fits within the visible area.
      const maxTextWidth = (maxRight - 100) - padX * 2;
      text = _truncate(ctx, text, maxTextWidth);
      const tw = ctx.measureText(text).width;
      const bw = tw + padX * 2;
      const bh = 30 + padY * 2;
      if (cx + bw > maxRight) {
        cx = 100;
        cy += bh + 12;
      }
      ctx.fillStyle = 'rgba(13, 20, 36, 0.65)';
      ctx.strokeStyle = 'rgba(197, 169, 117, 0.55)';
      ctx.lineWidth = 2;
      const r = 12;
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      ctx.lineTo(cx + bw - r, cy);
      ctx.quadraticCurveTo(cx + bw, cy, cx + bw, cy + r);
      ctx.lineTo(cx + bw, cy + bh - r);
      ctx.quadraticCurveTo(cx + bw, cy + bh, cx + bw - r, cy + bh);
      ctx.lineTo(cx + r, cy + bh);
      ctx.quadraticCurveTo(cx, cy + bh, cx, cy + bh - r);
      ctx.lineTo(cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f5efe2';
      ctx.fillText(text, cx + padX, cy + padY);
      cx += bw + 16;
    }
  }

  // Footer hostname + top-fragger hero attribution.
  ctx.font = '500 22px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#c5a975';
  ctx.fillText('oceinhouse.gg', 100, H - 70);
  if (heroImg && opts.topFraggerHeroDisplayName) {
    const label = String(opts.topFraggerHeroDisplayName);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(245, 239, 226, 0.8)';
    ctx.fillText(label, W - 100 - tw, H - 70);
  }

  // Logo bug bottom-right when we have a hero portrait.
  if (heroImg && logoImg) {
    const lh = 64;
    const lw = logoImg.width * (lh / logoImg.height);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(logoImg, W - lw - 100, H - 170, lw, lh);
    ctx.globalAlpha = 1;
  }

  const buf = await cv.encode('png');
  _cacheSet(key, buf);
  return buf;
}

function clearCache() {
  _cache.clear();
}

module.exports = {
  generateMatchOgCard,
  clearCache,
  CARD_WIDTH: W,
  CARD_HEIGHT: H,
};
