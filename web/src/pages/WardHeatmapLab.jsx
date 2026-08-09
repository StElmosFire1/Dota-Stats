import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAllWardPlacements } from '../api';
import { useSeason } from '../context/SeasonContext';
import { useSuperuser } from '../context/SuperuserContext';

// ─── Ward Heatmap Lab ────────────────────────────────────────────────────────
// Superuser-only draft page for the full-heatmap ward view. The goal is a
// density overlay whose colours stay TRANSPARENT enough that the minimap
// underneath remains readable — you should always be able to tell exactly
// where a hot zone sits on the map. Tunable sliders (radius, intensity,
// max opacity, map dim) let us find the right defaults before this ships to
// the public ward page.
//
// Not linked from any menu; route is /ward-heatmap-lab.

const MAP_X_MIN = 64, MAP_X_MAX = 192, MAP_Y_MIN = 64, MAP_Y_MAX = 192;
function wardToCanvas(ward, W, H) {
  return {
    px: ((ward.x - MAP_X_MIN) / (MAP_X_MAX - MAP_X_MIN)) * W,
    py: (1 - (ward.y - MAP_Y_MIN) / (MAP_Y_MAX - MAP_Y_MIN)) * H,
  };
}

// Colour ramp: cool → hot, with alpha capped by `maxAlpha` (0–255) so the map
// always shows through even at the hottest spots.
function heatColor(t, maxAlpha) {
  const stops = [
    [0.00, [0, 90, 220, 0]],
    [0.15, [0, 140, 255, 0.30]],
    [0.35, [0, 220, 180, 0.50]],
    [0.55, [190, 255, 0, 0.70]],
    [0.75, [255, 170, 0, 0.85]],
    [1.00, [255, 40, 0, 1.00]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const s = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      const a = stops[i - 1][1];
      const b = stops[i][1];
      return [
        Math.round(a[0] + s * (b[0] - a[0])),
        Math.round(a[1] + s * (b[1] - a[1])),
        Math.round(a[2] + s * (b[2] - a[2])),
        Math.round((a[3] + s * (b[3] - a[3])) * maxAlpha),
      ];
    }
  }
  const last = stops[stops.length - 1][1];
  return [last[0], last[1], last[2], Math.round(last[3] * maxAlpha)];
}

const GRID = 160;

function drawDensity(ctx, W, H, points, { radius, intensity, maxAlpha }) {
  if (!points.length) return;
  const acc = document.createElement('canvas');
  acc.width = GRID; acc.height = GRID;
  const ac = acc.getContext('2d');
  ac.globalCompositeOperation = 'lighter';

  const gradR = (radius / W) * GRID;
  const peakAlpha = Math.min(0.5, intensity / Math.max(1, Math.sqrt(points.length)));
  for (const { px, py } of points) {
    const gx = (px / W) * GRID;
    const gy = (py / H) * GRID;
    const grad = ac.createRadialGradient(gx, gy, 0, gx, gy, gradR);
    grad.addColorStop(0, `rgba(255,255,255,${peakAlpha.toFixed(4)})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${(peakAlpha * 0.35).toFixed(4)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ac.fillStyle = grad;
    ac.beginPath();
    ac.arc(gx, gy, gradR, 0, Math.PI * 2);
    ac.fill();
  }

  const raw = ac.getImageData(0, 0, GRID, GRID);
  let maxV = 0;
  for (let i = 0; i < raw.data.length; i += 4) if (raw.data[i] > maxV) maxV = raw.data[i];
  if (maxV === 0) return;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = GRID; colorCanvas.height = GRID;
  const cc = colorCanvas.getContext('2d');
  const imgData = cc.createImageData(GRID, GRID);
  for (let i = 0; i < raw.data.length; i += 4) {
    const t = raw.data[i] / maxV;
    if (t < 0.02) continue;
    const [r, g, b, a] = heatColor(t, maxAlpha);
    imgData.data[i] = r;
    imgData.data[i + 1] = g;
    imgData.data[i + 2] = b;
    imgData.data[i + 3] = a;
  }
  cc.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(colorCanvas, 0, 0, W, H);
  ctx.restore();
}

const SIZE = 760;

export default function WardHeatmapLab() {
  const { isSuperuser } = useSuperuser();
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardType, setWardType] = useState('obs');
  // Tunables — the whole point of the lab.
  const [radius, setRadius] = useState(30);
  const [intensity, setIntensity] = useState(2.2);
  const [maxAlpha, setMaxAlpha] = useState(150); // 0–255; default ~59% so the map reads through
  const [mapDim, setMapDim] = useState(0.18);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapImg = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setMapLoaded(true);
    img.src = '/minimap.jpg';
    mapImg.current = img;
  }, []);

  useEffect(() => {
    if (!isSuperuser) return;
    setLoading(true);
    getAllWardPlacements(seasonId)
      .then((d) => { setPlayers(d.players || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [seasonId, isSuperuser]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (mapLoaded && mapImg.current?.naturalWidth > 0) {
      ctx.drawImage(mapImg.current, 0, 0, SIZE, SIZE);
      ctx.fillStyle = `rgba(0,0,0,${mapDim})`;
      ctx.fillRect(0, 0, SIZE, SIZE);
    } else {
      ctx.fillStyle = '#0a1610';
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    const pts = [];
    for (const p of players) {
      if (wardType === 'obs' || wardType === 'both') (p.obs || []).forEach((w) => pts.push(wardToCanvas(w, SIZE, SIZE)));
      if (wardType === 'sen' || wardType === 'both') (p.sen || []).forEach((w) => pts.push(wardToCanvas(w, SIZE, SIZE)));
    }
    drawDensity(ctx, SIZE, SIZE, pts, { radius, intensity, maxAlpha });
  }, [players, wardType, radius, intensity, maxAlpha, mapDim, mapLoaded]);

  useEffect(() => { draw(); }, [draw]);

  if (!isSuperuser) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)' }}>
        This page is a superuser-only lab. Nothing to see here.
      </div>
    );
  }

  const totalWards = players.reduce((s, p) => s + (p.obs?.length || 0) + (p.sen?.length || 0), 0);

  const slider = (label, value, set, min, max, step = 1) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)', minWidth: 160 }}>
      <span>{label}: <b style={{ color: 'var(--text-primary)' }}>{value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </label>
  );

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        🧪 Ward Heatmap Lab <span style={{ fontSize: 12, color: '#f59e0b', verticalAlign: 'middle' }}>SUPERUSER DRAFT</span>
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: 16 }}>
        Full-density heatmap prototype. Tune the sliders until the hot zones are obvious
        <em> and</em> the minimap stays readable underneath, then we graduate these defaults
        to the public Ward Map.
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['obs', 'sen', 'both'].map((t) => (
            <button
              key={t}
              onClick={() => setWardType(t)}
              style={{
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                border: `1px solid ${wardType === t ? '#4ade80' : 'var(--border)'}`,
                background: wardType === t ? 'rgba(74,222,128,0.12)' : 'transparent',
                color: wardType === t ? '#4ade80' : 'var(--text-muted)',
              }}
            >
              {t === 'obs' ? 'Observers' : t === 'sen' ? 'Sentries' : 'Both'}
            </button>
          ))}
        </div>
        {slider('Blob radius (px)', radius, setRadius, 10, 80)}
        {slider('Intensity', intensity, setIntensity, 0.5, 6, 0.1)}
        {slider('Max opacity (0–255)', maxAlpha, setMaxAlpha, 40, 255)}
        {slider('Map dim', mapDim, setMapDim, 0, 0.6, 0.02)}
      </div>

      {loading ? (
        <div style={{ color: '#94a3b8', padding: 40 }}>Loading ward data…</div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            style={{ width: '100%', maxWidth: SIZE, borderRadius: 12, border: '1px solid var(--border)', display: 'block' }}
          />
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
            {totalWards.toLocaleString()} wards plotted · colour ramp blue → red by density,
            alpha capped at {(maxAlpha / 255 * 100).toFixed(0)}% so positions stay visible.
          </p>
        </>
      )}
    </div>
  );
}
