import React, { useState, useEffect } from 'react';
import { getPredictions, getPredictionAccuracy, savePrediction, getSeasons, getLeaderboard } from '../api';

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
  const [tab, setTab] = useState('submit');

  useEffect(() => {
    Promise.all([getSeasons(), getLeaderboard(100)])
      .then(([s, lb]) => {
        setSeasons(s.seasons || []);
        setPlayers(lb.leaderboard || []);
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        <button onClick={() => setTab('submit')} style={tabStyle(tab === 'submit')}>📝 Submit Prediction</button>
        <button onClick={() => setTab('all')} style={tabStyle(tab === 'all')}>👥 All Predictions ({predictions.length})</button>
        <button onClick={() => setTab('accuracy')} style={tabStyle(tab === 'accuracy')}>🏆 Accuracy Scores</button>
      </div>

      {tab === 'submit' && (
        <div className="stat-card" style={{ marginBottom: '2rem', maxWidth: 480 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Submit Your Prediction</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Pick who you think will finish in the top 5 by the end of the season.
            {process.env.NODE_ENV !== 'production' && ' A Discord notification is sent when predictions are submitted (if configured).'}
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Your name / nickname</label>
            <input
              type="text"
              value={myName}
              onChange={e => setMyName(e.target.value)}
              placeholder="Enter your name…"
              style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}
            />
          </div>
          {[1, 2, 3, 4, 5].map(rank => (
            <div key={rank} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: medalColor(rank), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                {rank}
              </div>
              <select
                value={myPicks[rank - 1]}
                onChange={e => setMyPicks(p => { const n = [...p]; n[rank - 1] = e.target.value; return n; })}
                style={{ flex: 1, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}
              >
                <option value="">Select player…</option>
                {players
                  .filter(p => !myPicks.includes(p.player_id?.toString()) || myPicks[rank - 1] === p.player_id?.toString())
                  .map(p => (
                    <option key={p.player_id} value={p.player_id}>
                      {p.nickname || p.display_name || p.player_id}
                    </option>
                  ))
                }
              </select>
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
