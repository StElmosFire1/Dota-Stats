// Task #241 — Open Graph card generator for shared `/p/<slug>` profile links.
// Renders a 1200×630 PNG (the size Twitter / Discord / Facebook all use for
// `summary_large_image`) using @napi-rs/canvas. The card layers a faded
// hero portrait behind a dark gradient with the player's name, MMR tier,
// and W/L on top. Falls back to a logo-only card when no hero is available
// or when the hero portrait fetch fails.
//
// Buffers are cached in-memory keyed by a stable signature of the inputs
// so repeat unfurls (Discord re-fetches whenever a link is pasted) don't
// repeatedly hit the canvas + remote fetch path.

let canvas = null;
try { canvas = require('@napi-rs/canvas'); } catch (_) { canvas = null; }

const path = require('path');
const fs = require('fs');

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

// Mirror of web/src/heroNames.js HERO_ID_TO_SLUG. Kept in sync manually;
// the server didn't previously need a hero-id → slug map. Unknown ids fall
// back to the `npc_dota_hero_<slug>` heroName supplied by the caller.
const HERO_ID_TO_SLUG = {
  1: 'antimage', 2: 'axe', 3: 'bane', 4: 'bloodseeker', 5: 'crystal_maiden',
  6: 'drow_ranger', 7: 'earthshaker', 8: 'juggernaut', 9: 'mirana',
  10: 'morphling', 11: 'nevermore', 12: 'phantom_lancer', 13: 'puck', 14: 'pudge',
  15: 'razor', 16: 'sand_king', 17: 'storm_spirit', 18: 'sven', 19: 'tiny',
  20: 'vengefulspirit', 21: 'windrunner', 22: 'zuus', 23: 'kunkka',
  25: 'lina', 26: 'lion', 27: 'shadow_shaman', 28: 'slardar', 29: 'tidehunter',
  30: 'witch_doctor', 31: 'lich', 32: 'riki', 33: 'enigma', 34: 'tinker',
  35: 'sniper', 36: 'necrolyte', 37: 'warlock', 38: 'beastmaster',
  39: 'queenofpain', 40: 'venomancer', 41: 'faceless_void', 42: 'skeleton_king',
  43: 'death_prophet', 44: 'phantom_assassin', 45: 'pugna', 46: 'templar_assassin',
  47: 'viper', 48: 'luna', 49: 'dragon_knight', 50: 'dazzle', 51: 'rattletrap',
  52: 'leshrac', 53: 'furion', 54: 'life_stealer', 55: 'dark_seer',
  56: 'clinkz', 57: 'omniknight', 58: 'enchantress', 59: 'huskar',
  60: 'night_stalker', 61: 'broodmother', 62: 'bounty_hunter', 63: 'weaver',
  64: 'jakiro', 65: 'batrider', 66: 'chen', 67: 'spectre', 68: 'ancient_apparition',
  69: 'doom_bringer', 70: 'ursa', 71: 'spirit_breaker', 72: 'gyrocopter',
  73: 'alchemist', 74: 'invoker', 75: 'silencer', 76: 'obsidian_destroyer',
  77: 'lycan', 78: 'brewmaster', 79: 'shadow_demon', 80: 'lone_druid',
  81: 'chaos_knight', 82: 'meepo', 83: 'treant', 84: 'ogre_magi', 85: 'undying',
  86: 'rubick', 87: 'disruptor', 88: 'nyx_assassin', 89: 'naga_siren',
  90: 'keeper_of_the_light', 91: 'wisp', 92: 'visage', 93: 'slark',
  94: 'medusa', 95: 'troll_warlord', 96: 'centaur', 97: 'magnataur',
  98: 'shredder', 99: 'bristleback', 100: 'tusk', 101: 'skywrath_mage',
  102: 'abaddon', 103: 'elder_titan', 104: 'legion_commander', 105: 'techies',
  106: 'ember_spirit', 107: 'earth_spirit', 108: 'abyssal_underlord',
  109: 'terrorblade', 110: 'phoenix', 111: 'oracle', 112: 'winter_wyvern',
  113: 'arc_warden', 114: 'monkey_king', 119: 'dark_willow', 120: 'pangolier',
  121: 'grimstroke', 123: 'hoodwink', 126: 'void_spirit', 128: 'snapfire',
  129: 'mars', 131: 'ringmaster', 135: 'dawnbreaker', 136: 'marci',
  137: 'primal_beast', 138: 'muerta', 145: 'kez', 155: 'largo',
};

function heroSlug(heroId, heroName) {
  if (heroId && HERO_ID_TO_SLUG[heroId]) return HERO_ID_TO_SLUG[heroId];
  if (heroName && typeof heroName === 'string' && heroName.startsWith('npc_dota_hero_')) {
    return heroName.slice('npc_dota_hero_'.length);
  }
  return null;
}

function heroImageUrl(heroId, heroName) {
  const slug = heroSlug(heroId, heroName);
  if (!slug) return null;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

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
  } catch (err) {
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

function _wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const probe = line ? line + ' ' + w : w;
    if (ctx.measureText(probe).width <= maxWidth) {
      line = probe;
    } else {
      if (line) lines.push(line);
      // Single token longer than maxWidth — hard-truncate with ellipsis.
      if (ctx.measureText(w).width > maxWidth) {
        let cut = w;
        while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
          cut = cut.slice(0, -1);
        }
        lines.push(cut + '…');
        line = '';
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function _cacheKey(opts) {
  return [
    opts.displayName || '',
    opts.heroId || '',
    opts.heroName || '',
    opts.mmr ?? '',
    opts.wins ?? '',
    opts.losses ?? '',
    opts.tierName || '',
    // Task #270 — tagline + showMmr toggle change the rendered output and
    // therefore must be part of the cache key, otherwise two players with
    // the same name + hero would collide on the in-memory buffer cache.
    opts.tagline || '',
    opts.showMmr === false ? '0' : '1',
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

// Public API. Returns a PNG Buffer (1200×630) or null if canvas is
// unavailable. Callers should fall back to the static OA logo in that case.
async function generateProfileOgCard(opts = {}) {
  if (!canvas) return null;
  const key = _cacheKey(opts);
  const cached = _cacheGet(key);
  if (cached) return cached;

  const displayName = String(opts.displayName || 'Player').slice(0, 64);
  const heroImg = await _loadHeroImage(heroImageUrl(opts.heroId, opts.heroName));
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
    // No hero — diagonal brass accent strip + centred logo.
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

  // Brass accent rule on the left.
  ctx.fillStyle = '#c5a975';
  ctx.fillRect(60, 110, 6, H - 220);

  // Site eyebrow.
  ctx.fillStyle = '#c5a975';
  ctx.font = '600 26px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('OCE INHOUSE', 100, 110);

  // Player display name (wraps onto up to 2 lines).
  ctx.fillStyle = '#f5efe2';
  ctx.font = '800 96px "Playfair Display", Georgia, serif';
  const nameLines = _wrapText(ctx, displayName, W - 160).slice(0, 2);
  let nameY = 160;
  for (const line of nameLines) {
    ctx.fillText(line, 100, nameY);
    nameY += 104;
  }

  // Stat strip. Task #270 — when the player has set a tagline override on
  // /settings/profile, render it in italic serif on its own line in place
  // of the auto-generated stat pills. share_card_show_mmr=false hides the
  // MMR pill (and the tier badge, since the tier name reveals MMR bracket)
  // even when the auto stats line is showing.
  const tagline = opts.tagline ? String(opts.tagline).slice(0, 80) : '';
  const showMmr = opts.showMmr !== false;
  if (tagline) {
    const stripY = Math.max(nameY + 24, H - 200);
    ctx.fillStyle = '#f5efe2';
    ctx.font = 'italic 600 40px "Playfair Display", Georgia, serif';
    const tlLines = _wrapText(ctx, `“${tagline}”`, W - 200).slice(0, 2);
    let ty = stripY;
    for (const line of tlLines) {
      ctx.fillText(line, 100, ty);
      ty += 48;
    }
  }
  const stats = [];
  if (!tagline) {
    if (showMmr && opts.tierName) stats.push(String(opts.tierName));
    if (showMmr && Number.isFinite(opts.mmr)) stats.push(`${opts.mmr} MMR`);
    if (Number.isFinite(opts.wins) && Number.isFinite(opts.losses)) {
      const total = opts.wins + opts.losses;
      stats.push(`${opts.wins}W ${opts.losses}L`);
      if (total > 0) {
        const wr = Math.round((opts.wins / total) * 100);
        stats.push(`${wr}% WR`);
      }
    }
  }
  if (stats.length) {
    const stripY = Math.max(nameY + 24, H - 200);
    ctx.font = '600 36px Inter, "Helvetica Neue", Arial, sans-serif';
    let cx = 100;
    for (let i = 0; i < stats.length; i++) {
      const text = stats[i];
      const tw = ctx.measureText(text).width;
      const padX = 22;
      const padY = 14;
      const bw = tw + padX * 2;
      const bh = 36 + padY * 2;
      ctx.fillStyle = 'rgba(13, 20, 36, 0.65)';
      ctx.strokeStyle = 'rgba(197, 169, 117, 0.55)';
      ctx.lineWidth = 2;
      const r = 14;
      ctx.beginPath();
      ctx.moveTo(cx + r, stripY);
      ctx.lineTo(cx + bw - r, stripY);
      ctx.quadraticCurveTo(cx + bw, stripY, cx + bw, stripY + r);
      ctx.lineTo(cx + bw, stripY + bh - r);
      ctx.quadraticCurveTo(cx + bw, stripY + bh, cx + bw - r, stripY + bh);
      ctx.lineTo(cx + r, stripY + bh);
      ctx.quadraticCurveTo(cx, stripY + bh, cx, stripY + bh - r);
      ctx.lineTo(cx, stripY + r);
      ctx.quadraticCurveTo(cx, stripY, cx + r, stripY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f5efe2';
      ctx.fillText(text, cx + padX, stripY + padY);
      cx += bw + 16;
      if (cx > W - 200) break;
    }
  }

  // Footer hostname + hero attribution.
  ctx.font = '500 22px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#c5a975';
  ctx.fillText('oceinhouse.gg', 100, H - 70);
  if (heroImg && opts.heroDisplayName) {
    const label = String(opts.heroDisplayName);
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
  generateProfileOgCard,
  heroImageUrl,
  heroSlug,
  clearCache,
  CARD_WIDTH: W,
  CARD_HEIGHT: H,
};
