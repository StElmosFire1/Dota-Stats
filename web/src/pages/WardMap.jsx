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
      ctx.fillStyle = '#0f2010';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1a4020';
      ctx.fillRect(0, H * 0.55, W * 0.45, H * 0.45);
      ctx.fillStyle = '#1a4020';
      ctx.fillRect(W * 0.55, 0, W * 0.45, H * 0.45);
      ctx.strokeStyle = '#2a6030';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.35);
      ctx.lineTo(W * 0.35, H * 0.35);
      ctx.lineTo(W * 0.35, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W * 0.65, H);
      ctx.lineTo(W * 0.65, H * 0.65);
      ctx.lineTo(W, H * 0.65);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, H * 0.5);
      ctx.lineTo(W * 0.5, 0);
      ctx.stroke();
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
    img.src = '/minimap.png';
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
