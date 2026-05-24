// Task #319 — Season Pass page. Surfaces the 50-tier track, weekly challenges,
// and a buy-now CTA. Pure presentation — entitlement state comes from
// /api/me/weekly-challenges + /player/:id/season-pass for the signed-in user.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import {
  createSeasonPassCheckout,
  getMyWeeklyChallenges,
  claimWeeklyChallenge,
} from '../api';

export default function SeasonPass() {
  const { user } = useSteamAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [pass, setPass] = useState(null);
  const [challenges, setChallenges] = useState([]);

  useEffect(() => {
    if (!user?.account_id) return;
    fetch(`/api/player/${user.account_id}/season-pass`, { credentials: 'same-origin' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setPass(d || null))
      .catch(() => setPass(null));
    getMyWeeklyChallenges().then((d) => setChallenges(d.challenges || []));
  }, [user?.account_id]);

  const buy = async () => {
    setErr(null); setBusy(true);
    try {
      const { url } = await createSeasonPassCheckout();
      if (url) window.location.href = url;
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const claim = async (id) => {
    try {
      await claimWeeklyChallenge(id);
      const d = await getMyWeeklyChallenges();
      setChallenges(d.challenges || []);
    } catch (e) { setErr(e.message); }
  };

  const hasPass = !!(pass && pass.activation);
  const currentTier = pass?.tier || 0;
  const xp = pass?.xp || 0;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', marginBottom: 8 }}>Season Pass</h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: 640 }}>
          50 tiers of season-exclusive cosmetics, +20% coin earnings, prediction
          multiplier, and a season trophy. Earn XP from matches, wins, MVPs,
          predictions, achievements, referrals, and weekly challenges.
        </p>
      </header>

      {!user?.account_id ? (
        <div className="card" style={{ padding: 16 }}>
          <p>Sign in with Steam to track your Season Pass progress.</p>
        </div>
      ) : hasPass ? (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>You're on the pass · Tier {currentTier} / 50</h2>
          <div style={{ height: 10, background: 'var(--bg-secondary)', borderRadius: 6, overflow: 'hidden', margin: '12px 0' }}>
            <div style={{ width: `${Math.min(100, (currentTier / 50) * 100)}%`, height: '100%', background: 'var(--gold)' }} />
          </div>
          <p style={{ color: 'var(--text-muted)' }}>{xp} XP this season</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>Unlock the Season Pass — $14.99 AUD</h2>
          <ul style={{ color: 'var(--text-muted)' }}>
            <li>All 50 tiers unlockable through play</li>
            <li>Season-exclusive cosmetics (frame, layout theme, voice pack)</li>
            <li>+20% coin earnings on every match</li>
            <li>2× prediction multiplier on correct picks</li>
            <li>Season trophy on your profile (forever)</li>
          </ul>
          <button type="button" onClick={buy} disabled={busy}
            style={{ background: 'var(--gold)', color: '#000', padding: '10px 18px', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Opening Stripe…' : 'Buy Season Pass'}
          </button>
          {err ? <p style={{ color: 'crimson', marginTop: 8 }}>{err}</p> : null}
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontFamily: 'var(--font-condensed)', letterSpacing: 0.5 }}>Weekly Challenges</h2>
        {challenges.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No active challenges this week. Check back soon.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {challenges.map((c) => {
              const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
              const complete = !!c.completed_at;
              const claimed = !!c.claimed_at;
              return (
                <div key={c.challenge_id} className="card" style={{ padding: 14 }}>
                  <h3 style={{ margin: '0 0 4px' }}>{c.title}</h3>
                  <p style={{ color: 'var(--text-muted)', margin: '0 0 10px', fontSize: 13 }}>{c.description}</p>
                  <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: complete ? 'var(--gold)' : 'var(--accent)' }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 8px' }}>
                    {c.progress} / {c.target} · Reward: {c.xp_reward} XP{c.coin_reward ? ` · ${c.coin_reward} 🪙` : ''}
                  </p>
                  <button type="button" onClick={() => claim(c.challenge_id)} disabled={!complete || claimed}
                    aria-label={claimed ? 'Reward already claimed' : 'Claim weekly challenge reward'}
                    style={{ width: '100%', padding: '6px 0', border: '1px solid var(--border)',
                      borderRadius: 4, background: claimed ? 'var(--bg-secondary)' : (complete ? 'var(--gold)' : 'transparent'),
                      color: claimed ? 'var(--text-muted)' : (complete ? '#000' : 'var(--text-muted)'),
                      cursor: complete && !claimed ? 'pointer' : 'not-allowed' }}>
                    {claimed ? 'Claimed ✓' : complete ? 'Claim reward' : 'In progress'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p style={{ marginTop: 24, fontSize: 13, color: 'var(--text-muted)' }}>
        <Link to="/shop">Browse cosmetics</Link> · <Link to="/leaderboard">Season leaderboard</Link>
      </p>
    </div>
  );
}
