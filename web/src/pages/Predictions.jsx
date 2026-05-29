import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getPredictions, getPredictionAccuracy, savePrediction, getSeasons, getLeaderboard,
         getOpenPredictionWindows, submitMatchPick, getMyPredictions, getPredictionLeaderboard } from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';

// Task #449 — Match Pick game subpage. Free, signed-in-only winner pick on
// any open inhouse match. The list polls every 15s while visible so a
// freshly-locked lobby disappears, a newly opened one appears, and "X picks
// so far" stays close to live.
function MatchPickTab() {
  const { steamUser } = useSteamAuth() || {};
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyMatchId, setBusyMatchId] = useState(null);
  const [error, setError] = useState(null);
  const [mine, setMine] = useState(null);

  const refresh = React.useCallback(() => {
    getOpenPredictionWindows()
      .then(d => setWindows(d.open || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    if (steamUser?.accountId) {
      getMyPredictions().then(setMine).catch(() => {});
    }
  }, [steamUser?.accountId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const pick = async (matchId, side) => {
    setBusyMatchId(matchId);
    setError(null);
    try {
      await submitMatchPick(matchId, side);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyMatchId(null);
    }
  };

  const stats = mine?.stats || null;

  return (
    <div>
      {/* Personal stats strip — only when signed in and has stats. */}
      {stats && stats.total > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <Stat label="Total Predictions" value={stats.total} />
          <Stat label="Correct" value={stats.correct_count} color="var(--accent-green)" />
          <Stat label="Accuracy" value={`${stats.accuracy}%`} color={stats.accuracy >= 50 ? 'var(--accent-green)' : 'var(--accent-red)'} />
          <Stat label="Current Streak" value={stats.current_streak} color={stats.current_streak >= 3 ? 'var(--amber, #f59e0b)' : 'var(--text-primary)'} />
          <Stat label="Best Streak" value={stats.best_streak} color="var(--brass, #c5a975)" />
        </div>
      )}

      {!steamUser?.accountId && (
        <div className="stat-card" style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>Sign in with Steam</strong> to make predictions on open matches and track your streak.
          </p>
        </div>
      )}

      {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="loading">Loading open matches…</div>
      ) : windows.length === 0 ? (
        <div className="empty-state">
          <p>No open inhouse matches right now. Check back when the next lobby locks in!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {windows.map(w => {
            const total = w.total_picks || 0;
            const pctR = total > 0 ? Math.round((w.radiant_picks / total) * 100) : 50;
            const pctD = 100 - pctR;
            const locked = w.locked;
            const isInMatch = w.in_match;
            const myPick = w.my_pick;
            const disabled = locked || isInMatch || !steamUser?.accountId || busyMatchId === w.match_id;
            return (
              <div key={w.match_id} className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      Match <Link to={`/match/${w.match_id}`} style={{ color: 'var(--accent, #c5a975)' }}>{w.match_id}</Link>
                      {w.lobby_name && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>· {w.lobby_name}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Opened {timeAgo(w.opened_at)} · {total} prediction{total === 1 ? '' : 's'} so far
                    </div>
                  </div>
                  {locked
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-red)', textTransform: 'uppercase' }}>🔒 Locked</span>
                    : isInMatch
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber, #f59e0b)' }}>You're in this match</span>
                      : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-green)', textTransform: 'uppercase' }}>● Open</span>}
                </div>

                {total > 0 && (
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 10, background: 'var(--bg-hover)' }}
                       aria-label={`${pctR}% picked Radiant, ${pctD}% picked Dire`}>
                    <div style={{ width: `${pctR}%`, background: '#4ade80' }} />
                    <div style={{ width: `${pctD}%`, background: '#ef4444' }} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    aria-pressed={myPick === 'radiant'}
                    aria-label={`Pick Radiant for match ${w.match_id}`}
                    onClick={() => pick(w.match_id, 'radiant')}
                    disabled={disabled}
                    style={{
                      flex: 1, minWidth: 160, padding: '12px 16px', borderRadius: 8,
                      border: `2px solid ${myPick === 'radiant' ? '#4ade80' : 'var(--border)'}`,
                      background: myPick === 'radiant' ? 'rgba(74,222,128,0.18)' : 'var(--bg-input)',
                      color: 'var(--text-primary)', fontWeight: 700, fontSize: 14,
                      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled && myPick !== 'radiant' ? 0.6 : 1,
                    }}
                  >
                    🟢 Radiant {total > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>{pctR}% ({w.radiant_picks})</span>}
                    {myPick === 'radiant' && ' ✓'}
                  </button>
                  <button
                    type="button"
                    aria-pressed={myPick === 'dire'}
                    aria-label={`Pick Dire for match ${w.match_id}`}
                    onClick={() => pick(w.match_id, 'dire')}
                    disabled={disabled}
                    style={{
                      flex: 1, minWidth: 160, padding: '12px 16px', borderRadius: 8,
                      border: `2px solid ${myPick === 'dire' ? '#ef4444' : 'var(--border)'}`,
                      background: myPick === 'dire' ? 'rgba(239,68,68,0.18)' : 'var(--bg-input)',
                      color: 'var(--text-primary)', fontWeight: 700, fontSize: 14,
                      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled && myPick !== 'dire' ? 0.6 : 1,
                    }}
                  >
                    🔴 Dire {total > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>{pctD}% ({w.dire_picks})</span>}
                    {myPick === 'dire' && ' ✓'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mine?.history?.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Your recent predictions
          </h3>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead><tr><th>Match</th><th>Picked</th><th>Winner</th><th>Result</th><th>When</th></tr></thead>
              <tbody>
                {mine.history.slice(0, 15).map((h, i) => (
                  <tr key={i}>
                    <td><Link to={`/match/${h.match_id}`} style={{ color: 'var(--accent, #c5a975)' }}>{h.match_id}</Link></td>
                    <td style={{ textTransform: 'capitalize' }}>{h.predicted_winner}</td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>{h.winner_team || (h.resolved ? '—' : 'pending')}</td>
                    <td style={{ fontWeight: 700, color: !h.resolved ? 'var(--text-muted)' : h.correct ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {!h.resolved ? '⏳ pending' : h.correct ? '✓ correct' : '✗ wrong'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{timeAgo(h.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function MatchPickLeaderboards() {
  const [type, setType] = useState('accuracy');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    getPredictionLeaderboard(type).then(setData).catch(() => setData({ rows: [] })).finally(() => setLoading(false));
  }, [type]);
  const tabs = [
    { key: 'accuracy', label: '🎯 All-Time Accuracy (min 25)' },
    { key: 'streak',   label: '🔥 Current Streak' },
    { key: 'season',   label: '📅 This Season' },
  ];
  return (
    <div>
      <div role="radiogroup" aria-label="Leaderboard type" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map(t => (
          <button
            type="button" key={t.key}
            role="radio" aria-checked={type === t.key}
            onClick={() => setType(t.key)}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${type === t.key ? 'var(--accent, #c5a975)' : 'var(--border)'}`,
              background: type === t.key ? 'var(--accent-muted, rgba(197,169,117,0.18))' : 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          >{t.label}</button>
        ))}
      </div>
      {loading ? (
        <div className="loading">Loading…</div>
      ) : !data?.rows?.length ? (
        <div className="empty-state"><p>No rows yet for this leaderboard.</p></div>
      ) : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Predictor</th>
                {type === 'streak'
                  ? <><th className="col-stat">Current Streak</th><th className="col-stat">Total</th></>
                  : <><th className="col-stat">Accuracy</th><th className="col-stat">Correct</th><th className="col-stat">Total</th></>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.account_id}>
                  <td>{i === 0 ? '🏆' : i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    <Link to={`/profile/${r.account_id}`} style={{ color: 'var(--text-primary)' }}>{r.display_name || `Player ${r.account_id}`}</Link>
                  </td>
                  {type === 'streak' ? (
                    <>
                      <td className="col-stat" style={{ fontWeight: 700, color: 'var(--amber, #f59e0b)' }}>🔥 {r.current_streak}</td>
                      <td className="col-stat" style={{ color: 'var(--text-muted)' }}>{r.total}</td>
                    </>
                  ) : (
                    <>
                      <td className="col-stat" style={{ fontWeight: 700, color: r.accuracy >= 60 ? 'var(--accent-green)' : 'var(--text-primary)' }}>{r.accuracy}%</td>
                      <td className="col-stat">{r.correct_count}</td>
                      <td className="col-stat" style={{ color: 'var(--text-muted)' }}>{r.total}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = 'var(--text-primary)' }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 110, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '—';
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SearchableSelect({ players, value, onChange, placeholder = 'Search player…' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = players.find(p => p.player_id?.toString() === value?.toString());
  const displayName = p => p.nickname || p.display_name || p.player_id;

  const filtered = players.filter(p =>
    displayName(p).toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (p) => {
    onChange(p.player_id?.toString());
    setQuery('');
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label="Select player"
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-input)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 6, padding: '6px 10px', cursor: 'pointer', userSelect: 'none',
          minHeight: 34,
        }}
      >
        <span style={{ flex: 1, fontSize: 14, color: selected ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {selected ? displayName(selected) : <span style={{ color: 'var(--text-muted)' }}>Select player…</span>}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear selection"
            onClick={handleClear}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClear(e); } }}
            style={{ color: 'var(--text-muted)', fontSize: 12, padding: '0 2px', cursor: 'pointer' }}
            title="Clear"
          >✕</span>
        )}
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 6, marginTop: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          maxHeight: 220, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px',
                fontSize: 13, boxSizing: 'border-box',
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)' }}>No players found</div>
            ) : filtered.map(p => (
              <button
                type="button"
                key={p.player_id}
                onClick={() => handleSelect(p)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 0, font: 'inherit',
                  padding: '7px 12px', fontSize: 14, cursor: 'pointer',
                  background: p.player_id?.toString() === value?.toString() ? 'var(--accent-muted, rgba(99,102,241,0.15))' : 'transparent',
                  color: p.player_id?.toString() === value?.toString() ? 'var(--accent)' : 'var(--text-primary)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = p.player_id?.toString() === value?.toString() ? 'var(--accent-muted, rgba(99,102,241,0.15))' : 'transparent'}
              >
                {displayName(p)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Predictions() {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [players, setPlayers] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [accuracy, setAccuracy] = useState(null);
  const [actualTop5, setActualTop5] = useState([]);
  const [myName, setMyName] = useState('');
  const [myPicks, setMyPicks] = useState(['', '', '', '', '']);
  const [loading, setLoading] = useState(true);
  const [accuracyLoading, setAccuracyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  // Task #449 — `picks` (winner-pick game) is now the default tab. Existing
  // season-Top-5 prediction game lives under `submit` / `all` / `accuracy`.
  const [tab, setTab] = useState('picks');

  useEffect(() => {
    Promise.all([getSeasons(), getLeaderboard(100)])
      .then(([s, lb]) => {
        setSeasons(s.seasons || []);
        const sorted = (lb.leaderboard || []).slice().sort((a, b) => {
          const nameA = (a.nickname || a.display_name || '').toLowerCase();
          const nameB = (b.nickname || b.display_name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        setPlayers(sorted);
        const active = (s.seasons || []).find(x => x.is_active) || (s.seasons || [])[0];
        if (active) setSelectedSeason(active.id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSeason) return;
    setLoading(true);
    getPredictions(selectedSeason)
      .then(d => setPredictions(d.predictions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSeason]);

  useEffect(() => {
    if (!selectedSeason || tab !== 'accuracy') return;
    setAccuracyLoading(true);
    getPredictionAccuracy(selectedSeason)
      .then(d => {
        setAccuracy(d.accuracy || []);
        setActualTop5(d.actual || []);
      })
      .catch(() => { setAccuracy([]); setActualTop5([]); })
      .finally(() => setAccuracyLoading(false));
  }, [selectedSeason, tab]);

  const submit = async () => {
    if (!myName.trim() || myPicks.some(p => !p)) {
      setError('Please enter your name and select a player for each rank.');
      return;
    }
    if (new Set(myPicks).size < myPicks.length) {
      setError('Each rank must have a different player — remove duplicates before submitting.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await savePrediction(selectedSeason, myName.trim(), myPicks.map((id, i) => ({ rank: i + 1, player_id: id })));
      setSaved(true);
      const d = await getPredictions(selectedSeason);
      setPredictions(d.predictions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const playerName = (id) => {
    const p = players.find(x => x.player_id?.toString() === id?.toString());
    return p ? (p.nickname || p.display_name || id) : id;
  };

  const activeSeason = seasons.find(s => s.id === selectedSeason);

  if (loading && seasons.length === 0) return <div className="loading">Loading…</div>;

  const tabStyle = (active) => ({
    padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 400,
    background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
    color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
    borderRadius: 0, marginBottom: -1,
  });

  const medalColor = (rank) => rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : 'var(--bg-hover)';

  return (
    <div>
      <h1 className="page-title">Season Predictions</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Predict who will finish in the top 5 at the end of the season. Compare your prediction to the actual standings when the season ends.
      </p>

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Season:</label>
        <select
          value={selectedSeason || ''}
          onChange={e => setSelectedSeason(parseInt(e.target.value))}
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}
        >
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (active)' : ''}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{predictions.length} prediction{predictions.length !== 1 ? 's' : ''} submitted</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('picks')} style={tabStyle(tab === 'picks')}>🎯 Match Picks</button>
        <button onClick={() => setTab('leaderboards')} style={tabStyle(tab === 'leaderboards')}>🏆 Leaderboards</button>
        <button onClick={() => setTab('submit')} style={tabStyle(tab === 'submit')}>📝 Top-5 Prediction</button>
        <button onClick={() => setTab('all')} style={tabStyle(tab === 'all')}>👥 Top-5 Submissions ({predictions.length})</button>
        <button onClick={() => setTab('accuracy')} style={tabStyle(tab === 'accuracy')}>📊 Top-5 Accuracy</button>
      </div>

      {tab === 'picks' && <MatchPickTab />}
      {tab === 'leaderboards' && <MatchPickLeaderboards />}

      {tab === 'submit' && (
        <div className="stat-card" style={{ marginBottom: '2rem', maxWidth: 480 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Submit Your Prediction</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Pick who you think will finish in the top 5 by the end of the season.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Your name / nickname</label>
            <input
              type="text"
              value={myName}
              onChange={e => setMyName(e.target.value)}
              placeholder="Enter your name…"
              style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', boxSizing: 'border-box' }}
            />
          </div>
          {[1, 2, 3, 4, 5].map(rank => (
            <div key={rank} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: medalColor(rank), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                {rank}
              </div>
              <SearchableSelect
                players={players}
                value={myPicks[rank - 1]}
                onChange={val => setMyPicks(p => { const n = [...p]; n[rank - 1] = val; return n; })}
              />
            </div>
          ))}
          {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 8 }}>{error}</div>}
          {saved && <div style={{ color: 'var(--accent-green)', fontSize: 13, marginTop: 8 }}>✓ Prediction saved! Check the other tabs to see how others have predicted.</div>}
          <button className="btn btn-primary" onClick={submit} disabled={saving} style={{ marginTop: 12 }}>
            {saving ? 'Saving…' : 'Submit Prediction'}
          </button>
        </div>
      )}

      {tab === 'all' && (
        <>
          {predictions.length > 0 ? (
            <div className="scoreboard-wrapper">
              <table className="scoreboard">
                <thead>
                  <tr>
                    <th>Predictor</th>
                    <th>1st</th>
                    <th>2nd</th>
                    <th>3rd</th>
                    <th>4th</th>
                    <th>5th</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((pred, i) => {
                    const picks = Array.isArray(pred.predictions) ? pred.predictions : [];
                    const sorted = [...picks].sort((a, b) => a.rank - b.rank);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{pred.predictor_name}</td>
                        {[0, 1, 2, 3, 4].map(r => (
                          <td key={r} style={{ fontSize: 13 }}>
                            {sorted[r] ? playerName(sorted[r].player_id) : '—'}
                          </td>
                        ))}
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {pred.created_at ? new Date(pred.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state"><p>No predictions yet for this season. Be the first!</p></div>
          )}
        </>
      )}

      {tab === 'accuracy' && (
        <>
          {accuracyLoading ? (
            <div className="loading">Calculating accuracy…</div>
          ) : (
            <>
              {actualTop5.length > 0 ? (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Actual Top 5 {activeSeason?.is_active ? '(Current Standings)' : '(Final Standings)'}
                  </h3>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                    {actualTop5.map(p => (
                      <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: medalColor(p.rank), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                          {p.rank}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.display_name || `Player ${p.player_id}`}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.mmr} MMR</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state" style={{ marginBottom: 20 }}>
                  <p>No MMR data found for this season yet. Play some matches first!</p>
                </div>
              )}

              {accuracy && accuracy.length > 0 ? (
                <>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Prediction Accuracy Leaderboard
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Scoring: exact rank match = 3 pts · correct player in top 5 wrong rank = 1 pt
                  </p>
                  <div className="scoreboard-wrapper">
                    <table className="scoreboard">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th className="col-player">Predictor</th>
                          <th className="col-stat" title="Total score (exact=3pts, in-top-5=1pt)">Score</th>
                          <th className="col-stat" title="Exact rank matches">Exact</th>
                          <th className="col-stat" title="Correct players in top 5 (any rank)">In Top 5</th>
                          <th>Picks (1st → 5th)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accuracy.map((pred, i) => {
                          const picks = Array.isArray(pred.predictions) ? [...pred.predictions].sort((a, b) => a.rank - b.rank) : [];
                          const actualIds = new Set(actualTop5.map(a => a.player_id));
                          const byRank = {};
                          actualTop5.forEach(a => { byRank[a.rank] = a.player_id; });
                          return (
                            <tr key={i}>
                              <td style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: i === 0 ? 700 : 400 }}>
                                {i === 0 ? '🏆' : i + 1}
                              </td>
                              <td className="col-player" style={{ fontWeight: 600 }}>{pred.predictor_name}</td>
                              <td className="col-stat" style={{ fontWeight: 700, color: pred.score >= 10 ? '#4ade80' : pred.score >= 5 ? '#fbbf24' : 'var(--text-primary)', fontSize: 16 }}>
                                {pred.score}
                              </td>
                              <td className="col-stat" style={{ color: '#4ade80' }}>{pred.exactMatches}</td>
                              <td className="col-stat" style={{ color: 'var(--text-muted)' }}>{pred.inTop5}/5</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {picks.map(pk => {
                                    const pid = pk.player_id?.toString();
                                    const isExact = byRank[pk.rank] === pid;
                                    const isInTop5 = !isExact && actualIds.has(pid);
                                    const bg = isExact ? 'rgba(74,222,128,0.15)' : isInTop5 ? 'rgba(251,191,36,0.15)' : 'rgba(248,113,113,0.1)';
                                    const border = isExact ? '#4ade80' : isInTop5 ? '#fbbf24' : '#555';
                                    return (
                                      <span key={pk.rank} style={{ fontSize: 11, background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '2px 8px' }}>
                                        #{pk.rank} {playerName(pid)}
                                        {isExact && ' ✓'}
                                        {isInTop5 && ' ~'}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                    ✓ = exact rank match (3 pts) · ~ = correct player wrong rank (1 pt) · no mark = incorrect
                  </p>
                </>
              ) : actualTop5.length > 0 ? (
                <div className="empty-state"><p>No predictions to score yet for this season.</p></div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
