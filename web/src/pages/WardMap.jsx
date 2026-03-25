import React, { useState, useEffect, useRef, useCallback } from 'react';
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

function WardCanvas({ placements, selectedPlayer, wardType, playerList, mapLoaded, mapImg }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (mapLoaded && mapImg.current?.naturalWidth > 0) {
      ctx.drawImage(mapImg.current, 0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
    } else {
      // Dota 2 map fallback — approximate topology
      ctx.fillStyle = '#0a1610';
      ctx.fillRect(0, 0, W, H);

      // Base terrain
      ctx.fillStyle = '#12241a';
      ctx.fillRect(0, 0, W, H);

      // Radiant jungle (safe lane — bottom right of radiant base)
      ctx.fillStyle = '#0f2016';
      ctx.fillRect(W * 0.28, H * 0.58, W * 0.24, H * 0.28);

      // Dire jungle (safe lane — top left of dire base)
      ctx.fillStyle = '#0d1a28';
      ctx.fillRect(W * 0.48, H * 0.14, W * 0.24, H * 0.28);

      // Radiant off-lane jungle (top left)
      ctx.fillStyle = '#0f2016';
      ctx.fillRect(W * 0.06, H * 0.20, W * 0.20, H * 0.30);

      // Dire off-lane jungle (bottom right)
      ctx.fillStyle = '#0d1a28';
      ctx.fillRect(W * 0.74, H * 0.50, W * 0.20, H * 0.30);

      // River (diagonal teal-green band)
      ctx.fillStyle = '#0a3a2a';
      ctx.beginPath();
      ctx.moveTo(W * 0.51, H * 1.0);
      ctx.lineTo(W * 0.59, H * 1.0);
      ctx.lineTo(W * 0.57, H * 0.77);
      ctx.lineTo(W * 0.53, H * 0.57);
      ctx.lineTo(W * 0.41, H * 0.43);
      ctx.lineTo(W * 0.38, H * 0.23);
      ctx.lineTo(W * 0.42, H * 0.0);
      ctx.lineTo(W * 0.34, H * 0.0);
      ctx.lineTo(W * 0.30, H * 0.22);
      ctx.lineTo(W * 0.33, H * 0.43);
      ctx.lineTo(W * 0.46, H * 0.57);
      ctx.lineTo(W * 0.49, H * 0.77);
      ctx.lineTo(W * 0.45, H * 1.0);
      ctx.closePath();
      ctx.fill();

      // Bottom lane path (E-W along south)
      ctx.fillStyle = '#2a2418';
      ctx.beginPath();
      ctx.moveTo(W * 0.01, H * 0.80);
      ctx.lineTo(W * 0.44, H * 0.80);
      ctx.lineTo(W * 0.51, H * 0.88);
      ctx.lineTo(W * 0.91, H * 0.88);
      ctx.lineTo(W * 0.91, H * 0.94);
      ctx.lineTo(W * 0.50, H * 0.94);
      ctx.lineTo(W * 0.42, H * 0.86);
      ctx.lineTo(W * 0.01, H * 0.86);
      ctx.closePath();
      ctx.fill();

      // Top lane path (N-S along west)
      ctx.fillStyle = '#2a2418';
      ctx.beginPath();
      ctx.moveTo(W * 0.06, H * 0.99);
      ctx.lineTo(W * 0.06, H * 0.55);
      ctx.lineTo(W * 0.12, H * 0.50);
      ctx.lineTo(W * 0.12, H * 0.06);
      ctx.lineTo(W * 0.18, H * 0.06);
      ctx.lineTo(W * 0.18, H * 0.52);
      ctx.lineTo(W * 0.12, H * 0.57);
      ctx.lineTo(W * 0.12, H * 0.99);
      ctx.closePath();
      ctx.fill();

      // Mid lane (diagonal NW-SE)
      ctx.fillStyle = '#2a2418';
      ctx.beginPath();
      ctx.moveTo(W * 0.16, H * 0.79);
      ctx.lineTo(W * 0.24, H * 0.74);
      ctx.lineTo(W * 0.74, H * 0.26);
      ctx.lineTo(W * 0.80, H * 0.22);
      ctx.lineTo(W * 0.86, H * 0.26);
      ctx.lineTo(W * 0.78, H * 0.32);
      ctx.lineTo(W * 0.28, H * 0.80);
      ctx.lineTo(W * 0.20, H * 0.84);
      ctx.closePath();
      ctx.fill();

      // Radiant base (bottom-left)
      ctx.fillStyle = '#143020';
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H * 0.60);
      ctx.lineTo(W * 0.20, H * 0.60);
      ctx.lineTo(W * 0.28, H * 0.80);
      ctx.lineTo(W * 0.28, H);
      ctx.closePath();
      ctx.fill();

      // Dire base (top-right)
      ctx.fillStyle = '#101428';
      ctx.beginPath();
      ctx.moveTo(W, 0);
      ctx.lineTo(W, H * 0.40);
      ctx.lineTo(W * 0.72, H * 0.40);
      ctx.lineTo(W * 0.64, H * 0.22);
      ctx.lineTo(W * 0.64, 0);
      ctx.closePath();
      ctx.fill();

      // Roshan pit (game ~168, 90 → canvas ~0.656, 0.648)
      ctx.save();
      ctx.fillStyle = '#b87000';
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(W * 0.64, H * 0.65, W * 0.022, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Radiant ancient (game ~25,25 → canvas ~0.098,0.902)
      ctx.save();
      ctx.fillStyle = '#22dd44';
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(W * 0.10, H * 0.90, W * 0.028, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#55ff77';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Dire ancient (game ~230,230 → canvas ~0.898,0.102)
      ctx.save();
      ctx.fillStyle = '#4466ff';
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(W * 0.90, H * 0.10, W * 0.028, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#7799ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Labels
      ctx.save();
      ctx.font = `bold ${Math.floor(W * 0.023)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(80,255,120,0.40)';
      ctx.fillText('RADIANT', W * 0.14, H * 0.96);
      ctx.fillStyle = 'rgba(100,140,255,0.40)';
      ctx.fillText('DIRE', W * 0.86, H * 0.04);
      ctx.fillStyle = 'rgba(255,200,50,0.40)';
      ctx.font = `${Math.floor(W * 0.019)}px sans-serif`;
      ctx.fillText('ROSH', W * 0.64, H * 0.71);
      ctx.restore();
    }

    const toShow = selectedPlayer === 'all'
      ? placements
      : placements.filter(p => String(p.accountId) === selectedPlayer);

    const playerColorMap = {};
    playerList.forEach((p, i) => {
      playerColorMap[String(p.accountId)] = PLAYER_COLORS[i % PLAYER_COLORS.length];
    });

    for (const player of toShow) {
      const baseColor = selectedPlayer === 'all'
        ? (playerColorMap[String(player.accountId)] || '#4ade80')
        : '#4ade80';

      const showObs = wardType === 'obs' || wardType === 'both';
      const showSen = wardType === 'sen' || wardType === 'both';

      const wardData = [
        ...(showObs ? (player.obs || []).map(w => ({ ...w, isObs: true })) : []),
        ...(showSen ? (player.sen || []).map(w => ({ ...w, isObs: false })) : []),
      ];

      for (const ward of wardData) {
        const px = (ward.x / 256) * W;
        const py = ((256 - ward.y) / 256) * H;

        const color = ward.isObs ? baseColor : '#f59e0b';
        const glowR = ward.isObs ? 14 : 10;
        const dotR = ward.isObs ? 5 : 4;

        const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        grad.addColorStop(0, hexToRgba(color, 0.7));
        grad.addColorStop(1, hexToRgba(color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [placements, selectedPlayer, wardType, playerList, mapLoaded, mapImg]);

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
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapImg = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setMapLoaded(true);
    img.onerror = () => setMapLoaded(false);
    img.src = '/minimap.jpg';
    mapImg.current = img;
  }, []);

  useEffect(() => {
    setLoading(true);
    getAllWardPlacements(seasonId)
      .then(data => {
        setPlayerList(data.players || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [seasonId]);

  const totalObs = playerList.reduce((s, p) => s + (p.obs?.length || 0), 0);
  const totalSen = playerList.reduce((s, p) => s + (p.sen?.length || 0), 0);

  const selectedPlayerData = playerList.filter(p =>
    selectedPlayer === 'all' || String(p.accountId) === selectedPlayer
  );

  const obsCount = selectedPlayerData.reduce((s, p) => s + (p.obs?.length || 0), 0);
  const senCount = selectedPlayerData.reduce((s, p) => s + (p.sen?.length || 0), 0);

  return (
    <div style={{ padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
        🗺️ Ward Heatmap
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
              playerList={playerList}
              mapLoaded={mapLoaded}
              mapImg={mapImg}
            />
          </div>

          <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                {playerList.map((p, i) => (
                  <option key={p.accountId} value={String(p.accountId)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

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

            <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Legend</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80' }} />
                  Observer Ward
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                  Sentry Ward
                </div>
              </div>
              {selectedPlayer === 'all' && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Player Colors</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {playerList.map((p, i) => (
                      <div key={p.accountId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: PLAYER_COLORS[i % PLAYER_COLORS.length], flexShrink: 0 }} />
                        {p.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Stats</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>👁️ Observers shown</span>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>{obsCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>🔍 Sentries shown</span>
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>{senCount}</span>
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
