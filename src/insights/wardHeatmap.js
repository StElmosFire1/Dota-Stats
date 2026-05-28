// Task #439 — Server-side ward heatmap PNG renderer.
//
// Used by GET /api/admin/match-insights/:matchId/ward-heatmap.png and exposed
// for tests. Draws observer + sentry placements over the real Dota minimap
// (web/public/minimap.jpg) via @napi-rs/canvas. Falls back to a dark
// gradient background when the minimap file isn't available so the endpoint
// keeps working even if a deploy forgets to ship the asset.

const fs = require('fs');
const path = require('path');

const MAP_X_MIN = 64, MAP_X_MAX = 192, MAP_Y_MIN = 64, MAP_Y_MAX = 192;

function _wardToCanvas(w, W, H) {
  return {
    px: ((w.x - MAP_X_MIN) / (MAP_X_MAX - MAP_X_MIN)) * W,
    py: (1 - (w.y - MAP_Y_MIN) / (MAP_Y_MAX - MAP_Y_MIN)) * H,
  };
}

function _normaliseWards(players) {
  const obs = [], sen = [];
  for (const p of (players || [])) {
    const wp = Array.isArray(p.ward_placements) ? p.ward_placements
      : (typeof p.ward_placements === 'string'
          ? (() => { try { return JSON.parse(p.ward_placements); } catch { return []; } })()
          : []);
    for (const w of wp) {
      if (w?.x == null || w?.y == null) continue;
      const t = (w.type || '').toLowerCase();
      if (t.startsWith('sen')) sen.push(w);
      else obs.push(w);
    }
  }
  return { obs, sen };
}

async function renderWardHeatmap(players, { width = 600, height = 600, mapPath } = {}) {
  let canvasMod;
  try {
    canvasMod = require('@napi-rs/canvas');
  } catch (e) {
    throw new Error('@napi-rs/canvas not installed — cannot render ward heatmap PNG');
  }
  const { createCanvas, loadImage } = canvasMod;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background — real minimap when available, else dark gradient
  const minimap = mapPath || path.join(process.cwd(), 'web', 'public', 'minimap.jpg');
  let drewMap = false;
  if (fs.existsSync(minimap)) {
    try {
      const img = await loadImage(minimap);
      ctx.drawImage(img, 0, 0, width, height);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, width, height);
      drewMap = true;
    } catch (_) { /* fall through */ }
  }
  if (!drewMap) {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0a1610');
    grad.addColorStop(1, '#101820');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  const { obs, sen } = _normaliseWards(players);

  // Density-based heatmap (additive radial gradients), tinted by ward type
  _paintHeat(ctx, obs.map(w => _wardToCanvas(w, width, height)), width, height, [80, 220, 255]);
  _paintHeat(ctx, sen.map(w => _wardToCanvas(w, width, height)), width, height, [200, 120, 255]);

  // Dots on top
  for (const w of obs) {
    const { px, py } = _wardToCanvas(w, width, height);
    _dot(ctx, px, py, '#4ade80');
  }
  for (const w of sen) {
    const { px, py } = _wardToCanvas(w, width, height);
    _diamond(ctx, px, py, '#a78bfa');
  }

  // Legend
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.fillRect(8, height - 60, 170, 52);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Observers: ${obs.length}`, 18, height - 38);
  ctx.fillText(`Sentries:  ${sen.length}`, 18, height - 20);

  return canvas.encode('png');
}

function _paintHeat(ctx, points, W, H, [r, g, b]) {
  if (!points.length) return;
  const peakAlpha = Math.min(0.45, 3.5 / Math.max(1, points.length));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const { px, py } of points) {
    const grad = ctx.createRadialGradient(px, py, 0, px, py, 36);
    grad.addColorStop(0,   `rgba(${r},${g},${b},${peakAlpha.toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${(peakAlpha * 0.4).toFixed(3)})`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, 36, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function _dot(ctx, px, py, color) {
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.fill(); ctx.stroke();
}

function _diamond(ctx, px, py, color) {
  ctx.beginPath();
  ctx.moveTo(px, py - 4);
  ctx.lineTo(px + 4, py);
  ctx.lineTo(px, py + 4);
  ctx.lineTo(px - 4, py);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.fill(); ctx.stroke();
}

module.exports = { renderWardHeatmap };
