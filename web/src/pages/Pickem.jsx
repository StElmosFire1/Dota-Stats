import React, { useEffect, useState } from 'react';
import {
  getActivePickemSeason, getPickemLeaderboard, getMyPickemPicks, submitPickemPick,
  placeMatchWager, getMatchWagers,
} from '../api';

export default function Pickem() {
  const [season, setSeason] = useState(null);
  const [board, setBoard] = useState([]);
  const [myPicks, setMyPicks] = useState([]);
  const [error, setError] = useState(null);
  const [matchRef, setMatchRef] = useState('');
  const [winner, setWinner] = useState('radiant');
  // Side-bet dimensions. Empty string = skip dim.
  const [firstBlood, setFirstBlood] = useState('');
  const [firstTower, setFirstTower] = useState('');
  const [totalKillsBucket, setTotalKillsBucket] = useState('');
  const [durationTier, setDurationTier] = useState('');
  // Task #316 — prop bets v2 (per reviewer): MVP side, comeback >10k, first Rosh team.
  const [mvpTeam, setMvpTeam] = useState('');
  const [comeback, setComeback] = useState('');
  const [firstRosh, setFirstRosh] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Task #316 — coin wager panel state.
  const [wagerRef, setWagerRef] = useState('');
  const [wagerSide, setWagerSide] = useState('radiant');
  const [wagerStake, setWagerStake] = useState(25);
  const [wagerInfo, setWagerInfo] = useState(null);
  const [wagerBusy, setWagerBusy] = useState(false);
  const [wagerFlash, setWagerFlash] = useState(null);

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
    setError(null); setSubmitting(true);
    try {
      const out = await submitPickemPick(matchRef.trim(), winner, {
        pickedFirstBlood: firstBlood || null,
        pickedTotalKillsBucket: totalKillsBucket || null,
        pickedDurationTier: durationTier || null,
        pickedFirstTower: firstTower || null,
        pickedMvpTeam: mvpTeam || null,
        pickedComeback: comeback || null,
        pickedFirstRosh: firstRosh || null,
      });
      setMyPicks(p => [out.pick, ...p.filter(x => x.match_ref !== out.pick.match_ref)]);
      setMatchRef('');
      setFirstBlood(''); setTotalKillsBucket('');
      setDurationTier(''); setFirstTower('');
      setMvpTeam(''); setComeback(''); setFirstRosh('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function loadWagerInfo(ref) {
    if (!ref) return;
    try {
      const d = await getMatchWagers(ref.trim());
      setWagerInfo(d);
    } catch (err) {
      setWagerInfo(null);
    }
  }

  async function onWager(e) {
    e.preventDefault();
    setWagerFlash(null); setWagerBusy(true);
    try {
      const d = await placeMatchWager(wagerRef.trim(), wagerSide, Number(wagerStake));
      setWagerFlash({ ok: true, msg: `Locked in ${d.wager.stake} 🪙 on ${d.wager.side}. Winners split the losing pool proportionally to stake.` });
      loadWagerInfo(wagerRef);
    } catch (err) {
      const msg = err.message || 'Wager failed.';
      const insufficient = /insufficient/i.test(msg);
      setWagerFlash({
        ok: false,
        msg: insufficient ? `${msg} Top up your balance.` : msg,
        topUp: insufficient,
      });
    } finally {
      setWagerBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <h2>Pickem {season ? `— ${season.label}` : ''}</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Predict winners of upcoming inhouse matches. Free for all signed-in players —
        correct winner picks grant 10 🪙, side bets are worth +5 pts each.
      </p>

      <h3>Submit a pick</h3>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={matchRef} onChange={e => setMatchRef(e.target.value)}
            placeholder="Match ref (e.g. lobby-id)" required
            style={{ flex: 1, padding: 6 }}
            aria-label="Match reference"
          />
          <select value={winner} onChange={e => setWinner(e.target.value)}
                  title="Winner pick (10 pts if correct)"
                  aria-label="Pick the winning team">
            <option value="radiant">Radiant wins</option>
            <option value="dire">Dire wins</option>
          </select>
          <button type="submit" disabled={submitting}>Submit</button>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Side bets (optional, +5 each):</span>
          <select value={firstBlood} onChange={e => setFirstBlood(e.target.value)}
                  aria-label="First blood side bet">
            <option value="">First blood…</option>
            <option value="radiant">Radiant FB</option>
            <option value="dire">Dire FB</option>
          </select>
          {/* Task #316 — prop bets v2: first tower. */}
          <select value={firstTower} onChange={e => setFirstTower(e.target.value)}
                  aria-label="First tower side bet">
            <option value="">First tower…</option>
            <option value="radiant">Radiant FT</option>
            <option value="dire">Dire FT</option>
          </select>
          <select value={totalKillsBucket} onChange={e => setTotalKillsBucket(e.target.value)}
                  aria-label="Total kills side bet">
            <option value="">Total kills…</option>
            <option value="under">Under 50</option>
            <option value="over">50 or more</option>
          </select>
          <select value={durationTier} onChange={e => setDurationTier(e.target.value)}
                  aria-label="Duration tier side bet">
            <option value="">Duration…</option>
            <option value="short">Short (&lt;30 min)</option>
            <option value="medium">Medium (30–45 min)</option>
            <option value="long">Long (&gt;45 min)</option>
          </select>
          {/* Task #316 — prop bets v2 (reviewer): MVP team / comeback / first Rosh. */}
          <select value={mvpTeam} onChange={e => setMvpTeam(e.target.value)}
                  aria-label="MVP side bet">
            <option value="">MVP side…</option>
            <option value="radiant">Radiant MVP</option>
            <option value="dire">Dire MVP</option>
          </select>
          <select value={comeback} onChange={e => setComeback(e.target.value)}
                  aria-label="Comeback side bet">
            <option value="">Comeback &gt;10k…</option>
            <option value="yes">Yes — winner came back</option>
            <option value="no">No — wire-to-wire</option>
          </select>
          <select value={firstRosh} onChange={e => setFirstRosh(e.target.value)}
                  aria-label="First Roshan side bet">
            <option value="">First Rosh…</option>
            <option value="radiant">Radiant first Rosh</option>
            <option value="dire">Dire first Rosh</option>
            <option value="none">No Rosh taken</option>
          </select>
        </div>
      </form>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {/* Task #316 — coin wager panel (25/50/100 🪙, 2× payout on win). */}
      <section
        aria-label="Match coin wager"
        style={{
          border: '1px solid var(--border)', borderRadius: 10,
          padding: 12, marginBottom: 24,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Wager coins on a match (pool-split payout)</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: -4, fontSize: 13 }}>
          Stake 25/50/100 🪙. Winners get their stake back plus a proportional share
          of the losing pool. One-sided pools refund the stake.
        </p>
        <form onSubmit={onWager} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            value={wagerRef}
            onChange={e => setWagerRef(e.target.value)}
            onBlur={() => loadWagerInfo(wagerRef)}
            placeholder="Match ref"
            required
            aria-label="Match reference for wager"
            style={{ flex: 1, minWidth: 160, padding: 6 }}
          />
          <select value={wagerSide} onChange={e => setWagerSide(e.target.value)}
                  aria-label="Wager side">
            <option value="radiant">Radiant</option>
            <option value="dire">Dire</option>
          </select>
          <select value={wagerStake} onChange={e => setWagerStake(Number(e.target.value))}
                  aria-label="Wager stake">
            <option value={25}>25 🪙</option>
            <option value={50}>50 🪙</option>
            <option value={100}>100 🪙</option>
          </select>
          <button type="submit" disabled={wagerBusy}>
            {wagerBusy ? 'Placing…' : 'Place wager'}
          </button>
        </form>
        {wagerFlash && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 13,
            background: wagerFlash.ok ? 'rgba(34,197,94,.1)' : 'rgba(244,67,54,.1)',
            border: `1px solid ${wagerFlash.ok ? '#16a34a55' : '#b91c1c55'}`,
            color: wagerFlash.ok ? '#86efac' : '#fca5a5',
          }}>
            {wagerFlash.msg}
            {wagerFlash.topUp ? (
              <> <a href="/coins/buy" style={{ color: '#fbbf24', fontWeight: 600 }}>Buy coins →</a></>
            ) : null}
          </div>
        )}
        {wagerInfo && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
            Pool — Radiant: <b>{wagerInfo.totals.radiant || 0}</b> 🪙
            · Dire: <b>{wagerInfo.totals.dire || 0}</b> 🪙
            · {wagerInfo.count} wager{wagerInfo.count === 1 ? '' : 's'}.
            {wagerInfo.mine && (
              <span> Your stake: {wagerInfo.mine.stake} 🪙 on {wagerInfo.mine.side}.</span>
            )}
          </div>
        )}
      </section>

      <h3>Your picks</h3>
      {myPicks.length === 0 ? <p>No picks yet.</p> : (
        <ul>
          {myPicks.map(p => {
            const sidePts = (p.points_first_blood || 0)
                          + (p.points_total_kills || 0)
                          + (p.points_duration_tier || 0)
                          + (p.points_first_tower || 0)
                          + (p.points_mvp_team || 0)
                          + (p.points_comeback || 0)
                          + (p.points_first_rosh || 0);
            const sideBets = [
              p.picked_first_blood && `FB:${p.picked_first_blood}`,
              p.picked_first_tower && `FT:${p.picked_first_tower}`,
              p.picked_total_kills_bucket && `Kills:${p.picked_total_kills_bucket}`,
              p.picked_duration_tier && `Dur:${p.picked_duration_tier}`,
              p.picked_mvp_team && `MVP:${p.picked_mvp_team}`,
              p.picked_comeback && `Cmbk:${p.picked_comeback}`,
              p.picked_first_rosh && `Rosh:${p.picked_first_rosh}`,
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

      <h3>Tipster leaderboard</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th align="left">Rank</th><th align="left">Tipster</th><th align="right">Points</th></tr></thead>
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
