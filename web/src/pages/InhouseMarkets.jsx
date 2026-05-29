import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getInhouseMarkets, placeInhouseBet } from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';
import Dialog from '../components/Dialog';

// Task #450 — Inhouse coin betting (full markets).
//
// Pari-mutuel coin betting on a live inhouse match. Markets (Winner, First
// Blood, MVP, Duration, Total kills) are opened when the lobby locks and lock
// progressively as the game starts / first-blood drops. Stakes use the v6.79
// in-app coin currency — never real money. Self-bet is blocked server-side;
// the UI mirrors the per-market / per-match caps for fast feedback.

const STATUS_BADGE = {
  open:    { label: '● OPEN',    color: 'var(--accent-green)' },
  locked:  { label: '🔒 LOCKED', color: 'var(--amber, #f59e0b)' },
  settled: { label: '✓ SETTLED', color: 'var(--brass, #c5a975)' },
  voided:  { label: '↩ VOIDED',  color: 'var(--text-muted)' },
};

function pct(part, whole) {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

// Pari-mutuel "to-win" estimate for a stake on an outcome, shown live before
// the bet is placed. Mirrors the server's pool maths: winners split the whole
// pool pro-rata. Returns the gross return (stake included) for `stake` coins.
function estimateReturn(outcome, market, stake) {
  const s = Number(stake) || 0;
  if (s <= 0) return 0;
  const newOutcomePool = (Number(outcome.pool) || 0) + s;
  const newTotalPool = (Number(market.pool) || 0) + s;
  if (newOutcomePool <= 0) return s;
  return Math.floor(s * (newTotalPool / newOutcomePool));
}

function OutcomeRow({ outcome, market, disabled, onBet, mine }) {
  const isMine = mine && mine.outcome_id === outcome.id;
  const isWinner = market.status === 'settled' && outcome.is_winner;
  const share = pct(outcome.pool, market.pool);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', borderRadius: 8, marginBottom: 8,
        border: `1px solid ${isWinner ? 'var(--accent-green)' : isMine ? 'var(--brass, #c5a975)' : 'var(--border)'}`,
        background: isWinner ? 'rgba(76,175,80,0.12)' : isMine ? 'rgba(197,169,117,0.10)' : 'var(--bg-input, var(--bg))',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {outcome.label}
          {isMine && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--brass, #c5a975)' }}>· your pick</span>}
          {isWinner && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-green)' }}>· winner</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          🪙 {outcome.pool} staked · {outcome.bettors} bettor{outcome.bettors === 1 ? '' : 's'} · {share}% of pool
        </div>
        <div style={{ marginTop: 6, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${share}%`, background: 'var(--brass, #c5a975)' }} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onBet(market, outcome)}
        disabled={disabled}
        aria-label={`Bet coins on ${outcome.label}`}
        style={{
          padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
          border: '1px solid var(--brass, #c5a975)',
          background: disabled ? 'var(--bg)' : 'rgba(197,169,117,0.18)',
          color: disabled ? 'var(--text-muted)' : 'var(--brass, #c5a975)',
          cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Bet
      </button>
    </div>
  );
}

function MarketCard({ market, signedIn, onBet }) {
  const badge = STATUS_BADGE[market.status] || STATUS_BADGE.open;
  const bettable = market.bettable && signedIn;
  return (
    <div className="stat-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          {market.title}
          {market.is_custom && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>· custom</span>}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: badge.color }}>{badge.label}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        🪙 {market.pool} total pool
        {market.status === 'open' && market.my_bet && ' · you have a bet on this market'}
      </div>
      {market.outcomes.map(o => (
        <OutcomeRow
          key={o.id}
          outcome={o}
          market={market}
          mine={market.my_bet}
          disabled={!bettable || Boolean(market.my_bet)}
          onBet={onBet}
        />
      ))}
      {market.my_bet && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Your bet: 🪙 {market.my_bet.stake}
          {market.my_bet.status !== 'placed' && (
            <> · {market.my_bet.status}{market.my_bet.payout ? ` · 🪙 ${market.my_bet.payout} returned` : ''}</>
          )}
        </div>
      )}
    </div>
  );
}

export default function InhouseMarkets() {
  const { matchId } = useParams();
  const { steamUser } = useSteamAuth() || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [betTarget, setBetTarget] = useState(null); // { market, outcome }
  const [stake, setStake] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [betError, setBetError] = useState(null);
  const stakeInputRef = useRef(null);

  const refresh = useCallback(() => {
    getInhouseMarkets(matchId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [matchId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 12000);
    return () => clearInterval(t);
  }, [refresh]);

  const openBet = (market, outcome) => {
    setBetTarget({ market, outcome });
    setStake(String(data?.limits?.min || 10));
    setBetError(null);
  };
  const closeBet = () => { setBetTarget(null); setBetError(null); };

  const submitBet = async () => {
    if (!betTarget) return;
    setSubmitting(true);
    setBetError(null);
    try {
      await placeInhouseBet(betTarget.market.id, betTarget.outcome.id, parseInt(stake, 10));
      closeBet();
      refresh();
    } catch (e) {
      setBetError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const limits = data?.limits || { min: 10, maxPerMarket: 500, maxPerMatch: 1000 };

  return (
    <div className="container" style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/inhouse" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>← Back to inhouse</Link>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🪙 Betting Markets</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        Match <Link to={`/match/${matchId}`} style={{ color: 'var(--accent, #c5a975)' }}>{matchId}</Link> ·
        wager in-app coins on live inhouse outcomes. Winners split the pool.
      </p>

      {data?.signedIn && data?.balance != null && (
        <div style={{ fontSize: 13, marginBottom: 16 }}>
          Your balance: <strong style={{ color: 'var(--brass, #c5a975)' }}>🪙 {data.balance}</strong>
          <span style={{ color: 'var(--text-muted)', marginLeft: 10 }}>
            Caps: {limits.maxPerMarket}/market · {limits.maxPerMatch}/match
          </span>
        </div>
      )}

      {data?.paused && (
        <div className="stat-card" style={{ marginBottom: 16, borderColor: 'var(--amber, #f59e0b)' }}>
          <strong>⏸ Betting is paused.</strong> An admin has temporarily disabled new bets.
        </div>
      )}

      {!steamUser?.accountId && (
        <div className="stat-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14 }}><strong>Sign in with Steam</strong> to place coin bets.</p>
        </div>
      )}

      {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="loading">Loading markets…</div>
      ) : !data || data.markets.length === 0 ? (
        <div className="empty-state">
          <p>No betting markets for this match. Markets open automatically when an inhouse lobby locks in.</p>
        </div>
      ) : (
        data.markets.map(m => (
          <MarketCard
            key={m.id}
            market={m}
            signedIn={data.signedIn && !data.paused}
            onBet={openBet}
          />
        ))
      )}

      <Dialog
        open={Boolean(betTarget)}
        onClose={closeBet}
        label="Place a coin bet"
        initialFocusRef={stakeInputRef}
        contentClassName="stat-card"
        contentStyle={{ maxWidth: 420, width: '100%', padding: 24 }}
      >
        {betTarget && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 0, marginBottom: 4 }}>{betTarget.market.title}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Backing <strong>{betTarget.outcome.label}</strong>
            </p>
            <label htmlFor="bet-stake" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Stake (coins)
            </label>
            <input
              id="bet-stake"
              ref={stakeInputRef}
              type="number"
              min={limits.min}
              max={limits.maxPerMarket}
              value={stake}
              onChange={e => setStake(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-input, var(--bg))',
                color: 'var(--text-primary)', fontSize: 15, marginBottom: 8,
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Min {limits.min} · max {limits.maxPerMarket} per market
            </div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>
              Estimated return if it hits:{' '}
              <strong style={{ color: 'var(--brass, #c5a975)' }}>
                🪙 {estimateReturn(betTarget.outcome, betTarget.market, stake)}
              </strong>
              <span style={{ color: 'var(--text-muted)' }}> (pari-mutuel — moves with the pool)</span>
            </div>
            {betError && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12 }}>{betError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeBet}
                disabled={submitting}
                style={{
                  padding: '9px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitBet}
                disabled={submitting}
                style={{
                  padding: '9px 16px', borderRadius: 8, fontWeight: 700, fontSize: 14,
                  border: '1px solid var(--brass, #c5a975)',
                  background: 'var(--brass, #c5a975)', color: 'var(--ink-navy, #0d1424)',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? 'Placing…' : 'Place bet'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
