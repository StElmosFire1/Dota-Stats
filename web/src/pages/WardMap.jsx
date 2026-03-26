import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAllWardPlacements, getPlayerWardPlacements } from '../api';
import { useSeason } from '../context/SeasonContext';

const PLAYER_COLORS = [
  '#4ade80','#60a5fa','#f59e0b','#f87171','#a78bfa',
  '#34d399','#fb923c','#e879f9','#38bdf8','#fde047',
];

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Dota 2 coordinate space mapped to canvas (standard symmetric mapping)
const MAP_X_MIN = 64, MAP_X_MAX = 192, MAP_Y_MIN = 64, MAP_Y_MAX = 192;

function wardToCanvas(ward, W, H) {
  return {
    px: ((ward.x - MAP_X_MIN) / (MAP_X_MAX - MAP_X_MIN)) * W,
    py: (1 - (ward.y - MAP_Y_MIN) / (MAP_Y_MAX - MAP_Y_MIN)) * H,
  };
}

// Heat colour ramp: transparent → blue → cyan → green → yellow → orange → red
function heatColor(t) {
  if (t <= 0) return [0, 0, 0, 0];
  const stops = [
    [0.00, [  0,   0, 220,   0]],
    [0.10, [  0,   0, 255,  60]],
    [0.30, [  0, 180, 255, 130]],
    [0.50, [  0, 255, 100, 180]],
    [0.65, [200, 255,   0, 210]],
    [0.80, [255, 160,   0, 235]],
    [1.00, [255,   0,   0, 255]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const s = (t - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
      return stops[i-1][1].map((v, j) => Math.round(v + s * (stops[i][1][j] - v)));
    }
  }
  return stops[stops.length - 1][1];
}

// Draw a proper density heatmap using a low-res density grid then upscale.
// This produces smooth gradients: isolated wards → blue, popular spots → red.
const HEATMAP_GRID = 128;

function drawHeatmap(ctx, W, H, points, sigmaCanvas) {
  if (!points.length) return;

  const G = HEATMAP_GRID;

  // Accumulate density at grid resolution
  const acc = document.createElement('canvas');
  acc.width = G; acc.height = G;
  const ac = acc.getContext('2d');
  ac.globalCompositeOperation = 'lighter';

  const sigmaG = (sigmaCanvas / W) * G;       // sigma in grid pixels
  const gradR  = sigmaG * 2.8;               // gradient radius (covers ~3σ)
  // peakAlpha: scale so isolated wards are cool, dense clusters are hot.
  // 3.5 / N means it takes ~3.5 fully-overlapping wards to saturate the max channel.
  const peakAlpha = Math.min(0.45, 3.5 / Math.max(1, points.length));

  for (const { px, py } of points) {
    const gx = (px / W) * G;
    const gy = (py / H) * G;
    const grad = ac.createRadialGradient(gx, gy, 0, gx, gy, gradR);
    grad.addColorStop(0,   `rgba(255,255,255,${peakAlpha.toFixed(4)})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${(peakAlpha * 0.35).toFixed(4)})`);
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ac.fillStyle = grad;
    ac.beginPath();
    ac.arc(gx, gy, gradR, 0, Math.PI * 2);
    ac.fill();
  }

  // Read density values
  const raw = ac.getImageData(0, 0, G, G);
  let maxV = 0;
  for (let i = 0; i < raw.data.length; i += 4) if (raw.data[i] > maxV) maxV = raw.data[i];
  if (maxV === 0) return;

  // Apply colour ramp on a small coloured canvas
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = G; colorCanvas.height = G;
  const cc = colorCanvas.getContext('2d');
  const imgData = cc.createImageData(G, G);
  for (let i = 0; i < raw.data.length; i += 4) {
    const t = raw.data[i] / maxV;
    if (t < 0.01) continue;
    const [r, g, b, a] = heatColor(t);
    imgData.data[i]   = r;
    imgData.data[i+1] = g;
    imgData.data[i+2] = b;
    imgData.data[i+3] = a;
  }
  cc.putImageData(imgData, 0, 0);

  // Upscale smoothly to the main canvas — this provides the blur/blend effect
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(colorCanvas, 0, 0, W, H);
  ctx.restore();
}

// Draw a diamond (rotated square) for sentry wards to distinguish from observer circles
function drawDiamond(ctx, px, py, r) {
  ctx.beginPath();
  ctx.moveTo(px,     py - r);
  ctx.lineTo(px + r, py);
  ctx.lineTo(px,     py + r);
  ctx.lineTo(px - r, py);
  ctx.closePath();
}

function WardCanvas({ placements, selectedPlayer, wardType, playerColorMap, mapLoaded, mapImg, viewMode }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Always draw map background
    if (mapLoaded && mapImg.current?.naturalWidth > 0) {
      ctx.drawImage(mapImg.current, 0, 0, W, H);
      // Darken more for heatmap so the colours pop, less for points
      ctx.fillStyle = viewMode === 'heatmap' ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0, W, H);
    } else {
      // Simple dark fallback
      ctx.fillStyle = '#0a1610';
      ctx.fillRect(0, 0, W, H);
    }

    const toShow = selectedPlayer === 'all'
      ? placements
      : placements.filter(p => String(p.accountId) === selectedPlayer);

    const showObs = wardType === 'obs' || wardType === 'both';
    const showSen = wardType === 'sen' || wardType === 'both';

    if (viewMode === 'heatmap') {
      const obsPoints = [], senPoints = [];
      for (const player of toShow) {
        if (showObs) (player.obs || []).forEach(w => obsPoints.push(wardToCanvas(w, W, H)));
        if (showSen) (player.sen || []).forEach(w => senPoints.push(wardToCanvas(w, W, H)));
      }

      // Draw observer heatmap (full colour ramp)
      if (obsPoints.length) drawHeatmap(ctx, W, H, obsPoints, 26);

      // Draw sentry heatmap with a purple/blue tint to distinguish
      if (senPoints.length) {
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = W; tmpCanvas.height = H;
        const tmpCtx = tmpCanvas.getContext('2d');
        drawHeatmap(tmpCtx, W, H, senPoints, 20);
        // Tint sentry layer with a light purple overlay to differentiate from observers
        tmpCtx.globalCompositeOperation = 'source-atop';
        tmpCtx.fillStyle = 'rgba(160,80,255,0.28)';
        tmpCtx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(tmpCanvas, 0, 0);
        ctx.globalAlpha = 1;
      }
    } else {
      // Points view — circles for observers, diamonds for sentries, both use player colour
      for (const player of toShow) {
        const baseColor = playerColorMap[String(player.accountId)] || '#4ade80';

        if (showObs) {
          for (const ward of (player.obs || [])) {
            const { px, py } = wardToCanvas(ward, W, H);
            const glowR = 11;
            const dotR  = 4;
            const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
            grad.addColorStop(0, hexToRgba(baseColor, 0.65));
            grad.addColorStop(1, hexToRgba(baseColor, 0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, glowR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = baseColor;
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(px, py, dotR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }

        if (showSen) {
          for (const ward of (player.sen || [])) {
            const { px, py } = wardToCanvas(ward, W, H);
            const glowR = 11;
            const dotR  = 4;
            const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
            grad.addColorStop(0, hexToRgba(baseColor, 0.5));
            grad.addColorStop(1, hexToRgba(baseColor, 0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, glowR, 0, Math.PI * 2);
            ctx.fill();
            // Diamond shape for sentry
            ctx.fillStyle = baseColor;
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 1.2;
            drawDiamond(ctx, px, py, dotR);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    }
  }, [placements, selectedPlayer, wardType, playerColorMap, mapLoaded, mapImg, viewMode]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={600}
      style={{ width: '100%', maxWidth: 600, borderRadius: 8, border: '1px solid #334155', display: 'block' }}
    />
  );
}

export default function WardMap() {
  const { seasonId } = useSeason();
  const [playerList, setPlayerList] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState('all');
  const [wardType, setWardType] = useState('both');
  const viewMode = 'points';
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapImg = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setMapLoaded(true);
    img.onerror = () => { setMapLoaded(false); };
    img.src = '/minimap.jpg';
    mapImg.current = img;
  }, []);

  useEffect(() => {
    setLoading(true);
    getAllWardPlacements(seasonId)
      .then(data => {
        // Sort alphabetically by name
        const sorted = (data.players || []).slice().sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
        setPlayerList(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [seasonId]);

  // Assign stable colours to players sorted alphabetically
  const playerColorMap = useMemo(() => {
    const map = {};
    playerList.forEach((p, i) => {
      map[String(p.accountId)] = PLAYER_COLORS[i % PLAYER_COLORS.length];
    });
    return map;
  }, [playerList]);

  const totalObs = playerList.reduce((s, p) => s + (p.obs?.length || 0), 0);
  const totalSen = playerList.reduce((s, p) => s + (p.sen?.length || 0), 0);

  const selectedPlayerData = playerList.filter(p =>
    selectedPlayer === 'all' || String(p.accountId) === selectedPlayer
  );
  const obsCount = selectedPlayerData.reduce((s, p) => s + (p.obs?.length || 0), 0);
  const senCount = selectedPlayerData.reduce((s, p) => s + (p.sen?.length || 0), 0);

  const selectedColor = selectedPlayer !== 'all'
    ? (playerColorMap[selectedPlayer] || '#4ade80')
    : null;

  return (
    <div style={{ padding: '24px 16px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
        🗺️ Ward Map
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: 24 }}>
        Observer and sentry ward placement patterns across all tracked replays.
      </p>

      {loading ? (
        <div style={{ color: '#94a3b8', padding: 40, textAlign: 'center' }}>Loading ward data…</div>
      ) : totalObs + totalSen === 0 ? (
        <div style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
          padding: 40, textAlign: 'center', color: '#94a3b8',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏔️</div>
          <div style={{ fontSize: 16, marginBottom: 8, color: '#e2e8f0' }}>No ward data yet</div>
          <div>Ward placement coordinates are captured from new replays. Upload a replay to start tracking ward patterns.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto', width: '100%', maxWidth: 600 }}>
            <WardCanvas
              placements={playerList}
              selectedPlayer={selectedPlayer}
              wardType={wardType}
              playerColorMap={playerColorMap}
              mapLoaded={mapLoaded}
              mapImg={mapImg}
              viewMode={viewMode}
            />
          </div>

          <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Player select */}
            <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Player</div>
              <select
                value={selectedPlayer}
                onChange={e => setSelectedPlayer(e.target.value)}
                style={{
                  width: '100%', background: '#0f172a', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: 6, padding: '8px 10px',
                  fontSize: 14, cursor: 'pointer',
                }}
              >
                <option value="all">All Players</option>
                {playerList.map((p) => (
                  <option key={p.accountId} value={String(p.accountId)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Ward type */}
            <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Ward Type</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['both','Both'],['obs','Observer'],['sen','Sentry']].map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setWardType(v)}
                    style={{
                      flex: 1, padding: '7px 4px', borderRadius: 6, fontSize: 12,
                      border: '1px solid',
                      borderColor: wardType === v ? '#3b82f6' : '#334155',
                      background: wardType === v ? '#1d4ed8' : '#0f172a',
                      color: wardType === v ? '#fff' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Legend</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e2e8f0' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8' }} />
                    Observer (circle)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e2e8f0' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <polygon points="6,1 11,6 6,11 1,6" fill="#94a3b8" stroke="rgba(0,0,0,0.5)" strokeWidth="0.8" />
                    </svg>
                    Sentry (diamond)
                  </div>
                </div>
                {selectedPlayer !== 'all' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: selectedColor }} />
                    {playerList.find(p => String(p.accountId) === selectedPlayer)?.name || 'Player'}
                  </div>
                ) : (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Player Colours</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {playerList.map((p) => (
                        <div key={p.accountId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: playerColorMap[String(p.accountId)], flexShrink: 0 }} />
                          {p.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Stats</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>👁️ Observers shown</span>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>{obsCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>🔍 Sentries shown</span>
                  <span style={{ color: '#a78bfa', fontWeight: 600 }}>{senCount}</span>
                </div>
                <div style={{ borderTop: '1px solid #334155', paddingTop: 6, marginTop: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12 }}>
                    <span>Total obs (all)</span><span>{totalObs}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12 }}>
                    <span>Total sen (all)</span><span>{totalSen}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
