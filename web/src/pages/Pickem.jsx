import React, { useEffect, useState } from 'react';
import {
  getActivePickemSeason, getPickemLeaderboard, getMyPickemPicks, submitPickemPick,
} from '../api';

export default function Pickem() {
  const [season, setSeason] = useState(null);
  const [board, setBoard] = useState([]);
  const [myPicks, setMyPicks] = useState([]);
  const [error, setError] = useState(null);
  const [paywall, setPaywall] = useState(false);
  const [matchRef, setMatchRef] = useState('');
  const [winner, setWinner] = useState('radiant');
  // Round-8: optional side-bet dimensions. Empty string = skip dim.
  const [firstBlood, setFirstBlood] = useState('');
  const [totalKillsBucket, setTotalKillsBucket] = useState('');
  const [durationTier, setDurationTier] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getActivePickemSeason().then(d => setSeason(d.season || d)).catch(() => {});
    getPickemLeaderboard()
      .then(d => setBoard(d.leaderboard || d.rows || []))
      .catch(() => {});
    getMyPickemPicks()
      .then(d => setMyPicks(d.picks || []))
      .catch(err => { if (err.status !== 401) setError(err.message); });
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null); setPaywall(false); setSubmitting(true);
    try {
      const out = await submitPickemPick(matchRef.trim(), winner, {
        pickedFirstBlood: firstBlood || null,
        pickedTotalKillsBucket: totalKillsBucket || null,
        pickedDurationTier: durationTier || null,
      });
      setMyPicks(p => [out.pick, ...p.filter(x => x.match_ref !== out.pick.match_ref)]);
      setMatchRef('');
      setFirstBlood(''); setTotalKillsBucket(''); setDurationTier('');
    } catch (err) {
      if (err.paywall) setPaywall(true);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <h2>Pickem {season ? `— ${season.label}` : ''}</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Predict winners of upcoming inhouse matches. Pro members can enter picks;
        free members can view the leaderboard.
      </p>

      {paywall && (
        <div style={{
          background: 'rgba(245,158,11,.1)', border: '1px solid var(--amber)',
          padding: 12, borderRadius: 8, marginBottom: 16,
        }}>
          Pickem entry requires Pro membership. <a href="/pricing">Upgrade →</a>
        </div>
      )}

      <h3>Submit a pick</h3>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={matchRef} onChange={e => setMatchRef(e.target.value)}
            placeholder="Match ref (e.g. lobby-id)" required
            style={{ flex: 1, padding: 6 }}
          />
          <select value={winner} onChange={e => setWinner(e.target.value)}
                  title="Winner pick (10 pts if correct)">
            <option value="radiant">Radiant wins</option>
            <option value="dire">Dire wins</option>
          </select>
          <button type="submit" disabled={submitting}>Submit</button>
        </div>
        {/* Round-8: optional side bets — each correct prediction is worth +5 pts. */}
        <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Side bets (optional, +5 each):</span>
          <select value={firstBlood} onChange={e => setFirstBlood(e.target.value)}
                  title="Which team draws first blood?">
            <option value="">First blood…</option>
            <option value="radiant">Radiant FB</option>
            <option value="dire">Dire FB</option>
          </select>
          <select value={totalKillsBucket} onChange={e => setTotalKillsBucket(e.target.value)}
                  title="Total kills across both teams">
            <option value="">Total kills…</option>
            <option value="under">Under 50</option>
            <option value="over">50 or more</option>
          </select>
          <select value={durationTier} onChange={e => setDurationTier(e.target.value)}
                  title="Match duration tier">
            <option value="">Duration…</option>
            <option value="short">Short (&lt;30 min)</option>
            <option value="medium">Medium (30–45 min)</option>
            <option value="long">Long (&gt;45 min)</option>
          </select>
        </div>
      </form>
      {error && !paywall && <div style={{ color: 'crimson' }}>{error}</div>}

      <h3>Your picks</h3>
      {myPicks.length === 0 ? <p>No picks yet.</p> : (
        <ul>
          {myPicks.map(p => {
            const sidePts = (p.points_first_blood || 0)
                          + (p.points_total_kills || 0)
                          + (p.points_duration_tier || 0);
            const sideBets = [
              p.picked_first_blood && `FB:${p.picked_first_blood}`,
              p.picked_total_kills_bucket && `Kills:${p.picked_total_kills_bucket}`,
              p.picked_duration_tier && `Dur:${p.picked_duration_tier}`,
            ].filter(Boolean).join(', ');
            return (
              <li key={`${p.match_ref}`}>
                {p.match_ref} — picked <b>{p.picked_winner}</b>
                {sideBets && <span style={{ color: 'var(--text-muted)' }}> ({sideBets})</span>}
                {p.points_awarded != null && ` · +${(p.points_awarded || 0) + sidePts} pts`}
              </li>
            );
          })}
        </ul>
      )}

      <h3>Leaderboard</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th align="left">Rank</th><th align="left">Account</th><th align="right">Points</th></tr></thead>
        <tbody>
          {board.map((r, i) => (
            <tr key={r.account_id}>
              <td>{i + 1}</td>
              <td>{r.account_id}</td>
              <td align="right">{r.points || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
