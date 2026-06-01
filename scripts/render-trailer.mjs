#!/usr/bin/env node
/**
 * OCE Inhouse Hype Trailer — Canvas Renderer
 * Renders each frame using @napi-rs/canvas, pipes raw RGBA to ffmpeg → MP4.
 *
 * Transitions between beats are true cross-dissolves (two offscreen canvases
 * blended over a short window) — no fade-to-black flashing between scenes.
 * Feature beats composite real website screenshots (screenshots/tall_*.png),
 * each matched to its heading. Tall pages scroll vertically inside their frame
 * for a professional product-tour feel.
 *
 * Usage: node scripts/render-trailer.mjs   (or: npm run render:trailer)
 */

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Config ────────────────────────────────────────────────────────────────
const WIDTH  = 1920;
const HEIGHT = 1080;
const FPS    = 30;
const TOTAL_SECONDS = 30;
const TOTAL_FRAMES  = FPS * TOTAL_SECONDS;
const XFADE_SEC = 0.6; // cross-dissolve duration centred on each beat boundary
const OUTPUT_PATH = path.join(ROOT, 'attached_assets', 'oce-inhouse-hype-trailer.mp4');
const AUDIO_PATH  = path.join(ROOT, 'attached_assets', 'generated_audio', 'epic_orchestral_score.mp3');

// Brand palette
const C = {
  inkNavy:    '#0d1424',
  deepPanel:  '#0a101e',
  card:       '#152036',
  brass:      '#c5a975',
  brassBright:'#e1c79a',
  amber:      '#f59e0b',
  parchment:  '#f5efe2',
  textPrimary:'#e6edf8',
  textSecond: '#94a6cb',
  radiant:    '#34d399',
  dire:       '#f87171',
};

// Beat timing (seconds)
const BEATS = [
  { name: 'brand_hook',    start: 0,  end: 4  },
  { name: 'hook_line',     start: 4,  end: 8  },
  { name: 'inhouse',       start: 8,  end: 13 },
  { name: 'stats',         start: 13, end: 19 },
  { name: 'coaching',      start: 19, end: 24 },
  { name: 'cta',           start: 24, end: 30 },
];

// ─── Register Fonts ─────────────────────────────────────────────────────────
const fontDir = path.join(ROOT, 'trailer-handoff', 'assets', 'fonts');
GlobalFonts.registerFromPath(path.join(fontDir, 'PlayfairDisplay-Bold.ttf'),      'PlayfairDisplay');
GlobalFonts.registerFromPath(path.join(fontDir, 'PlayfairDisplay-ExtraBold.ttf'), 'PlayfairDisplayEB');
GlobalFonts.registerFromPath(path.join(fontDir, 'Oswald-Medium.ttf'),             'Oswald');
GlobalFonts.registerFromPath(path.join(fontDir, 'Inter-Regular.ttf'),             'Inter');
GlobalFonts.registerFromPath(path.join(fontDir, 'Inter-SemiBold.ttf'),            'InterSB');

// ─── Asset Loaders ──────────────────────────────────────────────────────────
const assetDir = path.join(ROOT, 'attached_assets');
const imgDir   = path.join(assetDir, 'generated_images');
const brandDir = path.join(ROOT, 'trailer-handoff', 'assets', 'brand');
const badgeDir = path.join(ROOT, 'web', 'public', 'badges');
const tierBadgeDir = path.join(ROOT, 'trailer-handoff', 'assets', 'badges');
const shotDir  = path.join(ROOT, 'screenshots');

const loadImg = (p) => loadImage(p).catch(() => null);

async function loadAssets() {
  return {
    bgBattle:   await loadImg(path.join(imgDir,   'trailer_bg_battle.png')),
    brassFrame: await loadImg(path.join(imgDir,   'trailer_brass_frame.png')),
    embers:     await loadImg(path.join(imgDir,   'trailer_embers.png')),
    parchment:  await loadImg(path.join(imgDir,   'trailer_parchment.png')),
    throneRoom: await loadImg(path.join(imgDir,   'trailer_throne_room.png')),
    rankLadder: await loadImg(path.join(imgDir,   'trailer_rank_ladder.png')),
    logo:       await loadImg(path.join(brandDir, 'oa-logo.png')),
    // All 11 ladder tier emblems, lowest → highest (Peasant climbs to King).
    // Background-stripped copies (trailer-handoff/assets/badges/) so every crest
    // is a free-standing transparent PNG — no baked-in box on the sub tiers.
    tiers:      await Promise.all([
      'tier-sub-3-peasant', 'tier-sub-2-vagabond', 'tier-sub-1-outlaw',
      'tier-1-apprentice', 'tier-2-squire', 'tier-3-footman', 'tier-4-knight',
      'tier-5-templar', 'tier-6-paladin', 'tier-7-warlord', 'tier-8-king',
    ].map(async n =>
      (await loadImg(path.join(tierBadgeDir, `${n}.png`))) ||
      (await loadImg(path.join(badgeDir,     `${n}.png`)))
    )),
  };
}

async function loadShots() {
  // Tall full-page captures (Playwright, scripts/capture-trailer-pages.mjs) so
  // shown pages can scroll. Each is matched to the heading it appears under.
  return {
    home:        await loadImg(path.join(shotDir, 'tall_home.png')),        // beat 2 — overview
    draft:       await loadImg(path.join(shotDir, 'tall_draft.png')),       // beat 3 — captain draft board
    leaderboard: await loadImg(path.join(shotDir, 'tall_leaderboard.png')), // beat 4 — MMR / ladder
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
function easeOut(t)   { return 1-(1-t)*(1-t); }
function easeIn(t)    { return t*t; }
function lerp(a,b,t)  { return a + (b-a)*t; }
function smoothstep(e0,e1,x){ const t = Math.max(0, Math.min(1, (x-e0)/(e1-e0))); return t*t*(3-2*t); }
// Interpolate two #rrggbb hex colours → an rgb() string.
function lerpHex(a, b, t) {
  const ar=parseInt(a.slice(1,3),16), ag=parseInt(a.slice(3,5),16), ab=parseInt(a.slice(5,7),16);
  const br=parseInt(b.slice(1,3),16), bg=parseInt(b.slice(3,5),16), bb=parseInt(b.slice(5,7),16);
  const r=Math.round(ar+(br-ar)*t), g=Math.round(ag+(bg-ag)*t), bl=Math.round(ab+(bb-ab)*t);
  return `rgb(${r},${g},${bl})`;
}
// Constant-size text reveal. The glyph is ALWAYS drawn at full size and full
// coverage; only its colour develops from near-background ink up to the target
// colour, with a tiny opacity gate (first ~12% of the reveal) to avoid any
// faint ghost before it appears. This guarantees fade-in text never appears to
// change size as anti-aliased thin strokes would when fading via opacity alone.
// `gate` (scene cross-dissolve) still uses real opacity.
function revealText(ctx, text, x, y, opt) {
  const { font, color, revealIn, gate = 1, align = 'center',
          shadow = null, letterSpacing = null } = opt;
  if (gate <= 0 || revealIn <= 0) return;
  ctx.save();
  ctx.globalAlpha = gate * smoothstep(0, 0.12, revealIn);
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (letterSpacing) ctx.letterSpacing = letterSpacing;
  if (shadow) {
    ctx.shadowColor = hexToRgba(shadow.hex, shadow.alpha * revealIn);
    ctx.shadowBlur = shadow.blur;
    if (shadow.offsetY) ctx.shadowOffsetY = shadow.offsetY;
  }
  ctx.fillStyle = lerpHex(C.inkNavy, color, revealIn);
  ctx.fillText(text, x, y);
  if (letterSpacing) ctx.letterSpacing = '0';
  ctx.restore();
}
function clamp(v,mn,mx){ return Math.max(mn,Math.min(mx,v)); }

function beatProgress(frame, beat) {
  const start = beat.start * FPS;
  const end   = beat.end   * FPS;
  return clamp((frame - start) / (end - start), 0, 1);
}

// Text legibility gate. During a cross-dissolve two beats are blended, so any
// copy that lives in the same region (eyebrows, headlines, captions) would
// alpha-blend into a muddy, half-formed blob that reads as text "changing size
// and shape". This returns 0 while a dissolve is in progress and 1 only once
// the beat owns the screen alone, so every text element is always crisp.
function textGate(frame, beat) {
  const idx  = BEATS.indexOf(beat);
  const sec  = frame / FPS;
  const half = XFADE_SEC / 2;
  const pad  = 0.12; // quick ramp once the dissolve has fully settled
  let fin = 1, fout = 1;
  if (idx > 0)                fin  = clamp((sec - (beat.start + half)) / pad, 0, 1);
  if (idx < BEATS.length - 1) fout = clamp(((beat.end - half) - sec) / pad, 0, 1);
  return Math.min(fin, fout);
}

// Draw image, cover-fit to full frame
function drawCoverImage(ctx, img, alpha = 1) {
  if (!img) return;
  ctx.globalAlpha = alpha;
  const scale = Math.max(WIDTH/img.width, HEIGHT/img.height);
  const sw = img.width  * scale;
  const sh = img.height * scale;
  ctx.drawImage(img, (WIDTH-sw)/2, (HEIGHT-sh)/2, sw, sh);
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

// Horizontal divider line (brass), fades at both ends
function drawBrassLine(ctx, x, y, width, alpha = 1) {
  const grad = ctx.createLinearGradient(x, y, x+width, y);
  grad.addColorStop(0,   `rgba(197,169,117,0)`);
  grad.addColorStop(0.2, `rgba(197,169,117,${alpha})`);
  grad.addColorStop(0.8, `rgba(197,169,117,${alpha})`);
  grad.addColorStop(1,   `rgba(197,169,117,0)`);
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x+width, y);
  ctx.stroke();
}

// Subtle ember particles (deterministic by frame)
function drawEmbers(ctx, frame, count = 26, alpha = 0.5) {
  for (let i = 0; i < count; i++) {
    const seed = i * 137.5;
    const x    = ((seed * 7.3 + frame * (0.25 + (i%5)*0.1)) % WIDTH);
    const y    = HEIGHT - ((seed * 3.1 + frame * (0.7 + (i%7)*0.13)) % HEIGHT);
    const size = 1.2 + (i % 4) * 0.6;
    const a    = alpha * (0.35 + 0.5 * Math.abs(Math.sin((frame + seed) * 0.05)));
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI*2);
    ctx.fillStyle = `rgba(245,158,11,${a})`;
    ctx.fill();
  }
}

// Slow floating motes for depth
function drawMotes(ctx, frame, count = 10, alpha = 0.18) {
  for (let i = 0; i < count; i++) {
    const seed = i * 241.3;
    const x    = ((seed * 5.1 + frame * 0.12) % WIDTH);
    const y    = HEIGHT - ((seed * 2.7 + frame * 0.2) % HEIGHT);
    const r    = 3 + (i % 5) * 2.5;
    const a    = alpha * (0.5 + 0.5 * Math.sin((frame * 0.02) + seed));
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(197,169,117,${a})`);
    grad.addColorStop(1, `rgba(197,169,117,0)`);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

function drawVignette(ctx, alpha = 0.42) {
  const grad = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, HEIGHT*0.32, WIDTH/2, HEIGHT/2, HEIGHT*0.9);
  grad.addColorStop(0, `rgba(0,0,0,0)`);
  grad.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

// Restrained ornamental corner marks
function drawBrassCorners(ctx, margin, size, alpha) {
  ctx.strokeStyle = `rgba(197,169,117,${alpha * 0.8})`;
  ctx.lineWidth   = 1.5;
  const corners = [
    [margin,         margin,          1,  1],
    [WIDTH-margin,   margin,         -1,  1],
    [margin,         HEIGHT-margin,   1, -1],
    [WIDTH-margin,   HEIGHT-margin,  -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy*size);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx*size, cy);
    ctx.stroke();
  }
}

// Per-character stagger reveal (returns 0..1 per char)
function charReveal(progress, charIdx, totalChars, stagger = 0.05) {
  const charProgress = (progress - charIdx * stagger) / (1 - (totalChars-1)*stagger);
  return clamp(charProgress, 0, 1);
}

// Editorial eyebrow (Oswald, tracked, brass)
function drawEyebrow(ctx, text, y, revealIn, gate = 1) {
  revealText(ctx, text, WIDTH/2 + 6, y, { // +6 optical balance for tracking
    font: '500 22px Oswald', color: C.brass, revealIn, gate,
    letterSpacing: '0.32em',
  });
}

// Playfair headline — constant-size colour-develop reveal + gentle drop shadow
function drawHeadline(ctx, text, y, revealIn, gate = 1, size = 72) {
  revealText(ctx, text, WIDTH/2, y, {
    font: `700 ${size}px PlayfairDisplay`, color: C.parchment, revealIn, gate,
    shadow: { hex: '#000000', alpha: 0.55, blur: 14, offsetY: 3 },
  });
}

// A framed website screenshot — soft shadow, rounded clip, brass border, caption
function drawScreenshotCard(ctx, img, x, y, w, h, opts = {}) {
  if (!img) return;
  const { alpha = 1, radius = 14, border = C.brass, caption = null, capAlpha = alpha } = opts;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Drop shadow cast from a solid base
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur  = 42;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = C.deepPanel;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Clipped, cover-fit screenshot
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  const scale = Math.max(w/img.width, h/img.height);
  const sw = img.width * scale, sh = img.height * scale;
  ctx.drawImage(img, x + (w-sw)/2, y + (h-sh)/2, sw, sh);
  // gentle sheen + bottom settle for cohesion
  const sheen = ctx.createLinearGradient(0, y, 0, y+h);
  sheen.addColorStop(0,    'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.14, 'rgba(255,255,255,0)');
  sheen.addColorStop(1,    'rgba(13,20,36,0.16)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Brass border
  ctx.strokeStyle = hexToRgba(border, 0.7);
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();

  if (caption && capAlpha > 0) {
    ctx.globalAlpha = capAlpha;
    ctx.font = '500 19px Oswald';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.16em';
    ctx.fillStyle = C.brass;
    ctx.fillText(caption, x + w/2 + 3, y + h + 28);
    ctx.letterSpacing = '0';
    ctx.globalAlpha = 1;
  }
}

// Centre-anchored screenshot card with subtle scale-in
function showCard(ctx, img, cx, cy, baseW, baseH, reveal, caption, capAlpha = reveal) {
  const s = lerp(0.965, 1, reveal);
  const w = baseW * s, h = baseH * s;
  drawScreenshotCard(ctx, img, cx - w/2, cy - h/2, w, h, { alpha: reveal, caption, capAlpha });
}

// A framed screenshot fitted to card width and panned vertically (scroll=0..1).
// Used to "scroll through" a tall page for a product-tour feel.
function drawScrollCard(ctx, img, x, y, w, h, opts = {}) {
  if (!img) return;
  const { alpha = 1, radius = 14, border = C.brass, caption = null, scroll = 0, capAlpha = alpha } = opts;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Drop shadow base
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur  = 42;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = C.deepPanel;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Fit page to card width, pan vertically across the overflow
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  const scale = w / img.width;
  const sh = img.height * scale;
  const maxPan = Math.max(0, sh - h);
  const offY = maxPan * clamp(scroll, 0, 1);
  ctx.drawImage(img, x, y - offY, w, sh);
  // gentle sheen + bottom settle for cohesion
  const sheen = ctx.createLinearGradient(0, y, 0, y+h);
  sheen.addColorStop(0,    'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.14, 'rgba(255,255,255,0)');
  sheen.addColorStop(1,    'rgba(13,20,36,0.16)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Brass border
  ctx.strokeStyle = hexToRgba(border, 0.7);
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();

  if (caption && capAlpha > 0) {
    ctx.globalAlpha = capAlpha;
    ctx.font = '500 19px Oswald';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.16em';
    ctx.fillStyle = C.brass;
    ctx.fillText(caption, x + w/2 + 3, y + h + 28);
    ctx.letterSpacing = '0';
    ctx.globalAlpha = 1;
  }
}

// Centre-anchored scrolling card with subtle scale-in
function showScrollCard(ctx, img, cx, cy, baseW, baseH, reveal, scroll, caption, capAlpha = reveal) {
  const s = lerp(0.97, 1, reveal);
  const w = baseW * s, h = baseH * s;
  drawScrollCard(ctx, img, cx - w/2, cy - h/2, w, h, { alpha: reveal, caption, scroll, capAlpha });
}

// A horizontal strip of all 11 ladder tier emblems, lowest → highest, each
// igniting in turn with a brass→amber glow that intensifies toward King — the
// literal "11-tier ladder" rendered as the emblems themselves.
function drawTierLadder(ctx, imgs, reveal, cx, cy, size = 84) {
  if (!imgs || !imgs.length || reveal <= 0) return;
  const n      = imgs.length;
  const gap    = 34;
  const totalW = n*size + (n-1)*gap;
  let x = cx - totalW/2;
  for (let i = 0; i < n; i++) {
    const img = imgs[i];
    const a   = easeOut(clamp((reveal - i*0.05) * 2.4, 0, 1)); // left→right stagger
    if (img && a > 0) {
      const yo   = 16*(1-a);
      const gx   = x + size/2, gy = cy + size/2 + yo;
      const glowA = (0.12 + 0.34*(i/(n-1))) * a; // brighter toward King
      ctx.globalAlpha = a;
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, size*0.75);
      glow.addColorStop(0, `rgba(245,158,11,${glowA})`);
      glow.addColorStop(1, 'rgba(245,158,11,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(gx - size, gy - size, size*2, size*2);
      ctx.drawImage(img, x, cy + yo, size, size);
      ctx.globalAlpha = 1;
    }
    x += size + gap;
  }
}

// ─── Beat Renderers ──────────────────────────────────────────────────────────

/** Beat 1: Brand Hook (0–4s) — logo wordmark reveal */
function renderBrandHook(ctx, frame, assets) {
  const t     = beatProgress(frame, BEATS[0]);
  const gate  = textGate(frame, BEATS[0]);
  const t1    = easeOut(clamp(t * 4, 0, 1));
  const tLogo = easeOut(clamp((t-0.10)*3, 0, 1));
  const tText = easeOut(clamp((t-0.20)*3, 0, 1));
  const tLine = easeOut(clamp((t-0.30)*3, 0, 1));
  const tTag  = easeOut(clamp((t-0.42)*2.5, 0, 1));

  drawCoverImage(ctx, assets.throneRoom, t1);
  if (assets.bgBattle) {
    ctx.globalAlpha = 0.35 * t1;
    drawCoverImage(ctx, assets.bgBattle, 1);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = `rgba(10,16,30,${0.52 * t1})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawEmbers(ctx, frame, 30, 0.55 * t1);
  drawMotes(ctx, frame, 10, 0.22 * t1);

  drawBrassCorners(ctx, 44, 28, tLine);
  drawBrassLine(ctx, 200, HEIGHT/2 + 64, WIDTH - 400, tLine * 0.85 * gate);
  drawVignette(ctx, 0.5);

  // OA logo — fade in at near-final size (subtle settle, no size jump)
  if (assets.logo && tLogo > 0) {
    const logoW = 250 * 0.9;
    const logoH = logoW * (assets.logo.height / assets.logo.width);
    const lx = WIDTH/2 - logoW/2;
    const ly = HEIGHT/2 - logoH - 44;
    ctx.globalAlpha = tLogo;
    if (tLogo > 0.3) {
      const glow = ctx.createRadialGradient(WIDTH/2, ly+logoH/2, 0, WIDTH/2, ly+logoH/2, logoW*0.85);
      glow.addColorStop(0, `rgba(245,158,11,${0.16 * tLogo})`);
      glow.addColorStop(1, 'rgba(245,158,11,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lx - logoW*0.4, ly - logoH*0.4, logoW*1.8, logoH*1.8);
    }
    ctx.drawImage(assets.logo, lx, ly, logoW, logoH);
    ctx.globalAlpha = 1;
  }

  if (tTag > 0) drawEyebrow(ctx, "OCEANIA'S DOTA 2 PROVING GROUND", HEIGHT/2 - 8, tTag, gate);

  // Headline OCE INHOUSE — single smooth fade + gentle rise.
  // Constant font size and constant glow so the wordmark never appears to
  // change size or jitter as it reveals.
  if (tText > 0) {
    revealText(ctx, 'OCE INHOUSE', WIDTH/2, HEIGHT/2 + 72, {
      font: '800 120px PlayfairDisplayEB', color: C.parchment, revealIn: tText, gate,
      shadow: { hex: C.amber, alpha: 0.5, blur: 14 },
    });
  }
}

/** Beat 2: Hook Line (4–8s) — promise + home screenshot */
function renderHookLine(ctx, frame, assets, shots) {
  const t    = beatProgress(frame, BEATS[1]);
  const gate = textGate(frame, BEATS[1]);
  const tIn  = easeOut(clamp(t * 5, 0, 1));

  drawCoverImage(ctx, assets.bgBattle, 1);
  ctx.fillStyle = `rgba(10,16,30,0.62)`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawEmbers(ctx, frame, 34, 0.55);
  drawMotes(ctx, frame, 8, 0.16);
  drawBrassCorners(ctx, 44, 28, 0.8 * tIn);

  // Headline
  const l1 = easeOut(clamp(t * 5, 0, 1));
  const l2 = easeOut(clamp((t-0.12) * 4, 0, 1));
  revealText(ctx, 'From pub chaos', WIDTH/2, 248, {
    font: '800 84px PlayfairDisplayEB', color: C.parchment, revealIn: l1, gate,
    shadow: { hex: '#000000', alpha: 0.7, blur: 16 },
  });
  revealText(ctx, 'to real competition.', WIDTH/2, 344, {
    font: '800 84px PlayfairDisplayEB', color: C.amber, revealIn: l2, gate,
    shadow: { hex: C.amber, alpha: 0.45, blur: 18 },
  });

  drawBrassLine(ctx, 360, 400, WIDTH - 720, 0.85 * l2 * gate);

  // Real home page — scrolls down through the landing page
  const cardT  = easeOut(clamp((t-0.22)*3, 0, 1));
  const scroll = easeInOut(clamp((t-0.30)/0.62, 0, 1));
  if (cardT > 0) showScrollCard(ctx, shots.home, WIDTH/2, 700, 1000, 560, cardT, scroll, 'oceinhouse.gg', cardT * gate);

  drawVignette(ctx, 0.4);
}

/** Beat 3: Inhouse Lobbies (8–13s) — the real /inhouse lobby page */
function renderInhouse(ctx, frame, assets, shots) {
  const t    = beatProgress(frame, BEATS[2]);
  const gate = textGate(frame, BEATS[2]);
  const tIn  = easeOut(clamp(t * 4, 0, 1));

  drawCoverImage(ctx, assets.throneRoom, 0.55);
  ctx.fillStyle = 'rgba(13,20,36,0.74)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawEmbers(ctx, frame, 22, 0.4);
  drawMotes(ctx, frame, 8, 0.16);
  drawBrassCorners(ctx, 44, 28, 0.8 * tIn);

  drawEyebrow(ctx, 'COMPETITIVE LOBBIES', 118, easeOut(clamp(t*5,0,1)), gate);
  drawHeadline(ctx, 'Captain-Draft Inhouse Lobbies', 196, easeOut(clamp((t-0.06)*4,0,1)), gate, 70);

  const subT = easeOut(clamp((t-0.14)*3.5, 0, 1));
  revealText(ctx, 'Sign in  ·  Register position  ·  Captain draft  ·  Auto-provisioned server', WIDTH/2, 262, {
    font: '500 27px Inter', color: C.textSecond, revealIn: subT, gate,
  });
  drawBrassLine(ctx, 360, 296, WIDTH - 720, 0.8 * subT * gate);

  const cardT  = easeOut(clamp((t-0.2)*3, 0, 1));
  const scroll = easeInOut(clamp((t-0.30)/0.62, 0, 1));
  if (cardT > 0) showScrollCard(ctx, shots.draft, WIDTH/2, 660, 1160, 600, cardT, scroll, null, cardT * gate);

  drawVignette(ctx, 0.4);
}

/** Beat 4: TrueSkill MMR & 11-Tier Ladder (13–19s) — the live ladder, scrolling */
function renderStats(ctx, frame, assets, shots) {
  const t    = beatProgress(frame, BEATS[3]);
  const gate = textGate(frame, BEATS[3]);
  const tIn  = easeOut(clamp(t * 3.5, 0, 1));

  drawCoverImage(ctx, assets.bgBattle, 0.7);
  ctx.fillStyle = 'rgba(10,16,30,0.66)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawEmbers(ctx, frame, 24, 0.45);
  drawMotes(ctx, frame, 8, 0.16);
  drawBrassCorners(ctx, 44, 28, 0.8 * tIn);

  drawEyebrow(ctx, 'SKILL-BASED RATING', 118, tIn, gate);
  drawHeadline(ctx, 'TrueSkill MMR & 11-Tier Ladder', 196, easeOut(clamp((t-0.05)*4,0,1)), gate, 70);

  const subT = easeOut(clamp((t-0.12)*3, 0, 1));
  revealText(ctx, 'Performance scores  ·  Win rates  ·  Seasonal placement', WIDTH/2, 262, {
    font: '500 26px Inter', color: C.textSecond, revealIn: subT, gate,
  });
  drawBrassLine(ctx, 360, 296, WIDTH - 720, 0.8 * subT * gate);

  // The live ladder — scrolls down the seasonal rankings (lifted to leave room
  // for the tier-emblem ladder strip below)
  const cardT  = easeOut(clamp((t-0.16)*3, 0, 1));
  const scroll = easeInOut(clamp((t-0.26)/0.66, 0, 1));
  if (cardT > 0) showScrollCard(ctx, shots.leaderboard, WIDTH/2, 580, 1080, 480, cardT, scroll, 'Live 11-tier TrueSkill ladder', cardT * gate);

  // All 11 tier emblems, Peasant → King, igniting in turn beneath the ladder
  const emblemT = easeOut(clamp((t-0.34)*2.2, 0, 1));
  drawTierLadder(ctx, assets.tiers, emblemT, WIDTH/2, 902, 84);

  drawVignette(ctx, 0.4);
}

/** Beat 5: Coaching & Prize Pools (19–24s) */
function renderCoaching(ctx, frame, assets, shots) {
  const t    = beatProgress(frame, BEATS[4]);
  const gate = textGate(frame, BEATS[4]);
  const tIn  = easeOut(clamp(t * 4, 0, 1));

  if (assets.parchment) {
    ctx.globalAlpha = 0.12;
    drawCoverImage(ctx, assets.parchment, 1);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(10,16,30,0.86)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawEmbers(ctx, frame, 20, 0.36);
  drawMotes(ctx, frame, 10, 0.16);
  drawBrassCorners(ctx, 44, 28, 0.8 * tIn);

  drawEyebrow(ctx, 'GROW & COMPETE', 118, tIn, gate);
  drawHeadline(ctx, 'Coaching, Prize Pools & Seasons', 200, easeOut(clamp((t-0.06)*4,0,1)), gate, 70);
  drawBrassLine(ctx, 360, 268, WIDTH - 720, 0.8 * tIn * gate);

  const cards = [
    { eyebrow: 'COACHING MARKETPLACE', big: 'Find your coach',  detail: 'Book 1:1 sessions with top-ranked players', accent: C.brass },
    { eyebrow: 'PRIZE POOLS',          prize: 5000,             detail: 'Real money on the line every season',     accent: C.amber },
    { eyebrow: 'SEASON LADDER',        big: 'Compete for glory',detail: 'Ranked seasons · placement rewards',      accent: C.radiant },
  ];
  const cardW = 520, gap = 40, cardH = 320;
  const startX = (WIDTH - (cards.length*cardW + (cards.length-1)*gap)) / 2;
  const cardY = 360;

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const cT = easeOut(clamp((t - 0.16 - i*0.08)*4, 0, 1));
    const cx = startX + i*(cardW+gap);
    const cy = cardY;
    ctx.globalAlpha = cT * gate;

    const g = ctx.createLinearGradient(cx, cy, cx, cy+cardH);
    g.addColorStop(0, 'rgba(26,39,68,0.92)');
    g.addColorStop(1, 'rgba(13,20,36,0.92)');
    ctx.fillStyle = g;
    ctx.strokeStyle = hexToRgba(c.accent, 0.4);
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx, cy, cardW, cardH, 14);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = c.accent;
    ctx.fillRect(cx + 28, cy + 32, 42, 3);

    ctx.font = '500 17px Oswald';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.18em';
    ctx.fillStyle = c.accent;
    ctx.fillText(c.eyebrow, cx + 28, cy + 74);
    ctx.letterSpacing = '0';

    if (c.prize !== undefined) {
      const prizeVal = Math.floor(c.prize * easeOut(clamp((t - 0.3)*2.2, 0, 1)));
      ctx.font = '700 58px PlayfairDisplay';
      ctx.fillStyle = C.amber;
      ctx.shadowColor = 'rgba(245,158,11,0.4)'; ctx.shadowBlur = 14;
      ctx.fillText(`$${prizeVal.toLocaleString()}+`, cx + 28, cy + 150);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    } else {
      ctx.font = '700 44px PlayfairDisplay';
      ctx.fillStyle = C.parchment;
      ctx.fillText(c.big, cx + 28, cy + 150);
    }

    ctx.font = '400 20px Inter';
    ctx.fillStyle = C.textSecond;
    const words = c.detail.split(' ');
    let line = '', ly = cy + 214;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > cardW - 56 && line) {
        ctx.fillText(line, cx + 28, ly); line = w; ly += 30;
      } else line = test;
    }
    if (line) ctx.fillText(line, cx + 28, ly);

    ctx.globalAlpha = 1;
  }

  drawVignette(ctx, 0.42);
}

/** Beat 6: CTA End Card (24–30s) */
function renderCTA(ctx, frame, assets) {
  const t    = beatProgress(frame, BEATS[5]);
  const gate = textGate(frame, BEATS[5]);
  const tIn  = easeOut(clamp(t * 3, 0, 1));

  drawCoverImage(ctx, assets.throneRoom, 0.66 * tIn);
  if (assets.bgBattle) {
    ctx.globalAlpha = 0.28 * tIn;
    drawCoverImage(ctx, assets.bgBattle, 1);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = `rgba(10,16,30,${0.66 * tIn})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawEmbers(ctx, frame, 30, 0.5 * tIn);
  drawMotes(ctx, frame, 12, 0.26 * tIn);
  drawBrassCorners(ctx, 44, 28, tIn);
  ctx.strokeStyle = hexToRgba(C.brass, 0.22 * tIn);
  ctx.lineWidth = 1;
  ctx.strokeRect(34, 34, WIDTH-68, HEIGHT-68);

  if (assets.logo && tIn > 0) {
    const ls = easeOut(clamp((t-0.03)*4, 0, 1));
    const logoW = 300;
    const logoH = logoW * (assets.logo.height / assets.logo.width);
    const lx = WIDTH/2 - logoW/2;
    const ly = HEIGHT/2 - logoH - 104;
    ctx.globalAlpha = ls * gate;
    const halo = ctx.createRadialGradient(WIDTH/2, ly+logoH/2, 0, WIDTH/2, ly+logoH/2, logoW);
    halo.addColorStop(0, `rgba(245,158,11,${0.2 * ls})`);
    halo.addColorStop(1, 'rgba(245,158,11,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(lx-logoW*0.5, ly-logoH*0.5, logoW*2, logoH*2);
    ctx.drawImage(assets.logo, lx, ly, logoW, logoH);
    ctx.globalAlpha = 1;
  }

  const joinT = easeOut(clamp((t-0.15)*3.5, 0, 1));
  revealText(ctx, 'Join the Inhouse', WIDTH/2, HEIGHT/2 + 6, {
    font: '800 84px PlayfairDisplayEB', color: C.parchment, revealIn: joinT, gate,
    shadow: { hex: '#000000', alpha: 0.75, blur: 16 },
  });

  drawBrassLine(ctx, 360, HEIGHT/2 + 66, WIDTH - 720, joinT * gate);

  const urlT = easeOut(clamp((t-0.25)*3.5, 0, 1));
  revealText(ctx, 'oceinhouse.gg', WIDTH/2, HEIGHT/2 + 124, {
    font: '700 62px PlayfairDisplay', color: C.amber, revealIn: urlT, gate,
    shadow: { hex: C.amber, alpha: 0.45, blur: 18 },
  });

  const tagT = easeOut(clamp((t-0.35)*3, 0, 1));
  if (tagT > 0) drawEyebrow(ctx, "OCEANIA'S DOTA 2 PROVING GROUND", HEIGHT/2 + 196, tagT * 0.85, gate);

  drawVignette(ctx, 0.4);

  // Gentle fade-out at the very end (clean ending, not a between-scene flash)
  const endT = easeIn(clamp((t - 0.93) / 0.07, 0, 1));
  if (endT > 0) {
    ctx.fillStyle = `rgba(10,16,30,${endT})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

const RENDERERS = [
  renderBrandHook, renderHookLine, renderInhouse, renderStats, renderCoaching, renderCTA,
];

// Fill background + render a single beat to a context
function renderBeat(ctx, idx, frame, assets, shots) {
  ctx.fillStyle = C.deepPanel;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  RENDERERS[idx](ctx, frame, assets, shots);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Loading assets...');
  const [assets, shots] = await Promise.all([loadAssets(), loadShots()]);

  console.log('Assets:\n' + Object.entries(assets).map(([k,v]) => `  ${k}: ${v?'ok':'MISSING'}`).join('\n'));
  console.log('Screenshots:\n' + Object.entries(shots).map(([k,v]) => `  ${k}: ${v?'ok':'MISSING'}`).join('\n'));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx    = canvas.getContext('2d');
  // Offscreen buffers for cross-dissolve
  const cvA = createCanvas(WIDTH, HEIGHT); const ctxA = cvA.getContext('2d');
  const cvB = createCanvas(WIDTH, HEIGHT); const ctxB = cvB.getContext('2d');

  console.log(`\nRendering ${TOTAL_FRAMES} frames @ ${FPS}fps → ${OUTPUT_PATH}`);

  const ffmpegArgs = [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${WIDTH}x${HEIGHT}`, '-r', `${FPS}`, '-i', 'pipe:0',
    '-i', AUDIO_PATH,
    '-vf', 'format=yuv420p',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    OUTPUT_PATH,
  ];
  const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.on('error', (err) => { console.error('ffmpeg error:', err); process.exit(1); });

  const startTime = Date.now();
  const half = XFADE_SEC / 2;

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const sec = f / FPS;

    // Is this frame inside a cross-dissolve window around a beat boundary?
    let xfadeK = -1;
    for (let k = 0; k < BEATS.length - 1; k++) {
      const b = BEATS[k].end;
      if (sec >= b - half && sec < b + half) { xfadeK = k; break; }
    }

    if (xfadeK >= 0) {
      const b = BEATS[xfadeK].end;
      const blend = easeInOut(clamp((sec - (b - half)) / XFADE_SEC, 0, 1));
      renderBeat(ctxA, xfadeK,     f, assets, shots);
      renderBeat(ctxB, xfadeK + 1, f, assets, shots);
      ctx.globalAlpha = 1;
      ctx.drawImage(cvA, 0, 0);
      ctx.globalAlpha = blend;
      ctx.drawImage(cvB, 0, 0);
      ctx.globalAlpha = 1;
    } else {
      let i = 0;
      while (i < BEATS.length - 1 && sec >= BEATS[i].end) i++;
      renderBeat(ctx, i, f, assets, shots);
    }

    const data = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const written = ff.stdin.write(Buffer.from(data.buffer));
    if (!written) await new Promise(r => ff.stdin.once('drain', r));

    if (f % 30 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const fpsNow = f / (elapsed || 0.001);
      process.stdout.write(
        `\r  Frame ${f}/${TOTAL_FRAMES} (${(f/TOTAL_FRAMES*100).toFixed(0)}%)  ` +
        `${fpsNow.toFixed(1)} fps  ETA ${((TOTAL_FRAMES-f)/(fpsNow||1)).toFixed(0)}s   `
      );
    }
  }

  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
  });

  const elapsed = ((Date.now() - startTime)/1000).toFixed(1);
  const sizeMB  = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`\n\n✓ Rendered in ${elapsed}s  →  ${OUTPUT_PATH}  (${sizeMB} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
