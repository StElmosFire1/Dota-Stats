// Task #314 — Post-match recap card generator.
//
// Builds shareable PNG cards in two sizes (1200×630 OG/Twitter embed, and
// 1080×1920 Story/Reel) with three operator-pickable style variants:
//
//   • classic    — clean ink-navy + brass scoreboard layout
//   • magazine   — editorial Playfair Display layout with split colour panels
//   • tournament — bracket-style heavy bars + bold accent
//
// Inputs are an aggregated `recap` object (see `buildRecapInputs` in
// src/web/server.js helpers). Output is a PNG Buffer suitable for both
// download endpoints and Discord attachment.
//
// Falls back to null if @napi-rs/canvas is unavailable.

let canvas = null;
try { canvas = require('@napi-rs/canvas'); } catch (_) { canvas = null; }

const path = require('path');
const fs = require('fs');
// Hero portrait URL (inlined so this module has no cross-service imports).
function heroImageUrl(heroId, heroName) {
  let slug = null;
  if (heroName && typeof heroName === 'string') {
    slug = heroName.replace(/^npc_dota_hero_/, '');
  }
  if (!slug) return null;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

const SIZES = {
  og:    { w: 1200, h: 630 },
  story: { w: 1080, h: 1920 },
};

const VARIANTS = ['classic', 'magazine', 'tournament'];

const COLORS = {
  inkNavy:   '#0d1424',
  inkNavy2:  '#1a2440',
  brass:     '#c5a975',
  gold:      '#f59e0b',
  parchment: '#f5efe2',
  radiant:   '#57d95a',
  dire:      '#e05c5c',
  muted:     '#7d8aa0',
};

const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 80;
const LOGO_PATH = path.join(__dirname, '../../web/public/oa-logo.png');

const _cache = new Map();
const _imgCache = new Map();
let _logoImg = null;
let _logoTried = false;

async function _loadHero(url) {
  if (!url || !canvas) return null;
  if (_imgCache.has(url)) return _imgCache.get(url);
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

function _truncate(ctx, text, maxWidth) {
  let s = String(text || '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

function _formatDuration(seconds) {
  const s = parseInt(seconds, 10);
  if (!Number.isFinite(s) || s <= 0) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function _formatDelta(d) {
  if (d == null || !Number.isFinite(d)) return '';
  if (d > 0) return `+${d}`;
  return String(d);
}

function _cacheKey(opts) {
  // Stable signature: size + variant + match id + roster snapshot (ids/kda/perf).
  const playerSig = (opts.players || []).map(p =>
    `${p.team || ''}:${p.account_id || ''}:${p.hero_id || ''}:${p.kills || 0}/${p.deaths || 0}/${p.assists || 0}:${p.mmr_delta ?? ''}:${p.perf ?? ''}`
  ).join('|');
  return [
    opts.size || 'og',
    opts.variant || 'classic',
    opts.matchId || '',
    opts.radiantWin ? 'R' : 'D',
    opts.radiantScore ?? '',
    opts.direScore ?? '',
    opts.durationSeconds ?? '',
    opts.mvpName || '',
    opts.mvpHeroId || '',
    playerSig,
  ].join('||');
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
    const k = _cache.keys().next().value;
    if (k) _cache.delete(k);
  }
  _cache.set(key, { buf, t: Date.now() });
}

function _roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Sort players within team by kills desc.
function _sortPlayers(players) {
  return [...(players || [])].sort((a, b) => (b.kills || 0) - (a.kills || 0));
}

// --- Variant: CLASSIC --------------------------------------------------------
// Two-column roster on a clean ink-navy background. MVP banner across the top.
async function _drawClassic(ctx, opts) {
  const { w, h } = opts._dims;
  const isStory = opts.size === 'story';

  // Background gradient.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, COLORS.inkNavy2);
  g.addColorStop(1, COLORS.inkNavy);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const pad = isStory ? 60 : 50;
  const winnerColor = opts.radiantWin ? COLORS.radiant : COLORS.dire;

  // Header.
  ctx.fillStyle = COLORS.brass;
  ctx.font = `600 ${isStory ? 32 : 24}px Inter, "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(`OCE INHOUSE${opts.matchId ? ` · MATCH #${opts.matchId}` : ''}`, pad, pad);

  // Result headline.
  ctx.fillStyle = winnerColor;
  ctx.font = `800 ${isStory ? 96 : 64}px "Playfair Display", Georgia, serif`;
  const resultText = opts.radiantWin ? 'RADIANT VICTORY' : 'DIRE VICTORY';
  ctx.fillText(resultText, pad, pad + (isStory ? 50 : 36));

  // Score.
  ctx.fillStyle = COLORS.parchment;
  ctx.font = `800 ${isStory ? 140 : 96}px Oswald, Arial, sans-serif`;
  const scoreText = `${opts.radiantScore ?? 0} — ${opts.direScore ?? 0}`;
  ctx.fillText(scoreText, pad, pad + (isStory ? 180 : 110));

  // Duration pill.
  const durY = pad + (isStory ? 360 : 220);
  ctx.font = `600 ${isStory ? 28 : 22}px Inter, Arial, sans-serif`;
  const durText = `⏱  ${_formatDuration(opts.durationSeconds)}`;
  const dw = ctx.measureText(durText).width + 32;
  ctx.fillStyle = 'rgba(197,169,117,0.18)';
  _roundedRect(ctx, pad, durY, dw, isStory ? 50 : 40, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.brass;
  ctx.fillText(durText, pad + 16, durY + (isStory ? 12 : 8));

  // Rosters in two columns.
  const radiant = _sortPlayers((opts.players || []).filter(p => p.team === 'radiant'));
  const dire    = _sortPlayers((opts.players || []).filter(p => p.team === 'dire'));

  const rosterY = durY + (isStory ? 110 : 80);
  const colW = (w - pad * 3) / 2;
  await _drawRoster(ctx, radiant, pad, rosterY, colW, h - rosterY - (isStory ? 200 : 120), {
    teamColor: COLORS.radiant, label: 'RADIANT', isWinner: opts.radiantWin, isStory,
  });
  await _drawRoster(ctx, dire, pad * 2 + colW, rosterY, colW, h - rosterY - (isStory ? 200 : 120), {
    teamColor: COLORS.dire, label: 'DIRE', isWinner: !opts.radiantWin, isStory,
  });

  await _drawFooter(ctx, opts);
}

// --- Variant: MAGAZINE -------------------------------------------------------
// Editorial split-panel layout with large headline + MVP portrait.
async function _drawMagazine(ctx, opts) {
  const { w, h } = opts._dims;
  const isStory = opts.size === 'story';
  const pad = isStory ? 60 : 50;
  const winnerColor = opts.radiantWin ? COLORS.radiant : COLORS.dire;

  // Parchment top half / ink-navy bottom half (or left/right on OG).
  if (isStory) {
    ctx.fillStyle = COLORS.parchment;
    ctx.fillRect(0, 0, w, h * 0.42);
    ctx.fillStyle = COLORS.inkNavy;
    ctx.fillRect(0, h * 0.42, w, h * 0.58);
  } else {
    ctx.fillStyle = COLORS.parchment;
    ctx.fillRect(0, 0, w * 0.45, h);
    ctx.fillStyle = COLORS.inkNavy;
    ctx.fillRect(w * 0.45, 0, w * 0.55, h);
  }

  // Brass spine.
  ctx.fillStyle = COLORS.brass;
  if (isStory) ctx.fillRect(0, h * 0.42 - 6, w, 6);
  else ctx.fillRect(w * 0.45 - 4, 0, 4, h);

  // Editorial eyebrow.
  ctx.fillStyle = COLORS.inkNavy;
  ctx.font = `700 ${isStory ? 32 : 22}px Inter, Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText('THE OCE INHOUSE DISPATCH', pad, pad);
  if (opts.matchId) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 ${isStory ? 24 : 18}px Inter, Arial, sans-serif`;
    ctx.fillText(`Match #${opts.matchId}`, pad, pad + (isStory ? 44 : 30));
  }

  // Big serif headline.
  ctx.fillStyle = winnerColor;
  ctx.font = `900 ${isStory ? 120 : 72}px "Playfair Display", Georgia, serif`;
  ctx.fillText(opts.radiantWin ? 'Radiant' : 'Dire', pad, pad + (isStory ? 110 : 70));
  ctx.fillStyle = COLORS.inkNavy;
  ctx.fillText('triumphant.', pad, pad + (isStory ? 240 : 145));

  // Score subhead.
  ctx.fillStyle = COLORS.inkNavy;
  ctx.font = `700 ${isStory ? 56 : 36}px Oswald, Arial, sans-serif`;
  ctx.fillText(
    `${opts.radiantScore ?? 0} — ${opts.direScore ?? 0}   ·   ${_formatDuration(opts.durationSeconds)}`,
    pad,
    pad + (isStory ? 400 : 230),
  );

  // MVP panel on the dark half.
  const mvpX = isStory ? pad : w * 0.45 + pad;
  const mvpY = isStory ? h * 0.42 + pad : pad;
  ctx.fillStyle = COLORS.brass;
  ctx.font = `700 ${isStory ? 32 : 22}px Inter, Arial, sans-serif`;
  ctx.fillText('★ MVP', mvpX, mvpY);

  if (opts.mvpName) {
    ctx.fillStyle = COLORS.parchment;
    ctx.font = `800 ${isStory ? 64 : 42}px "Playfair Display", Georgia, serif`;
    ctx.fillText(_truncate(ctx, opts.mvpName, w - mvpX - pad), mvpX, mvpY + (isStory ? 50 : 32));
    if (opts.mvpHeroName) {
      ctx.fillStyle = COLORS.brass;
      ctx.font = `500 italic ${isStory ? 32 : 22}px "Playfair Display", Georgia, serif`;
      ctx.fillText(opts.mvpHeroName, mvpX, mvpY + (isStory ? 130 : 82));
    }
    if (opts.mvpKda) {
      ctx.fillStyle = COLORS.parchment;
      ctx.font = `700 ${isStory ? 36 : 26}px Oswald, Arial, sans-serif`;
      ctx.fillText(opts.mvpKda, mvpX, mvpY + (isStory ? 180 : 116));
    }
  } else {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 italic ${isStory ? 28 : 20}px Inter, Arial, sans-serif`;
    ctx.fillText('Awaiting community vote.', mvpX, mvpY + (isStory ? 50 : 32));
  }

  // Top fragger callout.
  if (opts.topFragger) {
    const tfY = mvpY + (isStory ? 280 : 170);
    ctx.fillStyle = COLORS.brass;
    ctx.font = `700 ${isStory ? 28 : 18}px Inter, Arial, sans-serif`;
    ctx.fillText('⚔ TOP FRAGGER', mvpX, tfY);
    ctx.fillStyle = COLORS.parchment;
    ctx.font = `700 ${isStory ? 40 : 28}px Inter, Arial, sans-serif`;
    ctx.fillText(_truncate(ctx, opts.topFragger.name, w - mvpX - pad), mvpX, tfY + (isStory ? 42 : 28));
    const kda = `${opts.topFragger.kills}/${opts.topFragger.deaths}/${opts.topFragger.assists}`;
    ctx.fillStyle = COLORS.brass;
    ctx.font = `500 ${isStory ? 28 : 20}px Oswald, Arial, sans-serif`;
    ctx.fillText(`${opts.topFragger.heroName || ''}  ·  ${kda}`, mvpX, tfY + (isStory ? 90 : 60));
  }

  // Highlight stats list.
  if (opts.highlights && opts.highlights.length) {
    const hlY = mvpY + (isStory ? 470 : 280);
    ctx.fillStyle = COLORS.brass;
    ctx.font = `700 ${isStory ? 24 : 16}px Inter, Arial, sans-serif`;
    ctx.fillText('HIGHLIGHTS', mvpX, hlY);
    ctx.fillStyle = COLORS.parchment;
    ctx.font = `500 ${isStory ? 26 : 18}px Inter, Arial, sans-serif`;
    let y = hlY + (isStory ? 36 : 24);
    for (const line of opts.highlights.slice(0, 4)) {
      ctx.fillText(`· ${_truncate(ctx, line, w - mvpX - pad)}`, mvpX, y);
      y += isStory ? 36 : 26;
    }
  }

  await _drawFooter(ctx, opts);
}

// --- Variant: TOURNAMENT -----------------------------------------------------
// Heavy split bars (Radiant green / Dire red) with bracket-style score block.
async function _drawTournament(ctx, opts) {
  const { w, h } = opts._dims;
  const isStory = opts.size === 'story';

  ctx.fillStyle = COLORS.inkNavy;
  ctx.fillRect(0, 0, w, h);

  // Top + bottom team bars (story) or left+right (og).
  if (isStory) {
    const barH = h * 0.18;
    ctx.fillStyle = opts.radiantWin ? COLORS.radiant : 'rgba(87,217,90,0.35)';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillStyle = !opts.radiantWin ? COLORS.dire : 'rgba(224,92,92,0.35)';
    ctx.fillRect(0, h - barH, w, barH);
  } else {
    ctx.fillStyle = opts.radiantWin ? COLORS.radiant : 'rgba(87,217,90,0.35)';
    ctx.fillRect(0, 0, w * 0.18, h);
    ctx.fillStyle = !opts.radiantWin ? COLORS.dire : 'rgba(224,92,92,0.35)';
    ctx.fillRect(w * 0.82, 0, w * 0.18, h);
  }

  // Bracket-style score block in centre.
  ctx.fillStyle = COLORS.parchment;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${isStory ? 36 : 24}px Oswald, Arial, sans-serif`;
  ctx.fillText('FINAL SCORE', w / 2, isStory ? h * 0.22 : 50);

  ctx.fillStyle = COLORS.brass;
  ctx.font = `900 ${isStory ? 220 : 156}px Oswald, Arial, sans-serif`;
  ctx.fillText(`${opts.radiantScore ?? 0} : ${opts.direScore ?? 0}`, w / 2, isStory ? h * 0.27 : 90);

  ctx.fillStyle = opts.radiantWin ? COLORS.radiant : COLORS.dire;
  ctx.font = `800 ${isStory ? 64 : 48}px "Playfair Display", Georgia, serif`;
  ctx.fillText(opts.radiantWin ? 'RADIANT WINS' : 'DIRE WINS', w / 2, isStory ? h * 0.49 : 270);

  ctx.fillStyle = COLORS.parchment;
  ctx.font = `500 ${isStory ? 32 : 22}px Inter, Arial, sans-serif`;
  ctx.fillText(
    `${_formatDuration(opts.durationSeconds)}${opts.matchId ? `   ·   Match #${opts.matchId}` : ''}`,
    w / 2,
    isStory ? h * 0.55 : 340,
  );

  // MVP banner.
  if (opts.mvpName) {
    const mvpY = isStory ? h * 0.62 : 400;
    ctx.fillStyle = COLORS.gold;
    ctx.font = `700 ${isStory ? 36 : 22}px Inter, Arial, sans-serif`;
    ctx.fillText('★ MVP', w / 2, mvpY);
    ctx.fillStyle = COLORS.parchment;
    ctx.font = `800 ${isStory ? 56 : 36}px "Playfair Display", Georgia, serif`;
    const label = opts.mvpHeroName
      ? `${opts.mvpName} · ${opts.mvpHeroName}`
      : opts.mvpName;
    ctx.fillText(_truncate(ctx, label, w * 0.8), w / 2, mvpY + (isStory ? 50 : 32));
    if (opts.mvpKda) {
      ctx.fillStyle = COLORS.brass;
      ctx.font = `600 ${isStory ? 36 : 26}px Oswald, Arial, sans-serif`;
      ctx.fillText(opts.mvpKda, w / 2, mvpY + (isStory ? 120 : 80));
    }
  }

  ctx.textAlign = 'left';
  await _drawFooter(ctx, opts);
}

// --- Roster helper -----------------------------------------------------------
async function _drawRoster(ctx, players, x, y, width, height, opts) {
  const rowH = opts.isStory ? Math.min(120, height / Math.max(players.length, 1))
                            : Math.min(70, height / Math.max(players.length, 1));
  // Header.
  ctx.fillStyle = opts.teamColor;
  ctx.font = `800 ${opts.isStory ? 30 : 22}px Oswald, Arial, sans-serif`;
  ctx.textBaseline = 'top';
  const label = opts.isWinner ? `${opts.label} ✓` : opts.label;
  ctx.fillText(label, x, y);

  // Rows.
  let ry = y + (opts.isStory ? 50 : 36);
  for (const p of players) {
    // Background row strip.
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    _roundedRect(ctx, x, ry, width, rowH - 6, 8);
    ctx.fill();

    // Hero thumbnail.
    let imgX = x + 8;
    let imgW = opts.isStory ? 96 : 60;
    let imgH = opts.isStory ? 54 : 34;
    const heroImg = await _loadHero(heroImageUrl(p.hero_id, p.hero_name));
    if (heroImg) {
      ctx.save();
      _roundedRect(ctx, imgX, ry + (rowH - 6 - imgH) / 2, imgW, imgH, 4);
      ctx.clip();
      ctx.drawImage(heroImg, imgX, ry + (rowH - 6 - imgH) / 2, imgW, imgH);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      _roundedRect(ctx, imgX, ry + (rowH - 6 - imgH) / 2, imgW, imgH, 4);
      ctx.fill();
    }

    // Player name.
    const nameX = imgX + imgW + 12;
    ctx.fillStyle = COLORS.parchment;
    ctx.font = `700 ${opts.isStory ? 26 : 18}px Inter, Arial, sans-serif`;
    ctx.fillText(_truncate(ctx, p.persona_name || `Player ${p.account_id || '?'}`, width - (imgW + 200)), nameX, ry + (opts.isStory ? 14 : 8));

    // KDA.
    const kda = `${p.kills || 0}/${p.deaths || 0}/${p.assists || 0}`;
    ctx.fillStyle = COLORS.brass;
    ctx.font = `600 ${opts.isStory ? 22 : 14}px Oswald, Arial, sans-serif`;
    ctx.fillText(kda, nameX, ry + (opts.isStory ? 50 : 30));

    // Right side: MMR delta + perf.
    const rightX = x + width - 12;
    ctx.textAlign = 'right';
    if (p.mmr_delta != null && Number.isFinite(p.mmr_delta)) {
      const d = Number(p.mmr_delta);
      ctx.fillStyle = d > 0 ? COLORS.radiant : d < 0 ? COLORS.dire : COLORS.muted;
      ctx.font = `800 ${opts.isStory ? 28 : 20}px Oswald, Arial, sans-serif`;
      ctx.fillText(_formatDelta(d), rightX, ry + (opts.isStory ? 14 : 8));
    }
    if (p.perf != null) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 ${opts.isStory ? 22 : 14}px Inter, Arial, sans-serif`;
      ctx.fillText(`PERF ${Number(p.perf).toFixed(1)}`, rightX, ry + (opts.isStory ? 50 : 30));
    }
    ctx.textAlign = 'left';

    ry += rowH;
  }
}

// --- Footer ------------------------------------------------------------------
async function _drawFooter(ctx, opts) {
  const { w, h } = opts._dims;
  const isStory = opts.size === 'story';
  const fy = h - (isStory ? 80 : 50);
  ctx.fillStyle = COLORS.brass;
  ctx.font = `500 ${isStory ? 26 : 18}px Inter, Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(opts.siteUrl || 'oceinhouse.gg', isStory ? 60 : 50, fy);

  const logoImg = await _loadLogo();
  if (logoImg) {
    const lh = isStory ? 64 : 40;
    const lw = logoImg.width * (lh / logoImg.height);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(logoImg, w - lw - (isStory ? 60 : 50), fy - 6, lw, lh);
    ctx.globalAlpha = 1;
  }
}

// --- Public API --------------------------------------------------------------

async function generateRecapCard(opts = {}) {
  if (!canvas) return null;
  const size = SIZES[opts.size] ? opts.size : 'og';
  const variant = VARIANTS.includes(opts.variant) ? opts.variant : 'classic';
  const dims = SIZES[size];
  const fullOpts = { ...opts, size, variant, _dims: dims };

  const key = _cacheKey(fullOpts);
  const cached = _cacheGet(key);
  if (cached) return cached;

  const cv = canvas.createCanvas(dims.w, dims.h);
  const ctx = cv.getContext('2d');

  if (variant === 'magazine')        await _drawMagazine(ctx, fullOpts);
  else if (variant === 'tournament') await _drawTournament(ctx, fullOpts);
  else                                await _drawClassic(ctx, fullOpts);

  const buf = await cv.encode('png');
  _cacheSet(key, buf);
  return buf;
}

function clearCache() { _cache.clear(); }

module.exports = {
  generateRecapCard,
  clearCache,
  SIZES,
  VARIANTS,
};
