import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMultiKillStats } from '../api';

const KILL_TYPES = [
  { key: 'rampages',    label: 'Rampages',    emoji: '☠️',  color: '#e53935', desc: '5 kills without dying' },
  { key: 'ultra_kills', label: 'Ultra Kills',  emoji: '⚡',  color: '#8e24aa', desc: '4 kills without dying' },
  { key: 'triple_kills',label: 'Triple Kills', emoji: '🔥',  color: '#ef6c00', desc: '3 kills without dying' },
  { key: 'double_kills',label: 'Double Kills', emoji: '⚔️',  color: '#1976d2', desc: '2 kills without dying' },
];

function KillBadge({ count, color, emoji }) {
  if (!count || count == 0) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: `${color}22`, border: `1px solid ${color}55`,
      color, borderRadius: 8, padding: '2px 10px',
      fontSize: 13, fontWeight: 700,
    }}>
      {emoji} {count}
    </span>
  );
}

export default function MultiKills() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('rampages');

  useEffect(() => {
    getMultiKillStats()
      .then(d => setRows(d.rows || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'total') return Number(b.total_multikills) - Number(a.total_multikills);
    return Number(b[sortKey]) - Number(a[sortKey]) || Number(b.total_multikills) - Number(a.total_multikills);
  });

  const Th = ({ col, label, title }) => (
    <th
      className="col-stat"
      title={title}
      style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === col ? 'var(--accent-blue)' : '' }}
      onClick={() => setSortKey(col)}
    >
      {label} {sortKey === col ? '▼' : ''}
    </th>
  );

  const topRampage = sorted.find(r => Number(r.rampages) > 0);

  return (
    <div>
      <h1 className="page-title">Multi-Kill Leaderboard</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        Consecutive kill streaks within a single engagement — click a column to sort.
      </p>

      {/* Kill type legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {KILL_TYPES.map(k => (
          <div key={k.key} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-card)', border: `1px solid ${k.color}44`,
            borderRadius: 10, padding: '8px 14px',
          }}>
            <span style={{ fontSize: 20 }}>{k.emoji}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: k.color }}>{k.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Highlight card */}
      {topRampage && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(229,57,53,0.15) 0%, rgba(142,36,170,0.1) 100%)',
          border: '1px solid rgba(229,57,53,0.4)', borderRadius: 12,
          padding: '14px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <span style={{ fontSize: 36 }}>☠️</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Rampage King</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              <Link to={`/player/${topRampage.account_id}`} style={{ color: '#e53935', textDecoration: 'none' }}>
                {topRampage.display_name}
              </Link>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {topRampage.rampages} rampage{topRampage.rampages > 1 ? 's' : ''} in {topRampage.games_played} games
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading multi-kill stats…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>No multi-kills recorded yet — go out there and get some!</p>
        </div>
      ) : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-player">Player</th>
                <Th col="rampages"     label="☠️ Rampages"    title="5 kills without dying" />
                <Th col="ultra_kills"  label="⚡ Ultras"       title="4 kills without dying" />
                <Th col="triple_kills" label="🔥 Triples"      title="3 kills without dying" />
                <Th col="double_kills" label="⚔️ Doubles"      title="2 kills without dying" />
                <Th col="total"        label="Total"           title="All multi-kills combined" />
                <th className="col-stat" title="Games played">Games</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.account_id} className={i < 3 ? `rank-${i + 1}` : ''}>
                  <td className="col-rank">{i + 1}</td>
                  <td className="col-player">
                    <Link to={`/player/${r.account_id}`} className="player-link">
                      {r.display_name}
                    </Link>
                  </td>
                  <td className="col-stat"><KillBadge count={r.rampages}     color="#e53935" emoji="☠️" /></td>
                  <td className="col-stat"><KillBadge count={r.ultra_kills}  color="#8e24aa" emoji="⚡" /></td>
                  <td className="col-stat"><KillBadge count={r.triple_kills} color="#ef6c00" emoji="🔥" /></td>
                  <td className="col-stat"><KillBadge count={r.double_kills} color="#1976d2" emoji="⚔️" /></td>
                  <td className="col-stat" style={{ fontWeight: 700 }}>{r.total_multikills}</td>
                  <td className="col-stat" style={{ color: 'var(--text-muted)' }}>{r.games_played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
