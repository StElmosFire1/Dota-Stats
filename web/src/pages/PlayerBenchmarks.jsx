import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPlayerBenchmarks } from '../api';
import { useSeason } from '../context/SeasonContext';

const METRICS = [
  { key: 'avg_kda', label: 'KDA', fmt: v => parseFloat(v).toFixed(2), higher: true },
  { key: 'avg_gpm', label: 'GPM', fmt: v => Math.round(v), higher: true },
  { key: 'avg_xpm', label: 'XPM', fmt: v => Math.round(v), higher: true },
  { key: 'avg_kills', label: 'Kills', fmt: v => parseFloat(v).toFixed(1), higher: true },
  { key: 'avg_deaths', label: 'Deaths', fmt: v => parseFloat(v).toFixed(1), higher: false },
  { key: 'avg_assists', label: 'Assists', fmt: v => parseFloat(v).toFixed(1), higher: true },
  { key: 'avg_hero_damage', label: 'Hero Dmg', fmt: v => Math.round(v).toLocaleString(), higher: true },
  { key: 'avg_tower_damage', label: 'Tower Dmg', fmt: v => Math.round(v).toLocaleString(), higher: true },
  { key: 'avg_healing', label: 'Healing', fmt: v => Math.round(v).toLocaleString(), higher: true },
  { key: 'avg_last_hits', label: 'Last Hits', fmt: v => Math.round(v), higher: true },
];

function BarCell({ value, min, max, higher }) {
  if (max === min) return <td className="col-stat">{value}</td>;
  const pct = ((parseFloat(value.toString().replace(/,/g, '')) - min) / (max - min)) * 100;
  const good = higher ? pct > 60 : pct < 40;
  const bad = higher ? pct < 30 : pct > 70;
  const color = good ? 'var(--radiant-color)' : bad ? 'var(--dire-color)' : 'var(--text-primary)';
  return (
    <td className="col-stat" style={{ color, fontWeight: good || bad ? 700 : 400 }}>
      {value}
    </td>
  );
}

export default function PlayerBenchmarks() {
  const { seasonId } = useSeason();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('avg_kda');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getPlayerBenchmarks(seasonId)
      .then(d => setData(d?.benchmarks || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [seasonId]);

  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = data.filter(p =>
    !search || p.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const av = parseFloat(a[sortKey]) || 0;
    const bv = parseFloat(b[sortKey]) || 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const metricRanges = {};
  for (const m of METRICS) {
    const vals = data.map(p => parseFloat(p[m.key]) || 0);
    metricRanges[m.key] = { min: Math.min(...vals), max: Math.max(...vals) };
  }

  const SortTh = ({ metricKey, label }) => (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => handleSort(metricKey)}
    >
      {label} {sortKey === metricKey ? (sortDir === 'desc' ? '▼' : '▲') : ''}
    </th>
  );

  if (loading) return <div className="loading">Loading benchmarks…</div>;

  return (
    <div>
      <h1 className="page-title">📊 Player Benchmarks</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
        Average stats across all players (minimum 3 games). Green = top 40%, red = bottom 30%.
        Click any column header to sort.
      </p>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search player…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)',
            borderRadius: 8, padding: '8px 14px', fontSize: 14, width: 220,
          }}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="scoreboard" style={{ width: '100%', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Player</th>
              <th>Games</th>
              {METRICS.map(m => (
                <SortTh key={m.key} metricKey={m.key} label={m.label} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.account_id}>
                <td>
                  <Link to={`/player/${p.account_id}`} style={{ fontWeight: 600, color: 'var(--accent)' }}>
                    {p.display_name}
                  </Link>
                </td>
                <td className="col-stat">{p.games}</td>
                {METRICS.map(m => (
                  <BarCell
                    key={m.key}
                    value={m.fmt(p[m.key] || 0)}
                    min={metricRanges[m.key]?.min || 0}
                    max={metricRanges[m.key]?.max || 1}
                    higher={m.higher}
                  />
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={METRICS.length + 2} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No data found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
