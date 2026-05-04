import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getPlayer, getPlayerPositions, getPlayerRatingHistory, getPlayerV3ModifierHistory, getPlayerAchievements, getPlayerNemesis, getPlayerStreak, getPlayerDurationStats, getPlayerCommunityRatings, getPositionAverages, getPlayerAlly, getPlayerWinRateHistory, getImpactScores, getPlayerRanks, getPlayerMatchStatsHistory } from '../api';
import ImpactBadge from '../components/ImpactBadge';
import RankBadge, { MmrBadge } from '../components/RankBadge';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { useSteamAuth } from '../context/SteamAuthContext';
import { useSeason } from '../context/SeasonContext';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
import HeroIcon from '../components/HeroIcon';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const POS_NAMES = { 1: 'Pos 1 (Safe)', 2: 'Pos 2 (Mid)', 3: 'Pos 3 (Off)', 4: 'Pos 4 (Sup)', 5: 'Pos 5 (Hard Sup)' };

function formatDuration(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function RatingChart({ history }) {
  if (!history || history.length < 2) return null;
  const data = history.map((h, i) => ({
    idx: i + 1,
    mmr: Math.round(h.mmr),
    date: h.recorded_at ? new Date(h.recorded_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' }) : `#${i+1}`,
  }));
  const mmrValues = data.map(d => d.mmr);
  const minMmr = Math.min(...mmrValues);
  const maxMmr = Math.max(...mmrValues);
  const domain = [Math.max(0, minMmr - 50), maxMmr + 50];
  const startMmr = data[0].mmr;
  const endMmr = data[data.length - 1].mmr;
  const delta = endMmr - startMmr;
  const deltaColor = delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>MMR History</h2>
        <span style={{ fontSize: 13, color: deltaColor, fontWeight: 600 }}>
          {delta >= 0 ? '+' : ''}{delta} MMR over {history.length} games
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>(all time — chart is not season-filtered)</span>
      </div>
      <div className="stat-card" style={{ padding: '1rem 0.5rem' }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="idx"
              tick={false}
              stroke="var(--border)"
              label={{ value: 'Games →', position: 'insideRight', offset: -10, fill: 'var(--text-muted)', fontSize: 11 }}
            />
            <YAxis
              domain={domain}
              stroke="var(--border)"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              width={42}
            />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
              labelStyle={{ color: 'var(--text-muted)', fontSize: 12 }}
              itemStyle={{ color: 'var(--accent-blue)' }}
              formatter={(v, n) => [v + ' MMR', 'Rating']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
            />
            <Line
              type="monotone"
              dataKey="mmr"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: '#3b82f6' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ModifierHistoryChart({ history }) {
  if (!history || history.length < 2) return null;
  const data = history.map((h, i) => ({
    idx: i + 1,
    modifier: Number((h.modifier ?? 1).toFixed(3)),
    score: Number((h.score ?? 0).toFixed(1)),
    won: h.won ? 'W' : 'L',
    hasStats: h.has_stats !== false,
    date: h.date ? new Date(h.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' }) : `#${i + 1}`,
  }));
  const avg = data.reduce((s, d) => s + d.modifier, 0) / data.length;
  const last = data[data.length - 1].modifier;
  const lastColor = last > 1.05 ? 'var(--accent-green)' : last < 0.95 ? 'var(--accent-red)' : 'var(--text-muted)';
  const lobbyOnlyCount = data.filter(d => !d.hasStats).length;
  // Show a hollow grey dot on lobby-only (no-stats) matches so it's obvious
  // why the modifier sits flat at 1.00× there — V3 doesn't penalise them.
  const renderDot = (props) => {
    const { cx, cy, payload, key } = props;
    if (cx == null || cy == null) return null;
    if (payload && payload.hasStats === false) {
      return <circle key={key} cx={cx} cy={cy} r={3} fill="var(--bg-card)" stroke="var(--text-muted)" strokeWidth={1.5} />;
    }
    return null;
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>⚖️ V3 Performance Modifier</h2>
        <span style={{ fontSize: 13, color: lastColor, fontWeight: 600 }}>
          last ×{last.toFixed(2)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
          avg ×{avg.toFixed(2)} over {data.length} games
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Per-match scaling factor (0.80×–1.20×) applied to this player's MMR change under V3.
        Above 1.00 = strong game vs the lobby; below 1.00 = weak game.
        {lobbyOnlyCount > 0 ? ` ${lobbyOnlyCount} lobby-only match${lobbyOnlyCount === 1 ? '' : 'es'} (no replay) shown as ×1.00 — hollow grey dots.` : ''}
      </p>
      <div className="stat-card" style={{ padding: '1rem 0.5rem' }}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="idx" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} label={{ value: 'Game #', position: 'insideBottomRight', offset: 0, fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis
              domain={[0.78, 1.22]}
              ticks={[0.8, 0.9, 1.0, 1.1, 1.2]}
              tickFormatter={v => `×${v.toFixed(2)}`}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              width={56}
            />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload;
                if (!p) return '';
                return `${p.date} (${p.won})`;
              }}
              formatter={(v, n, p) => {
                if (n === 'modifier') return [`×${v.toFixed(2)}`, 'Modifier'];
                return [v, n];
              }}
            />
            <Line
              type="monotone"
              dataKey="modifier"
              stroke="#a855f7"
              strokeWidth={2}
              dot={renderDot}
              activeDot={{ r: 5, fill: '#a855f7' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function AchievementBadges({ achievements }) {
  const [showLocked, setShowLocked] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  if (!achievements || achievements.length === 0) return null;
  const earned = achievements.filter(a => a.earned);
  if (earned.length === 0) return null;

  const visible = showLocked ? achievements : earned;

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collapsed ? 0 : 12 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>🏅 Achievements</h2>
        <span style={{ fontSize: 11, background: 'var(--accent-blue)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontWeight: 700 }}>
          {earned.length}/{achievements.length}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!collapsed && (
            <button
              onClick={() => setShowLocked(s => !s)}
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 11 }}
            >
              {showLocked ? 'Hide locked' : 'Show locked'}
            </button>
          )}
          <button
            onClick={() => setCollapsed(s => !s)}
            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 11 }}
          >
            {collapsed ? 'Show ▾' : 'Hide ▴'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {visible.map(a => (
            <div
              key={a.key}
              title={a.desc}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 20,
                background: a.earned ? 'var(--bg-card)' : 'var(--bg-secondary)',
                border: `1px solid ${a.earned ? 'var(--accent-blue)' : 'var(--border)'}`,
                opacity: a.earned ? 1 : 0.4,
                boxShadow: a.earned ? '0 0 6px rgba(59,130,246,0.15)' : 'none',
                cursor: 'default',
              }}
            >
              <span style={{ fontSize: 18 }}>{a.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: a.earned ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {a.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// 1.4 — Profile chart v2 (own profile only, gated on `profile_chart_v2`)
// Renders rolling KDA, GPM, and hero damage over the last ~100 matches with a
// 5-game smoothing window. Data sourced from /player/:id/match-stats-history.
function ProfileChartV2({ history }) {
  if (!history || history.length < 5) return null;
  // Build rolling K/D/A and rolling GPM with a 5-game window.
  const win = 5;
  const data = history.map((m, i) => {
    const slice = history.slice(Math.max(0, i - win + 1), i + 1);
    const k = slice.reduce((s, x) => s + (x.kills || 0), 0);
    const d = slice.reduce((s, x) => s + (x.deaths || 0), 0);
    const a = slice.reduce((s, x) => s + (x.assists || 0), 0);
    const gpm = slice.reduce((s, x) => s + (x.gpm || 0), 0) / Math.max(slice.length, 1);
    const kda = ((k + a) / Math.max(d, 1));
    return {
      match_num: i + 1,
      match_id: m.match_id,
      kda: Number(kda.toFixed(2)),
      gpm: Math.round(gpm),
      hero_damage: m.hero_damage || 0,
    };
  });
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>📊 Performance Trend</h2>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          color: '#a855f7', background: 'rgba(168,85,247,0.12)',
          border: '1px solid rgba(168,85,247,0.4)', borderRadius: 6,
          padding: '2px 8px',
        }}>NEW · v2</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>only visible to you</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        5-game rolling K/D/A and GPM over your last {history.length} matches.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Rolling K/D/A</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="match_num" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip
                formatter={(v, n, p) => [v, 'KDA']}
                labelFormatter={i => `Game ${i}`}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="kda" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Rolling GPM</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="match_num" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip
                formatter={(v) => [v, 'GPM']}
                labelFormatter={i => `Game ${i}`}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="gpm" stroke="#22d3ee" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

export default function PlayerProfile() {
  const { accountId } = useParams();
  const { seasonId } = useSeason();
  const navigate = useNavigate();
  const { steamUser } = useSteamAuth();
  // Wave 1 feature flags
  const showMvpBadges = useFeatureFlag('mvp_match_badges');
  const newRankTheme  = useFeatureFlag('new_rank_theme');
  const showProfileChartV2 = useFeatureFlag('profile_chart_v2');
  // Treat the profile as "own" only when viewing your own Steam-linked profile
  const isOwnProfile = !!(steamUser?.accountId && String(steamUser.accountId) === String(accountId));
  const [data, setData] = useState(null);
  const [positions, setPositions] = useState([]);
  const [ratingHistory, setRatingHistory] = useState([]);
  const [modifierHistory, setModifierHistory] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [nemesis, setNemesis] = useState([]);
  const [allies, setAllies] = useState([]);
  const [rawWinRateHistory, setRawWinRateHistory] = useState([]);
  const [wrWindow, setWrWindow] = useState(5);
  const [streak, setStreak] = useState(null);
  const [durationStats, setDurationStats] = useState([]);
  const [communityRatings, setCommunityRatings] = useState(null);
  const [positionAverages, setPositionAverages] = useState([]);
  const [impactScore, setImpactScore] = useState(null);
  const [playerRank, setPlayerRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matchStatsHistory, setMatchStatsHistory] = useState([]);
  const [trendPaywall, setTrendPaywall] = useState(null);

  useEffect(() => {
    if (!showProfileChartV2 || !isOwnProfile || !accountId) {
      setMatchStatsHistory([]);
      setTrendPaywall(null);
      return;
    }
    setTrendPaywall(null);
    getPlayerMatchStatsHistory(accountId, seasonId)
      .then(d => setMatchStatsHistory(d?.history || []))
      .catch((err) => {
        setMatchStatsHistory([]);
        if (err && err.paywall) setTrendPaywall(err);
      });
  }, [accountId, seasonId, showProfileChartV2, isOwnProfile]);

  useEffect(() => {
    getPlayerRanks()
      .then(rows => {
        const match = rows.find(r => String(r.account_id) === String(accountId));
        setPlayerRank(match || null);
      })
      .catch(() => {});
  }, [accountId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPlayer(accountId, seasonId).catch(() => null),
      getPlayerPositions(accountId, seasonId).catch(() => ({ positions: [] })),
      getPlayerRatingHistory(accountId).catch(() => ({ history: [] })),
      getPlayerV3ModifierHistory(accountId).catch(() => ({ history: [] })),
      getPlayerAchievements(accountId).catch(() => ({ achievements: [] })),
      getPlayerNemesis(accountId).catch(() => []),
      getPlayerAlly(accountId, seasonId).catch(() => []),
      getPlayerWinRateHistory(accountId, seasonId).catch(() => ({ history: [] })),
      getPlayerStreak(accountId).catch(() => ({ streak: 0 })),
      getPlayerDurationStats(accountId, seasonId).catch(() => ({ stats: [] })),
      getPlayerCommunityRatings(accountId).catch(() => null),
      getPositionAverages(seasonId).catch(() => ({ averages: [] })),
    ]).then(([playerData, posData, histData, modHistData, achData, nemData, allyData, wrHistData, streakData, durData, ratingData, avgData]) => {
      setData(playerData);
      setPositions(posData?.positions || []);
      setRatingHistory(histData?.history || []);
      setModifierHistory(modHistData?.history || []);
      setAchievements(achData?.achievements || []);
      setNemesis(Array.isArray(nemData) ? nemData : []);
      setAllies(Array.isArray(allyData) ? allyData : []);
      const rawRows = Array.isArray(wrHistData) ? wrHistData : (wrHistData?.history || []);
      setRawWinRateHistory(rawRows);
      setStreak(streakData?.streak ?? null);
      setDurationStats(durData?.stats || []);
      setCommunityRatings(ratingData?.ratings || null);
      setPositionAverages(avgData?.averages || []);
      // Redirect merged secondary accounts to the canonical (primary) profile
      if (playerData?.canonical_id) {
        navigate(`/player/${playerData.canonical_id}`, { replace: true });
      }
    }).finally(() => setLoading(false));
  }, [accountId, seasonId]);

  useEffect(() => {
    getImpactScores(seasonId).then(res => {
      const map = res?.scores || {};
      const key = accountId?.toString();
      if (key && map[key] != null) setImpactScore(map[key].score);
    }).catch(() => {});
  }, [accountId, seasonId]);

  if (loading) return <div className="loading">Loading player...</div>;
  if (!data) return <div className="error-state">Player not found</div>;

  const { rating, nickname, recentMatches, averages, heroes, seasonMmr } = data;
  const winRateHistory = rawWinRateHistory.map((row, idx) => {
    const windowSize = wrWindow === 0 ? rawWinRateHistory.length : wrWindow;
    const slice = rawWinRateHistory.slice(Math.max(0, idx - windowSize + 1), idx + 1);
    const wins = slice.filter(r => parseInt(r.won) === 1).length;
    return { match_num: idx + 1, win_rate: Math.round((wins / slice.length) * 100) };
  });
  const displayName = nickname || rating?.display_name || `Player ${accountId}`;

  const totalMatches = averages ? parseInt(averages.total_matches) : 0;
  const totalKDA = averages && totalMatches > 0
    ? ((parseInt(averages.total_kills) + parseInt(averages.total_assists)) / Math.max(parseInt(averages.total_deaths), 1)).toFixed(2)
    : null;

  return (
    <div>
      <Link to="/players" className="back-link">&larr; Back to players</Link>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 0 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          {displayName}
          {nickname && rating?.display_name && nickname !== rating.display_name && (
            <span style={{ fontSize: '0.6em', color: '#888', marginLeft: '0.5rem' }}>
              ({rating.display_name})
            </span>
          )}
        </h1>
        {playerRank?.dota_rank_tier && (
          <RankBadge
            rankTier={playerRank.dota_rank_tier}
            leaderboardRank={playerRank.dota_leaderboard_rank}
            source={playerRank.dota_rank_source}
            size="lg"
          />
        )}
        {/* 1.8 — Inhouse MMR badge (8-tier MMR ladder, gated on `new_rank_theme`) */}
        {newRankTheme && (seasonMmr != null || rating?.mmr != null) && (
          <MmrBadge mmr={seasonMmr != null ? seasonMmr : rating?.mmr} size="lg" />
        )}
        <button
          onClick={() => {
            const url = window.location.href;
            navigator.clipboard?.writeText(url).then(() => {
              const btn = document.getElementById('share-btn');
              if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { btn.textContent = '🔗 Share'; }, 2000); }
            }).catch(() => {
              window.prompt('Copy this link:', url);
            });
          }}
          id="share-btn"
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >🔗 Share</button>
        <button
          onClick={async () => {
            try {
              const res = await fetch(`/api/players/${accountId}/matches/export.csv${seasonId ? `?season_id=${seasonId}` : ''}`, { credentials: 'same-origin' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `matches_${accountId}${seasonId ? `_s${seasonId}` : ''}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            } catch (err) {
              alert(`Export failed: ${err.message}`);
            }
          }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >📥 Export CSV</button>

      </div>



      {rating && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {/* Row 1 */}
          <div className="stat-card">
            <div className="stat-value mmr">{seasonMmr != null ? seasonMmr : rating.mmr}</div>
            <div className="stat-label">MMR</div>
          </div>
          <div className="stat-card">
            <div className="stat-value wins">{averages ? parseInt(averages.wins) || 0 : rating.wins}</div>
            <div className="stat-label">Wins</div>
          </div>
          <div className="stat-card">
            <div className="stat-value losses">{averages ? parseInt(averages.losses) || 0 : rating.losses}</div>
            <div className="stat-label">Losses</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {(() => {
                const w = averages ? parseInt(averages.wins) || 0 : rating.wins;
                const g = averages ? parseInt(averages.total_matches) || 0 : rating.games_played;
                return g > 0 ? ((w / g) * 100).toFixed(1) + '%' : '—';
              })()}
            </div>
            <div className="stat-label">Win Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalKDA || '—'}</div>
            <div className="stat-label">KDA</div>
          </div>
          <div
            className="stat-card"
            title={averages?.avg_perf != null ? `Avg PERF ${Number(averages.avg_perf).toFixed(1)}/10 across ${averages.perf_games || 0} rated games. Best: ${averages.best_perf != null ? Number(averages.best_perf).toFixed(1) : '—'}.` : 'PERF not yet computed for this player\'s matches'}
          >
            <div className="stat-value" style={{
              color: averages?.avg_perf != null
                ? (Number(averages.avg_perf) >= 9.0 ? '#fbbf24'
                  : Number(averages.avg_perf) >= 8.0 ? '#4ade80'
                  : Number(averages.avg_perf) >= 5.0 ? undefined
                  : '#f87171')
                : undefined,
            }}>
              {averages?.avg_perf != null ? Number(averages.avg_perf).toFixed(1) : '—'}
            </div>
            <div className="stat-label">Avg PERF</div>
          </div>
          <div className="stat-card" style={{
            borderColor: streak ? (streak > 0 ? 'var(--accent-green)' : 'var(--accent-red)') : undefined,
            boxShadow: streak ? (streak > 0 ? '0 0 8px rgba(74,222,128,0.2)' : '0 0 8px rgba(248,113,113,0.2)') : undefined,
          }}>
            <div className="stat-value" style={{ color: streak ? (streak > 0 ? 'var(--accent-green)' : 'var(--accent-red)') : undefined }}>
              {streak ? (streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`) : '—'}
            </div>
            <div className="stat-label">Streak</div>
          </div>

          {/* Row 2 */}
          <div className="stat-card" style={{ borderColor: averages && parseInt(averages.total_firstbloods) > 0 ? '#f87171' : undefined }}>
            <div className="stat-value" style={{ color: averages && parseInt(averages.total_firstbloods) > 0 ? '#f87171' : undefined }}>
              {averages && parseInt(averages.total_firstbloods) > 0
                ? <>{averages.total_firstbloods}<span style={{ fontSize: '0.7em', color: '#64748b', marginLeft: 4 }}>({averages.fb_rate}%)</span></>
                : '—'}
            </div>
            <div className="stat-label">🩸 First Blood</div>
          </div>
          <div className="stat-card" style={{ borderColor: averages && parseInt(averages.pudge_games_with_hooks) > 0 ? '#a78bfa' : undefined }}>
            <div className="stat-value" style={{ color: averages && parseInt(averages.pudge_games_with_hooks) > 0 ? '#a78bfa' : undefined }}>
              {averages && parseInt(averages.pudge_games_with_hooks) > 0
                ? (parseInt(averages.total_hook_attempts) > 0
                    ? ((parseInt(averages.total_hook_hits) / parseInt(averages.total_hook_attempts)) * 100).toFixed(1) + '%'
                    : '—')
                : '—'}
            </div>
            <div className="stat-label">🪝 Hook</div>
          </div>
          <div className="stat-card" style={{ borderColor: impactScore != null ? (impactScore >= 7 ? 'rgba(56,220,80,0.4)' : impactScore >= 4 ? 'rgba(240,170,10,0.35)' : 'rgba(235,50,50,0.35)') : undefined }}>
            <div className="stat-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ImpactBadge score={impactScore} size="lg" />
            </div>
            <div className="stat-label">🎯 Impact Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#fb923c' }}>
              {averages
                ? (parseInt(averages.avg_hero_damage || 0) >= 1000
                    ? (parseInt(averages.avg_hero_damage) / 1000).toFixed(1) + 'k'
                    : parseInt(averages.avg_hero_damage || 0))
                : '—'}
            </div>
            <div className="stat-label">🗡️ Damage</div>
          </div>
          <div className="stat-card" style={{ borderColor: communityRatings && parseInt(communityRatings.mvp_wins) > 0 ? '#fbbf24' : undefined }}>
            <div className="stat-value" style={{ color: '#fbbf24' }}>
              {communityRatings ? communityRatings.mvp_wins : 0} ⭐
            </div>
            <div className="stat-label">MVP Wins</div>
          </div>
          {(() => {
            const att = communityRatings?.avg_attitude ? parseFloat(communityRatings.avg_attitude) : null;
            const color = att !== null ? (att >= 7 ? '#4ade80' : att >= 5 ? '#fbbf24' : '#f87171') : undefined;
            return (
              <div className="stat-card" style={{ borderColor: color }}>
                <div className="stat-value" style={{ color }}>
                  {att !== null ? att.toFixed(1) : '—'}<span style={{ fontSize: '0.6em', color: '#64748b' }}>/10</span>
                </div>
                <div className="stat-label">🤝 Attitude</div>
              </div>
            );
          })()}
        </div>
      )}

      <RatingChart history={ratingHistory} />

      <ModifierHistoryChart history={modifierHistory} />

      {showProfileChartV2 && isOwnProfile && matchStatsHistory.length >= 5 && (
        <ProfileChartV2 history={matchStatsHistory} />
      )}

      {rawWinRateHistory.length >= 3 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 className="section-title" style={{ margin: 0 }}>📈 Rolling Win Rate</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              {[5, 10, 20, 0].map(w => (
                <button
                  key={w}
                  onClick={() => setWrWindow(w)}
                  style={{
                    background: wrWindow === w ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                    color: wrWindow === w ? '#fff' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >{w === 0 ? 'All' : w}</button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {wrWindow === 0 ? 'Cumulative win rate over all games.' : `${wrWindow}-game rolling win rate over time.`}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={winRateHistory} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="match_num" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} label={{ value: 'Game #', position: 'insideBottomRight', offset: 0, fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip formatter={v => [`${v}%`, 'Win Rate']} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Line type="monotone" dataKey="win_rate" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      <AchievementBadges achievements={achievements} />



      {nemesis.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">☠️ Nemesis</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>
            Players who have killed this player the most across all matches.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {nemesis.map((n, i) => {
              const medals = ['💀', '🩸', '⚔️'];
              return (
                <div key={n.killer_account_id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '14px 18px', minWidth: 160, flex: 1,
                }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{medals[i] || '⚔️'}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {n.killer_name || `Player ${n.killer_account_id}`}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600 }}>
                    {n.total_kills} kills
                  </div>
                  {n.last_hero && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Last seen on {formatHeroName(n.last_hero)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {allies.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">🤝 Best Allies</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>
            Players you win most with (min. 3 games together).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {allies.slice(0, 5).map((a, i) => {
              const games = parseInt(a.games_together) || 0;
              const wins = parseInt(a.wins_together) || 0;
              const wr = games > 0 ? Math.round((wins / games) * 100) : 0;
              return (
                <div key={i} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '14px 18px', minWidth: 160, flex: 1,
                }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>🤝</div>
                  <Link to={`/player/${a.account_id}`} style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                    {a.display_name || `Player ${a.account_id}`}
                  </Link>
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    <span style={{ color: wr >= 60 ? 'var(--radiant-color)' : wr >= 45 ? 'var(--text-primary)' : 'var(--dire-color)', fontWeight: 700 }}>
                      {wr}% WR
                    </span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({games} games)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}


      {averages && totalMatches > 0 && (
        <section>
          <h2 className="section-title">Averages ({totalMatches} games)</h2>
          <div className="stats-grid">
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_kills}</div>
              <div className="stat-label">Kills</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_deaths}</div>
              <div className="stat-label">Deaths</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_assists}</div>
              <div className="stat-label">Assists</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_gpm}</div>
              <div className="stat-label">GPM</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_xpm}</div>
              <div className="stat-label">XPM</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseInt(averages.avg_hero_damage).toLocaleString()}</div>
              <div className="stat-label">Hero Dmg</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseInt(averages.avg_tower_damage).toLocaleString()}</div>
              <div className="stat-label">Tower Dmg</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseInt(averages.avg_hero_healing).toLocaleString()}</div>
              <div className="stat-label">Healing</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_last_hits}</div>
              <div className="stat-label">Last Hits</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_denies}</div>
              <div className="stat-label">Denies</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseFloat(averages.avg_obs_placed || 0).toFixed(1)}</div>
              <div className="stat-label">Obs Wards</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseFloat(averages.avg_sen_placed || 0).toFixed(1)}</div>
              <div className="stat-label">Sentry Wards</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseFloat(averages.avg_camps_stacked || 0).toFixed(1)}</div>
              <div className="stat-label">Camps Stacked</div>
            </div>
          </div>
        </section>
      )}

      {positions.length > 0 && (
        <section>
          <h2 className="section-title">Position Breakdown</h2>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player" title="Lane position (1-5)">Position</th>
                  <th className="col-stat" title="Games played at this position">Games</th>
                  <th className="col-stat" title="Wins at this position">Wins</th>
                  <th className="col-stat" title="Win percentage at this position">Win%</th>
                  <th className="col-stat" title="Average kills per game">K</th>
                  <th className="col-stat" title="Average deaths per game">D</th>
                  <th className="col-stat" title="Average assists per game">A</th>
                  <th className="col-stat" title="Average Gold Per Minute">GPM</th>
                </tr>
              </thead>
              <tbody>
                {positions.filter(p => p.position > 0).sort((a, b) => b.games - a.games).map((p, i) => {
                  const wr = p.games > 0 ? ((p.wins / p.games) * 100).toFixed(0) : '0';
                  return (
                    <tr key={i}>
                      <td className="col-player">{POS_NAMES[p.position] || `Pos ${p.position}`}</td>
                      <td className="col-stat">{p.games}</td>
                      <td className="col-stat wins">{p.wins}</td>
                      <td className="col-stat" style={{ color: parseInt(wr) >= 50 ? '#4ade80' : '#f87171' }}>{wr}%</td>
                      <td className="col-stat">{p.avg_kills}</td>
                      <td className="col-stat">{p.avg_deaths}</td>
                      <td className="col-stat">{p.avg_assists}</td>
                      <td className="col-stat">{parseInt(p.avg_gpm).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(() => {
        if (!positions.length || !positionAverages.length) return null;
        const mainPos = positions.filter(p => p.position > 0).sort((a, b) => b.games - a.games)[0];
        if (!mainPos) return null;
        const serverAvg = positionAverages.find(a => parseInt(a.position) === parseInt(mainPos.position));
        if (!serverAvg) return null;
        const posLabel = POS_NAMES[mainPos.position] || `Pos ${mainPos.position}`;
        const stats = [
          { label: 'KDA', player: `${parseFloat(mainPos.avg_kills || 0).toFixed(1)}/${parseFloat(mainPos.avg_deaths || 0).toFixed(1)}/${parseFloat(mainPos.avg_assists || 0).toFixed(1)}`, server: `${parseFloat(serverAvg.avg_kills).toFixed(1)}/${parseFloat(serverAvg.avg_deaths).toFixed(1)}/${parseFloat(serverAvg.avg_assists).toFixed(1)}`, pVal: null, sVal: null, noBar: true },
          { label: 'GPM', player: Math.round(mainPos.avg_gpm || 0), server: Math.round(serverAvg.avg_gpm), pVal: parseFloat(mainPos.avg_gpm || 0), sVal: parseFloat(serverAvg.avg_gpm), higherBetter: true },
          { label: 'Damage', player: Math.round(mainPos.avg_hero_damage || 0).toLocaleString(), server: Math.round(serverAvg.avg_hero_damage).toLocaleString(), pVal: parseFloat(mainPos.avg_hero_damage || 0), sVal: parseFloat(serverAvg.avg_hero_damage), higherBetter: true },
          { label: 'LH', player: Math.round(mainPos.avg_last_hits || 0), server: Math.round(serverAvg.avg_last_hits), pVal: parseFloat(mainPos.avg_last_hits || 0), sVal: parseFloat(serverAvg.avg_last_hits), higherBetter: true },
          { label: 'Healing', player: Math.round(mainPos.avg_hero_healing || 0).toLocaleString(), server: Math.round(serverAvg.avg_hero_healing).toLocaleString(), pVal: parseFloat(mainPos.avg_hero_healing || 0), sVal: parseFloat(serverAvg.avg_hero_healing), higherBetter: true },
        ];
        return (
          <section>
            <h2 className="section-title">How You Compare — {posLabel}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Your averages vs all players at {posLabel} across all inhouse games.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {stats.map(s => {
                const pv = parseFloat(s.pVal) || 0;
                const sv = parseFloat(s.sVal) || 0;
                const isAbove = s.higherBetter ? pv >= sv : pv <= sv;
                const diff = sv > 0 ? ((pv - sv) / sv * 100) : 0;
                const diffLabel = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
                const maxBar = Math.max(pv, sv, 1);
                return (
                  <div key={s.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: 80 }}>{s.label}</span>
                      <span style={{ fontWeight: 700, color: s.noBar ? 'var(--text-primary)' : (isAbove ? 'var(--accent-green, #4caf50)' : 'var(--accent-red, #f44336)') }}>
                        You: {s.player}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>Server: {s.server}</span>
                      {!s.noBar && <span style={{ color: isAbove ? 'var(--accent-green, #4caf50)' : 'var(--accent-red, #f44336)', minWidth: 52, textAlign: 'right' }}>{diffLabel}</span>}
                    </div>
                    {!s.noBar && (
                      <div style={{ position: 'relative', height: 8, background: '#333', borderRadius: 4, overflow: 'visible' }}>
                        <div style={{ width: `${Math.min((pv / maxBar) * 100, 100)}%`, height: '100%', background: isAbove ? 'var(--accent-green, #4caf50)' : 'var(--accent-red, #f44336)', borderRadius: 4 }} />
                        <div style={{ position: 'absolute', top: 0, left: `${Math.min((sv / maxBar) * 100, 100)}%`, width: 2, height: '100%', background: 'var(--text-muted)', transform: 'translateX(-50%)' }} title={`Server avg: ${s.server}`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {heroes && heroes.length > 0 && (
        <section>
          <h2 className="section-title">Most Played Heroes</h2>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player" title="Hero name">Hero</th>
                  <th className="col-stat" title="Games played with this hero">Games</th>
                  <th className="col-stat" title="Wins with this hero">Wins</th>
                  <th className="col-stat" title="Win percentage with this hero">Win %</th>
                  <th className="col-stat" title="Average kills per game">K</th>
                  <th className="col-stat" title="Average deaths per game">D</th>
                  <th className="col-stat" title="Average assists per game">A</th>
                  <th className="col-stat" title="Average Gold Per Minute">GPM</th>
                  <th className="col-stat" title="Average Hero Damage dealt per game">HD</th>
                </tr>
              </thead>
              <tbody>
                {heroes.slice(0, 20).map((h, i) => (
                  <tr key={i}>
                    <td className="col-player">{getHeroName(h.hero_id, h.hero_name)}</td>
                    <td className="col-stat">{h.games}</td>
                    <td className="col-stat wins">{h.wins}</td>
                    <td className="col-stat">
                      {h.games > 0 ? ((h.wins / h.games) * 100).toFixed(0) + '%' : '--'}
                    </td>
                    <td className="col-stat">{h.avg_kills}</td>
                    <td className="col-stat">{h.avg_deaths}</td>
                    <td className="col-stat">{h.avg_assists}</td>
                    <td className="col-stat">{parseInt(h.avg_gpm).toLocaleString()}</td>
                    <td className="col-stat">{parseInt(h.avg_hero_damage).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {durationStats && durationStats.length > 0 && (
        <section>
          <h2 className="section-title">Win Rate by Game Duration</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {durationStats.map(row => {
              const wr = row.games > 0 ? Math.round(100 * row.wins / row.games) : 0;
              const barColor = wr >= 55 ? '#4ade80' : wr >= 45 ? '#facc15' : '#f87171';
              return (
                <div key={row.bracket} style={{
                  background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                  padding: '1rem 1.25rem', minWidth: 140, textAlign: 'center',
                }}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: 4 }}>{row.bracket}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: barColor }}>{wr}%</div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 2 }}>{row.games} games</div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 4 }}>
                    Avg {row.avg_kills}K · {row.avg_gpm} GPM
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {recentMatches && recentMatches.length > 0 && (
        <section>
          <h2 className="section-title">Recent Matches</h2>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player" title="Match ID (click to view details)">Match</th>
                  <th className="col-hero" title="Hero played">Hero</th>
                  <th className="col-stat" title="Kills">K</th>
                  <th className="col-stat" title="Deaths">D</th>
                  <th className="col-stat" title="Assists">A</th>
                  <th className="col-stat" title="Gold Per Minute">GPM</th>
                  <th className="col-stat" title="Match result">Result</th>
                </tr>
              </thead>
              <tbody>
                {recentMatches.map((m, i) => {
                  const won = (m.team === 'radiant' && m.radiant_win) ||
                              (m.team === 'dire' && !m.radiant_win);
                  return (
                    <tr key={i}>
                      <td className="col-player">
                        <Link to={`/match/${m.match_id}`} className="player-link">
                          #{m.match_id}
                        </Link>
                        {/* 1.5 — MVP marker (gated on `mvp_match_badges`) */}
                        {showMvpBadges && m.is_mvp && (
                          <span
                            title="Voted MVP by teammates"
                            style={{
                              display: 'inline-block', marginLeft: 6,
                              color: '#fbbf24', fontWeight: 700, fontSize: 11,
                              verticalAlign: 'middle',
                            }}
                          >⭐</span>
                        )}
                      </td>
                      <td className="col-hero">{getHeroName(m.hero_id, m.hero_name)}</td>
                      <td className="col-stat">{m.kills}</td>
                      <td className="col-stat">{m.deaths}</td>
                      <td className="col-stat">{m.assists}</td>
                      <td className="col-stat">{m.gpm}</td>
                      <td className={`col-stat ${won ? 'wins' : 'losses'}`}>
                        {won ? 'Won' : 'Lost'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
