import React, { useEffect, useRef, useState } from 'react';
import {
  getActivePickemSeason, getPickemLeaderboard, getMyPickemPicks, submitPickemPick,
  placeMatchWager, getMatchWagers, getPickableLiveGames,
} from '../api';

function fmtGameTime(sec) {
  if (sec == null) return null;
  const n = Math.max(parseInt(sec, 10) || 0, 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Pickem() {
  const [season, setSeason] = useState(null);
  const [board, setBoard] = useState([]);
  const [myPicks, setMyPicks] = useState([]);
  const [error, setError] = useState(null);
  const [matchRef, setMatchRef] = useState('');
  const [winner, setWinner] = useState('radiant');
  const [firstBlood, setFirstBlood] = useState('');
  const [firstTower, setFirstTower] = useState('');
  const [totalKillsBucket, setTotalKillsBucket] = useState('');
  const [durationTier, setDurationTier] = useState('');
  const [mvpTeam, setMvpTeam] = useState('');
  const [comeback, setComeback] = useState('');
  const [firstRosh, setFirstRosh] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [wagerRef, setWagerRef] = useState('');
  const [wagerSide, setWagerSide] = useState('radiant');
  const [wagerStake, setWagerStake] = useState(25);
  const [wagerInfo, setWagerInfo] = useState(null);
  const [wagerBusy, setWagerBusy] = useState(false);
  const [wagerFlash, setWagerFlash] = useState(null);

  const [liveGames, setLiveGames] = useState([]);
  const matchRefInput = useRef(null);

  useEffect(() => {
    getActivePickemSeason().then(d => setSeason(d.season || d)).catch(() => {});
    getPickemLeaderboard()
      .then(d => setBoard(d.leaderboard || d.rows || []))
      .catch(() => {});
    getMyPickemPicks()
      .then(d => setMyPicks(d.picks || []))
      .catch(err => { if (err.status !== 401) setError(err.message); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => getPickableLiveGames()
      .then(d => { if (!cancelled) setLiveGames(Array.isArray(d.games) ? d.games : []); })
      .catch(() => { if (!cancelled) setLiveGames([]); });
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function pickThisMatch(ref) {
    setMatchRef(ref);
    setWinner('radiant');
    setError(null);
    if (matchRefInput.current) {
      matchRefInput.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      matchRefInput.current.focus();
    }
  }

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
    <div style={{ padding: '24px 16px', maxWidth: 960, margin: '0 auto' }}>

      {/* ── Editorial page header ── */}
      <header style={{ marginBottom: 32 }}>
        <div className="pb-eyebrow" style={{ marginBottom: 6 }}>
          Inhouse Pickem{season?.label ? ` · ${season.label}` : ''}
        </div>
        <h1 className="pb-page-title" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', marginBottom: 10 }}>
          Pick 'Em
        </h1>
        <p style={{ color: 'var(--pb-muted)', fontSize: 14, maxWidth: 600, lineHeight: 1.6 }}>
          Predict winners of upcoming inhouse matches. Free for all signed-in players —
          correct winner picks grant <span className="pb-num">10</span> 🪙,
          side bets are worth <span className="pb-num">+5</span> pts each.
        </p>
      </header>

      {/* ── Live now ── */}
      {liveGames.length > 0 && (
        <section
          aria-label="Live games you can pick"
          className="pb-card"
          style={{ padding: '16px 20px', marginBottom: 24 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: 4, background: '#ef4444', flexShrink: 0,
              display: 'inline-block', boxShadow: '0 0 0 3px rgba(239,68,68,.22)',
            }} />
            <span className="pb-section-title">Live now</span>
            <span style={{ color: 'var(--pb-faint)', fontSize: 12 }}>
              Pick before the match locks (under 5 min of game time)
            </span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {liveGames.map(g => {
              const gt = fmtGameTime(g.gameTime);
              const isForming = !g.started;
              const statusLabel = isForming ? 'Forming' : (gt ? `Live · ${gt}` : 'Live');
              return (
                <li key={g.matchRef} style={{
                  border: '1px solid var(--pb-line)',
                  borderRadius: 8, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  background: 'var(--pb-surface)',
                }}>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-serif)', fontSize: 15 }}>
                    {g.lobbyName || `Match ${g.matchRef}`}
                  </span>
                  <span style={{
                    fontSize: 11, padding: '2px 10px', borderRadius: 999,
                    fontFamily: 'var(--font-condensed)', fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: g.pickable
                      ? 'rgba(34,197,94,.13)'
                      : isForming
                        ? 'color-mix(in srgb, var(--pb-brass) 14%, transparent)'
                        : 'rgba(148,163,184,.14)',
                    color: g.pickable
                      ? 'var(--accent-green)'
                      : isForming
                        ? 'var(--pb-brass)'
                        : 'var(--pb-faint)',
                    border: `1px solid ${g.pickable ? '#16a34a44' : isForming ? 'color-mix(in srgb, var(--pb-brass) 30%, transparent)' : 'var(--pb-line)'}`,
                  }}>
                    {statusLabel}
                  </span>
                  <span style={{ marginLeft: 'auto' }}>
                    {g.pickable ? (
                      <button
                        type="button"
                        onClick={() => pickThisMatch(g.matchRef)}
                        style={{
                          padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                          background: 'var(--pb-brass)', color: 'var(--pb-bg)',
                          border: 'none', fontWeight: 700, fontSize: 13,
                          fontFamily: 'var(--font-condensed)', letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Pick this match
                      </button>
                    ) : (
                      <span style={{
                        fontSize: 12, color: 'var(--pb-faint)',
                        fontFamily: 'var(--font-condensed)', letterSpacing: '0.08em',
                      }} title="Past the 5-minute pickable window">
                        🔒 Locked
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Submit a pick ── */}
      <section
        aria-label="Submit a pick"
        className="pb-card"
        style={{ padding: '20px 24px', marginBottom: 24 }}
      >
        <div className="pb-section-title" style={{ marginBottom: 16 }}>Submit a pick</div>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              ref={matchRefInput}
              value={matchRef} onChange={e => setMatchRef(e.target.value)}
              placeholder="Match ref (e.g. lobby-id)" required
              aria-label="Match reference"
              style={{
                flex: '1 1 160px', padding: '8px 12px', borderRadius: 8,
                background: 'var(--pb-surface-2)',
                border: '1px solid var(--pb-line)',
                color: 'var(--pb-text)', fontSize: 14,
              }}
            />
            <select
              value={winner} onChange={e => setWinner(e.target.value)}
              title="Winner pick (10 pts if correct)"
              aria-label="Pick the winning team"
              style={{
                flex: '0 0 auto', padding: '8px 12px', borderRadius: 8,
                background: 'var(--pb-surface-2)',
                border: '1px solid var(--pb-line)',
                color: 'var(--pb-text)', fontSize: 14,
              }}
            >
              <option value="radiant">Radiant wins</option>
              <option value="dire">Dire wins</option>
            </select>
            <button
              type="submit" disabled={submitting}
              style={{
                padding: '8px 22px', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer',
                background: submitting ? 'var(--pb-surface-2)' : 'var(--pb-brass)',
                color: submitting ? 'var(--pb-faint)' : 'var(--pb-bg)',
                border: submitting ? '1px solid var(--pb-line)' : 'none',
                fontWeight: 700, fontSize: 13,
                fontFamily: 'var(--font-condensed)', letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>

          {/* Side bets row */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--pb-brass)', fontFamily: 'var(--font-condensed)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>
              Side bets <span style={{ color: 'var(--pb-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional · +5 pts each</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { value: firstBlood, onChange: e => setFirstBlood(e.target.value), label: 'First blood side bet', options: [['', 'First blood…'], ['radiant', 'Radiant FB'], ['dire', 'Dire FB']] },
                { value: firstTower, onChange: e => setFirstTower(e.target.value), label: 'First tower side bet', options: [['', 'First tower…'], ['radiant', 'Radiant FT'], ['dire', 'Dire FT']] },
                { value: totalKillsBucket, onChange: e => setTotalKillsBucket(e.target.value), label: 'Total kills side bet', options: [['', 'Total kills…'], ['under', 'Under 50'], ['over', '50 or more']] },
                { value: durationTier, onChange: e => setDurationTier(e.target.value), label: 'Duration tier side bet', options: [['', 'Duration…'], ['short', 'Short (<30 min)'], ['medium', 'Medium (30–45 min)'], ['long', 'Long (>45 min)']] },
                { value: mvpTeam, onChange: e => setMvpTeam(e.target.value), label: 'MVP side bet', options: [['', 'MVP side…'], ['radiant', 'Radiant MVP'], ['dire', 'Dire MVP']] },
                { value: comeback, onChange: e => setComeback(e.target.value), label: 'Comeback side bet', options: [['', 'Comeback >10k…'], ['yes', 'Yes — winner came back'], ['no', 'No — wire-to-wire']] },
                { value: firstRosh, onChange: e => setFirstRosh(e.target.value), label: 'First Roshan side bet', options: [['', 'First Rosh…'], ['radiant', 'Radiant first Rosh'], ['dire', 'Dire first Rosh'], ['none', 'No Rosh taken']] },
              ].map(({ value, onChange, label, options }) => (
                <select
                  key={label}
                  value={value} onChange={onChange}
                  aria-label={label}
                  style={{
                    flex: '1 1 120px', padding: '7px 10px', borderRadius: 8, fontSize: 13,
                    background: value ? 'color-mix(in srgb, var(--pb-brass) 12%, var(--pb-surface-2))' : 'var(--pb-surface-2)',
                    border: `1px solid ${value ? 'color-mix(in srgb, var(--pb-brass) 40%, transparent)' : 'var(--pb-line)'}`,
                    color: value ? 'var(--pb-text)' : 'var(--pb-faint)',
                  }}
                >
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ))}
            </div>
          </div>
        </form>

        {error && (
          <div style={{
            marginTop: 12, padding: '8px 14px', borderRadius: 8, fontSize: 13,
            background: 'rgba(244,67,54,.1)', border: '1px solid rgba(244,67,54,.3)',
            color: 'var(--accent-red)',
          }}>{error}</div>
        )}
      </section>

      {/* ── Wager coins ── */}
      <section
        aria-label="Match coin wager"
        className="pb-card"
        style={{ padding: '20px 24px', marginBottom: 24 }}
      >
        <div className="pb-section-title" style={{ marginBottom: 4 }}>Wager coins on a match</div>
        <p style={{ color: 'var(--pb-muted)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          Stake <span className="pb-num">25</span>/<span className="pb-num">50</span>/<span className="pb-num">100</span> 🪙.
          Winners get their stake back plus a proportional share of the losing pool.
          One-sided pools refund the stake.
        </p>
        <form onSubmit={onWager} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ fontSize: 11, color: 'var(--pb-brass)', fontFamily: 'var(--font-condensed)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Match ref
            </label>
            <input
              value={wagerRef}
              onChange={e => setWagerRef(e.target.value)}
              onBlur={() => loadWagerInfo(wagerRef)}
              placeholder="e.g. lobby-id"
              required
              aria-label="Match reference for wager"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                background: 'var(--pb-surface-2)', border: '1px solid var(--pb-line)',
                color: 'var(--pb-text)', fontSize: 14,
              }}
            />
          </div>
          <div style={{ flex: '0 1 120px' }}>
            <label style={{ fontSize: 11, color: 'var(--pb-brass)', fontFamily: 'var(--font-condensed)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Side
            </label>
            <select
              value={wagerSide} onChange={e => setWagerSide(e.target.value)}
              aria-label="Wager side"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                background: 'var(--pb-surface-2)', border: '1px solid var(--pb-line)',
                color: 'var(--pb-text)', fontSize: 14,
              }}
            >
              <option value="radiant">Radiant</option>
              <option value="dire">Dire</option>
            </select>
          </div>
          <div style={{ flex: '0 1 110px' }}>
            <label style={{ fontSize: 11, color: 'var(--pb-brass)', fontFamily: 'var(--font-condensed)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Stake
            </label>
            <select
              value={wagerStake} onChange={e => setWagerStake(Number(e.target.value))}
              aria-label="Wager stake"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                background: 'var(--pb-surface-2)', border: '1px solid var(--pb-line)',
                color: 'var(--pb-text)', fontSize: 14,
              }}
            >
              <option value={25}>25 🪙</option>
              <option value={50}>50 🪙</option>
              <option value={100}>100 🪙</option>
            </select>
          </div>
          <button
            type="submit" disabled={wagerBusy}
            style={{
              padding: '8px 22px', borderRadius: 8, cursor: wagerBusy ? 'not-allowed' : 'pointer',
              background: wagerBusy ? 'var(--pb-surface-2)' : 'var(--pb-brass)',
              color: wagerBusy ? 'var(--pb-faint)' : 'var(--pb-bg)',
              border: wagerBusy ? '1px solid var(--pb-line)' : 'none',
              fontWeight: 700, fontSize: 13,
              fontFamily: 'var(--font-condensed)', letterSpacing: '0.08em',
              textTransform: 'uppercase', alignSelf: 'flex-end',
            }}
          >
            {wagerBusy ? 'Placing…' : 'Place wager'}
          </button>
        </form>

        {wagerFlash && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: wagerFlash.ok ? 'rgba(34,197,94,.09)' : 'rgba(244,67,54,.09)',
            border: `1px solid ${wagerFlash.ok ? '#16a34a44' : 'rgba(244,67,54,.3)'}`,
            color: wagerFlash.ok ? 'var(--accent-green)' : 'var(--accent-red)',
            lineHeight: 1.5,
          }}>
            {wagerFlash.msg}
            {wagerFlash.topUp ? (
              <> <a href="/coins/buy" style={{ color: 'var(--pb-brass)', fontWeight: 600 }}>Buy coins →</a></>
            ) : null}
          </div>
        )}

        {wagerInfo && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: 'var(--pb-surface)', border: '1px solid var(--pb-line)',
            color: 'var(--pb-muted)', display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
            alignItems: 'center',
          }}>
            <span>Pool:</span>
            <span>
              Radiant <span className="pb-num" style={{ color: 'var(--radiant-color)', fontWeight: 700 }}>{wagerInfo.totals.radiant || 0}</span> 🪙
            </span>
            <span>
              Dire <span className="pb-num" style={{ color: 'var(--dire-color)', fontWeight: 700 }}>{wagerInfo.totals.dire || 0}</span> 🪙
            </span>
            <span style={{ color: 'var(--pb-faint)' }}>
              <span className="pb-num">{wagerInfo.count}</span> wager{wagerInfo.count === 1 ? '' : 's'}
            </span>
            {wagerInfo.mine && (
              <span style={{ marginLeft: 'auto' }}>
                Your stake: <span className="pb-num" style={{ fontWeight: 700, color: 'var(--pb-text)' }}>{wagerInfo.mine.stake}</span> 🪙 on {wagerInfo.mine.side}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Your picks ── */}
      <section
        aria-label="Your picks"
        className="pb-card"
        style={{ padding: '20px 24px', marginBottom: 24 }}
      >
        <div className="pb-section-title" style={{ marginBottom: 14 }}>Your picks</div>
        {myPicks.length === 0 ? (
          <p style={{ color: 'var(--pb-faint)', fontSize: 14 }}>No picks yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {myPicks.map((p, i) => {
              const sidePts = (p.points_first_blood || 0)
                + (p.points_total_kills || 0)
                + (p.points_duration_tier || 0)
                + (p.points_first_tower || 0)
                + (p.points_mvp_team || 0)
                + (p.points_comeback || 0)
                + (p.points_first_rosh || 0);
              const totalPts = p.points_awarded != null ? (p.points_awarded || 0) + sidePts : null;
              const sideBets = [
                p.picked_first_blood && `FB:${p.picked_first_blood}`,
                p.picked_first_tower && `FT:${p.picked_first_tower}`,
                p.picked_total_kills_bucket && `Kills:${p.picked_total_kills_bucket}`,
                p.picked_duration_tier && `Dur:${p.picked_duration_tier}`,
                p.picked_mvp_team && `MVP:${p.picked_mvp_team}`,
                p.picked_comeback && `Cmbk:${p.picked_comeback}`,
                p.picked_first_rosh && `Rosh:${p.picked_first_rosh}`,
              ].filter(Boolean);
              const isRadiant = p.picked_winner === 'radiant';
              return (
                <li
                  key={p.match_ref}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    padding: '11px 0',
                    borderTop: i > 0 ? '1px solid var(--pb-line)' : 'none',
                  }}
                >
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-serif)', fontSize: 14, minWidth: 90 }}>
                    {p.match_ref}
                  </span>
                  <span style={{
                    fontSize: 12, padding: '2px 10px', borderRadius: 999,
                    fontFamily: 'var(--font-condensed)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: isRadiant ? 'var(--radiant-bg)' : 'var(--dire-bg)',
                    color: isRadiant ? 'var(--radiant-color)' : 'var(--dire-color)',
                    border: `1px solid ${isRadiant ? 'rgba(52,211,153,.28)' : 'rgba(248,113,113,.28)'}`,
                  }}>
                    {p.picked_winner}
                  </span>
                  {sideBets.length > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--pb-faint)', fontFamily: 'var(--font-condensed)', letterSpacing: '0.04em' }}>
                      {sideBets.join(' · ')}
                    </span>
                  )}
                  {totalPts != null && (
                    <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                      <span className="pb-num" style={{ color: 'var(--pb-brass)', fontSize: 15 }}>+{totalPts}</span>
                      <span style={{ fontSize: 12, color: 'var(--pb-faint)', marginLeft: 3 }}>pts</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Tipster leaderboard ── */}
      <section
        aria-label="Tipster leaderboard"
        className="pb-card"
        style={{ padding: '20px 24px' }}
      >
        <div className="pb-section-title" style={{ marginBottom: 14 }}>Tipster leaderboard</div>
        {board.length === 0 ? (
          <p style={{ color: 'var(--pb-faint)', fontSize: 14 }}>No tipsters yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Rank', 'Tipster', 'Points'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 2 ? 'right' : 'left',
                      padding: '6px 8px 10px',
                      fontSize: 11, fontFamily: 'var(--font-condensed)', fontWeight: 600,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'var(--pb-brass)', borderBottom: '1px solid var(--pb-line)',
                    }}
                  >{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.map((r, i) => (
                <tr
                  key={r.account_id}
                  style={{ borderBottom: i < board.length - 1 ? '1px solid var(--pb-line)' : 'none' }}
                >
                  <td style={{ padding: '10px 8px', width: 48 }}>
                    {i === 0 ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: 4,
                        background: 'color-mix(in srgb, var(--pb-brass) 22%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--pb-brass) 45%, transparent)',
                        fontWeight: 700, fontSize: 13, color: 'var(--pb-brass)',
                      }}>1</span>
                    ) : (
                      <span className="pb-num" style={{ color: 'var(--pb-faint)', fontSize: 13 }}>{i + 1}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px', fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 14 }}>
                    {r.account_id}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <span className="pb-num" style={{ fontWeight: 700, fontSize: 15, color: 'var(--pb-brass)' }}>
                      {r.points || 0}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
