import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getHomeStats, getLatestRecap, getSeasons, getPredictions, getWeekendTournaments, getLeaderboard } from '../api';
import { fmtDate } from '../utils/dates';
import { useSeason } from '../context/SeasonContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { formatHeroName } from '../utils/heroes';
import { useSteamAuth } from '../context/SteamAuthContext';
import QuestTracker from '../components/QuestTracker';
import CommunityChallengeTile from '../components/CommunityChallengeTile';
import RivalCard from '../components/RivalCard';
import { MmrBadge } from '../components/RankBadge';
import HomeBanner from '../components/HomeBanner';
import SponsorshipBanner from '../components/SponsorshipBanner';
import { PlayerOfTheWeek, HotHeroes, FeaturedPlayer, WatchLiveBadge } from '../components/HomeWidgets';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import '../styles/pressbox-home.css';

// Season10LaunchBanner is now CMS-driven via web/src/components/HomeBanner.jsx
// (settings key `home_banner`). The legacy hard-coded banner was removed in v5.76.

// Press Box steam glyph — the live app has no icon package, so we inline a
// tiny stroke/fill SVG to mirror the mockup's lucide-style Steam mark.
function SteamGlyph({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.5 2 2 6.4 2 11.9c0 4.5 3 8.3 7.1 9.6l-1.4-2.1a3.3 3.3 0 0 1-1.9-3 3.3 3.3 0 0 1 3.3-3.3l.4.02 2.9-4.2v-.06a3.7 3.7 0 1 1 3.7 3.7h-.08l-4.1 2.9.01.3a3.3 3.3 0 0 1-6.1 1.7l-2.9-1.2A10 10 0 1 0 12 2Zm5.1 5.2a2.45 2.45 0 1 1-4.9 0 2.45 2.45 0 0 1 4.9 0Zm-3.7 0a1.23 1.23 0 1 0 2.46 0 1.23 1.23 0 0 0-2.46 0ZM7.6 16.8a2.5 2.5 0 0 0 4.6-1l-1.5-.6a1.27 1.27 0 0 1-1.7.7l-1.4.9Z" />
    </svg>
  );
}

// Lucide-style stroke glyphs (the live app has no icon package — mirror the
// mockup's Users / Sword / ChevronRight marks with tiny inline SVGs).
function UsersGlyph({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SwordGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <line x1="19" y1="21" x2="21" y2="19" />
    </svg>
  );
}

function ChevronRightGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// Prominent Active Lobby card (mirrors upscale-2026/Home.tsx "Active Lobby
// Status" block). Subscribes to the same SSE queue stream LiveQueueWidget
// uses, so the player count + status are real and live. Self-hides when no
// lobby is queueing/accepting/drafting.
const LOBBY_STATUS_LABEL = {
  open: 'Queueing',
  accepting: 'Ready Check',
  drafting: 'Drafting',
};

function ActiveLobbyCard({ accountId }) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/inhouse/queue/stream');
    es.addEventListener('snapshot', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const list = Array.isArray(data.sessions) ? data.sessions : [];
        // Only the live queueing states belong in this prominent card; the
        // small dashboard tile owns server_failed / in_progress. The SSE feed
        // already filters to these, but guard client-side so the card's
        // self-hide is guaranteed regardless of future feed changes.
        const live = list.find((s) => LOBBY_STATUS_LABEL[s.status]);
        setSession(live || null);
      } catch {}
    });
    es.onerror = () => {};
    return () => { try { es.close(); } catch {} };
  }, []);

  if (!session) return null;

  const min = session.min_players || 10;
  const players = session.players || 0;
  const needed = typeof session.needed === 'number' ? session.needed : Math.max(min - players, 0);
  const statusLabel = LOBBY_STATUS_LABEL[session.status] || session.status;
  const joined = accountId != null && Array.isArray(session.queued)
    && session.queued.some(p => String(p.account_id) === String(accountId));

  return (
    <div className="pb-card pb-lobby-card">
      <span aria-hidden="true" className="pb-lobby-glow" />
      <div className="pb-lobby-main">
        <span className="pb-lobby-ring" aria-hidden="true">
          <span className="pb-lobby-ping" />
          <UsersGlyph size={24} />
        </span>
        <div>
          <div className="pb-lobby-titlerow">
            <h3 className="pb-serif pb-lobby-title">Active Lobby</h3>
            <span className="pb-lobby-badge">
              <span aria-hidden="true" className="pb-lobby-dot" />
              {statusLabel}
            </span>
          </div>
          <p className="pb-lobby-sub">
            Inhouse · Captains Draft
            {needed > 0 ? ` · ${needed} slot${needed === 1 ? '' : 's'} open` : ' · Lobby full'}
          </p>
        </div>
      </div>
      <div className="pb-lobby-right">
        <div className="pb-lobby-count">
          <div className="pb-serif pb-num pb-lobby-count-val">
            {players}<span className="pb-lobby-count-max">/{min}</span>
          </div>
          <div className="pb-lobby-count-cap">Players</div>
        </div>
        <Link to="/inhouse" className="pb-lobby-cta">
          {joined ? 'View Lobby' : 'Join Lobby'}
        </Link>
      </div>
    </div>
  );
}

// Press Box landing hero (mirrors upscale-2026/HomeSignedOut.tsx hero block):
// brass eyebrow + serif headline + lede + Steam sign-in / explore CTAs.
function SignedOutHero({ signIn }) {
  return (
    <section className="pb-home-hero" aria-labelledby="pb-home-hero-title">
      <img src="/pressbox-hero.png" alt="" aria-hidden="true" className="pb-home-hero-bg" />
      <span aria-hidden="true" className="pb-home-hero-fade" />
      <div className="pb-home-hero-inner">
        <div className="pb-eyebrow pb-eyebrow-rule">Oceanic Dota 2 · Est. 2021</div>
        <h1 id="pb-home-hero-title" className="pb-home-title">
          The Premier <br />
          <em>Oceanic Pro</em> League.
        </h1>
        <p className="pb-home-lede">
          Competitive inhouse Dota for Oceania — captain drafts, dedicated servers,
          TrueSkill rankings and nightly prize-pool lobbies. Sign in with Steam to
          claim your rating and join the queue.
        </p>
        <div className="pb-hero-actions">
          <button
            type="button"
            className="pb-btn-amber"
            onClick={() => { if (signIn) signIn(); else window.location.href = '/auth/steam'; }}
          >
            <SteamGlyph />
            Sign in with Steam
          </button>
          <Link to="/leaderboard" className="pb-btn-ghost">
            Explore the League
            <span aria-hidden="true">↗</span>
          </Link>
          <Link to="/how-it-works" className="pb-btn-ghost">
            How it works
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="pb-trust-line">
          <span aria-hidden="true" style={{ color: 'var(--pb-brass)' }}>◈</span>
          Free to join. No account needed beyond Steam — we never see your password.
        </div>
      </div>
    </section>
  );
}

function JoinTheLeagueButton() {
  const enabled = useFeatureFlag('home_join_button');
  if (!enabled) return null;
  return (
    <Link to="/join" className="btn btn-primary" style={{
      fontSize: 13,
      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      borderColor: '#16a34a',
      color: '#fff',
      boxShadow: '0 0 0 1px rgba(34,197,94,0.4)',
    }}>
      ✨ Join the League
    </Link>
  );
}

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="pb-card" style={{
      padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', gap: 6, flex: 1, minWidth: 140,
    }}>
      {icon && <span style={{ fontSize: 22 }}>{icon}</span>}
      <span className="pb-serif pb-num" style={{ fontSize: 30, fontWeight: 700, color: 'var(--pb-brass-bright)', lineHeight: 1.1 }}>{value ?? '—'}</span>
      <span className="pb-eyebrow">{label}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--pb-muted)', marginTop: 2 }}>{sub}</span>}
    </div>
  );
}

function fmtDuration(s) {
  if (!s) return '—';
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function MatchRow({ m }) {
  const winner = m.radiant_win ? 'Radiant' : 'Dire';
  const winColor = m.radiant_win ? 'var(--accent-green)' : 'var(--accent-red)';
  const killerHero = m.top_killer_hero ? formatHeroName(m.top_killer_hero) : null;
  return (
    <Link to={`/match/${m.match_id}`} style={{
      display: 'grid', gridTemplateColumns: '110px 90px 70px 1fr 80px',
      alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: 'var(--bg-hover)', textDecoration: 'none',
      border: '1px solid transparent', transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
    >
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(m.date)}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: winColor }}>{winner} Win</span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtDuration(m.duration)}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m.top_killer && m.top_kills != null
          ? <>⚔️ <strong style={{ color: 'var(--text-primary)' }}>{m.top_killer}</strong>{killerHero ? ` · ${killerHero}` : ''} · {m.top_kills}k</>
          : null}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
        {m.total_kills != null ? `${m.total_kills} kills` : ''}
      </span>
    </Link>
  );
}

function PersonalMatchRow({ m }) {
  const heroName = formatHeroName(m.hero_name) || m.hero_name || '?';
  const won = m.won;
  const team = m.team === 'radiant' ? 'Radiant' : m.team === 'dire' ? 'Dire' : null;
  return (
    <Link to={`/match/${m.match_id}`} className="pb-card pb-match-row">
      <div className="pb-match-left">
        <span className={`pb-match-icon ${won ? 'is-win' : 'is-loss'}`} aria-hidden="true">
          <SwordGlyph size={18} />
        </span>
        <div className="pb-match-meta">
          <div className="pb-match-heroline">
            <span className="pb-match-hero">{heroName}</span>
            {team && <span className="pb-match-tag">{team}</span>}
          </div>
          <div className="pb-match-sub">
            <span>Match #{m.match_id}</span>
            <span aria-hidden="true" className="pb-match-dotsep" />
            <span>{fmtDate(m.date)}</span>
          </div>
        </div>
      </div>
      <div className="pb-match-right">
        <div className="pb-match-stat pb-match-hide-sm">
          <div className="pb-match-stat-val pb-num">{m.kills}/{m.deaths}/{m.assists}</div>
          <div className="pb-match-stat-cap">K/D/A</div>
        </div>
        <div className="pb-match-stat pb-match-hide-sm">
          <div className="pb-match-stat-val pb-num">{fmtDuration(m.duration)}</div>
          <div className="pb-match-stat-cap">Duration</div>
        </div>
        <div className="pb-match-stat pb-match-result">
          <div className={`pb-match-stat-val ${won ? 'is-win' : 'is-loss'}`}>{won ? 'WIN' : 'LOSS'}</div>
          <div className="pb-match-stat-cap">Result</div>
        </div>
        <span className="pb-match-chev" aria-hidden="true"><ChevronRightGlyph size={20} /></span>
      </div>
    </Link>
  );
}

function StreakBadge({ streak }) {
  if (!streak) return null;
  const isWin = streak > 0;
  const count = Math.abs(streak);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700,
      background: isWin ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
      color: isWin ? 'var(--accent-green, #22c55e)' : 'var(--accent-red, #ef4444)',
      border: `1px solid ${isWin ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      {isWin ? '🔥' : '❄️'} {count}-{isWin ? 'win' : 'loss'} streak
    </span>
  );
}

function MiniMmrChart({ accountId }) {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (!accountId) return;
    fetch('/api/me/mmr-history', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.history) setHistory(d.history); })
      .catch(() => {});
  }, [accountId]);

  if (!history || history.length < 2) return null;

  const data = history.map((h, i) => ({
    idx: i + 1,
    mmr: Math.round(h.mmr),
    date: h.recorded_at
      ? new Date(h.recorded_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })
      : `#${i + 1}`,
  }));

  const mmrValues = data.map(d => d.mmr);
  const minMmr = Math.min(...mmrValues);
  const maxMmr = Math.max(...mmrValues);
  const first = mmrValues[0];
  const last = mmrValues[mmrValues.length - 1];
  const delta = last - first;
  const deltaColor = delta >= 0 ? 'var(--accent-green, #22c55e)' : 'var(--accent-red, #ef4444)';

  return (
    <div className="pb-card" style={{
      padding: '18px 20px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="pb-section-title" style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          MMR History
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--pb-muted)', letterSpacing: 0, textTransform: 'none', fontFamily: 'var(--font)' }}>
            last {data.length} games
          </span>
        </div>
        <span className="pb-serif pb-num" style={{ fontSize: 16, fontWeight: 700, color: deltaColor }}>
          {delta >= 0 ? '+' : ''}{delta} MMR
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="idx" tick={false} stroke="var(--border)" />
          <YAxis
            domain={[minMmr - 50, maxMmr + 50]}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            width={40}
          />
          <Tooltip
            formatter={v => [`${v} MMR`, 'MMR']}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="mmr"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PersonalisedDashboard({ steamUser }) {
  const { seasonId } = useSeason();
  const [homeData, setHomeData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHomeData = useCallback(async () => {
    try {
      const res = await fetch('/api/me/home', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHomeData(data);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  // v5.82 — fetch the #1 leaderboard player so the signed-in user's MmrBadge
  // is promoted to "King" if (and only if) they're top of the realm.
  const [topLeaderId, setTopLeaderId] = useState(null);
  useEffect(() => {
    getLeaderboard(1, seasonId).then(rows => {
      const top = Array.isArray(rows) ? rows[0] : (rows?.leaderboard || [])[0];
      if (top?.player_id != null) setTopLeaderId(String(top.player_id));
    }).catch(() => {});
  }, [seasonId]);

  const displayName = steamUser?.displayName || `Player ${steamUser?.accountId}`;
  const accountId = steamUser?.accountId;
  const isLeader = topLeaderId != null && accountId != null && String(accountId) === topLeaderId;

  return (
    <>
      {/* Personal hero banner — left: welcome + nav; right: "Your Status" card
          (mirrors upscale-2026/Home.tsx Personal Welcome Strip). */}
      <div className="pb-card pb-home-welcome" style={{
        padding: '28px 32px', marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 28,
      }}>
        <img src="/pressbox-hero.png" alt="" aria-hidden="true" className="pb-home-hero-bg" />
        <span aria-hidden="true" className="pb-home-hero-fade" />
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div className="pb-eyebrow pb-eyebrow-rule">
            Welcome back
          </div>
          <h1 className="pb-page-title" style={{ margin: 0, fontSize: 38 }}>
            {displayName}
          </h1>
          {!loading && homeData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              {homeData.mmr !== null && (
                <MmrBadge mmr={homeData.mmr} size="lg" isLeader={isLeader} />
              )}
              {homeData.games_played > 0 && (
                <span style={{ fontSize: 13, color: 'var(--pb-muted)' }}>
                  {homeData.wins}W – {homeData.losses}L
                </span>
              )}
              {homeData.streak !== 0 && <StreakBadge streak={homeData.streak} />}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            {accountId && (
              <Link to={`/player/${accountId}`} className="btn btn-primary" style={{ fontSize: 13 }}>
                My Profile
              </Link>
            )}
            <Link to="/leaderboard" className="btn" style={{ fontSize: 13 }}>
              Leaderboard
            </Link>
            <Link to="/matches" className="btn" style={{ fontSize: 13 }}>
              Matches
            </Link>
            {/* Task #629 — "one thing to improve" entry point. The Growth Coach
                page distils the player's weakest dimension into an actionable
                plan; surface it straight from the welcome strip once they have
                games on record. */}
            {accountId && homeData && homeData.games_played > 0 && (
              <Link to={`/player/${accountId}/growth`} className="btn" style={{ fontSize: 13 }}>
                Growth Coach
              </Link>
            )}
          </div>
        </div>

        {/* Your Status panel */}
        {!loading && homeData && homeData.mmr !== null && (
          <div className="pb-card" style={{
            padding: '22px 26px', minWidth: 280, flex: '0 1 320px',
            background: 'linear-gradient(180deg, var(--pb-surface-2) 0%, var(--pb-bg-2) 100%)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span className="pb-eyebrow">Your Status</span>
              {homeData.streak !== 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: homeData.streak > 0 ? 'var(--pb-radiant)' : 'var(--pb-dire)',
                }}>
                  {Math.abs(homeData.streak)}{homeData.streak > 0 ? 'W' : 'L'} streak
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32, marginBottom: 18 }}>
              <div>
                <div className="pb-pulse-label" style={{ marginBottom: 4 }}>Rating</div>
                <div className="pb-serif pb-num" style={{ fontSize: 40, fontWeight: 700, color: 'var(--pb-brass-bright)', lineHeight: 1 }}>
                  {Math.round(homeData.mmr)}
                </div>
              </div>
              {homeData.games_played > 0 && (
                <div>
                  <div className="pb-pulse-label" style={{ marginBottom: 4 }}>Win Rate</div>
                  <div className="pb-serif pb-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--pb-text)', lineHeight: 1 }}>
                    {Math.round((homeData.wins / homeData.games_played) * 100)}%
                  </div>
                </div>
              )}
            </div>
            <div style={{ height: 1, background: 'var(--pb-line)', marginBottom: 12 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--pb-muted)' }}>
              <span>Games: <strong className="pb-num" style={{ color: 'var(--pb-text)' }}>{homeData.games_played || 0}</strong></span>
              <span>W/L: <strong className="pb-num" style={{ color: 'var(--pb-text)' }}>{homeData.wins || 0}–{homeData.losses || 0}</strong></span>
            </div>
          </div>
        )}
      </div>

      <MiniMmrChart accountId={accountId} />

      {loading ? (
        <div className="loading" style={{ marginBottom: 28 }}>Loading your stats…</div>
      ) : homeData ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

          {/* Last 3 matches */}
          <div className="pb-card" style={{ padding: 22 }}>
            <div className="pb-section-head" style={{ marginBottom: 16 }}>
              <h2 className="pb-section-head-title" style={{ fontSize: 20 }}>Recent Games</h2>
              {accountId && (
                <Link to={`/player/${accountId}`} className="pb-section-link">
                  All matches →
                </Link>
              )}
            </div>
            {homeData.last_matches?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {homeData.last_matches.map(m => (
                  <PersonalMatchRow key={m.match_id} m={m} />
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No matches played yet.</div>
            )}
          </div>

          {/* Stats + hero spotlight */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Stat cards */}
            {homeData.games_played > 0 && (
              <div style={{ display: 'flex', gap: 12 }}>
                <StatCard
                  label="Games"
                  value={homeData.games_played}
                  sub="This season"
                />
                <StatCard
                  label="Win rate"
                  value={homeData.games_played > 0
                    ? `${Math.round((homeData.wins / homeData.games_played) * 100)}%`
                    : '—'}
                  sub={`${homeData.wins || 0}W – ${homeData.losses || 0}L`}
                />
              </div>
            )}

            {/* Hero spotlight */}
            {homeData.top_hero && (
              <div className="pb-card" style={{ padding: '18px 20px' }}>
                <div className="pb-eyebrow" style={{ marginBottom: 10 }}>
                  Your hero this week
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 56, height: 32, borderRadius: 6, overflow: 'hidden',
                    background: 'var(--pb-elevated)', border: '1px solid var(--pb-line)', flexShrink: 0,
                  }}>
                    <img
                      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${homeData.top_hero.hero_name || ''}.png`}
                      alt={homeData.top_hero.hero_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div>
                    <div className="pb-serif" style={{ fontSize: 18, fontWeight: 700, color: 'var(--pb-text)' }}>
                      {formatHeroName(homeData.top_hero.hero_name) || homeData.top_hero.hero_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--pb-muted)', marginTop: 2 }}>
                      {homeData.top_hero.picks} game{homeData.top_hero.picks !== 1 ? 's' : ''} this week
                      {homeData.top_hero.picks > 0 && homeData.top_hero.wins != null && (
                        <> · {Math.round((homeData.top_hero.wins / homeData.top_hero.picks) * 100)}% WR</>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`/heroes`}
                    className="pb-eyebrow"
                    style={{ marginLeft: 'auto', textDecoration: 'none' }}
                  >
                    Heroes →
                  </Link>
                </div>
              </div>
            )}

            {/* Active inhouse lobby — the live queueing/accepting/drafting
                states now render in the prominent <ActiveLobbyCard> at the top
                of the page (SSE-driven, real player count). This tile is kept
                only for the states that card doesn't surface: a failed server
                provision (captain Retry) and an in-progress game. */}
            {homeData.active_session
              && (homeData.active_session.status === 'server_failed'
                || homeData.active_session.status === 'in_progress') && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, var(--bg-card) 100%)',
                border: '1px solid rgba(34,197,94,0.35)', borderRadius: 12, padding: '16px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Active lobby
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                    background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                    border: '1px solid rgba(34,197,94,0.3)', textTransform: 'uppercase', letterSpacing: 1,
                  }}>
                    {homeData.active_session.status.replace('_', ' ')}
                  </span>
                  {homeData.active_session.player_joined && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                      background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                      border: '1px solid rgba(59,130,246,0.3)', textTransform: 'uppercase', letterSpacing: 1,
                    }}>
                      You're in
                    </span>
                  )}
                </div>
                {homeData.active_session.notes && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {homeData.active_session.notes}
                  </div>
                )}
                <Link to="/inhouse" style={{ fontSize: 12, color: '#22c55e', textDecoration: 'none', fontWeight: 600 }}>
                  {homeData.active_session.player_joined ? 'View lobby →' : 'Join lobby →'}
                </Link>
              </div>
            )}

            {/* Upcoming game (only when no active session) */}
            {!homeData.active_session && homeData.upcoming_game && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, var(--bg-card) 100%)',
                border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: '16px 20px',
              }}>
                <div className="pb-eyebrow" style={{ marginBottom: 8, color: 'var(--pb-amber)' }}>
                  Next scheduled game
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {new Date(homeData.upcoming_game.scheduled_at).toLocaleDateString('en-AU', {
                    weekday: 'short', day: 'numeric', month: 'short',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                {homeData.upcoming_game.note && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    {homeData.upcoming_game.note}
                  </div>
                )}
                <Link to="/schedule" style={{ fontSize: 12, color: 'var(--accent-blue, #3b82f6)', marginTop: 8, display: 'inline-block', textDecoration: 'none' }}>
                  View schedule →
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <DiscoverGrid />
    </>
  );
}

// Task #629 — discoverability rail. The nav consolidation tucks deeper tools
// behind hubs; this surfaces the high-value analysis pages straight on the
// signed-in dashboard so they're one click away rather than two hovers deep.
const DISCOVER_LINKS = [
  { to: '/synergy', icon: '🤝', title: 'Synergy', sub: 'Best & worst duos' },
  { to: '/benchmarks', icon: '📊', title: 'Benchmarks', sub: 'How you stack up' },
  { to: '/ward-map', icon: '🗺️', title: 'Ward Maps', sub: 'Vision heatmaps' },
  { to: '/draft-assistant', icon: '🧠', title: 'Draft Assistant', sub: 'Live counter-picks' },
  { to: '/heroes/draft-trainer', icon: '🎯', title: 'Draft Trainer', sub: 'Practice your reads' },
  { to: '/pickem', icon: '🔮', title: "Pick'em", sub: 'Predict & earn' },
  { to: '/records', icon: '🏆', title: 'Records', sub: 'Hall of Fame & feats' },
  { to: '/wrapped/me/latest', icon: '🎁', title: 'Season Wrapped', sub: 'Your season in review' },
];

function DiscoverGrid() {
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="pb-section-head" style={{ marginBottom: 14 }}>
        <h2 className="pb-section-head-title" style={{ fontSize: 20 }}>Discover</h2>
        <span className="pb-eyebrow">Explore the league</span>
      </div>
      <div className="oa-discover-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12,
      }}>
        {DISCOVER_LINKS.map(l => (
          <Link key={l.to} to={l.to} className="pb-card" style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
            textDecoration: 'none',
          }}>
            <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{l.icon}</span>
            <span style={{ minWidth: 0 }}>
              <span className="pb-serif" style={{
                display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--pb-text, var(--text-primary))',
              }}>{l.title}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--pb-muted, var(--text-muted))' }}>{l.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Medieval tier ladder (mirrors web/src/pages/Leaderboard.jsx MMR_TIERS so the
// home ladder rows show the same heraldic emblem the leaderboard does).
const HOME_TIERS = [
  { min: 7000, name: 'Warlord', badge: '/badges/tier-7-warlord.png' },
  { min: 6500, name: 'Paladin', badge: '/badges/tier-6-paladin.png' },
  { min: 6200, name: 'Templar', badge: '/badges/tier-5-templar.png' },
  { min: 5900, name: 'Knight', badge: '/badges/tier-4-knight.png' },
  { min: 5600, name: 'Footman', badge: '/badges/tier-3-footman.png' },
  { min: 5300, name: 'Squire', badge: '/badges/tier-2-squire.png' },
  { min: 5000, name: 'Apprentice', badge: '/badges/tier-1-apprentice.png' },
  { min: 4500, name: 'Outlaw', badge: '/badges/tier-sub-1-outlaw.png' },
  { min: 4000, name: 'Vagabond', badge: '/badges/tier-sub-2-vagabond.png' },
  { min: 0, name: 'Peasant', badge: '/badges/tier-sub-3-peasant.png' },
];

function tierForMmr(mmr, isLeader) {
  if (isLeader) return { name: 'King', badge: '/badges/tier-8-king.png' };
  const v = Number(mmr) || 0;
  for (const t of HOME_TIERS) if (v >= t.min) return t;
  return HOME_TIERS[HOME_TIERS.length - 1];
}

// Press Box ladder row (mirrors upscale-2026/HomeSignedOut.tsx LadderRow):
// tier emblem + rank numeral + name/tier beside win-rate + rating, wired to
// the REAL top players already fetched. Replaces the disliked oversized-italic
// Top-5 numeral list.
function LadderRow({ rank, accountId, name, mmr, wins, losses, isLeader }) {
  const tier = tierForMmr(mmr, isLeader);
  const games = (Number(wins) || 0) + (Number(losses) || 0);
  const wr = games > 0 ? Math.round(((Number(wins) || 0) / games) * 100) : null;
  return (
    <Link to={`/player/${accountId}`} className="pb-card pb-ladder-row">
      <div className="pb-ladder-left">
        <img
          src={tier.badge}
          alt={`${tier.name} tier`}
          title={tier.name}
          width={40}
          height={40}
          className="pb-ladder-emblem"
          onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
        />
        <div className={`pb-ladder-rank pb-serif pb-num${rank === 1 ? ' is-top' : ''}`}>{rank}</div>
        <div style={{ minWidth: 0 }}>
          <div className="pb-ladder-name pb-serif">{name}</div>
          <div className="pb-ladder-tier">{tier.name}</div>
        </div>
      </div>
      <div className="pb-ladder-right">
        <div className="pb-ladder-stat pb-ladder-wr">
          <div className="pb-ladder-stat-val pb-num">{wr != null ? `${wr}%` : '—'}</div>
          <div className="pb-ladder-cap">Win Rate</div>
        </div>
        <div className="pb-ladder-stat">
          <div className="pb-ladder-stat-val pb-serif pb-num" style={{ color: 'var(--pb-brass-bright)' }}>{Math.round(Number(mmr) || 0)}</div>
          <div className="pb-ladder-cap">Rating</div>
        </div>
      </div>
    </Link>
  );
}

// "How It Works" — 3 static step cards (mirrors HomeSignedOut.tsx StepCard).
// Evergreen copy describing how the league genuinely works.
function HowItWorks() {
  const steps = [
    { n: '01', icon: <SteamGlyph size={15} />, title: 'Sign in with Steam', body: 'One click. We link your Dota account — no password shared.' },
    { n: '02', icon: null, title: 'Queue & get drafted', body: 'Register a role, accept the pop, captains draft the teams.' },
    { n: '03', icon: null, title: 'Climb the ranks', body: 'Every game adjusts your TrueSkill rating across 8 tiers.' },
  ];
  return (
    <div>
      <h2 className="pb-section-head-title" style={{ marginBottom: 18 }}>How It Works</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {steps.map(s => (
          <div key={s.n} className="pb-card pb-step-card">
            <div className="pb-step-num pb-serif pb-num">{s.n}</div>
            <div>
              <div className="pb-step-title">
                {s.icon && <span style={{ color: 'var(--pb-brass)', display: 'inline-flex' }}>{s.icon}</span>}
                <span className="pb-serif">{s.title}</span>
              </div>
              <p className="pb-step-body">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// "Why Play Here" — 3 static feature cards (mirrors HomeSignedOut.tsx FeatureCard).
function WhyPlayHere() {
  const features = [
    { title: 'Dedicated Servers', body: 'Auto-provisioned OCE servers on the 10th pick — no host-shopping, low ping.' },
    { title: 'Deep Stats', body: 'Replay-parsed performance scores, hero meta, draft assistant and match history.' },
    { title: 'Prize Tournaments', body: 'Seasonal prize pools, buy-in cups, and a coaching marketplace to level up.' },
  ];
  return (
    <div style={{ marginTop: 36 }}>
      <h2 className="pb-section-head-title" style={{ marginBottom: 18 }}>Why Play Here</h2>
      <div className="pb-feature-grid">
        {features.map(f => (
          <div key={f.title} className="pb-card pb-feature-card">
            <span aria-hidden="true" className="pb-feature-mark">◈</span>
            <div className="pb-serif pb-feature-title">{f.title}</div>
            <p className="pb-feature-body">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Closing sign-in banner (mirrors HomeSignedOut.tsx bottom CTA).
function ClosingSignInBanner({ signIn }) {
  return (
    <div className="pb-card pb-close-banner" style={{ marginTop: 36 }}>
      <div className="pb-eyebrow pb-eyebrow-centered">Ready when you are</div>
      <h2 className="pb-serif pb-close-title">Claim your rating tonight.</h2>
      <p className="pb-close-sub">
        Join the Oceanic inhouse community. Your first inhouse is one Steam click away.
      </p>
      <button
        type="button"
        className="pb-btn-amber"
        onClick={() => { if (signIn) signIn(); else window.location.href = '/auth/steam'; }}
      >
        <SteamGlyph />
        Sign in with Steam
      </button>
    </div>
  );
}

export default function Home() {
  const { steamUser, loading: authLoading, signIn } = useSteamAuth() || {};
  const { seasonId } = useSeason();
  const [stats, setStats] = useState(null);
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [predInfo, setPredInfo] = useState(null);
  const [activeTournament, setActiveTournament] = useState(null);

  useEffect(() => {
    getSeasons().then(s => {
      const seasons = s.seasons || [];
      const active = seasons.find(x => x.is_active) || seasons[0];
      if (active) {
        getPredictions(active.id)
          .then(d => setPredInfo({ season: active, count: (d.predictions || []).length }))
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getWeekendTournaments().then(d => {
      const now = new Date();
      const active = (d.tournaments || []).find(t =>
        (t.status === 'active' || t.status === 'upcoming') &&
        new Date(t.end_date) >= now
      );
      setActiveTournament(active || null);
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    Promise.all([
      getHomeStats(seasonId).catch(() => null),
      getLatestRecap().catch(() => null),
    ]).then(([s, r]) => {
      setStats(s);
      setRecap(r);
      setLoading(false);
    });
  }, [seasonId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totals = stats?.totals || {};
  const recentMatches = stats?.recentMatches || [];
  const [top5, setTop5] = useState([]);

  useEffect(() => {
    if (authLoading) return;
    getLeaderboard(5, seasonId)
      .then(d => setTop5((d?.leaderboard || []).slice(0, 5)))
      .catch(() => {});
  }, [authLoading, steamUser, seasonId]);

  const tournamentBanner = activeTournament && (
    <div style={{
      background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(251,191,36,0.08) 100%)',
      border: '1px solid rgba(245,158,11,0.4)',
      borderRadius: 14, padding: '18px 24px', marginBottom: 24,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b' }}>{activeTournament.name}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
            background: activeTournament.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
            color: activeTournament.status === 'active' ? '#22c55e' : '#f59e0b',
            textTransform: 'uppercase', letterSpacing: 1,
          }}>
            {activeTournament.status === 'active' ? 'Live Now' : 'Coming Soon'}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {activeTournament.description || `Top ${activeTournament.games_to_count} game scores across the weekend. Play any games — best scores count.`}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          📅 {new Date(activeTournament.start_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' → '}
          {new Date(activeTournament.end_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
          {activeTournament.prize_pool > 0 && <> · 💰 ${activeTournament.prize_pool} prize pool</>}
        </div>
      </div>
      <Link to={`/weekend-tournament/${activeTournament.id}`}
        className="btn btn-primary" style={{ fontSize: 13, flexShrink: 0, background: '#f59e0b', borderColor: '#f59e0b', color: '#000' }}>
        View Leaderboard →
      </Link>
    </div>
  );

  if (!authLoading && steamUser) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="pb-home-notice"><HomeBanner /></div>
        <SponsorshipBanner slug="home_top" style={{ margin: '12px 0' }} />
        {tournamentBanner}
        <ActiveLobbyCard accountId={steamUser?.accountId} />
        <WatchLiveBadge />
        <FeaturedPlayer />
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginBottom: 8,
        }} className="oa-home-pulse-row">
          <PlayerOfTheWeek />
          <HotHeroes />
        </div>
        <PersonalisedDashboard steamUser={steamUser} />

        {/* Task #440 — Daily/weekly quests + community challenges */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginBottom: 24,
        }} className="oa-home-pulse-row">
          <QuestTracker />
          <CommunityChallengeTile />
        </div>

        {/* Task #441 — Weekly Rivals tile (self-fetching; renders nothing
            when the viewer isn't paired this week). */}
        <div style={{ marginBottom: 24 }}>
          <RivalCard />
        </div>

        <CourtPitchHomeLanding
          loading={loading}
          totals={totals}
          recentMatches={recentMatches}
          top5={top5}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      <div className="pb-home-notice"><HomeBanner /></div>
      <SignedOutHero signIn={signIn} />
      <SponsorshipBanner slug="home_top" style={{ margin: '12px 0' }} />

      {tournamentBanner}

      <ActiveLobbyCard />
      <WatchLiveBadge />
      <FeaturedPlayer />
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        marginBottom: 8,
      }} className="oa-home-pulse-row">
        <PlayerOfTheWeek />
        <HotHeroes />
      </div>

      <CommunityChallengeTile />

      <CourtPitchHomeLanding
        loading={loading}
        totals={totals}
        recentMatches={recentMatches}
        top5={top5}
      />

      <HowItWorks />

      <WhyPlayHere />

      <ClosingSignInBanner signIn={signIn} />

    </div>
  );
}

function fmtAgo(dateStr) {
  if (!dateStr) return '—';
  const t = new Date(dateStr).getTime();
  if (!t) return '—';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function fmtDurMmSs(s) {
  if (!s) return '—';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function CourtPitchHomeLanding({ loading, totals, recentMatches, top5 }) {
  const stats = [
    { label: 'Matches Played', value: totals.total_matches != null ? Number(totals.total_matches).toLocaleString() : '—' },
    { label: 'Active Players', value: totals.total_players != null ? Number(totals.total_players).toLocaleString() : '—' },
    { label: 'This Week', value: totals.matches_this_week != null ? Number(totals.matches_this_week).toLocaleString() : '—' },
    { label: 'Most Played Hero', value: formatHeroName(totals.most_played_hero) || '—' },
  ];

  return (
    <>
      {/* League pulse stat bar (mirrors HomeSignedOut.tsx Live League Pulse) */}
      <div className="pb-card pb-pulse-bar">
        {stats.map((s, i) => (
          <div key={i} className="pb-pulse-cell">
            <div className="pb-pulse-value pb-num">{loading ? '—' : s.value}</div>
            <div className="pb-pulse-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Two-column main grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
        gap: 28, marginBottom: 32,
      }} className="oa-home-twocol">

        {/* Latest Matches */}
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <h2 className="font-serif" style={{
                margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif, serif)',
              }}>Latest Matches</h2>
              <p className="font-serif" style={{
                margin: '2px 0 0', fontSize: 13, fontStyle: 'italic',
                color: 'var(--text-muted)', fontFamily: 'var(--font-serif, serif)',
              }}>From the past 48 hours</p>
            </div>
            <Link to="/matches" className="uppercase-wide" style={{
              fontSize: 12, color: 'var(--brass, var(--accent))', textDecoration: 'none',
              fontFamily: 'var(--font-condensed, inherit)', textTransform: 'uppercase',
              letterSpacing: '0.12em', fontWeight: 600,
            }}>View all →</Link>
          </div>
          <div className="oa-rule-double" style={{ marginBottom: 14 }} />

          {recentMatches.length === 0 ? (
            <div className="oa-card pb-card" style={{ padding: '24px 18px', color: 'var(--text-muted)', fontSize: 13 }}>
              No matches recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentMatches.slice(0, 5).map((m) => {
                const radWin = m.radiant_win;
                const score = (m.radiant_score != null && m.dire_score != null)
                  ? `${m.radiant_score} - ${m.dire_score}` : '—';
                return (
                  <Link key={m.match_id} to={`/match/${m.match_id}`} className="pb-card pb-match-row">
                    <div className="pb-match-left">
                      <span className={`pb-match-icon ${radWin ? 'is-win' : 'is-loss'}`} aria-hidden="true">
                        <SwordGlyph size={18} />
                      </span>
                      <div className="pb-match-meta">
                        <div className="pb-match-heroline">
                          <span className="pb-match-hero">{radWin ? 'Radiant' : 'Dire'}</span>
                          <span className="pb-match-tag">Victory</span>
                        </div>
                        <div className="pb-match-sub">
                          <span>Match #{m.match_id}</span>
                          <span aria-hidden="true" className="pb-match-dotsep" />
                          <span>{fmtAgo(m.date)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="pb-match-right">
                      <div className="pb-match-stat pb-match-hide-sm">
                        <div className="pb-match-stat-val pb-num">{score}</div>
                        <div className="pb-match-stat-cap">Score</div>
                      </div>
                      <div className="pb-match-stat pb-match-hide-sm">
                        <div className="pb-match-stat-val pb-num">{fmtDurMmSs(m.duration)}</div>
                        <div className="pb-match-stat-cap">Duration</div>
                      </div>
                      <div className="pb-match-stat">
                        <div className="pb-match-stat-val" style={{ fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic', fontWeight: 700, color: 'var(--brass, var(--accent))' }}>
                          {m.top_killer || '—'}
                        </div>
                        <div className="pb-match-stat-cap">MVP</div>
                      </div>
                      <span className="pb-match-chev" aria-hidden="true"><ChevronRightGlyph size={20} /></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Top 5 Players sidebar */}
        <aside>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <h2 className="font-serif" style={{
                margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif, serif)',
              }}>Top of the Ladder</h2>
              <p className="font-serif" style={{
                margin: '2px 0 0', fontSize: 13, fontStyle: 'italic',
                color: 'var(--text-muted)', fontFamily: 'var(--font-serif, serif)',
              }}>Season standings</p>
            </div>
            <span className="uppercase-wide" style={{
              fontSize: 10, color: 'var(--amber, #f59e0b)',
              border: '1px solid var(--amber, #f59e0b)', borderRadius: 999,
              padding: '2px 9px', fontFamily: 'var(--font-condensed, inherit)',
              textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600,
            }}>Live</span>
          </div>
          <div className="oa-rule-double" style={{ marginBottom: 14 }} />

          {top5.length === 0 ? (
            <div className="oa-card pb-card" style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              No leaderboard data yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {top5.map((p, i) => {
                const rank = i + 1;
                // getComputedLeaderboard returns { player_id, display_name,
                // nickname, mmr, wins, losses, ... }. Old field names
                // (player_name / persona_name / account_id) never existed
                // here, so the fallback chain always landed on
                // "Player undefined". Use the real fields.
                const accountId = p.player_id || p.account_id;
                const name = p.nickname || p.display_name || `Player ${accountId}`;
                return (
                  <LadderRow
                    key={accountId}
                    rank={rank}
                    accountId={accountId}
                    name={name}
                    mmr={p.mmr}
                    wins={p.wins}
                    losses={p.losses}
                    isLeader={rank === 1}
                  />
                );
              })}
            </div>
          )}

          <Link to="/leaderboard" className="oa-cta-ghost uppercase-wide" style={{
            display: 'block', textAlign: 'center', marginTop: 14,
            fontSize: 12, fontFamily: 'var(--font-condensed, inherit)',
            textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 600,
            textDecoration: 'none',
          }}>Full leaderboard →</Link>
        </aside>
      </div>
    </>
  );
}
