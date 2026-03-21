import React, { useState, useEffect, useCallback } from 'react';
import { getPlayerComparison, getAllPlayers } from '../api';
import { useSeason } from '../context/SeasonContext';

function Stat({ label, a, b, higherBetter = true, format = v => v?.toFixed(1) }) {
  const aV = parseFloat(a) || 0;
  const bV = parseFloat(b) || 0;
  const aWins = higherBetter ? aV > bV : aV < bV;
  const bWins = higherBetter ? bV > aV : bV < aV;
  const max = Math.max(aV, bV, 0.01);
  const aBar = (aV / max) * 100;
  const bBar = (bV / max) * 100;
  const green = 'var(--accent-green)';
  const normal = 'var(--bg-hover)';

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: aWins ? 700 : 400, color: aWins ? green : 'var(--text-primary)' }}>
            {format(aV)}
          </div>
          <div style={{ height: 6, borderRadius: 3, background: aWins ? green : normal, width: `${aBar}%`, marginLeft: 'auto', marginTop: 3, minWidth: 2, transition: 'width 0.3s' }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', width: 100 }}>{label}</div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 15, fontWeight: bWins ? 700 : 400, color: bWins ? green : 'var(--text-primary)' }}>
            {format(bV)}
          </div>
          <div style={{ height: 6, borderRadius: 3, background: bWins ? green : normal, width: `${bBar}%`, marginTop: 3, minWidth: 2, transition: 'width 0.3s' }} />
        </div>
      </div>
    </div>
  );
}

export default function Compare() {
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAllPlayers(null).then(r => setPlayers(r.players || [])).catch(() => {});
  }, []);

  const search = useCallback(async () => {
    if (!playerA || !playerB || playerA === playerB) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getPlayerComparison(playerA, playerB, seasonId);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [playerA, playerB, seasonId]);

  return (
    <div>
      <h1 className="page-title">Player Comparison</h1>
      <div className="stats-grid" style={{ gridTemplateColumns: '1fr auto 1fr', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Player A</label>
          <select
            value={playerA}
            onChange={e => setPlayerA(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.account_id} value={p.account_id}>{p.player_key}</option>
            ))}
          </select>
        </div>
        <div className="stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>vs</span>
        </div>
        <div className="stat-card">
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Player B</label>
          <select
            value={playerB}
            onChange={e => setPlayerB(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.account_id} value={p.account_id}>{p.player_key}</option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn btn-primary" onClick={search} disabled={!playerA || !playerB || playerA === playerB || loading}>
        {loading ? 'Loading…' : 'Compare'}
      </button>

      {error && <div className="error-state" style={{ marginTop: '1rem' }}>{error}</div>}

      {data && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, marginBottom: 12, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent-blue)' }}>{data.a.display_name}</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', alignSelf: 'center' }}>vs</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent-purple, #b967ff)' }}>{data.b.display_name}</div>
          </div>
          <div className="stat-card">
            <Stat label="MMR" a={data.a.mmr} b={data.b.mmr} format={v => Math.round(v)} />
            <Stat label="Games" a={data.a.games} b={data.b.games} format={v => Math.round(v)} />
            <Stat label="Win Rate" a={data.a.games > 0 ? data.a.wins / data.a.games * 100 : 0} b={data.b.games > 0 ? data.b.wins / data.b.games * 100 : 0} format={v => v.toFixed(1) + '%'} />
            <Stat label="Avg Kills" a={data.a.avg_kills} b={data.b.avg_kills} />
            <Stat label="Avg Deaths" a={data.a.avg_deaths} b={data.b.avg_deaths} higherBetter={false} />
            <Stat label="Avg Assists" a={data.a.avg_assists} b={data.b.avg_assists} />
            <Stat label="KDA" a={data.a.avg_deaths > 0 ? (data.a.avg_kills + data.a.avg_assists) / data.a.avg_deaths : data.a.avg_kills + data.a.avg_assists} b={data.b.avg_deaths > 0 ? (data.b.avg_kills + data.b.avg_assists) / data.b.avg_deaths : data.b.avg_kills + data.b.avg_assists} format={v => v.toFixed(2)} />
            <Stat label="Avg GPM" a={data.a.avg_gpm} b={data.b.avg_gpm} format={v => Math.round(v)} />
            <Stat label="Avg XPM" a={data.a.avg_xpm} b={data.b.avg_xpm} format={v => Math.round(v)} />
            <Stat label="Avg Hero Dmg" a={data.a.avg_hero_damage} b={data.b.avg_hero_damage} format={v => Math.round(v).toLocaleString()} />
            <Stat label="Avg Dmg Taken" a={data.a.avg_damage_taken} b={data.b.avg_damage_taken} higherBetter={false} format={v => Math.round(v).toLocaleString()} />
            <Stat label="Avg Camps Stacked" a={data.a.avg_camps_stacked} b={data.b.avg_camps_stacked} />
            <Stat label="Hero Pool" a={data.a.unique_heroes} b={data.b.unique_heroes} format={v => Math.round(v)} />
          </div>
        </div>
      )}
    </div>
  );
}
