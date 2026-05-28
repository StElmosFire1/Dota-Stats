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
import { LiveInhousePulse, PlayerOfTheWeek, HotHeroes, FeaturedPlayer, WatchLiveBadge } from '../components/HomeWidgets';
import LiveQueueWidget from '../components/LiveQueueWidget';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// Season10LaunchBanner is now CMS-driven via web/src/components/HomeBanner.jsx
// (settings key `home_banner`). The legacy hard-coded banner was removed in v5.76.

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
                <MmrBadge mmr={homeData.mmr} size="lg" isLeader={isLeader} />
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
        <HomeBanner />
        <SponsorshipBanner slug="home_top" style={{ margin: '12px 0' }} />
        {tournamentBanner}
        <LiveQueueWidget />
        <WatchLiveBadge />
        <LiveInhousePulse />
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

      <HomeBanner />
      <SponsorshipBanner slug="home_top" style={{ margin: '12px 0' }} />

      {tournamentBanner}

      <LiveQueueWidget />
      <WatchLiveBadge />
      <LiveInhousePulse />
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
      {/* Stats Strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 32,
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)', padding: '22px 18px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <div className="font-serif" style={{
              fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1,
              fontFamily: 'var(--font-serif, serif)',
            }}>{loading ? '—' : s.value}</div>
            <div className="uppercase-wide" style={{
              fontSize: 11, fontFamily: 'var(--font-condensed, inherit)',
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.15em', textAlign: 'center',
            }}>{s.label}</div>
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

          <div className="oa-card" style={{ overflow: 'hidden' }}>
            {recentMatches.length === 0 ? (
              <div style={{ padding: '24px 18px', color: 'var(--text-muted)', fontSize: 13 }}>
                No matches recorded yet.
              </div>
            ) : (
              <>
                <div className="uppercase-wide" style={{
                  display: 'grid', gridTemplateColumns: '110px 1fr 80px 110px 80px',
                  alignItems: 'center', gap: 10,
                  padding: '10px 16px', borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-primary, var(--bg-base))',
                  fontSize: 11, color: 'var(--text-muted)',
                  fontFamily: 'var(--font-condensed, inherit)',
                  textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600,
                }}>
                  <span>Winner</span>
                  <span>Score</span>
                  <span style={{ textAlign: 'center' }}>Duration</span>
                  <span style={{ textAlign: 'center' }}>MVP</span>
                  <span style={{ textAlign: 'right' }}>Time</span>
                </div>
                {recentMatches.slice(0, 5).map((m, i, arr) => {
                  const radWin = m.radiant_win;
                  const score = (m.radiant_score != null && m.dire_score != null)
                    ? `${m.radiant_score} - ${m.dire_score}` : '—';
                  return (
                    <Link
                      key={m.match_id}
                      to={`/match/${m.match_id}`}
                      style={{
                        display: 'grid', gridTemplateColumns: '110px 1fr 80px 110px 80px',
                        alignItems: 'center', gap: 10,
                        padding: '14px 16px', textDecoration: 'none',
                        borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      <span>
                        <span className={`oa-tag ${radWin ? 'oa-tag-radiant' : 'oa-tag-dire'}`}>
                          {radWin ? 'Radiant' : 'Dire'}
                        </span>
                      </span>
                      <span style={{
                        fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
                        fontFamily: 'var(--font-condensed, inherit)', letterSpacing: '0.02em',
                      }}>{score}</span>
                      <span style={{
                        textAlign: 'center', fontSize: 13, color: 'var(--text-muted)',
                        fontFamily: 'var(--font-condensed, inherit)',
                      }}>{fmtDurMmSs(m.duration)}</span>
                      <span className="font-serif" style={{
                        textAlign: 'center', fontStyle: 'italic', fontWeight: 700,
                        color: 'var(--brass, var(--accent))',
                        fontFamily: 'var(--font-serif, serif)',
                      }}>{m.top_killer || '—'}</span>
                      <span style={{
                        textAlign: 'right', fontSize: 12, color: 'var(--text-muted)',
                        fontFamily: 'var(--font-condensed, inherit)',
                      }}>{fmtAgo(m.date)}</span>
                    </Link>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Top 5 Players sidebar */}
        <aside>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <h2 className="font-serif" style={{
                margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif, serif)',
              }}>Top 5 Players</h2>
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
            <div className="oa-card" style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
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
                  <Link
                    key={accountId}
                    to={`/player/${accountId}`}
                    className="oa-card oa-card-rule"
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '12px 14px 12px 18px',
                      textDecoration: 'none',
                    }}
                  >
                    <div className={`oa-rank-numeral ${rank <= 3 ? 'is-top' : ''}`} style={{
                      width: 38, textAlign: 'center', marginRight: 14, flexShrink: 0,
                    }}>{rank}</div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="font-serif" style={{
                          fontSize: 16, fontWeight: 700, color: 'var(--text-primary)',
                          lineHeight: 1.1, marginBottom: 3,
                          fontFamily: 'var(--font-serif, serif)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{name}</div>
                        <div className="uppercase-wide" style={{
                          fontSize: 10, color: 'var(--text-muted)',
                          fontFamily: 'var(--font-condensed, inherit)',
                          textTransform: 'uppercase', letterSpacing: '0.14em',
                        }}>{p.wins || 0}W – {p.losses || 0}L</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                        <div style={{
                          fontSize: 18, fontWeight: 700, color: 'var(--brass, var(--accent))',
                          lineHeight: 1.1, marginBottom: 2,
                          fontFamily: 'var(--font-condensed, inherit)',
                        }}>{Math.round(p.mmr || 0)}</div>
                        <div style={{
                          fontSize: 10, color: 'var(--text-muted)',
                          fontFamily: 'var(--font-condensed, inherit)',
                          letterSpacing: '0.06em',
                        }}>MMR</div>
                      </div>
                    </div>
                  </Link>
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
