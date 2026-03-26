import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPersonalRecords, getFirstBloodStats, getComebackMatches } from '../api';
import { useSeason } from '../context/SeasonContext';
import { formatHeroName } from '../utils/heroes';

function fmtDuration(s) {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtNum(v, key) {
  if (v == null) return '—';
  if (key === 'gpm' || key === 'xpm') return Math.round(v).toLocaleString();
  if (key === 'hero_damage' || key === 'tower_damage' || key === 'net_worth' || key === 'hero_healing') return Math.round(v).toLocaleString();
  return v;
}

const RECORD_ORDER = [
  'kills', 'deaths', 'assists', 'gpm', 'xpm',
  'hero_damage', 'hero_healing', 'tower_damage', 'net_worth', 'last_hits', 'level',
];

const RECORD_ICONS = {
  kills: '⚔️',
  deaths: '💀',
  assists: '🤝',
  gpm: '💰',
  xpm: '⭐',
  hero_damage: '🔥',
  hero_healing: '💚',
  tower_damage: '🗼',
  net_worth: '🏆',
  last_hits: '🎯',
  level: '📊',
};

export default function Records() {
  const { seasonId } = useSeason();
  const [records, setRecords] = useState({});
  const [fbStats, setFbStats] = useState([]);
  const [comebacks, setComebacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('records');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPersonalRecords(seasonId).catch(() => ({ records: {} })),
      getFirstBloodStats(seasonId).catch(() => ({ stats: [] })),
      getComebackMatches(seasonId).catch(() => ({ matches: [] })),
    ]).then(([recData, fbData, cbData]) => {
      setRecords(recData?.records || {});
      setFbStats(fbData?.stats || []);
      setComebacks(cbData?.matches || []);
    }).finally(() => setLoading(false));
  }, [seasonId]);

  const tabs = [
    { key: 'records', label: '🏆 Hall of Records' },
    { key: 'firstblood', label: '🩸 First Blood' },
    { key: 'comebacks', label: '⚡ Greatest Comebacks' },
  ];

  const cardStyle = {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 10,
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  };

  return (
    <div>
      <h1 className="page-title">Records</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem',
              background: tab === t.key ? '#4ade80' : '#1e293b',
              color: tab === t.key ? '#0f172a' : '#94a3b8',
              border: `1px solid ${tab === t.key ? '#4ade80' : '#334155'}`,
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading records...</div>
      ) : tab === 'records' ? (
        <div>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            All-time best single-game performances across all inhouse matches.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {RECORD_ORDER.map(key => {
              const rec = records[key];
              if (!rec) return null;
              return (
                <div key={key} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {RECORD_ICONS[key]} {rec.label}
                      </div>
                      <div style={{ color: '#f8fafc', fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>
                        {fmtNum(rec.value, key)}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, borderTop: '1px solid #334155', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Link
                      to={`/player/${rec.account_id}`}
                      style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }}
                    >
                      {rec.persona_name}
                    </Link>
                    <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                      {formatHeroName(rec.hero_name)} &bull;{' '}
                      <Link to={`/match/${rec.match_id}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                        Match #{rec.match_id}
                      </Link>
                      {' '}&bull; {fmtDuration(rec.duration)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === 'firstblood' ? (
        <div>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Who draws first blood most often. Minimum 5 games.
          </p>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="col-player">Player</th>
                  <th className="col-stat">FB Count</th>
                  <th className="col-stat">Games</th>
                  <th className="col-stat">FB Rate</th>
                </tr>
              </thead>
              <tbody>
                {fbStats.map((row, i) => (
                  <tr key={row.account_id}>
                    <td style={{ color: i < 3 ? '#f8fafc' : '#64748b', fontWeight: i < 3 ? 700 : 400 }}>
                      {i === 0 ? '🩸' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`}
                    </td>
                    <td>
                      <Link to={`/player/${row.account_id}`} style={{ color: '#4ade80', textDecoration: 'none' }}>
                        {row.display_name}
                      </Link>
                    </td>
                    <td style={{ color: '#f87171', fontWeight: 600 }}>{row.fb_count}</td>
                    <td style={{ color: '#94a3b8' }}>{row.games}</td>
                    <td style={{ color: '#fbbf24' }}>{row.fb_rate}%</td>
                  </tr>
                ))}
                {fbStats.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>No data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Matches where a team overcame a 5,000+ gold deficit to win. Sorted by comeback size.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {comebacks.map(match => (
              <div key={match.match_id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                      background: match.comeback_team === 'radiant' ? '#166534' : '#7f1d1d',
                      color: match.comeback_team === 'radiant' ? '#4ade80' : '#f87171',
                    }}>
                      {match.comeback_team === 'radiant' ? '🟢 Radiant' : '🔴 Dire'} Comeback
                    </div>
                    <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '1rem' }}>
                      +{match.max_deficit.toLocaleString()}g overcome
                    </div>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                    {fmtDuration(match.duration)} &bull;{' '}
                    <Link to={`/match/${match.match_id}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                      Match #{match.match_id}
                    </Link>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '2rem', marginTop: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#4ade80', fontSize: '0.75rem', marginBottom: 3 }}>Radiant {match.radiant_win ? '🏆' : ''}</div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                      {match.radiant_players.join(', ') || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: 3 }}>Dire {!match.radiant_win ? '🏆' : ''}</div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                      {match.dire_players.join(', ') || '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {comebacks.length === 0 && (
              <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>
                No major comebacks recorded yet (requires parsed replays with gold lead data)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
