import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPudgeStats } from '../api';
import { useSeason } from '../context/SeasonContext';

const PUDGE_IMG = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png';

function fmt(v, dec = 0) {
  if (v == null || v === '') return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return dec > 0 ? n.toFixed(dec) : Math.round(n).toLocaleString();
}

function pct(hits, attempts) {
  const h = parseFloat(hits), a = parseFloat(attempts);
  if (!a || isNaN(h) || isNaN(a)) return '—';
  return ((h / a) * 100).toFixed(1) + '%';
}

function kda(kills, deaths, assists) {
  const k = parseFloat(kills) || 0;
  const d = parseFloat(deaths) || 1;
  const a = parseFloat(assists) || 0;
  return ((k + a) / d).toFixed(2);
}

const SORT_COLS = [
  { key: 'pudge_games',               label: 'Games',             title: 'Total games played as Pudge' },
  { key: 'wins',                      label: 'Win %',             title: 'Win rate as Pudge' },
  { key: 'hook_accuracy',             label: 'Hook Acc',          title: 'Overall hook hit accuracy (hits / genuine attempts)' },
  { key: 'total_hook_hits',           label: 'Hook Hits',         title: 'Total hero hooks landed (across all games with tracked data)' },
  { key: 'avg_hook_hits_per_game',    label: 'Hits/Game',         title: 'Average hook hits per game (games with hook data)' },
  { key: 'avg_hook_attempts_per_game',label: 'Att/Game',          title: 'Average genuine hook attempts per game' },
  { key: 'kda',                       label: 'KDA',               title: 'Kill / Death / Assist ratio as Pudge' },
  { key: 'avg_gpm',                   label: 'Avg GPM',           title: 'Average gold per minute as Pudge' },
];

export default function PudgeStats() {
  const { selectedSeasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('total_hook_hits');
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => {
    setLoading(true);
    getPudgeStats(selectedSeasonId)
      .then(d => { setPlayers(d.players || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [selectedSeasonId]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  }

  const sorted = [...players].sort((a, b) => {
    let av, bv;
    if (sortKey === 'wins') {
      av = parseFloat(a.pudge_games) > 0 ? parseFloat(a.wins) / parseFloat(a.pudge_games) : 0;
      bv = parseFloat(b.pudge_games) > 0 ? parseFloat(b.wins) / parseFloat(b.pudge_games) : 0;
    } else if (sortKey === 'kda') {
      av = (parseFloat(a.avg_kills) + parseFloat(a.avg_assists)) / Math.max(parseFloat(a.avg_deaths), 1);
      bv = (parseFloat(b.avg_kills) + parseFloat(b.avg_assists)) / Math.max(parseFloat(b.avg_deaths), 1);
    } else {
      av = parseFloat(a[sortKey]) || 0;
      bv = parseFloat(b[sortKey]) || 0;
    }
    return sortDir * (bv - av);
  });

  const SortTh = ({ col }) => (
    <th
      className="col-stat"
      title={col.title}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => handleSort(col.key)}
    >
      {col.label}
      {sortKey === col.key ? (sortDir === -1 ? ' ▼' : ' ▲') : ''}
    </th>
  );

  const hasHookData = players.some(p => parseInt(p.games_with_hooks) > 0);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
        <img
          src={PUDGE_IMG}
          alt="Pudge"
          style={{ height: 80, borderRadius: 8, objectFit: 'cover', border: '2px solid #a78bfa' }}
          onError={e => { e.target.style.display = 'none'; }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#a78bfa' }}>🪝 Pudge Stats</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Hook accuracy and Pudge-specific stats. Only games with replay data include hook tracking.
          </p>
        </div>
      </div>

      {loading && <div className="loading">Loading pudge stats…</div>}
      {error && <div className="error">Error: {error}</div>}

      {!loading && !error && players.length === 0 && (
        <div className="empty-state">
          <p>No Pudge games recorded yet.</p>
        </div>
      )}

      {!loading && !error && players.length > 0 && (
        <>
          {!hasHookData && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16, color: 'var(--text-muted)', fontSize: 13,
            }}>
              Hook accuracy data requires replays uploaded with the latest version of the parser.
              Re-upload recent Pudge games to populate hook stats.
            </div>
          )}

          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player">Player</th>
                  <SortTh col={SORT_COLS[0]} />
                  <SortTh col={SORT_COLS[1]} />
                  <th className="col-stat" title="Average K / D / A as Pudge">Avg KDA</th>
                  <SortTh col={SORT_COLS[6]} />
                  <SortTh col={SORT_COLS[7]} />
                  {hasHookData && (
                    <>
                      <th className="col-stat" title="Games with hook tracking data">Hook Games</th>
                      <SortTh col={SORT_COLS[3]} />
                      <SortTh col={SORT_COLS[2]} />
                      <SortTh col={SORT_COLS[4]} />
                      <SortTh col={SORT_COLS[5]} />
                    </>
                  )}
                  <th className="col-stat" title="Total rampages on Pudge">Rampages</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const winRate = parseFloat(p.pudge_games) > 0
                    ? ((parseFloat(p.wins) / parseFloat(p.pudge_games)) * 100).toFixed(0) + '%'
                    : '—';
                  const avgKda = kda(p.avg_kills, p.avg_deaths, p.avg_assists);
                  const avgKdaLabel = `${fmt(p.avg_kills, 1)} / ${fmt(p.avg_deaths, 1)} / ${fmt(p.avg_assists, 1)}`;
                  const hookGames = parseInt(p.games_with_hooks) || 0;

                  return (
                    <tr key={i}>
                      <td className="col-player">
                        <Link to={`/player/${p.account_id}`} style={{ fontWeight: 600 }}>
                          {p.display_name}
                        </Link>
                      </td>
                      <td className="col-stat">{fmt(p.pudge_games)}</td>
                      <td className="col-stat">{winRate}</td>
                      <td className="col-stat" title={avgKdaLabel}>{avgKda}</td>
                      <td className="col-stat">{avgKdaLabel}</td>
                      <td className="col-stat">{fmt(p.avg_gpm)}</td>
                      {hasHookData && (
                        <>
                          <td className="col-stat">{hookGames > 0 ? hookGames : '—'}</td>
                          <td className="col-stat">{hookGames > 0 ? fmt(p.total_hook_hits) : '—'}</td>
                          <td className="col-stat" style={{
                            fontWeight: hookGames > 0 ? 700 : 400,
                            color: hookGames > 0 ? (parseFloat(p.hook_accuracy) >= 50 ? '#4ade80' : parseFloat(p.hook_accuracy) >= 30 ? '#facc15' : '#f87171') : 'inherit',
                          }}>
                            {hookGames > 0 ? (p.hook_accuracy != null ? p.hook_accuracy + '%' : '—') : '—'}
                          </td>
                          <td className="col-stat">{hookGames > 0 ? fmt(p.avg_hook_hits_per_game, 1) : '—'}</td>
                          <td className="col-stat">{hookGames > 0 ? fmt(p.avg_hook_attempts_per_game, 1) : '—'}</td>
                        </>
                      )}
                      <td className="col-stat">{parseInt(p.total_rampages) > 0 ? '☠️ ' + p.total_rampages : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasHookData && (
            <div style={{ marginTop: 32 }}>
              <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>How hook accuracy is calculated</h2>
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '14px 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7,
              }}>
                <p style={{ margin: '0 0 8px' }}>
                  <strong style={{ color: 'var(--text)' }}>Hook Hits</strong> — hooks that connected with an enemy hero.
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  <strong style={{ color: 'var(--text)' }}>Genuine Attempts</strong> — all hook casts where an enemy hero was within 1500 range of Pudge at cast time.
                  Farm hooks (no nearby enemy) are excluded so they don't inflate attempt counts.
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: 'var(--text)' }}>Accuracy</strong> = Hits ÷ Genuine Attempts.
                  Hook data is only available for games where a replay file was uploaded.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
