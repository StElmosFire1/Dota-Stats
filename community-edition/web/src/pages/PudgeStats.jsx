import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPudgeStats, getPudgeGames } from '../api';
import { useSeason } from '../context/SeasonContext';

const PUDGE_IMG = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png';

function fmt(v, dec = 0) {
  if (v == null || v === '') return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return dec > 0 ? n.toFixed(dec) : Math.round(n).toLocaleString();
}

function kda(kills, deaths, assists) {
  const k = parseFloat(kills) || 0;
  const d = parseFloat(deaths) || 1;
  const a = parseFloat(assists) || 0;
  return ((k + a) / d).toFixed(2);
}

function accColor(acc) {
  const v = parseFloat(acc);
  if (isNaN(v)) return 'inherit';
  if (v >= 50) return '#4ade80';
  if (v >= 30) return '#facc15';
  return '#f87171';
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const SUMMARY_COLS = [
  { key: 'pudge_games',                label: 'Games',      title: 'Total games played as Pudge' },
  { key: 'wins',                       label: 'Win %',      title: 'Win rate as Pudge' },
  { key: 'kda',                        label: 'KDA',        title: 'Kill / Death / Assist ratio' },
  { key: 'avg_gpm',                    label: 'Avg GPM',    title: 'Average gold per minute' },
  { key: 'total_hook_hits',            label: 'Hook Hits',  title: 'Total genuine hook hits (games with replay data)' },
  { key: 'total_hook_attempts',        label: 'Attempts',   title: 'Total genuine hook attempts (games with replay data)' },
  { key: 'hook_accuracy',              label: 'Accuracy',   title: 'Hook hits ÷ genuine attempts' },
  { key: 'avg_hook_hits_per_game',     label: 'Hits/Game',  title: 'Avg hook hits per game (hook-tracked games only)' },
  { key: 'avg_hook_attempts_per_game', label: 'Att/Game',   title: 'Avg genuine attempts per game (hook-tracked games only)' },
];

const GAME_COLS = [
  { key: 'start_time',    label: 'Date',      title: 'Match date' },
  { key: 'display_name',  label: 'Player',    title: 'Player name' },
  { key: 'match_id',      label: 'Match',     title: 'Match ID' },
  { key: 'won',           label: 'Result',    title: 'Win or Loss' },
  { key: 'kills',         label: 'K',         title: 'Kills' },
  { key: 'deaths',        label: 'D',         title: 'Deaths' },
  { key: 'assists',       label: 'A',         title: 'Assists' },
  { key: 'gpm',           label: 'GPM',       title: 'Gold per minute' },
  { key: 'hook_attempts', label: 'Attempts',  title: 'Genuine hook attempts' },
  { key: 'hook_hits',     label: 'Hits',      title: 'Hook hits' },
  { key: 'accuracy',      label: 'Accuracy',  title: 'Hits ÷ genuine attempts' },
];

function SummaryTab({ players }) {
  const [sortKey, setSortKey] = useState('total_hook_hits');
  const [sortDir, setSortDir] = useState(-1);
  const hasHookData = players.some(p => parseInt(p.games_with_hooks) > 0);

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

  const Th = ({ col }) => (
    <th className="col-stat" title={col.title}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => handleSort(col.key)}>
      {col.label}{sortKey === col.key ? (sortDir === -1 ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <>
      {!hasHookData && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: 'var(--text-muted)', fontSize: 13 }}>
          Hook accuracy data requires replays uploaded with the latest parser. Re-upload recent Pudge games to populate hook stats.
        </div>
      )}
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <Th col={SUMMARY_COLS[0]} />
              <Th col={SUMMARY_COLS[1]} />
              <th className="col-stat" title="Avg K / D / A">Avg K/D/A</th>
              <Th col={SUMMARY_COLS[2]} />
              <Th col={SUMMARY_COLS[3]} />
              {hasHookData && (
                <>
                  <th className="col-stat" title="Games with hook tracking data">Hook Games</th>
                  <Th col={SUMMARY_COLS[4]} />
                  <Th col={SUMMARY_COLS[5]} />
                  <Th col={SUMMARY_COLS[6]} />
                  <Th col={SUMMARY_COLS[7]} />
                  <Th col={SUMMARY_COLS[8]} />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const winRate = parseFloat(p.pudge_games) > 0
                ? ((parseFloat(p.wins) / parseFloat(p.pudge_games)) * 100).toFixed(0) + '%' : '—';
              const avgKdaLabel = `${fmt(p.avg_kills, 1)} / ${fmt(p.avg_deaths, 1)} / ${fmt(p.avg_assists, 1)}`;
              const hookGames = parseInt(p.games_with_hooks) || 0;
              return (
                <tr key={i}>
                  <td className="col-player">
                    <Link to={`/player/${p.account_id}`} style={{ fontWeight: 600 }}>{p.display_name}</Link>
                  </td>
                  <td className="col-stat">{fmt(p.pudge_games)}</td>
                  <td className="col-stat">{winRate}</td>
                  <td className="col-stat">{avgKdaLabel}</td>
                  <td className="col-stat">{kda(p.avg_kills, p.avg_deaths, p.avg_assists)}</td>
                  <td className="col-stat">{fmt(p.avg_gpm)}</td>
                  {hasHookData && (
                    <>
                      <td className="col-stat">{hookGames > 0 ? hookGames : '—'}</td>
                      <td className="col-stat">{hookGames > 0 ? fmt(p.total_hook_hits) : '—'}</td>
                      <td className="col-stat">{hookGames > 0 ? fmt(p.total_hook_attempts) : '—'}</td>
                      <td className="col-stat" style={{ fontWeight: hookGames > 0 ? 700 : 400, color: hookGames > 0 ? accColor(p.hook_accuracy) : 'inherit' }}>
                        {hookGames > 0 ? (p.hook_accuracy != null ? p.hook_accuracy + '%' : '—') : '—'}
                      </td>
                      <td className="col-stat">{hookGames > 0 ? fmt(p.avg_hook_hits_per_game, 1) : '—'}</td>
                      <td className="col-stat">{hookGames > 0 ? fmt(p.avg_hook_attempts_per_game, 1) : '—'}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GamesTab({ games }) {
  const [sortKey, setSortKey] = useState('start_time');
  const [sortDir, setSortDir] = useState(-1);
  const [filterPlayer, setFilterPlayer] = useState('');

  const players = [...new Set(games.map(g => g.display_name))].sort();
  const filtered = filterPlayer ? games.filter(g => g.display_name === filterPlayer) : games;

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'display_name') return sortDir * a.display_name.localeCompare(b.display_name);
    if (sortKey === 'won') return sortDir * ((a.won ? 1 : 0) - (b.won ? 1 : 0));
    if (sortKey === 'start_time') return sortDir * (new Date(a.start_time) - new Date(b.start_time));
    return sortDir * ((parseFloat(a[sortKey]) || 0) - (parseFloat(b[sortKey]) || 0));
  });

  const Th = ({ col }) => (
    <th className="col-stat" title={col.title}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => handleSort(col.key)}>
      {col.label}{sortKey === col.key ? (sortDir === -1 ? ' ▼' : ' ▲') : ''}
    </th>
  );

  if (games.length === 0) {
    return (
      <div className="empty-state">
        <p>No per-game hook data yet. Upload replays for Pudge games to populate this tab.</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Filter player:</label>
        <select
          value={filterPlayer}
          onChange={e => setFilterPlayer(e.target.value)}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '4px 10px', fontSize: 13 }}>
          <option value="">All players</option>
          {players.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sorted.length} game{sorted.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <Th col={GAME_COLS[0]} />
              <Th col={GAME_COLS[1]} />
              <Th col={GAME_COLS[2]} />
              <Th col={GAME_COLS[3]} />
              <Th col={GAME_COLS[4]} />
              <Th col={GAME_COLS[5]} />
              <Th col={GAME_COLS[6]} />
              <Th col={GAME_COLS[7]} />
              <Th col={GAME_COLS[8]} />
              <Th col={GAME_COLS[9]} />
              <Th col={GAME_COLS[10]} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((g, i) => (
              <tr key={i}>
                <td className="col-stat">{formatDate(g.start_time)}</td>
                <td className="col-player">
                  <Link to={`/player/${g.account_id}`} style={{ fontWeight: 600 }}>{g.display_name}</Link>
                </td>
                <td className="col-stat">
                  <Link to={`/match/${g.match_id}`} style={{ color: 'var(--accent)', fontSize: 12 }}>
                    {g.match_id}
                  </Link>
                </td>
                <td className="col-stat" style={{ color: g.won ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                  {g.won ? 'W' : 'L'}
                </td>
                <td className="col-stat">{g.kills}</td>
                <td className="col-stat">{g.deaths}</td>
                <td className="col-stat">{g.assists}</td>
                <td className="col-stat">{fmt(g.gpm)}</td>
                <td className="col-stat">{fmt(g.hook_attempts)}</td>
                <td className="col-stat">{fmt(g.hook_hits)}</td>
                <td className="col-stat" style={{ fontWeight: 700, color: accColor(g.accuracy) }}>
                  {g.accuracy != null ? g.accuracy + '%' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function PudgeStats() {
  const { selectedSeasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('summary');

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getPudgeStats(selectedSeasonId),
      getPudgeGames(selectedSeasonId),
    ])
      .then(([pd, gd]) => {
        setPlayers(pd.players || []);
        setGames(gd.games || []);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [selectedSeasonId]);

  const tabStyle = (t) => ({
    padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
    background: tab === t ? 'var(--accent)' : 'var(--bg-card)',
    color: tab === t ? '#fff' : 'var(--text-muted)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
        <img src={PUDGE_IMG} alt="Pudge"
          style={{ height: 80, borderRadius: 8, objectFit: 'cover', border: '2px solid #a78bfa' }}
          onError={e => { e.target.style.display = 'none'; }} />
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#a78bfa' }}>🪝 Pudge Stats</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Hook accuracy and Pudge-specific stats. Only games with replay data include hook tracking.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={tabStyle('summary')} onClick={() => setTab('summary')}>📊 Player Summary</button>
        <button style={tabStyle('games')} onClick={() => setTab('games')}>🎯 Per-Game Hook Attempts</button>
      </div>

      {loading && <div className="loading">Loading pudge stats…</div>}
      {error && <div className="error">Error: {error}</div>}

      {!loading && !error && players.length === 0 && (
        <div className="empty-state"><p>No Pudge games recorded yet.</p></div>
      )}

      {!loading && !error && players.length > 0 && (
        <>
          {tab === 'summary' && <SummaryTab players={players} />}
          {tab === 'games' && <GamesTab games={games} />}

          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>How hook accuracy is calculated</h2>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text)' }}>Hook Hits</strong> — hooks that connected with an enemy hero.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text)' }}>Genuine Attempts</strong> — every hook cast is tracked via unit order events.
                A cast is only excluded if it hit a non-hero (creep or neutral) <em>and</em> no enemy hero was anywhere along the hook's full flight path.
                Complete misses always count. Farm hooks (where no enemy was anywhere near the hook's trajectory) are the only casts excluded.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                <strong style={{ color: 'var(--text)' }}>Accuracy</strong> = Hits ÷ Genuine Attempts.
              </p>
              <p style={{ margin: 0 }}>
                Hook data is only available for games where a replay file was uploaded and parsed.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
