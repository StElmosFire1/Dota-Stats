import React, { useState, useEffect } from 'react';
import { getPredictions, savePrediction, getSeasons, getLeaderboard } from '../api';

export default function Predictions() {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [players, setPlayers] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [myName, setMyName] = useState('');
  const [myPicks, setMyPicks] = useState(['', '', '', '', '']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

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

  if (loading && seasons.length === 0) return <div className="loading">Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Season Predictions</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Predict who will finish in the top 5 at the end of the season. See how your prediction stacks up against the others!
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
      </div>

      <div className="stat-card" style={{ marginBottom: '2rem', maxWidth: 480 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Submit Your Prediction</div>
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
        {[1,2,3,4,5].map(rank => (
          <div key={rank} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {rank}
            </div>
            <select
              value={myPicks[rank-1]}
              onChange={e => setMyPicks(p => { const n = [...p]; n[rank-1] = e.target.value; return n; })}
              style={{ flex: 1, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}
            >
              <option value="">Select player…</option>
              {players
                .filter(p => !myPicks.includes(p.player_id?.toString()) || myPicks[rank-1] === p.player_id?.toString())
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
        {saved && <div style={{ color: 'var(--accent-green)', fontSize: 13, marginTop: 8 }}>Prediction saved!</div>}
        <button className="btn btn-primary" onClick={submit} disabled={saving} style={{ marginTop: 12 }}>
          {saving ? 'Saving…' : 'Submit Prediction'}
        </button>
      </div>

      {predictions.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>All Predictions ({predictions.length})</h2>
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
                      {[0,1,2,3,4].map(r => (
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
        </div>
      )}
      {predictions.length === 0 && !loading && (
        <div className="empty-state"><p>No predictions yet for this season. Be the first!</p></div>
      )}
    </div>
  );
}
