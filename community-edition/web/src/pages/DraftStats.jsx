import React, { useState, useEffect } from 'react';
import { getDraftStats } from '../api';
import { getHeroName } from '../heroNames';
import { useSeason } from '../context/SeasonContext';

const SORT_OPTIONS = [
  { key: 'pick_count', label: 'Picks' },
  { key: 'ban_count', label: 'Bans' },
  { key: 'pick_winrate', label: 'Win Rate' },
  { key: 'pick_games', label: 'Total Games' },
];

function WinRateBar({ wr }) {
  if (wr === null || isNaN(wr)) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
  const color = wr >= 60 ? '#4ade80' : wr >= 50 ? '#86efac' : wr >= 40 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg)', borderRadius: 3, minWidth: 60 }}>
        <div style={{
          width: `${Math.min(100, wr)}%`, height: '100%',
          background: color, borderRadius: 3,
          transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: 13, minWidth: 36, textAlign: 'right' }}>
        {wr.toFixed(1)}%
      </span>
    </div>
  );
}

export default function DraftStats() {
  const { seasonId } = useSeason();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('pick_count');
  const [tab, setTab] = useState('picks');

  useEffect(() => {
    setLoading(true);
    getDraftStats(seasonId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [seasonId]);

  if (loading) return <div className="loading">Loading draft stats…</div>;
  if (!data || !data.heroes?.length) return (
    <div className="error-state">
      <p>No draft data available.</p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
        Draft data is populated when replays are parsed. Upload a replay with draft information to see pick and ban statistics.
      </p>
    </div>
  );

  const enriched = data.heroes
    .map(h => ({
      ...h,
      pick_count: parseInt(h.pick_count) || 0,
      ban_count: parseInt(h.ban_count) || 0,
      pick_games: parseInt(h.pick_games) || 0,
      pick_wins: parseInt(h.pick_wins) || 0,
      pick_winrate: parseInt(h.pick_games) > 0 ? (parseInt(h.pick_wins) / parseInt(h.pick_games)) * 100 : null,
      pick_rate: data.totalMatches > 0 ? (parseInt(h.pick_count) / data.totalMatches) * 100 : 0,
      ban_rate: data.totalMatches > 0 ? (parseInt(h.ban_count) / data.totalMatches) * 100 : 0,
    }));

  const sorted = [...enriched].sort((a, b) => {
    if (sortKey === 'pick_winrate') {
      return (b.pick_winrate ?? -1) - (a.pick_winrate ?? -1);
    }
    return b[sortKey] - a[sortKey];
  });

  const picks = sorted.filter(h => h.pick_count > 0);
  const bans = [...enriched].sort((a, b) => b.ban_count - a.ban_count).filter(h => h.ban_count > 0);
  const contested = [...enriched]
    .map(h => ({ ...h, contested: h.pick_count + h.ban_count }))
    .sort((a, b) => b.contested - a.contested)
    .filter(h => h.contested > 0);

  const tabData = tab === 'picks' ? picks : tab === 'bans' ? bans : contested;

  return (
    <div>
      <h1 className="page-title">Draft Statistics</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, marginTop: -8 }}>
        Hero pick and ban rates across {data.totalMatches} tracked {data.totalMatches === 1 ? 'match' : 'matches'}.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['picks', 'bans', 'contested'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: '1px solid',
              borderColor: tab === t ? '#3b82f6' : 'var(--border)',
              background: tab === t ? '#1d4ed8' : 'var(--bg-card)',
              color: tab === t ? '#fff' : 'var(--text-primary)',
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {tab === 'picks' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SORT_OPTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setSortKey(s.key)}
                style={{
                  padding: '4px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                  border: '1px solid',
                  borderColor: sortKey === s.key ? '#7c3aed' : 'var(--border)',
                  background: sortKey === s.key ? '#4c1d95' : 'var(--bg-card)',
                  color: sortKey === s.key ? '#c4b5fd' : 'var(--text-muted)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scoreboard-wrapper">
        {tab === 'picks' && (
          <table className="scoreboard">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th className="col-player">Hero</th>
                <th className="col-stat" title="Number of times picked">Picks</th>
                <th className="col-stat" title="Pick rate (picks / total matches)">Pick Rate</th>
                <th className="col-stat" title="Wins when picked">Wins</th>
                <th className="col-stat" title="Win rate when picked" style={{ minWidth: 140 }}>Win Rate</th>
                <th className="col-stat" title="Number of times banned">Bans</th>
                <th className="col-stat" title="Ban rate">Ban Rate</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((h, i) => (
                <tr key={h.hero_id || h.hero_name || i}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td className="col-player">{getHeroName(h.hero_id, h.hero_name)}</td>
                  <td className="col-stat" style={{ fontWeight: 600 }}>{h.pick_count}</td>
                  <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {h.pick_rate.toFixed(0)}%
                  </td>
                  <td className="col-stat wins">{h.pick_wins}</td>
                  <td className="col-stat">
                    <WinRateBar wr={h.pick_winrate} />
                  </td>
                  <td className="col-stat" style={{ color: '#f87171' }}>{h.ban_count}</td>
                  <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {h.ban_rate.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'bans' && (
          <table className="scoreboard">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th className="col-player">Hero</th>
                <th className="col-stat" title="Number of times banned">Bans</th>
                <th className="col-stat" title="Ban rate">Ban Rate</th>
                <th className="col-stat" title="Number of times picked">Picks</th>
                <th className="col-stat" title="Win rate when picked" style={{ minWidth: 140 }}>Win Rate (when picked)</th>
              </tr>
            </thead>
            <tbody>
              {bans.map((h, i) => (
                <tr key={h.hero_id || h.hero_name || i}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td className="col-player">{getHeroName(h.hero_id, h.hero_name)}</td>
                  <td className="col-stat" style={{ color: '#f87171', fontWeight: 600 }}>{h.ban_count}</td>
                  <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {h.ban_rate.toFixed(0)}%
                  </td>
                  <td className="col-stat">{h.pick_count}</td>
                  <td className="col-stat">
                    {h.pick_count > 0 ? <WinRateBar wr={h.pick_winrate} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'contested' && (
          <table className="scoreboard">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th className="col-player">Hero</th>
                <th className="col-stat" title="Total times picked or banned">Contested</th>
                <th className="col-stat" title="Picks">Picks</th>
                <th className="col-stat" title="Bans">Bans</th>
                <th className="col-stat" title="Contested rate (% of matches)">Contest Rate</th>
                <th className="col-stat" title="Win rate when picked" style={{ minWidth: 140 }}>Win Rate (when picked)</th>
              </tr>
            </thead>
            <tbody>
              {contested.map((h, i) => (
                <tr key={h.hero_id || h.hero_name || i}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td className="col-player">{getHeroName(h.hero_id, h.hero_name)}</td>
                  <td className="col-stat" style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{h.contested}</td>
                  <td className="col-stat wins">{h.pick_count}</td>
                  <td className="col-stat" style={{ color: '#f87171' }}>{h.ban_count}</td>
                  <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {data.totalMatches > 0 ? `${Math.round((h.contested / data.totalMatches) * 100)}%` : '--'}
                  </td>
                  <td className="col-stat">
                    {h.pick_count > 0 ? <WinRateBar wr={h.pick_winrate} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
