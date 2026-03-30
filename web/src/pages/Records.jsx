import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPersonalRecords, getFirstBloodStats, getComebackMatches, getMultiKillStats, getSeasonPlayerRecords } from '../api';
import { useSeason } from '../context/SeasonContext';
import { formatHeroName } from '../utils/heroes';

const KILL_TYPES = [
  { key: 'rampages',    label: 'Rampages',    emoji: '☠️',  color: '#e53935' },
  { key: 'ultra_kills', label: 'Ultra Kills',  emoji: '⚡',  color: '#8e24aa' },
  { key: 'triple_kills',label: 'Triple Kills', emoji: '🔥',  color: '#ef6c00' },
  { key: 'double_kills',label: 'Double Kills', emoji: '⚔️',  color: '#1976d2' },
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
  kills: '⚔️', deaths: '💀', assists: '🤝', gpm: '💰', xpm: '⭐',
  hero_damage: '🔥', hero_healing: '💚', tower_damage: '🗼',
  net_worth: '🏆', last_hits: '🎯', level: '📊',
};

function MultiKillsTab({ rows, sortKey, setSortKey }) {
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'total') return Number(b.total_multikills) - Number(a.total_multikills);
    return Number(b[sortKey]) - Number(a[sortKey]) || Number(b.total_multikills) - Number(a.total_multikills);
  });
  const topRampage = sorted.find(r => Number(r.rampages) > 0);
  const Th = ({ col, label, title }) => (
    <th className="col-stat" title={title}
      style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === col ? 'var(--accent-blue)' : '' }}
      onClick={() => setSortKey(col)}>
      {label} {sortKey === col ? '▼' : ''}
    </th>
  );
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {KILL_TYPES.map(k => (
          <div key={k.key} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-card)', border: `1px solid ${k.color}44`,
            borderRadius: 10, padding: '6px 12px',
          }}>
            <span style={{ fontSize: 18 }}>{k.emoji}</span>
            <div style={{ fontWeight: 600, fontSize: 13, color: k.color }}>{k.label}</div>
          </div>
        ))}
      </div>
      {topRampage && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(229,57,53,0.15) 0%, rgba(142,36,170,0.1) 100%)',
          border: '1px solid rgba(229,57,53,0.4)', borderRadius: 12,
          padding: '14px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <span style={{ fontSize: 32 }}>☠️</span>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Rampage King</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              <Link to={`/player/${topRampage.account_id}`} style={{ color: '#e53935', textDecoration: 'none' }}>{topRampage.display_name}</Link>
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{topRampage.rampages} rampage{topRampage.rampages > 1 ? 's' : ''} in {topRampage.games_played} games</div>
          </div>
        </div>
      )}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>No multi-kills recorded yet</div>
      ) : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-player">Player</th>
                <Th col="rampages"     label="☠️ Rampages"  title="5 hero kills within 18s" />
                <Th col="ultra_kills"  label="⚡ Ultras"     title="4 hero kills within 18s" />
                <Th col="triple_kills" label="🔥 Triples"    title="3 hero kills within 18s" />
                <Th col="double_kills" label="⚔️ Doubles"    title="2 hero kills within 18s" />
                <Th col="total"        label="Total"         title="All multi-kills combined" />
                <th className="col-stat">Games</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.account_id} className={i < 3 ? `rank-${i + 1}` : ''}>
                  <td className="col-rank">{i + 1}</td>
                  <td className="col-player">
                    <Link to={`/player/${r.account_id}`} className="player-link">{r.display_name}</Link>
                  </td>
                  <td className="col-stat"><KillBadge count={r.rampages}     color="#e53935" emoji="☠️" /></td>
                  <td className="col-stat"><KillBadge count={r.ultra_kills}  color="#8e24aa" emoji="⚡" /></td>
                  <td className="col-stat"><KillBadge count={r.triple_kills} color="#ef6c00" emoji="🔥" /></td>
                  <td className="col-stat"><KillBadge count={r.double_kills} color="#1976d2" emoji="⚔️" /></td>
                  <td className="col-stat" style={{ fontWeight: 700 }}>{r.total_multikills}</td>
                  <td className="col-stat" style={{ color: '#64748b' }}>{r.games_played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Records() {
  const { seasonId } = useSeason();
  const [records, setRecords] = useState({});
  const [fbStats, setFbStats] = useState([]);
  const [comebacks, setComebacks] = useState([]);
  const [multiKills, setMultiKills] = useState([]);
  const [mkSortKey, setMkSortKey] = useState('rampages');
  const [seasonRecs, setSeasonRecs] = useState({ positive: {}, negative: {} });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('records');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPersonalRecords(seasonId).catch(() => ({ records: {} })),
      getFirstBloodStats(seasonId).catch(() => ({ stats: [] })),
      getComebackMatches(seasonId).catch(() => ({ matches: [] })),
      getMultiKillStats(seasonId).catch(() => ({ rows: [] })),
      getSeasonPlayerRecords(seasonId).catch(() => ({ positive: {}, negative: {} })),
    ]).then(([recData, fbData, cbData, mkData, srData]) => {
      setRecords(recData?.records || {});
      setFbStats(fbData?.stats || []);
      setComebacks(cbData?.matches || []);
      setMultiKills(mkData?.rows || []);
      setSeasonRecs(srData || { positive: {}, negative: {} });
    }).finally(() => setLoading(false));
  }, [seasonId]);

  const tabs = [
    { key: 'records', label: '🏆 Hall of Records' },
    { key: 'season', label: '📊 Season Records' },
    { key: 'firstblood', label: '🩸 First Blood' },
    { key: 'comebacks', label: '⚡ Greatest Comebacks' },
    { key: 'multikills', label: '☠️ Multi-Kills' },
  ];

  const cardStyle = {
    background: '#1e293b', border: '1px solid #334155',
    borderRadius: 10, padding: '1rem 1.25rem',
    display: 'flex', flexDirection: 'column', gap: 4,
  };

  return (
    <div>
      <h1 className="page-title">Records</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem',
            background: tab === t.key ? '#4ade80' : '#1e293b',
            color: tab === t.key ? '#0f172a' : '#94a3b8',
            border: `1px solid ${tab === t.key ? '#4ade80' : '#334155'}`,
            fontWeight: tab === t.key ? 700 : 400,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="loading">Loading records...</div>}

      {!loading && tab === 'records' && (
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
                    <Link to={`/player/${rec.account_id}`} style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }}>
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
      )}

      {!loading && tab === 'season' && (() => {
        const { positive = {}, negative = {} } = seasonRecs;
        const posCards = [
          { key: 'most_wins',          emoji: '🏆', label: 'Most Wins',          field: 'wins',         fmt: v => `${v}W` },
          { key: 'most_kills',         emoji: '⚔️', label: 'Most Kills',         field: 'total_kills',  fmt: v => v.toLocaleString() },
          { key: 'most_assists',       emoji: '🤝', label: 'Most Assists',        field: 'total_assists', fmt: v => v.toLocaleString() },
          { key: 'most_damage',        emoji: '🔥', label: 'Most Hero Damage',    field: 'total_damage', fmt: v => `${Math.round(v/1000)}k` },
          { key: 'most_healing',       emoji: '💚', label: 'Most Healing',        field: 'total_healing',fmt: v => `${Math.round(v/1000)}k` },
          { key: 'best_win_rate',      emoji: '📈', label: 'Best Win Rate (5+ games)', field: 'win_rate', fmt: v => `${v}%` },
          { key: 'longest_win_streak', emoji: '🔥', label: 'Longest Win Streak',  field: 'max_streak',   fmt: v => `${v}W` },
          { key: 'most_games',         emoji: '🎮', label: 'Most Games Played',   field: 'games_played', fmt: v => `${v} games` },
        ];
        const negCards = [
          { key: 'most_deaths',         emoji: '💀', label: 'Most Deaths',          field: 'total_deaths', fmt: v => v.toLocaleString() },
          { key: 'most_losses',         emoji: '😞', label: 'Most Losses',          field: 'losses',       fmt: v => `${v}L` },
          { key: 'worst_win_rate',      emoji: '📉', label: 'Worst Win Rate (5+ games)', field: 'win_rate', fmt: v => `${v}%` },
          { key: 'longest_loss_streak', emoji: '❌', label: 'Longest Loss Streak',  field: 'max_streak',   fmt: v => `${v}L` },
        ];

        const RecCard = ({ rec, card, color }) => {
          if (!rec) return (
            <div style={{ ...cardStyle, opacity: 0.4 }}>
              <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.emoji} {card.label}</div>
              <div style={{ color: '#334155', fontSize: '1.4rem', fontWeight: 700 }}>—</div>
            </div>
          );
          const val = rec[card.field];
          const gp = rec.games_played ? ` (${rec.games_played}g)` : '';
          return (
            <div style={{ ...cardStyle, borderColor: `${color}44` }}>
              <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.emoji} {card.label}</div>
              <div style={{ color, fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>
                {val != null ? card.fmt(parseInt(val)) : '—'}
              </div>
              <div style={{ marginTop: 8, borderTop: '1px solid #334155', paddingTop: 8 }}>
                <Link to={`/player/${rec.account_id}`} style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }}>
                  {rec.display_name}
                </Link>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{gp}</span>
              </div>
            </div>
          );
        };

        return (
          <div>
            <h2 style={{ color: '#4ade80', marginBottom: '0.5rem', fontSize: '1.1rem' }}>🏅 Positive Records</h2>
            <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.85rem' }}>Aggregate season totals — most wins, kills, assists, damage, healing, and streaks.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              {posCards.map(c => <RecCard key={c.key} rec={positive[c.key]} card={c} color="#4ade80" />)}
            </div>
            <h2 style={{ color: '#f87171', marginBottom: '0.5rem', fontSize: '1.1rem' }}>💀 Negative Records</h2>
            <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.85rem' }}>Most deaths, most losses, worst win rate, and longest loss streak.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
              {negCards.map(c => <RecCard key={c.key} rec={negative[c.key]} card={c} color="#f87171" />)}
            </div>
          </div>
        );
      })()}

      {!loading && tab === 'firstblood' && (
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
      )}

      {!loading && tab === 'comebacks' && (
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
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{match.radiant_players.join(', ') || '—'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: 3 }}>Dire {!match.radiant_win ? '🏆' : ''}</div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{match.dire_players.join(', ') || '—'}</div>
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

      {!loading && tab === 'multikills' && (
        <MultiKillsTab rows={multiKills} sortKey={mkSortKey} setSortKey={setMkSortKey} />
      )}
    </div>
  );
}
