// Task #443 — Open Graph share card for the /wrapped/:season/:player slideshow.
// 1200×630 PNG drawn with @napi-rs/canvas in the same palette as the rest of
// the OCE Inhouse site (ink-navy + brass + amber). Caches recent buffers in
// memory keyed by (accountId, seasonId, displayName, grade) so repeat
// unfurls don't re-render. Falls back to null when @napi-rs/canvas is
// unavailable; callers should serve the static OA logo in that case.

let canvas = null;
try { canvas = require('@napi-rs/canvas'); } catch (_) { canvas = null; }

const path = require('path');
const fs = require('fs');

const W = 1200;
const H = 630;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const LOGO_PATH = path.join(__dirname, '../../web/public/oa-logo.png');

const _cache = new Map();
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

function _cacheKey(opts) {
  return [
    opts.accountId || '',
    opts.seasonId || '',
    opts.displayName || '',
    opts.seasonName || '',
    opts.grade || '',
    opts.games ?? '',
    opts.wins ?? '',
    opts.wrPct ?? '',
  ].join('|');
}

function _cacheGet(k) {
  const hit = _cache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) { _cache.delete(k); return null; }
  return hit.buf;
}

function _cacheSet(k, buf) {
  if (_cache.size >= CACHE_MAX) {
    const first = _cache.keys().next().value;
    if (first) _cache.delete(first);
  }
  _cache.set(k, { buf, t: Date.now() });
}

async function generateWrappedOgCard(opts = {}) {
  if (!canvas) return null;
  const key = _cacheKey(opts);
  const cached = _cacheGet(key);
  if (cached) return cached;

  const displayName = String(opts.displayName || 'Player').slice(0, 48);
  const seasonName = String(opts.seasonName || 'Season').slice(0, 48);
  const grade = String(opts.grade || '').slice(0, 3);
  const games = Number.isFinite(opts.games) ? opts.games : null;
  const wins = Number.isFinite(opts.wins) ? opts.wins : null;
  const losses = Number.isFinite(opts.losses) ? opts.losses : null;
  const wrPct = Number.isFinite(opts.wrPct) ? opts.wrPct : null;
  const heroName = opts.heroName ? String(opts.heroName).slice(0, 48) : null;
  const streak = Number.isFinite(opts.streak) ? opts.streak : null;
  const mvp = Number.isFinite(opts.mvp) ? opts.mvp : null;

  const cv = canvas.createCanvas(W, H);
  const ctx = cv.getContext('2d');

  // Ink-navy backdrop with brass diagonal sweep.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d1424');
  bg.addColorStop(1, '#1a2440');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle brass diagonal band behind the grade circle.
  ctx.save();
  ctx.translate(W - 280, H / 2);
  ctx.rotate(-Math.PI / 12);
  ctx.fillStyle = 'rgba(197, 169, 117, 0.10)';
  ctx.fillRect(-600, -110, 1200, 220);
  ctx.restore();

  // Left brass rule.
  ctx.fillStyle = '#c5a975';
  ctx.fillRect(60, 90, 6, H - 180);

  // Eyebrow.
  ctx.fillStyle = '#c5a975';
  ctx.font = '600 26px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('OCE INHOUSE · SEASON WRAPPED', 100, 90);

  // Season name.
  ctx.fillStyle = '#f59e0b';
  ctx.font = '700 36px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(seasonName, 100, 130);

  // Player display name.
  ctx.fillStyle = '#f5efe2';
  ctx.font = '800 88px "Playfair Display", Georgia, serif';
  // Truncate name to fit width 720 (leaves room for the grade circle).
  let name = displayName;
  while (name.length > 4 && ctx.measureText(name).width > 700) name = name.slice(0, -1);
  if (name.length < displayName.length) name = name.replace(/\s+\S*$/, '') + '…';
  ctx.fillText(name, 100, 188);

  // Tagline.
  ctx.fillStyle = 'rgba(245, 239, 226, 0.78)';
  ctx.font = 'italic 600 32px "Playfair Display", Georgia, serif';
  const parts = [];
  if (games != null) parts.push(`${games} matches`);
  if (wins != null && losses != null) parts.push(`${wins}W ${losses}L`);
  if (wrPct != null) parts.push(`${wrPct}% WR`);
  if (parts.length) ctx.fillText(parts.join(' · '), 100, 302);

  // Highlight pills.
  const pills = [];
  if (heroName) pills.push(`Signature · ${heroName}`);
  if (streak != null && streak >= 2) pills.push(`${streak}-win streak`);
  if (mvp != null && mvp > 0) pills.push(`${mvp} MVP vote${mvp === 1 ? '' : 's'}`);
  if (pills.length) {
    ctx.font = '600 26px Inter, "Helvetica Neue", Arial, sans-serif';
    let cx = 100;
    const py = 370;
    for (const text of pills) {
      const tw = ctx.measureText(text).width;
      const padX = 18;
      const bw = tw + padX * 2;
      const bh = 50;
      ctx.fillStyle = 'rgba(13, 20, 36, 0.7)';
      ctx.strokeStyle = 'rgba(197, 169, 117, 0.55)';
      ctx.lineWidth = 2;
      const r = 12;
      ctx.beginPath();
      ctx.moveTo(cx + r, py);
      ctx.lineTo(cx + bw - r, py);
      ctx.quadraticCurveTo(cx + bw, py, cx + bw, py + r);
      ctx.lineTo(cx + bw, py + bh - r);
      ctx.quadraticCurveTo(cx + bw, py + bh, cx + bw - r, py + bh);
      ctx.lineTo(cx + r, py + bh);
      ctx.quadraticCurveTo(cx, py + bh, cx, py + bh - r);
      ctx.lineTo(cx, py + r);
      ctx.quadraticCurveTo(cx, py, cx + r, py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f5efe2';
      ctx.textBaseline = 'top';
      ctx.fillText(text, cx + padX, py + 12);
      cx += bw + 14;
      if (cx > W - 360) break;
    }
  }

  // Grade circle (right side).
  if (grade) {
    const cx = W - 200;
    const cy = H / 2 - 10;
    const radius = 140;
    ctx.save();
    const ring = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
    ring.addColorStop(0, 'rgba(245, 158, 11, 0.95)');
    ring.addColorStop(1, 'rgba(197, 169, 117, 0.85)');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d1424';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = '#0d1424';
    ctx.font = '900 ' + (grade.length > 1 ? '120px' : '160px') + ' "Playfair Display", Georgia, serif';
    ctx.textBaseline = 'middle';
    const gw = ctx.measureText(grade).width;
    ctx.fillText(grade, cx - gw / 2, cy + 4);
    ctx.font = '700 22px Inter, "Helvetica Neue", Arial, sans-serif';
    const lbl = 'SEASON GRADE';
    const lw = ctx.measureText(lbl).width;
    ctx.fillText(lbl, cx - lw / 2, cy + radius + 32);
    ctx.restore();
  }

  // Footer hostname + logo.
  ctx.textBaseline = 'top';
  ctx.font = '500 22px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#c5a975';
  ctx.fillText('oceinhouse.gg · /wrapped', 100, H - 70);
  const logoImg = await _loadLogo();
  if (logoImg) {
    const lh = 56;
    const lw = logoImg.width * (lh / logoImg.height);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(logoImg, 100 - 8, H - 130, lw, lh);
    ctx.globalAlpha = 1;
  }

  const buf = await cv.encode('png');
  _cacheSet(key, buf);
  return buf;
}

function clearCache() { _cache.clear(); }

module.exports = {
  generateWrappedOgCard,
  clearCache,
  CARD_WIDTH: W,
  CARD_HEIGHT: H,
};
