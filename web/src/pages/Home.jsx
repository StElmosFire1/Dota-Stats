import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getHomeStats, getLatestRecap, getSeasons, getPredictions, getWeekendTournaments } from '../api';
import { fmtDate } from '../utils/dates';
import { useSeason } from '../context/SeasonContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { formatHeroName } from '../utils/heroes';
import { useSteamAuth } from '../context/SteamAuthContext';
import { MmrBadge } from '../components/RankBadge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const LAUNCH_BANNER_DISMISS_KEY = 'season10LaunchBannerDismissed_v2';

function Season10LaunchBanner() {
  const enabled = useFeatureFlag('home_launch_banner');
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(LAUNCH_BANNER_DISMISS_KEY) === '1'; } catch { return false; }
  });
  if (!enabled || dismissed) return null;
  const handleDismiss = () => {
    try { localStorage.setItem(LAUNCH_BANNER_DISMISS_KEY, '1'); } catch {}
    setDismissed(true);
  };
  return (
    <div className="oa-card oa-card-rule oa-hero-glow oa-home-hero" style={{ paddingRight: '3rem' }}>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute', top: 12, right: 14,
          background: 'transparent', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4, zIndex: 2,
        }}
      >×</button>
      <div className="oa-eyebrow">Season 10 · Court &amp; Pitch</div>
      <h1>The new season <em>is in session.</em></h1>
      <p>
        Fresh ladder, refined design, and the full Court &amp; Pitch experience across every page.
        Read the patch notes for the rundown — and good luck on the climb.
      </p>
      <div className="oa-home-hero-cta">
        <Link to="/leaderboard" className="oa-cta-primary">Open the ladder</Link>
        <Link to="/patch-notes" className="oa-cta-ghost">Patch notes</Link>
      </div>
    </div>
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
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', gap: 4, flex: 1, minWidth: 140,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value ?? '—'}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</span>}
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
  return (
    <Link to={`/match/${m.match_id}`} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: 'var(--bg-hover)', textDecoration: 'none',
      border: '1px solid transparent', transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
    >
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
        background: won ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        color: won ? 'var(--accent-green, #22c55e)' : 'var(--accent-red, #ef4444)',
        border: `1px solid ${won ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      }}>
        {won ? 'WIN' : 'LOSS'}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
        {heroName}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {m.kills}/{m.deaths}/{m.assists}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {fmtDuration(m.duration)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {fmtDate(m.date)}
      </span>
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
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '18px 20px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          📈 MMR History
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            last {data.length} games
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: deltaColor }}>
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

  const displayName = steamUser?.displayName || `Player ${steamUser?.accountId}`;
  const accountId = steamUser?.accountId;

  return (
    <>
      {/* Personal hero banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(59,130,246,0.1) 100%)',
        border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px',
        marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Welcome back
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
            {displayName}
          </h1>
          {!loading && homeData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  {homeData.mmr !== null && (
                <MmrBadge mmr={homeData.mmr} size="lg" />
              )}
              {homeData.games_played > 0 && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {homeData.wins}W – {homeData.losses}L
                </span>
              )}
              {homeData.streak !== 0 && <StreakBadge streak={homeData.streak} />}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {accountId && (
            <Link to={`/player/${accountId}`} className="btn btn-primary" style={{ fontSize: 13 }}>
              👤 My Profile
            </Link>
          )}
          <Link to="/leaderboard" className="btn" style={{ fontSize: 13 }}>
            🏆 Leaderboard
          </Link>
          <Link to="/matches" className="btn" style={{ fontSize: 13 }}>
            🎮 Matches
          </Link>
        </div>
      </div>

      <MiniMmrChart accountId={accountId} />

      {loading ? (
        <div className="loading" style={{ marginBottom: 28 }}>Loading your stats…</div>
      ) : homeData ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

          {/* Last 3 matches */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 22 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>🕐 Recent Games</span>
              {accountId && (
                <Link to={`/player/${accountId}`} style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>
                  All matches →
                </Link>
              )}
            </h2>
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
                  icon="🎮"
                  label="Games"
                  value={homeData.games_played}
                />
                <StatCard
                  icon="📊"
                  label="Win rate"
                  value={homeData.games_played > 0
                    ? `${Math.round((homeData.wins / homeData.games_played) * 100)}%`
                    : '—'}
                />
              </div>
            )}

            {/* Hero spotlight */}
            {homeData.top_hero && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px',
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  ⭐ Your hero this week
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 56, height: 32, borderRadius: 6, overflow: 'hidden',
                    background: 'var(--bg-hover)', flexShrink: 0,
                  }}>
                    <img
                      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${homeData.top_hero.hero_name || ''}.png`}
                      alt={homeData.top_hero.hero_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatHeroName(homeData.top_hero.hero_name) || homeData.top_hero.hero_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {homeData.top_hero.picks} game{homeData.top_hero.picks !== 1 ? 's' : ''} this week
                      {homeData.top_hero.picks > 0 && homeData.top_hero.wins != null && (
                        <> · {Math.round((homeData.top_hero.wins / homeData.top_hero.picks) * 100)}% WR</>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`/heroes`}
                    style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}
                  >
                    Heroes →
                  </Link>
                </div>
              </div>
            )}

            {/* Active inhouse lobby */}
            {homeData.active_session && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, var(--bg-card) 100%)',
                border: '1px solid rgba(34,197,94,0.35)', borderRadius: 12, padding: '16px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🎮 Active lobby
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
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  📅 Next scheduled game
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
    </>
  );
}

export default function Home() {
  const { steamUser, loading: authLoading } = useSteamAuth() || {};
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

  if (!authLoading && steamUser) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Season10LaunchBanner />
        <PersonalisedDashboard steamUser={steamUser} />

        {/* Community stats section below personalized view */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '16px 22px', marginBottom: 20,
        }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>
            🌏 Community stats
          </h2>
          {loading ? (
            <div className="loading">Loading…</div>
          ) : (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <StatCard icon="🎮" label="Total Matches" value={totals.total_matches} />
              <StatCard icon="👥" label="Players" value={totals.total_players} />
              <StatCard icon="📅" label="This Week" value={totals.matches_this_week} sub="matches played" />
              <StatCard icon="🦸" label="Most Played Hero" value={formatHeroName(totals.most_played_hero)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      <Season10LaunchBanner />

      {/* Hero banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(59,130,246,0.08) 100%)',
        border: '1px solid var(--border)', borderRadius: 16, padding: '32px 36px',
        marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--text-primary)' }}>
            ⚔️ OCE Dota 2 Inhouse
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text-secondary)', maxWidth: 480 }}>
            A private stats tracker for the OCE inhouse community. Track matches, MMR, hero performance, and more.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/leaderboard" className="btn btn-primary" style={{ fontSize: 13 }}>
            🏆 Leaderboard
          </Link>
          <Link to="/matches" className="btn" style={{ fontSize: 13 }}>
            🎮 Matches
          </Link>
          <JoinTheLeagueButton />
        </div>
      </div>

      {/* Weekend Tournament Banner */}
      {activeTournament && (
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
      )}

      {/* Server stats */}
      {loading ? (
        <div className="loading" style={{ marginBottom: 28 }}>Loading stats…</div>
      ) : (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28, justifyContent: 'center' }}>
          <StatCard icon="🎮" label="Total Matches" value={totals.total_matches} />
          <StatCard icon="👥" label="Players" value={totals.total_players} />
          <StatCard icon="📅" label="This Week" value={totals.matches_this_week} sub="matches played" />
          <StatCard icon="🦸" label="Most Played Hero" value={formatHeroName(totals.most_played_hero)} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>

        {/* Weekly AI Recap */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, gridColumn: recap?.ai_blurb ? 'span 2' : 'span 1' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            📊 Weekly Recap
            {recap?.generated_at && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                generated {fmtDate(recap.generated_at)}
              </span>
            )}
          </h2>
          {recap?.ai_blurb ? (
            <div>
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, fontStyle: 'italic' }}>
                "{recap.ai_blurb}"
              </p>
              {recap.matches_count > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {recap.matches_count} match{recap.matches_count !== 1 ? 'es' : ''} played last week
                  {recap.period_start && ` · ${fmtDate(recap.period_start)} – ${fmtDate(recap.period_end)}`}
                </div>
              )}
              {recap.top_performers && recap.top_performers.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {recap.top_performers.slice(0, 3).map((p, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i];
                    return (
                      <span key={p.account_id} style={{
                        background: 'var(--bg-hover)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '4px 10px', fontSize: 12, color: 'var(--text-primary)',
                      }}>
                        {medal} {p.player_name} · {parseFloat(p.avg_kda).toFixed(2)} KDA
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No weekly recap yet — one is auto-generated every Monday, or use <code>!recap</code> in Discord.
            </div>
          )}
        </div>

        {/* Recent matches */}
        {!recap?.ai_blurb && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 22 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              🕐 Recent Matches
            </h2>
            {recentMatches.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No matches recorded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentMatches.map(m => <MatchRow key={m.match_id} m={m} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Predictions widget */}
      {predInfo && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              🎯 Season Predictions — {predInfo.season.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {predInfo.count > 0
                ? <>{predInfo.count} prediction{predInfo.count !== 1 ? 's' : ''} submitted — predict who ends up top 5!</>
                : 'No predictions yet — be the first to predict the top 5!'}
            </div>
          </div>
          <Link to="/predictions" className="btn btn-primary" style={{ fontSize: 13, flexShrink: 0 }}>
            {predInfo.count > 0 ? 'View Predictions' : 'Make a Prediction'}
          </Link>
        </div>
      )}

      {/* Recent matches (shown below when recap is present) */}
      {recap?.ai_blurb && recentMatches.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            🕐 Recent Matches
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentMatches.map(m => <MatchRow key={m.match_id} m={m} />)}
          </div>
        </div>
      )}

    </div>
  );
}
