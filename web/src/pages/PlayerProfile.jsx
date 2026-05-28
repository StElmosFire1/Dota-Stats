import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getPlayer, getPlayerPositions, getPlayerRatingHistory, getPlayerV3ModifierHistory, getPlayerAchievements, getPlayerNemesis, getPlayerPredictionStats, getPlayerHeroCounters, getPlayerStreak, getCaptainAutoPickStats, getPlayerDurationStats, getPlayerCommunityRatings, getPositionAverages, getPlayerAlly, getPlayerWinRateHistory, getImpactScores, getPlayerRanks, getPlayerMatchStatsHistory, getPlayerHeroSuggestions, createGiftProCheckout, createGiftSeasonPassCheckout, getScoutingReport, getLeaderboard, getPlayerTimeOfDay, getPlayerHeroItems, getPlayerSeasonWrapped, getPlayerHallOfFamePlaques, getAllPlayers, getPlayerComparison, getPlayerPresence, getPlayerRivals, getPlayerItemBenchmarks, getDraftTrainerAccuracy } from '../api';
import Dialog from '../components/Dialog';
import { FRAME_META, DEFAULT_FRAME } from '../profileCosmetics';
import ImpactBadge from '../components/ImpactBadge';
import RankBadge, { MmrBadge } from '../components/RankBadge';
import ProfileCard from '../components/ProfileCard';
import RivalCard from '../components/RivalCard';
import MoodFormWidget from '../components/MoodFormWidget';
import ProfileV3Panels from '../components/ProfileV3Panels';
import MagazineCover from '../components/MagazineCover';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { useSteamAuth } from '../context/SteamAuthContext';
import { useSuperuser } from '../context/SuperuserContext';
import { useSeason } from '../context/SeasonContext';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
import HeroIcon from '../components/HeroIcon';
import ProBadge from '../components/ProBadge';
import PaywallCard from '../components/PaywallCard';
import WeeklyReportTile from '../components/WeeklyReportTile';
import QuestTracker from '../components/QuestTracker';
import HeroMasterySection from '../components/HeroMasterySection';
import SponsorChip from '../components/SponsorChip';
import SponsorshipBanner from '../components/SponsorshipBanner';
import VerifiedBadge from '../components/VerifiedBadge';
import CoachRecommendationsTile from '../components/CoachRecommendationsTile';
import { VerifiedBadgeOwnerCta } from '../components/VerifiedBadgePurchaseModal';
import useProMembers from '../hooks/useProMembers';
import useProStatus from '../hooks/useProStatus';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const POS_NAMES = { 1: 'Pos 1 (Safe)', 2: 'Pos 2 (Mid)', 3: 'Pos 3 (Off)', 4: 'Pos 4 (Sup)', 5: 'Pos 5 (Hard Sup)' };

// Task #442 — "Compare vs…" picker. Self-fetches the player roster
// once, navigates to /h2h/<thisProfile>/<pickedAccountId> on change.
// Renders a quick "vs me" link when the viewer is signed in and looking
// at someone else's profile so they don't have to scroll the dropdown.
function H2HComparePicker({ thisAccountId, isOwnProfile, viewerAccountId }) {
  const navigate = useNavigate();
  const [players, setPlayers] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    getAllPlayers()
      .then(list => { if (alive) setPlayers(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!thisAccountId) return null;
  const handleChange = (e) => {
    const v = e.target.value;
    if (!v || String(v) === String(thisAccountId)) return;
    navigate(`/h2h/${thisAccountId}/${v}`);
  };
  const showVsMe = !isOwnProfile && viewerAccountId
    && String(viewerAccountId) !== String(thisAccountId);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
        <span aria-hidden="true">⚔️</span>
        <span>Compare H2H vs</span>
        <select
          value=""
          onChange={handleChange}
          aria-label="Compare this player's head-to-head against another player"
          style={{
            background: 'var(--bg-card)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '6px 10px', fontSize: 13, fontWeight: 600,
          }}
        >
          <option value="">Pick a player…</option>
          {players
            .filter(p => p.account_id && String(p.account_id) !== String(thisAccountId))
            .map(p => (
              <option key={p.account_id} value={p.account_id}>
                {p.nickname || p.persona_name || `Player ${p.account_id}`}
              </option>
            ))}
        </select>
      </label>
      {showVsMe && (
        <Link
          to={`/h2h/${thisAccountId}/${viewerAccountId}`}
          aria-label="View detailed head-to-head: this player vs me"
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--accent, #c5a975)', borderRadius: 8,
            padding: '6px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}
        >vs me →</Link>
      )}
    </div>
  );
}

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

const ACHIEVEMENT_GROUP_ORDER = [
  'Milestones', 'Win Rate', 'Streaks', 'Survivability', 'Roles',
  'Hero Pool', 'Hero Mastery', 'Multi-kills', 'First Blood',
  'Totals', 'Economy', 'Damage', 'Healing', 'Vision', 'KDA',
  'Community', 'Secret',
];

// ── ItemBenchmarksSection (Task #377) ────────────────────────────────────────
// Aggregates the player's avg first-purchase per item against the seasonal
// position baseline, rendering one row per major item sorted by absolute delta
// so the most distinctive (fastest / slowest vs league) items surface first.
// Hidden when the player has no item rows in this season.
function ItemBenchmarksSection({ data }) {
  if (!data || !data.byPosition || !data.primaryPosition) return null;
  const pos = data.primaryPosition;
  const mine = data.byPosition[pos] || {};
  const base = (data.baseline && data.baseline[pos]) || {};
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fmtDelta = s => {
    const sign = s < 0 ? '-' : '+';
    const abs = Math.abs(s);
    return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
  };
  const rows = Object.keys(mine).map(item => {
    const myT = mine[item].avgT;
    const baseT = base[item]?.avgT ?? null;
    const delta = baseT != null ? myT - baseT : null;
    return { item, myT, n: mine[item].n, baseT, delta };
  }).filter(r => r.delta != null);
  if (!rows.length) return null;
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = rows.slice(0, 12);
  const prettify = n => n.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Item benchmarks <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>— avg first-purchase time vs Pos {pos} seasonal average</span></h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {top.map(r => {
          const c = r.delta <= -30 ? '#4ade80' : r.delta >= 30 ? '#f87171' : '#facc15';
          return (
            <div key={r.item} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{prettify(r.item)}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                {fmt(r.myT)} <span style={{ color: '#64748b' }}>vs {fmt(r.baseT)}</span>
                <span style={{ marginLeft: 8, color: c, fontWeight: 700 }}>{fmtDelta(r.delta)}</span>
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>n={r.n}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AchievementBadges({ achievements }) {
  const [showLocked, setShowLocked] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [activeGroup, setActiveGroup] = React.useState('All');

  if (!achievements || achievements.length === 0) return null;
  const earned = achievements.filter(a => a.earned);

  const groups = ['All', ...ACHIEVEMENT_GROUP_ORDER.filter(g =>
    achievements.some(a => a.group === g)
  )];

  const filtered = achievements.filter(a => {
    if (!showLocked && !a.earned) return false;
    if (activeGroup !== 'All' && a.group !== activeGroup) return false;
    return true;
  });

  const formatDate = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return null; }
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collapsed ? 0 : 12, flexWrap: 'wrap' }}>
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
              {showLocked ? 'Hide locked' : 'Show all'}
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
        <>
          {/* Category filter tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {groups.map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                style={{
                  background: activeGroup === g ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                  color: activeGroup === g ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${activeGroup === g ? 'var(--accent-blue)' : 'var(--border)'}`,
                  borderRadius: 12, padding: '2px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}
              >{g}</button>
            ))}
          </div>

          {/* Badge grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {filtered.map(a => {
              const isSecret = a.secret && !a.earned;
              const displayLabel = isSecret ? '???' : a.label;
              const displayDesc = isSecret ? 'Hidden achievement — keep playing to discover!' : a.desc;
              const unlockDate = a.earned && a.achieved_at ? formatDate(a.achieved_at) : null;
              return (
                <div
                  key={a.key}
                  title={displayDesc + (unlockDate ? `\nUnlocked: ${unlockDate}` : '')}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '10px 12px', borderRadius: 10, minWidth: 80, maxWidth: 110, textAlign: 'center',
                    background: a.earned ? 'var(--bg-card)' : 'var(--bg-secondary)',
                    border: `1px solid ${a.earned ? (a.secret ? '#f59e0b' : 'var(--accent-blue)') : 'var(--border)'}`,
                    opacity: a.earned ? 1 : 0.4,
                    boxShadow: a.earned ? `0 0 8px ${a.secret ? 'rgba(245,158,11,0.25)' : 'rgba(59,130,246,0.15)'}` : 'none',
                    cursor: 'default',
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{a.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: a.earned ? (a.secret ? '#f59e0b' : 'var(--text-primary)') : 'var(--text-muted)', lineHeight: 1.2 }}>
                    {displayLabel}
                  </span>
                  {unlockDate && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.1 }}>{unlockDate}</span>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {showLocked ? 'No achievements in this category yet.' : 'No achievements earned here yet. Keep playing!'}
            </p>
          )}
        </>
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

// Task #269 — Owner-only preview of the rendered share card on the profile
// page itself, so players can sanity-check what crawlers unfurl without
// having to open Settings → Profile. Click-through deep-links to the
// share-card picker section there.
function ShareCardPreviewTile({ accountId }) {
  const [bust] = React.useState(() => Date.now());
  const [failed, setFailed] = React.useState(false);
  if (!accountId) return null;
  const previewSrc = `/og/profile/by-id/${encodeURIComponent(accountId)}.png?t=${bust}`;
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, var(--bg-card) 100%)',
      border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12,
      padding: '14px 18px', marginTop: 12, marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
            🖼️ How your share link looks
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            This is the card that unfurls when your profile link is pasted into Discord, Twitter, Slack, etc.
          </div>
        </div>
        <Link
          to="/settings/profile#share-card"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(245,158,11,0.4)',
            color: '#f59e0b',
            borderRadius: 8, padding: '7px 14px',
            fontSize: 13, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
            textDecoration: 'none',
          }}
        >
          Customize →
        </Link>
      </div>
      {failed ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
          Preview unavailable right now.
        </div>
      ) : (
        <div style={{
          width: '100%', maxWidth: 600,
          aspectRatio: '1200 / 630',
          borderRadius: 8, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--bg-secondary)',
        }}>
          <img
            src={previewSrc}
            alt="Your profile share card preview"
            onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
          />
        </div>
      )}
    </div>
  );
}

// Task #447 — Owner-only Share / Embed panel. Lets the profile owner copy
// an <iframe> snippet or a static image URL for the public embed cards
// served by /embed/player/:id and /og/player/:id.png. Two size presets
// (tall 240×320, wide 480×120) and a light/dark theme toggle. Renders a
// live preview using the same iframe URL the snippet exposes so the user
// sees exactly what their embed will look like.
function EmbedSharePanel({ accountId }) {
  const [variant, setVariant] = React.useState('tall');
  const [theme, setTheme] = React.useState('dark');
  const [copied, setCopied] = React.useState(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const dims = variant === 'wide' ? { w: 480, h: 120 } : { w: 240, h: 320 };
  const qs = `?size=${variant}&theme=${theme}`;
  const iframeUrl = `${origin}/embed/player/${accountId}${qs}`;
  const imageUrl = `${origin}/og/player/${accountId}.png${qs}`;
  const iframeSnippet = `<iframe src="${iframeUrl}" width="${dims.w}" height="${dims.h}" frameborder="0" style="border:0;border-radius:10px;overflow:hidden" loading="lazy" title="OCE Inhouse player card"></iframe>`;

  const copy = async (label, text) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt('Copy:', text);
    }
  };

  const segBtn = (active) => ({
    background: active ? 'rgba(197,169,117,0.18)' : 'var(--bg-card)',
    border: `1px solid ${active ? 'var(--brass, #c5a975)' : 'var(--border)'}`,
    color: active ? 'var(--brass, #c5a975)' : 'var(--text-primary)',
    borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
  });

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(197,169,117,0.08) 0%, var(--bg-card) 100%)',
      border: '1px solid rgba(197,169,117,0.3)', borderRadius: 12,
      padding: '14px 18px', marginTop: 12, marginBottom: 8,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
        🖼️ Share / Embed
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Drop a live card into Discord, your stream overlay, or a blog post. Settings &gt; Profile has a toggle to opt out.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 220px', minWidth: 220 }}>
          <div role="radiogroup" aria-label="Embed size" style={{ display: 'flex', gap: 6 }}>
            <button type="button" role="radio" aria-checked={variant === 'tall'} onClick={() => setVariant('tall')} style={segBtn(variant === 'tall')}>Tall 240×320</button>
            <button type="button" role="radio" aria-checked={variant === 'wide'} onClick={() => setVariant('wide')} style={segBtn(variant === 'wide')}>Wide 480×120</button>
          </div>
          <div role="radiogroup" aria-label="Embed theme" style={{ display: 'flex', gap: 6 }}>
            <button type="button" role="radio" aria-checked={theme === 'dark'} onClick={() => setTheme('dark')} style={segBtn(theme === 'dark')}>Dark</button>
            <button type="button" role="radio" aria-checked={theme === 'light'} onClick={() => setTheme('light')} style={segBtn(theme === 'light')}>Light</button>
          </div>

          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>iframe snippet</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 6, padding: '6px 8px', fontFamily: 'monospace', wordBreak: 'break-all', maxHeight: 70, overflow: 'auto' }}>
              {iframeSnippet}
            </div>
            <button type="button" onClick={() => copy('iframe', iframeSnippet)} aria-label="Copy iframe snippet" style={{ marginTop: 6, background: copied === 'iframe' ? 'rgba(74,222,128,0.15)' : 'var(--bg-card)', border: `1px solid ${copied === 'iframe' ? 'var(--accent-green)' : 'rgba(197,169,117,0.4)'}`, color: copied === 'iframe' ? 'var(--accent-green)' : 'var(--brass, #c5a975)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {copied === 'iframe' ? '✅ Copied!' : '📋 Copy iframe'}
            </button>
          </div>

          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>image URL</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 6, padding: '6px 8px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {imageUrl}
            </div>
            <button type="button" onClick={() => copy('image', imageUrl)} aria-label="Copy image URL" style={{ marginTop: 6, background: copied === 'image' ? 'rgba(74,222,128,0.15)' : 'var(--bg-card)', border: `1px solid ${copied === 'image' ? 'var(--accent-green)' : 'rgba(197,169,117,0.4)'}`, color: copied === 'image' ? 'var(--accent-green)' : 'var(--brass, #c5a975)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {copied === 'image' ? '✅ Copied!' : '📋 Copy image URL'}
            </button>
          </div>
        </div>

        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Live preview</div>
          <iframe
            key={`${variant}-${theme}`}
            src={iframeUrl}
            width={dims.w}
            height={dims.h}
            style={{ border: '1px solid var(--border)', borderRadius: 10, display: 'block', background: theme === 'light' ? '#f5efe2' : '#0d1424' }}
            title="OCE Inhouse player card preview"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}

function InviteLinkCard({ accountId }) {
  const [inviteData, setInviteData] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [referralData, setReferralData] = React.useState(null);
  const [showReferralList, setShowReferralList] = React.useState(false);

  React.useEffect(() => {
    if (!accountId) return;
    fetch(`/api/player/${accountId}/invite-link`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.inviteUrl) setInviteData(d); })
      .catch(() => {});
    fetch(`/api/player/${accountId}/referrals`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReferralData(d); })
      .catch(() => {});
  }, [accountId]);

  const inviteUrl = inviteData?.inviteUrl;
  const referralXp = inviteData?.referralXp ?? 50;

  if (!inviteUrl) return null;

  const copyLink = () => {
    navigator.clipboard?.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      window.prompt('Copy your invite link:', inviteUrl);
    });
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' });
    } catch { return ''; }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, var(--bg-card) 100%)',
      border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12,
      padding: '14px 18px', marginTop: 12, marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
            🔗 Your Invite Link
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Share this link to invite friends. When they sign up and get approved, you earn <strong style={{ color: 'var(--accent-blue)' }}>{referralXp} XP</strong> toward your season pass.
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)',
            background: 'var(--bg-secondary)', borderRadius: 6, padding: '4px 8px',
            marginTop: 6, wordBreak: 'break-all', fontFamily: 'monospace',
          }}>
            {inviteUrl}
          </div>
        </div>
        <button
          onClick={copyLink}
          style={{
            background: copied ? 'rgba(74,222,128,0.15)' : 'var(--bg-card)',
            border: `1px solid ${copied ? 'var(--accent-green)' : 'rgba(59,130,246,0.4)'}`,
            color: copied ? 'var(--accent-green)' : '#60a5fa',
            borderRadius: 8, padding: '7px 16px', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✅ Copied!' : '📋 Copy'}
        </button>
      </div>

      {referralData !== null && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(59,130,246,0.15)' }}>
          {referralData.count === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              You haven't referred anyone yet — share your invite link to get started!
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  👥 You've referred <span style={{ color: '#60a5fa' }}>{referralData.count}</span> player{referralData.count !== 1 ? 's' : ''}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: referralData.totalXp > 0 ? 'var(--accent-green)' : 'var(--text-muted)',
                  background: referralData.totalXp > 0 ? 'rgba(74,222,128,0.1)' : 'var(--bg-secondary)',
                  border: `1px solid ${referralData.totalXp > 0 ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                  borderRadius: 6, padding: '1px 8px',
                }}>
                  +{referralData.totalXp} XP earned
                </span>
                {referralData.referrals.length > 0 && (
                  <button
                    onClick={() => setShowReferralList(s => !s)}
                    style={{
                      background: 'none', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', borderRadius: 6,
                      padding: '2px 8px', cursor: 'pointer', fontSize: 11,
                    }}
                  >
                    {showReferralList ? 'Hide ▴' : 'Show ▾'}
                  </button>
                )}
              </div>
              {showReferralList && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {referralData.referrals.map((r) => (
                    <div key={r.accountId} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 12, color: 'var(--text-secondary)',
                      background: 'var(--bg-secondary)', borderRadius: 6,
                      padding: '4px 10px',
                    }}>
                      <span style={{ fontWeight: 600 }}>{r.displayName}</span>
                      {r.joinedAt && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          joined {formatDate(r.joinedAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlayerProfile() {
  const { accountId } = useParams();
  const { seasonId } = useSeason();
  const navigate = useNavigate();
  const { steamUser } = useSteamAuth();
  // v5.86 — superusers can preview AI Scout without a Pro subscription.
  const { superuserKey } = useSuperuser() || {};
  // Wave 1 feature flags
  const showMvpBadges = useFeatureFlag('mvp_match_badges');
  const newRankTheme  = useFeatureFlag('new_rank_theme');
  const showProfileChartV2 = useFeatureFlag('profile_chart_v2');
  // Wave 2 / 3 flags
  const showSeasonPass = true;
  const showMvpAttitude = useFeatureFlag('mvp_attitude_analytics');
  const showProfileCustomization = true;
  const [seasonPass, setSeasonPass] = useState(null);
  const [mvpTrends, setMvpTrends] = useState(null);
  const [profileCard, setProfileCard] = useState(null);
  const [scoutingReport, setScoutingReport] = useState(null);
  const [scoutingLoading, setScoutingLoading] = useState(false);
  const [scoutingError, setScoutingError] = useState(null);
  const [scoutingLinkCopied, setScoutingLinkCopied] = useState(false);
  const [scoutingAutoCopied, setScoutingAutoCopied] = useState(false);
  const [giftError, setGiftError] = useState(null);
  const [giftLoading, setGiftLoading] = useState(null);
  // Round-8: Pro state for the replay-download CTA. Free users see the
  // "🔒 Pro" upsell instead of the download icon. Defaults to false so
  // the upsell is shown on first paint until we know otherwise.
  const [replayIsPro, setReplayIsPro] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/replay-quota', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled && j) setReplayIsPro(Boolean(j.is_pro)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!showProfileCustomization || !accountId) { setProfileCard(null); return; }
    fetch(`/api/player/${accountId}/profile-card`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setProfileCard(d?.customization || null))
      .catch(() => setProfileCard(null));
  }, [accountId, showProfileCustomization]);

  useEffect(() => {
    if (!showSeasonPass || !accountId) { setSeasonPass(null); return; }
    fetch(`/api/player/${accountId}/season-pass${seasonId ? `?season=${seasonId}` : ''}`)
      .then(r => (r.ok ? r.json() : null)).then(setSeasonPass).catch(() => setSeasonPass(null));
  }, [accountId, seasonId, showSeasonPass]);

  useEffect(() => {
    if (!showMvpAttitude || !accountId) { setMvpTrends(null); return; }
    fetch(`/api/player/${accountId}/mvp-attitude-trends?window=10`)
      .then(r => (r.ok ? r.json() : null)).then(setMvpTrends).catch(() => setMvpTrends(null));
  }, [accountId, showMvpAttitude]);
  // Treat the profile as "own" only when viewing your own Steam-linked profile
  const isOwnProfile = !!(steamUser?.accountId && String(steamUser.accountId) === String(accountId));
  const [data, setData] = useState(null);
  const [positions, setPositions] = useState([]);
  const [ratingHistory, setRatingHistory] = useState([]);
  const [modifierHistory, setModifierHistory] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [nemesis, setNemesis] = useState([]);
  const [trainerAccuracy, setTrainerAccuracy] = useState(null);
  const [allies, setAllies] = useState([]);
  const [rivals, setRivals] = useState([]);
  const [rawWinRateHistory, setRawWinRateHistory] = useState([]);
  const [wrWindow, setWrWindow] = useState(5);
  const [predictionStats, setPredictionStats] = useState(null);
  const [heroCounters, setHeroCounters] = useState([]);
  const [streak, setStreak] = useState(null);
  // Task #205 — live presence chip. Polled every 30s while the tab is visible.
  const [presence, setPresence] = useState(null);
  // Task #221 — vanity slug for this profile (if claimed). Used by the Share
  // button to prefer the short `/p/<slug>` URL over the canonical
  // `/player/<accountId>` URL when one exists.
  const [vanitySlug, setVanitySlug] = useState(null);
  // Task #242 — Share popover state. Opens a small Dialog next to the
  // Share button with one-click intents for Twitter/X, Discord-friendly
  // markdown, and the existing copy-link behaviour.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(null); // 'link' | 'discord' | null
  const [shareAnchor, setShareAnchor] = useState(null); // { top, left } or null
  const shareBtnRef = useRef(null);
  useEffect(() => {
    if (!accountId) { setVanitySlug(null); return; }
    let cancelled = false;
    fetch(`/api/player/${accountId}/vanity-slug`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setVanitySlug(d?.slug || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accountId]);
  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      getPlayerPresence(accountId).then(p => { if (!cancelled) setPresence(p || null); }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [accountId]);
  const [captainAutoPick, setCaptainAutoPick] = useState(null);
  const [durationStats, setDurationStats] = useState([]);
  const [communityRatings, setCommunityRatings] = useState(null);
  const [positionAverages, setPositionAverages] = useState([]);
  const [impactScore, setImpactScore] = useState(null);
  const [playerRank, setPlayerRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matchStatsHistory, setMatchStatsHistory] = useState([]);
  const [trendPaywall, setTrendPaywall] = useState(null);
  const [heroSuggestions, setHeroSuggestions] = useState(null);

  // Task #203 — Magazine v3 stat panels.
  const [todHeatmap, setTodHeatmap] = useState(null);
  const [heroItems, setHeroItems] = useState(null);
  const [seasonWrapped, setSeasonWrapped] = useState(null);
  const [hofPlaques, setHofPlaques] = useState(null);
  // Task #204 / v6.60 — Magazine v3 compare drawer.
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareList, setCompareList] = useState([]);
  const [compareB, setCompareB] = useState('');
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Single close path for the compare drawer — also strips ?compare so
  // browser back-nav doesn't immediately re-open it.
  const closeCompareDrawer = React.useCallback(() => {
    setCompareOpen(false);
    if (searchParams.get('compare')) {
      const next = new URLSearchParams(searchParams);
      next.delete('compare');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  // ?compare=<id> preselects the opponent and opens the drawer on mount.
  useEffect(() => {
    const cmp = searchParams.get('compare');
    if (!cmp || !accountId) return;
    if (Number(cmp) === Number(accountId)) return;
    setCompareB(String(cmp));
    setCompareOpen(true);
    if (compareList.length === 0) {
      getAllPlayers(seasonId).then(rows => {
        setCompareList((rows || []).filter(r => Number(r.account_id) !== Number(accountId)));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, searchParams]);
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    getPlayerTimeOfDay(accountId, seasonId)
      .then(d => { if (!cancelled) setTodHeatmap(d); })
      .catch(() => { if (!cancelled) setTodHeatmap(null); });
    getPlayerHeroItems(accountId)
      .then(d => { if (!cancelled) setHeroItems(d); })
      .catch(() => { if (!cancelled) setHeroItems(null); });
    getPlayerSeasonWrapped(accountId)
      .then(d => { if (!cancelled) setSeasonWrapped(d); })
      .catch(() => { if (!cancelled) setSeasonWrapped(null); });
    getPlayerHallOfFamePlaques(accountId)
      .then(d => { if (!cancelled) setHofPlaques(d); })
      .catch(() => { if (!cancelled) setHofPlaques(null); });
    return () => { cancelled = true; };
  }, [accountId, seasonId]);

  useEffect(() => {
    // v5.89 — Performance Trend chart is no longer owner-only. Any signed-in
    // viewer (subject to the existing pro/paywall server check) can see it on
    // any profile so the public profile reaches parity with the private view.
    if (!showProfileChartV2 || !accountId) {
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
  }, [accountId, seasonId, showProfileChartV2]);

  useEffect(() => {
    getPlayerRanks()
      .then(rows => {
        const match = rows.find(r => String(r.account_id) === String(accountId));
        setPlayerRank(match || null);
      })
      .catch(() => {});
  }, [accountId]);

  useEffect(() => {
    if (!accountId) { setCaptainAutoPick(null); return; }
    let cancelled = false;
    getCaptainAutoPickStats(accountId, 5)
      .then(d => { if (!cancelled) setCaptainAutoPick(d || null); })
      .catch(() => { if (!cancelled) setCaptainAutoPick(null); });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    setHeroSuggestions(null);
    getPlayerHeroSuggestions(accountId, seasonId)
      .then(d => setHeroSuggestions(d))
      .catch(() => setHeroSuggestions({ suggestions: [] }));
  }, [accountId, seasonId]);

  useEffect(() => {
    if (!accountId) return;
    getDraftTrainerAccuracy(accountId).then(setTrainerAccuracy).catch(() => setTrainerAccuracy(null));
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
      getPlayerPredictionStats(accountId).catch(() => null),
      getPlayerHeroCounters(accountId, seasonId).catch(() => ({ counters: [] })),
      getPlayerStreak(accountId).catch(() => ({ streak: 0 })),
      getPlayerDurationStats(accountId, seasonId).catch(() => ({ stats: [] })),
      getPlayerCommunityRatings(accountId).catch(() => null),
      getPositionAverages(seasonId).catch(() => ({ averages: [] })),
      getPlayerRivals(accountId, seasonId).catch(() => []),
    ]).then(([playerData, posData, histData, modHistData, achData, nemData, allyData, wrHistData, predData, counterData, streakData, durData, ratingData, avgData, rivalsData]) => {
      setData(playerData);
      setPositions(posData?.positions || []);
      setRatingHistory(histData?.history || []);
      setModifierHistory(modHistData?.history || []);
      setAchievements(achData?.achievements || []);
      setNemesis(Array.isArray(nemData) ? nemData : []);
      setAllies(Array.isArray(allyData) ? allyData : []);
      setRivals(Array.isArray(rivalsData) ? rivalsData : []);
      const rawRows = Array.isArray(wrHistData) ? wrHistData : (wrHistData?.history || []);
      setRawWinRateHistory(rawRows);
      setPredictionStats(predData?.stats || null);
      setHeroCounters(counterData?.counters || []);
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

  // Task #377 — player item benchmarks (per-position avg first-purchase time
  // vs seasonal baseline). Fetched once per (account, season) and rendered as
  // a compact section below the achievements rail.
  const [itemBenchmarks, setItemBenchmarks] = useState(null);
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    getPlayerItemBenchmarks(accountId, seasonId).then(d => {
      if (!cancelled) setItemBenchmarks(d);
    }).catch(() => { if (!cancelled) setItemBenchmarks(null); });
    return () => { cancelled = true; };
  }, [accountId, seasonId]);

  // v5.82 — fetch the #1 leaderboard player so we can promote their MmrBadge
  // to "King" (every other player tops out at "Warlord").
  const [topLeaderId, setTopLeaderId] = useState(null);
  useEffect(() => {
    getLeaderboard(1, seasonId).then(rows => {
      const top = Array.isArray(rows) ? rows[0] : (rows?.leaderboard || [])[0];
      if (top?.player_id != null) setTopLeaderId(String(top.player_id));
    }).catch(() => {});
  }, [seasonId]);
  const isLeader = topLeaderId != null && String(accountId) === topLeaderId;

  const proMembers = useProMembers();
  const isPlayerPro = proMembers.has(String(accountId));

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

  // v6.18 — Resolve real player data into the shape ProfileCard wants. Replaces the
  // ~400-line scattered customization stack that used to live here with a single
  // shared component used by the public profile, the Settings editor preview, and
  // the sandbox. All data comes from the existing /players/:id and
  // /player/:id/profile-card endpoints — no SAMPLE_* stubs, no extra round trips.
  const allHeroes = data?.heroes || data?.heroStats || [];
  const ex = (showProfileCustomization && profileCard?.extras) || {};
  const pinnedHeroRow = (showProfileCustomization && profileCard?.pinned_hero_id)
    ? allHeroes.find(h => Number(h.hero_id || h.heroId) === Number(profileCard.pinned_hero_id))
    : null;
  const pinnedHero = (showProfileCustomization && profileCard?.pinned_hero_id) ? {
    hero_id: profileCard.pinned_hero_id,
    name: pinnedHeroRow ? (pinnedHeroRow.hero_name || getHeroName(profileCard.pinned_hero_id)) : getHeroName(profileCard.pinned_hero_id),
    games: pinnedHeroRow ? parseInt(pinnedHeroRow.games || pinnedHeroRow.matches || 0) : 0,
    wins: pinnedHeroRow ? parseInt(pinnedHeroRow.wins || 0) : 0,
    kda: pinnedHeroRow ? (
      (parseFloat(pinnedHeroRow.avg_kills || 0) + parseFloat(pinnedHeroRow.avg_assists || 0))
      / Math.max(parseFloat(pinnedHeroRow.avg_deaths || 0), 1)
    ) : null,
    caption: profileCard.pinned_hero_caption || null,
    borderColor: ex.pinned_hero_border || null,
  } : null;
  // Task #204 / v6.60 — Magazine v3 pinned-achievement ribbon. Hydrated
  // from `profileCard.pinned_achievements` (server-validated against
  // earned + non-secret keys). Free tier shows up to 1, Pro shows up to 3.
  const ribbonAchievements = (showProfileCustomization && Array.isArray(profileCard?.pinned_achievements))
    ? profileCard.pinned_achievements
        .map(id => {
          const a = (achievements || []).find(x => String(x.key || x.id) === String(id));
          if (!a) return null;
          return {
            id: String(a.key || a.id),
            emoji: a.emoji || a.icon || '🏆',
            label: a.label || a.title || a.key,
            sub: a.description || a.sub || null,
          };
        })
        .filter(Boolean)
    : [];
  const pinnedAchievement = (showProfileCustomization && ex.pinned_achievement_id)
    ? (() => {
        const a = (achievements || []).find(x => (x.key || x.id) === ex.pinned_achievement_id);
        if (!a) return null;
        return {
          emoji: a.emoji || a.icon || '🏆',
          label: a.label || a.title || a.key,
          sub: a.description || a.sub || null,
        };
      })()
    : null;
  // v6.18 — Every customization-derived prop is gated on showProfileCustomization
  // so the free-tier baseline (no flag, or flag off) renders just the name +
  // adornments + headerExtras, exactly matching the pre-refactor behaviour.
  const topHeroesForCard = showProfileCustomization
    ? allHeroes.slice(0, 5).map(h => {
        const k = parseFloat(h.avg_kills || 0);
        const d = parseFloat(h.avg_deaths || 0);
        const a = parseFloat(h.avg_assists || 0);
        const kda = (k + a) / Math.max(d, 1);
        return {
          hero_id: h.hero_id || h.heroId,
          games: parseInt(h.games || h.matches || 0),
          wins: parseInt(h.wins || 0),
          kda: Number.isFinite(kda) && (k || a || d) ? kda : null,
        };
      })
    : [];
  const pinnedMatchForCard = showProfileCustomization ? (profileCard?.pinnedMatch || null) : null;
  const streakForCard = showProfileCustomization ? streak : null;
  const customizationForCard = showProfileCustomization && profileCard ? profileCard : { extras: {} };
  const frameForCard = (showProfileCustomization && profileCard?.profile_frame) || 'none';

  const headerNameAdornments = (
    <>
      {nickname && rating?.display_name && nickname !== rating.display_name && (
        <span style={{ fontSize: 12, color: '#888' }}>({rating.display_name})</span>
      )}
      {isPlayerPro && <ProBadge size="sm" variant={proMembers.isFounder?.(accountId) ? 'founder' : 'pro'} />}
      {/* Magazine v3 (Task #157): verified-checkmark propagation. Component
          self-hides when the player has no verified badges. */}
      <VerifiedBadge accountId={accountId} size={14} />
      {playerRank?.dota_rank_tier && (
        <RankBadge
          rankTier={playerRank.dota_rank_tier}
          leaderboardRank={playerRank.dota_leaderboard_rank}
          source={playerRank.dota_rank_source}
          size="sm"
        />
      )}
      {/* 1.8 — Inhouse MMR badge (8-tier MMR ladder, gated on `new_rank_theme`) */}
      {newRankTheme && (seasonMmr != null || rating?.mmr != null) && (
        <MmrBadge mmr={seasonMmr != null ? seasonMmr : rating?.mmr} size="sm" isLeader={isLeader} />
      )}
    </>
  );

  // AUDIT (v6.18): Owner-only and signed-in viewer controls — kept intact next to
  // the shared card. Edit Profile / CoachingApplyCta gated on isOwnProfile, Gift
  // buttons gated on (!isOwnProfile + signed in), AI Scout gated on signed in
  // (paywall enforced server-side). Share + Export always public.
  const headerExtras = (
    <>
      <button
        type="button"
        ref={shareBtnRef}
        onClick={(e) => {
          setShareCopied(null);
          const r = e.currentTarget.getBoundingClientRect();
          setShareAnchor({ top: r.bottom + 8, left: r.left });
          setShareOpen(true);
        }}
        id="share-btn"
        title={vanitySlug ? `Share ${window.location.origin}/p/${vanitySlug}` : 'Share this profile'}
        aria-label={vanitySlug ? `Share profile /p/${vanitySlug}` : 'Share profile'}
        aria-haspopup="dialog"
        aria-expanded={shareOpen}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
          borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}
      >🔗 Share</button>
      {/* Task #204 / v6.60 — Magazine v3 compare drawer trigger. Public,
          uses the shared <Dialog> primitive (a11y gate compliant). */}
      <button
        type="button"
        onClick={() => {
          setCompareOpen(true);
          if (compareList.length === 0) {
            getAllPlayers(seasonId).then(rows => {
              setCompareList((rows || []).filter(r => Number(r.account_id) !== Number(accountId)));
            }).catch(() => {});
          }
        }}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
          borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}
      >⚖️ Compare</button>
      <button
        onClick={async () => {
          try {
            const res = await fetch(`/api/players/${accountId}/matches/export.csv${seasonId ? `?season_id=${seasonId}` : ''}`, { credentials: 'same-origin' });
            if (res.status === 402) {
              const body = await res.json().catch(() => ({}));
              setTrendPaywall({ paywall: true, feature: body.feature || 'csv_export', signedIn: body.signed_in });
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
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
      {trendPaywall && trendPaywall.feature === 'csv_export' && (
        <PaywallCard feature="csv_export" signedIn={trendPaywall.signedIn} compact />
      )}
      {showProfileCustomization && isOwnProfile && (
        <Link
          to="/settings/profile"
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
            borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}
        >✏️ Edit Profile</Link>
      )}
      {/* Coaching marketplace — Apply to coach CTA shows on own profile when
          eligible (top-5 leaderboard or Immortal+). Hidden when the
          coaching_marketplace flag is off (eligibility endpoint 404s). */}
      {isOwnProfile && <CoachingApplyCta />}
      {/* Task #441 — Weekly Rivals card on your own profile. */}
      {isOwnProfile && (
        <div style={{ marginTop: 12 }}>
          <RivalCard compact />
        </div>
      )}
      {/* Task #444 — Pre-match mood & form widget. Own profile only; the
          widget self-gates on the `mood_widget` notification pref so the
          viewer can hide it from Settings → Notifications. */}
      {isOwnProfile && <MoodFormWidget accountId={accountId} />}
      {/* Task #442 — Compare-vs picker. Navigates to /h2h/<thisProfile>/<picked>
          so the same control works on your own profile (compare you vs anyone)
          and on someone else's profile (compare them vs anyone). When viewing
          another player while signed in, also offer a one-click "vs me" link. */}
      <H2HComparePicker thisAccountId={accountId} isOwnProfile={isOwnProfile} viewerAccountId={steamUser?.accountId} />
      
      {/* Gift buttons — shown when viewing another player's profile and signed in */}
      {!isOwnProfile && steamUser?.accountId && (
        <>
          <button
            onClick={async () => {
              setGiftError(null);
              setGiftLoading('pro');
              try {
                const { url } = await createGiftProCheckout(accountId);
                window.location.href = url;
              } catch (err) {
                setGiftError(err.message);
                setGiftLoading(null);
              }
            }}
            disabled={giftLoading != null}
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)',
              border: '1px solid rgba(245,158,11,0.5)', color: '#f59e0b',
              borderRadius: 8, padding: '6px 14px', cursor: giftLoading ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >🎁 {giftLoading === 'pro' ? 'Redirecting…' : 'Gift Pro'}</button>
          <button
            onClick={async () => {
              setGiftError(null);
              setGiftLoading('sp');
              try {
                const { url } = await createGiftSeasonPassCheckout(accountId);
                window.location.href = url;
              } catch (err) {
                setGiftError(err.message);
                setGiftLoading(null);
              }
            }}
            disabled={giftLoading != null}
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0.05) 100%)',
              border: '1px solid rgba(168,85,247,0.5)', color: '#a855f7',
              borderRadius: 8, padding: '6px 14px', cursor: giftLoading ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >🎫 {giftLoading === 'sp' ? 'Redirecting…' : 'Gift Season Pass'}</button>
        </>
      )}
      {/* Scouting report — Pro feature, shown on any profile when viewer is signed in */}
      {steamUser?.accountId && (
        <button
          onClick={async () => {
            if (scoutingLoading) return;
            setScoutingReport(null);
            setScoutingError(null);
            setScoutingLoading(true);
            try {
              const reportData = await getScoutingReport(accountId, superuserKey);
              setScoutingReport(reportData);
              if (reportData.share_link_ready !== false) {
                const shareUrl = `${window.location.origin}/scouting/${accountId}`;
                navigator.clipboard?.writeText(shareUrl).then(() => {
                  setScoutingAutoCopied(true);
                  setTimeout(() => setScoutingAutoCopied(false), 4000);
                }).catch(() => {});
              }
              setTimeout(() => {
                document.getElementById('scouting-report-anchor')?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            } catch (err) {
              setScoutingError(err.paywall ? 'AI Scouting Reports require Pro membership.' : err.message);
            } finally {
              setScoutingLoading(false);
            }
          }}
          disabled={scoutingLoading}
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(6,182,212,0.05) 100%)',
            border: '1px solid rgba(6,182,212,0.5)', color: '#06b6d4',
            borderRadius: 8, padding: '6px 14px', cursor: scoutingLoading ? 'wait' : 'pointer',
            fontSize: 13, fontWeight: 600,
          }}
        >🔍 {scoutingLoading ? 'Generating…' : 'AI Scout'}</button>
      )}
    </>
  );

  // v6.52 / Task #195 — Magazine v3 cover graduation. The cover banner +
  // sticky mini-header are mounted ABOVE the existing ProfileCard / sections
  // so the deep section ports (anchor nav, time-of-day heatmap, OG shop,
  // founders pass, Hall-of-Fame plaque, Profile Spotlight) can land in
  // follow-up tasks without reshuffling this page. The wrapping
  // `magazine-v3 v3-theme-{slug}` class drives the Court & Pitch / Newsprint
  // / Carbon / Holo / Heritage / Broadcast palettes — only Court & Pitch is
  // free; the other five mirror the PREMIUM_THEMES Pro cosmetic gating.
  // Sanitize against the known catalogue so a stale/malformed DB value can
  // never compose a malformed className token (architect review on Task #195).
  const ALLOWED_LAYOUT_THEMES = new Set(['court-pitch', 'newsprint', 'carbon', 'holo', 'heritage', 'broadcast']);
  const rawLayoutTheme = (showProfileCustomization && profileCard?.profile_layout_theme) || 'court-pitch';
  const layoutTheme = ALLOWED_LAYOUT_THEMES.has(rawLayoutTheme) ? rawLayoutTheme : 'court-pitch';
  const coverSocials = {
    twitch: ex.social_twitch || null,
    youtube: ex.social_youtube || null,
    steam: ex.social_steam || null,
  };
  const coverFlair = (showProfileCustomization && ex.flair_unlocked && ex.flair_override) || null;
  return (
    <div className={`magazine-v3 v3-theme-${layoutTheme}`}>
      <SponsorshipBanner slug="profile_sidebar" style={{ margin: '12px 0' }} />
      <div id="cover" />
      <MagazineCover
        accountId={accountId}
        presence={presence}
        displayName={displayName}
        customTitle={profileCard?.custom_title || null}
        bio={profileCard?.bio || null}
        pinnedHero={pinnedHero}
        topHero={allHeroes[0] || null}
        rating={rating}
        averages={averages}
        recentMatches={recentMatches}
        ratingHistory={ratingHistory}
        winRateHistory={winRateHistory}
        positions={positions}
        streak={streak}
        impactScore={impactScore}
        themeAccent={profileCard?.theme_accent || null}
        socials={coverSocials}
        flair={coverFlair}
        nameAdornments={headerNameAdornments}
        // v6.63 / Task #207 — Founders Pass ring + Cover FX. Both are
        // server-gated: the ring requires the `founders_pass_ring`
        // entitlement (one-time SKU, capped); the FX list is Pro-only and
        // already validated server-side before persistence.
        foundersRing={showProfileCustomization && Array.isArray(profileCard?.owned_entitlements) && profileCard.owned_entitlements.includes('founders_pass_ring')}
        // Task #314 / v7.34 — equipped Founders Ring slug. Server-side
        // setEquippedFounderRing() already validates ownership before
        // persisting the column, so we can trust the value as-is here.
        equippedFounderRing={showProfileCustomization && profileCard?.equipped_founder_ring ? profileCard.equipped_founder_ring : null}
        coverFx={showProfileCustomization && Array.isArray(profileCard?.cover_fx) ? profileCard.cover_fx : []}
      />
      <Link to="/players" className="back-link">&larr; Back to players</Link>

      {/* Task #204 / v6.60 — Magazine v3 pinned-achievement ribbon. Free
          tier surfaces 1 slot; Pro surfaces up to 3. Server (`POST
          /api/me/profile`) validates the keys against the player's earned
          non-secret achievements before persisting, so this list is safe
          to render directly. Hidden for free profiles with nothing pinned
          (and for the v3 cover when customization is off). */}
      {ribbonAchievements.length > 0 && (
        <div className="v3-pinned-ribbon" aria-label="Pinned achievements">
          {ribbonAchievements.map(a => (
            <div key={a.id} className="v3-pinned-ribbon-item" title={a.sub || a.label}>
              <span className="v3-pinned-ribbon-emoji" aria-hidden="true">{a.emoji}</span>
              <div className="v3-pinned-ribbon-text">
                <div className="v3-pinned-ribbon-label">{a.label}</div>
                {a.sub && <div className="v3-pinned-ribbon-sub">{a.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task #204 / v6.60 — sticky anchor nav rail. Desktop only (CSS
          hides it under 1100px). Each link jumps to a section anchor
          mounted further down. Real <a href="#…"> elements so keyboard
          and screen-reader users get the same affordance as mouse users. */}
      {/* Anchor order MUST match the actual DOM order of the corresponding
          `id="…"` divs further down the page. Page order is:
          cover → records (v3 panels) → stats → achievements → heroes → recent.
          The `#records` anchor is mounted right above <ProfileV3Panels> which
          renders the time-of-day heatmap, hero builds, season wrapped, and
          hall-of-fame plaques — collectively surfaced as "Highlights" in the
          rail to be honest about what the link actually scrolls to. */}
      <nav className="v3-anchor-nav" aria-label="Profile sections">
        <a href="#cover" data-dot="●"><span className="v3-anchor-label">Cover</span></a>
        <a href="#records" data-dot="●"><span className="v3-anchor-label">Highlights</span></a>
        <a href="#stats" data-dot="●"><span className="v3-anchor-label">Stats</span></a>
        <a href="#achievements" data-dot="●"><span className="v3-anchor-label">Achievements</span></a>
        <a href="#heroes" data-dot="●"><span className="v3-anchor-label">Heroes</span></a>
        <a href="#recent" data-dot="●"><span className="v3-anchor-label">Recent Matches</span></a>
      </nav>

      {/* AUDIT (v6.18): PUBLIC — single shared <ProfileCard /> renders the polished
          serif name lockup, theme accent rule, optional flair + streak chips, pinned
          hero / pinned match / pinned achievement tiles, top-heroes strip, social
          chips, optional background pattern, and the active profile frame. Same
          component is used by Settings → Profile editor preview and the sandbox so
          the editor preview is always 1:1 with what visitors see. Owner-only and
          signed-in-viewer buttons (Edit Profile / Gift Pro / Gift SP / AI Scout /
          Apply to Coach) sit beneath the card via the headerExtras slot, with their
          existing isOwnProfile / steamUser / requirePro gates intact. */}
      <ProfileCard
        displayName={displayName}
        customization={customizationForCard}
        pinnedHero={pinnedHero}
        pinnedMatch={pinnedMatchForCard}
        pinnedAchievement={pinnedAchievement}
        topHeroes={topHeroesForCard}
        streak={streakForCard}
        frame={frameForCard}
        nameAdornments={headerNameAdornments}
        headerExtras={headerExtras}
      />

      {/* Task #203 — Magazine v3 stat panels: time-of-day heatmap, hero-hover
          item builds, Season Wrapped recap, and Hall-of-Fame plaques. All free
          for everyone, with empty-state copy when a player has no eligible data. */}
      <div id="records" />
      <ProfileV3Panels
        tod={todHeatmap}
        heroItems={heroItems}
        seasonWrapped={seasonWrapped}
        hofPlaques={hofPlaques}
      />

      {/* Magazine v3 (Task #157): public sponsor chip on every profile;
          weekly AI report tile only for the profile owner (component
          self-hides on 401 / shows Pro paywall on 402). */}
      <div style={{ marginTop: 12 }}>
        <SponsorChip accountId={accountId} />
      </div>
      {isOwnProfile && <QuestTracker />}
      {isOwnProfile && <WeeklyReportTile />}
      {isOwnProfile && <CoachRecommendationsTile />}
      {isOwnProfile && <VerifiedBadgeOwnerCta accountId={accountId} />}

      {giftError && (
        <div style={{ marginTop: 8, padding: '6px 12px', background: '#3a0f0f', border: '1px solid #ef4444', borderRadius: 6, fontSize: 13, color: '#ef4444' }}>
          {giftError}
        </div>
      )}
      {scoutingError && (
        <div style={{ marginTop: 8, padding: '6px 12px', background: '#3a0f0f', border: '1px solid #ef4444', borderRadius: 6, fontSize: 13, color: '#ef4444' }}>
          {scoutingError}
        </div>
      )}
      {scoutingAutoCopied && (
        <div style={{ marginTop: 8, padding: '6px 12px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 6, fontSize: 12, color: 'var(--accent-green)' }}>
          ✅ Share link copied to clipboard — paste it to share this scouting report!
        </div>
      )}

      {/* AUDIT (v5.91 parity pass): OWNER-ONLY — invite/referral link is only meaningful
          to the profile owner (it grants them XP for referrals). Public viewers see nothing. */}
      {isOwnProfile && <InviteLinkCard accountId={accountId} />}
      {/* Task #269 — owner-only share-card preview tile, click-through to
          Settings → Profile § share-card picker. */}
      {isOwnProfile && <ShareCardPreviewTile accountId={accountId} />}
      {/* Task #447 — owner-only Share / Embed panel (iframe + image embeds). */}
      {isOwnProfile && <EmbedSharePanel accountId={accountId} />}

      {/* AUDIT (v5.91 parity pass): PRO-PAYWALLED — AI Scouting Report. Trigger
          button shows for any signed-in viewer; the actual /player/:id/scouting-report
          endpoint is requirePro and returns 402 → setScoutingError() shows the upgrade
          message. Public/anonymous viewers don't see the trigger at all (gated on
          steamUser?.accountId in the header). */}
      {/* AI Scouting Report (Pro feature) */}
      {scoutingReport && (
        <div id="scouting-report-anchor" style={{
          marginTop: 20, marginBottom: 8,
          background: 'linear-gradient(135deg, rgba(6,182,212,0.07) 0%, var(--bg-card) 100%)',
          border: '1px solid rgba(6,182,212,0.35)', borderRadius: 12, padding: '18px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🔍</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#06b6d4' }}>AI Scouting Report</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Generated {new Date(scoutingReport.generated_at).toLocaleString('en-AU')} · Pro feature
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <strong style={{ color: '#4ade80' }}>{scoutingReport.stats.wins}W</strong> / <strong style={{ color: '#f87171' }}>{scoutingReport.stats.losses}L</strong>
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                KDA {scoutingReport.stats.avg_kills}/{scoutingReport.stats.avg_deaths}/{scoutingReport.stats.avg_assists}
              </span>
            </div>
          </div>
          {/* One-line summary */}
          {scoutingReport.summary && (
            <div style={{ fontSize: 14, fontWeight: 600, fontStyle: 'italic', color: '#06b6d4', marginBottom: 10, lineHeight: 1.5 }}>
              {scoutingReport.summary}
            </div>
          )}
          {/* Overview */}
          {scoutingReport.overview && (
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)', marginBottom: 14 }}>
              {scoutingReport.overview}
            </div>
          )}

          {/* Hero pool + strongest position */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            {scoutingReport.strongest_position && (
              <div style={{ flex: 1, minWidth: 180, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Strongest Position</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{scoutingReport.strongest_position}</div>
              </div>
            )}
            {scoutingReport.hero_pool?.length > 0 && (
              <div style={{ flex: 2, minWidth: 220, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Hero Pool</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {scoutingReport.hero_pool.map((h, i) => (
                    <span key={i} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.25)' }}>{h}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Strengths / Improvements side by side */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            {scoutingReport.strengths?.length > 0 && (
              <div style={{ flex: 1, minWidth: 200, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>✓ Strengths</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {scoutingReport.strengths.map((s, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.5 }}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {scoutingReport.improvements?.length > 0 && (
              <div style={{ flex: 1, minWidth: 200, background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>↑ Areas to Improve</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {scoutingReport.improvements.map((s, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.5 }}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Counters */}
          {scoutingReport.counters?.length > 0 && (
            <div style={{ marginBottom: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>⚔ Counter Picks</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {scoutingReport.counters.map((c, i) => (
                  <span key={i} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Draft recommendation */}
          {scoutingReport.draft_recommendation && (
            <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Draft Recommendation</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{scoutingReport.draft_recommendation}</div>
            </div>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                const shareUrl = `${window.location.origin}/scouting/${accountId}`;
                navigator.clipboard?.writeText(shareUrl).then(() => {
                  setScoutingLinkCopied(true);
                  setTimeout(() => setScoutingLinkCopied(false), 2500);
                }).catch(() => {
                  window.prompt('Copy share link:', shareUrl);
                });
              }}
              style={{
                background: scoutingLinkCopied ? 'rgba(74,222,128,0.1)' : 'var(--bg-card)',
                border: `1px solid ${scoutingLinkCopied ? 'var(--accent-green)' : 'rgba(6,182,212,0.4)'}`,
                color: scoutingLinkCopied ? 'var(--accent-green)' : '#06b6d4',
                borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >{scoutingLinkCopied ? '✅ Link Copied!' : '🔗 Copy Share Link'}</button>
            <button
              onClick={() => window.print()}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >🖨 Print / Save PDF</button>
            <button
              onClick={() => setScoutingReport(null)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12,
              }}
            >✕ Close</button>
          </div>
        </div>
      )}

      {/* AUDIT (v5.91 parity pass): PUBLIC — top stat-card grid (MMR, W/L, Win Rate,
          KDA, Avg PERF, Streak, First Blood, Hook%, Impact Score, Damage, MVP Wins,
          Attitude). Renders for any visitor; data comes from the open /players/:id and
          related public endpoints. */}
      {rating && (
        <div id="stats" className="stats-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
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

      {/* AUDIT (v5.91 parity pass): PUBLIC — MMR / rating history line chart.
          /players/:id/rating-history is open; renders the same for any visitor. */}
      <RatingChart history={ratingHistory} />

      {/* AUDIT (v5.91 parity pass): PUBLIC — V3 PERF modifier history chart.
          /players/:id/v3-modifier-history is open; renders the same for any visitor. */}
      <ModifierHistoryChart history={modifierHistory} />

      {/* AUDIT (v5.91 parity pass): PRO-PAYWALLED — V2 Performance Trend chart (rolling
          KDA / GPM / hero damage). /player/:id/match-stats-history is gated by
          requirePro('performance_trend'); on a 402 the page renders a PaywallCard so
          public + non-Pro viewers still see *something* in this slot. v5.89 ungated
          this from owner-only; v5.91 confirms the parity holds and adds this audit. */}
      {showProfileChartV2 && trendPaywall && (
        <PaywallCard feature={trendPaywall.feature || 'performance_trend'} signedIn={trendPaywall.signedIn} />
      )}
      {showProfileChartV2 && !trendPaywall && matchStatsHistory.length >= 5 && (
        <ProfileChartV2 history={matchStatsHistory} />
      )}

      {/* Task #190 — captain auto-pick streak. Surfaces chronic AFK captains
          who let the per-pick deadline expire on every pick. Only renders when
          the player has actually captained at least one completed session. */}
      {captainAutoPick && captainAutoPick.sessionsConsidered > 0 && captainAutoPick.picks > 0 && (() => {
        const ratioPct = (captainAutoPick.ratio * 100);
        const tone = ratioPct >= 50 ? '#f87171' : ratioPct >= 25 ? '#fbbf24' : 'var(--text-muted)';
        const label = ratioPct >= 50 ? 'Frequent AFK captain'
          : ratioPct >= 25 ? 'Some auto-picks'
          : 'Active captain';
        return (
          <section style={{ marginBottom: 16 }}>
            <div style={{
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${tone}`,
              background: 'var(--bg-card)',
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10,
            }}>
              <span style={{ fontFamily: 'var(--font-condensed, var(--font))', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, color: 'var(--text-muted)' }}>
                Captain Auto-Pick Rate
              </span>
              <strong style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: tone }}>
                {ratioPct.toFixed(0)}%
              </strong>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                Auto-picked {captainAutoPick.autoPicks} of {captainAutoPick.picks} picks across last {captainAutoPick.sessionsConsidered} captain {captainAutoPick.sessionsConsidered === 1 ? 'run' : 'runs'}.
              </span>
              <span style={{ fontSize: 11, color: tone, fontWeight: 600 }}>{label}</span>
            </div>
          </section>
        );
      })()}

      {/* AUDIT (v5.91 parity pass): PUBLIC — rolling win-rate chart with 5/10/20/All
          window selector. /player/:id/win-rate-history is open. */}
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

      {/* AUDIT (v5.91 parity pass): PUBLIC — achievement badges grid (with category
          filter + show-locked toggle). /players/:id/achievements is open. */}
      <div id="achievements" />
      <AchievementBadges achievements={achievements} />

      {/* Task #377 — player item-purchase benchmarks vs seasonal position baseline. */}
      <ItemBenchmarksSection data={itemBenchmarks} />

      {/* Task #316 — per-hero per-position mastery panel. Public; renders
          nothing when the player has no recorded mastery rows. */}
      <HeroMasterySection accountId={accountId} />

      {/* AUDIT (v5.91 parity pass): PUBLIC — Season Pass tier + XP progress bar.
          /player/:id/season-pass is open. */}
      {showSeasonPass && seasonPass && (
        <section style={{ marginBottom: 24, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              🎟️ Season Pass — {seasonPass.tier?.tier_name || 'Bronze'}
              {seasonPass.has_season_pass && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', borderRadius: 6, padding: '2px 8px', verticalAlign: 'middle' }}>
                  ★ Pass Active
                </span>
              )}
            </h2>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{(seasonPass.total_xp ?? 0).toLocaleString()} XP</span>
          </div>
          <div style={{ height: 14, background: 'var(--bg-hover)', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, seasonPass.tier?.progress_pct || 0)).toFixed(1)}%`,
              background: 'linear-gradient(90deg, var(--accent-gold,#f59e0b), #fbbf24)',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>
            <span>{seasonPass.tier?.tier_name || 'Bronze'}</span>
            <span>
              {seasonPass.tier?.next_tier_name
                ? `${seasonPass.tier.xp_to_next} XP to ${seasonPass.tier.next_tier_name}`
                : 'Max tier reached'}
            </span>
          </div>
        </section>
      )}

      {/* AUDIT (v5.91 parity pass): PUBLIC — MVP & Attitude rolling-window trends.
          /player/:id/mvp-attitude-trends is open; gated only by the
          mvp_attitude_analytics feature flag, not by isOwnProfile. */}
      {showMvpAttitude && mvpTrends && (
        <section style={{ marginBottom: 24, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <h2 className="section-title" style={{ marginTop: 0, marginBottom: 10 }}>🌟 MVP & Attitude Trends</h2>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <div className="stat-card"><div className="stat-value">{mvpTrends.mvp_count ?? 0}</div><div className="stat-label">MVP Wins</div></div>
            <div className="stat-card"><div className="stat-value">{mvpTrends.mvp_rate != null ? `${(mvpTrends.mvp_rate * 100).toFixed(1)}%` : '—'}</div><div className="stat-label">MVP Rate</div></div>
            <div className="stat-card"><div className="stat-value">{mvpTrends.attitude_avg != null ? Number(mvpTrends.attitude_avg).toFixed(2) : '—'}</div><div className="stat-label">Attitude (avg)</div></div>
          </div>
          {Array.isArray(mvpTrends.points) && mvpTrends.points.length > 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Rolling {mvpTrends.window_size}-game window: {mvpTrends.points.length} data point{mvpTrends.points.length === 1 ? '' : 's'}.
              Latest attitude {mvpTrends.points[mvpTrends.points.length - 1]?.avg_attitude != null ? Number(mvpTrends.points[mvpTrends.points.length - 1].avg_attitude).toFixed(2) : '—'}.
            </div>
          )}
        </section>
      )}

      {/* AUDIT (v5.91 parity pass): PUBLIC — match-prediction stats card.
          /players/:id/predictions is open. */}
      {predictionStats && parseInt(predictionStats.total) > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">🎯 Match Predictions</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '14px 20px', minWidth: 120, textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{predictionStats.total}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Total Predictions</div>
            </div>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '14px 20px', minWidth: 120, textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-green)' }}>{predictionStats.correct_count}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Correct</div>
            </div>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '14px 20px', minWidth: 120, textAlign: 'center',
            }}>
              <div style={{
                fontSize: 24, fontWeight: 800,
                color: parseInt(predictionStats.total) > 0
                  ? (parseInt(predictionStats.correct_count) / parseInt(predictionStats.total) >= 0.5 ? 'var(--accent-green)' : 'var(--accent-red)')
                  : 'var(--text-primary)',
              }}>
                {parseInt(predictionStats.total) > 0
                  ? `${Math.round((parseInt(predictionStats.correct_count) / parseInt(predictionStats.total)) * 100)}%`
                  : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Accuracy</div>
            </div>
          </div>
        </section>
      )}

      {/* AUDIT (v5.91 parity pass): PUBLIC — Nemesis cards (top killers across all
          matches). /player/:id/nemesis is open. */}
      {nemesis.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">☠️ Nemesis</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>
            Players who have killed this player the most across all matches.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {nemesis.map((n, i) => {
              const medals = ['💀', '🩸', '⚔️'];
              // Task #442 — Deep-link each Nemesis card to the detailed
              // H2H page. Uses /me/h2h/:other when the viewer is signed
              // in (so the redirect resolves to /h2h/<me>/<nemesis>), or
              // /h2h/<thisProfile>/<nemesis> when browsing as a guest /
              // viewing someone else's profile.
              const h2hHref = (steamUser?.accountId && isOwnProfile)
                ? `/me/h2h/${n.killer_account_id}`
                : `/h2h/${accountId}/${n.killer_account_id}`;
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
                  <Link
                    to={h2hHref}
                    aria-label={`View detailed head-to-head against ${n.killer_name || `Player ${n.killer_account_id}`}`}
                    style={{
                      display: 'inline-block', marginTop: 8,
                      fontSize: 12, fontWeight: 600,
                      color: 'var(--accent, #c5a975)', textDecoration: 'none',
                    }}
                  >Detailed H2H →</Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Rivals leaderboard — pairwise head-to-head across all opponents this
          player has faced. Public (no auth, no Pro). Mirrors the Nemesis card
          shape but ranks opponents by total games played, not kills. */}
      {rivals.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">⚔️ Rivals</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>
            Players this player has faced the most. Wins shown against and alongside.
          </p>
          <div className="scoreboard-wrapper">
            <table className="scoreboard compact">
              <thead>
                <tr>
                  <th className="col-player">Opponent</th>
                  <th className="col-stat">Against</th>
                  <th className="col-stat">W–L (vs)</th>
                  <th className="col-stat">WR vs</th>
                  <th className="col-stat">Together</th>
                  <th className="col-stat">W–L (with)</th>
                </tr>
              </thead>
              <tbody>
                {rivals.slice(0, 15).map((r) => {
                  const lossesVs = r.games_against - r.wins_against;
                  const lossesWith = r.games_with - r.wins_with;
                  const wrVs = r.games_against > 0 ? Math.round((r.wins_against / r.games_against) * 100) : null;
                  const wrColor = wrVs == null ? 'var(--text-muted)' : wrVs >= 55 ? '#4ade80' : wrVs <= 45 ? '#f87171' : 'var(--text-secondary)';
                  return (
                    <tr key={r.opponent_account_id}>
                      <td className="col-player">
                        <Link to={`/player/${r.opponent_account_id}`} style={{ color: 'var(--accent)' }}>
                          {r.opponent_name}
                        </Link>
                      </td>
                      <td className="col-stat" style={{ fontWeight: 600 }}>{r.games_against}</td>
                      <td className="col-stat" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                        {r.wins_against}–{lossesVs}
                      </td>
                      <td className="col-stat" style={{ fontWeight: 600, color: wrColor }}>
                        {wrVs == null ? '—' : `${wrVs}%`}
                      </td>
                      <td className="col-stat" style={{ color: 'var(--text-muted)' }}>{r.games_with}</td>
                      <td className="col-stat" style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)' }}>
                        {r.wins_with}–{lossesWith}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Task #409 — Draft Trainer rolling accuracy. Hidden when the
          player has zero recorded runs so the section doesn't clutter
          profiles of users who've never used the trainer. */}
      {trainerAccuracy && trainerAccuracy.runs > 0 && (
        <section style={{ marginBottom: 24, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <h2 className="section-title" style={{ marginTop: 0, marginBottom: 8 }}>🎯 Draft Trainer accuracy</h2>
          <p style={{ margin: '4px 0 8px 0', fontSize: 13, color: 'var(--text-muted)' }}>
            How often the trainer's predicted advantage matched the actual outcome when this draft was later played in a real inhouse.
          </p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: trainerAccuracy.accuracy == null ? 'var(--text-muted)' : trainerAccuracy.accuracy >= 0.6 ? '#4ade80' : trainerAccuracy.accuracy >= 0.45 ? 'var(--text-primary)' : '#f87171' }}>
                {trainerAccuracy.accuracy == null ? '—' : `${(trainerAccuracy.accuracy * 100).toFixed(0)}%`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>rolling accuracy</div>
            </div>
            <div>
              <div style={{ fontSize: 20 }}>{trainerAccuracy.correct} / {trainerAccuracy.matched}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>graded runs</div>
            </div>
            <div>
              <div style={{ fontSize: 20 }}>{trainerAccuracy.runs}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>total runs</div>
            </div>
            <Link to="/heroes/draft-trainer" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--accent-blue)' }}>Open trainer →</Link>
          </div>
        </section>
      )}

      {/* AUDIT (v5.91 parity pass): PUBLIC — Best Allies cards (top win-rate
          teammates). /player/:id/ally is open. */}
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

      {/* AUDIT (v5.91 parity pass): PUBLIC — Hero Matchups table (vs/with win rates).
          /players/:id/hero-counters is open. */}
      {heroCounters.filter(c => parseInt(c.games_against) >= 2).length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">⚔️ Hero Matchups</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>
            Win rates against and alongside enemy heroes (min. 2 games).
          </p>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player">Hero</th>
                  <th className="col-stat" title="Games played against this hero">vs Games</th>
                  <th className="col-stat" title="Win rate when facing this hero">vs Win%</th>
                  <th className="col-stat" title="Games played with this hero on your team">With Games</th>
                  <th className="col-stat" title="Win rate when this hero is on your team">With Win%</th>
                </tr>
              </thead>
              <tbody>
                {heroCounters
                  .filter(c => parseInt(c.games_against) >= 2)
                  .slice(0, 15)
                  .map((c, i) => {
                    const vsWr = c.games_against > 0 ? Math.round((c.wins_against / c.games_against) * 100) : null;
                    const withWr = c.games_with > 0 ? Math.round((c.wins_with / c.games_with) * 100) : null;
                    return (
                      <tr key={i}>
                        <td className="col-player">{getHeroName(c.hero_id, c.hero_name)}</td>
                        <td className="col-stat">{c.games_against}</td>
                        <td className="col-stat" style={{ color: vsWr === null ? 'var(--text-muted)' : vsWr >= 50 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
                          {vsWr !== null ? `${vsWr}%` : '--'}
                        </td>
                        <td className="col-stat">{c.games_with || 0}</td>
                        <td className="col-stat" style={{ color: withWr === null ? 'var(--text-muted)' : withWr >= 50 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
                          {withWr !== null ? `${withWr}%` : '--'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* AUDIT (v5.91 parity pass): PUBLIC — per-stat averages grid (KDA, GPM/XPM,
          damage, healing, last hits, wards, camps stacked). Comes from the open
          /players/:id payload. */}
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

      {/* AUDIT (v5.91 parity pass): PUBLIC — Position Breakdown table (games / wins /
          win% / KDA / GPM per role). /players/:id/positions is open. */}
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

      {/* AUDIT (v5.91 parity pass): PUBLIC — "How You Compare" bars (player vs server
          averages on their main role). /position-averages is open. */}
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

      {/* AUDIT (v5.91 parity pass): PUBLIC — Most Played Heroes table (top 20 by
          games). Sourced from the open /players/:id payload. */}
      {heroes && heroes.length > 0 && (
        <section id="heroes">
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

      {/* AUDIT (v5.91 parity pass): PUBLIC — Win Rate by Game Duration buckets.
          /players/:id/duration-stats is open. */}
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

      {/* AUDIT (v5.91 parity pass): PUBLIC, internal Pro upsell — Heroes to Try
          (a.k.a. "Best Player Heroes" suggestions). /player/:id/hero-suggestions is open;
          the Pro vs free split is per-row inside the card (correlation breakdown is
          Pro-only, the suggestion list itself is public). */}
      {heroSuggestions && totalMatches > 0 && (
        <section>
          <h2 className="section-title">Heroes to Try</h2>
          {heroSuggestions.suggestions && heroSuggestions.suggestions.length > 0 ? (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                Based on your top heroes and community win rates — heroes you have less than 5 games on that are performing well in your role{heroSuggestions.is_pro ? '' : '. Upgrade to Pro for full breakdown'}.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {heroSuggestions.suggestions.map(s => {
                  const wrPct = (s.community_win_rate * 100).toFixed(1);
                  const TIER_COLOR = s.community_win_rate >= 0.58 ? '#ff6b35' : s.community_win_rate >= 0.53 ? '#f7c059' : '#a3e635';
                  return (
                    <div key={s.hero_id} style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '12px 14px', minWidth: 200, maxWidth: 260, flex: '0 0 auto',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.hero_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${s.community_win_rate * 100}%`, height: '100%', background: TIER_COLOR, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: TIER_COLOR }}>{wrPct}% WR</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                        You: {s.player_games} game{s.player_games !== 1 ? 's' : ''}
                        {s.position > 0 ? ` · Pos ${s.position}` : ''}
                      </div>
                      {heroSuggestions.is_pro && s.based_on_hero_name && s.correlation_score != null ? (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 6, padding: '5px 8px', marginTop: 4 }}>
                          {Math.round(s.correlation_score * 100)}% of players good at{' '}
                          <strong>{s.based_on_hero_name}</strong>{' '}
                          ({s.based_on_hero_wr != null ? `${(s.based_on_hero_wr * 100).toFixed(0)}% your WR` : 'your top hero'}){' '}
                          also excel here · {s.similar_players_count} shared player{s.similar_players_count !== 1 ? 's' : ''}
                        </div>
                      ) : s.based_on_hero_name && !heroSuggestions.is_pro ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>
                          Pro: see correlation breakdown
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Play a few more games to unlock suggestions!
            </p>
          )}
        </section>
      )}

      {/* AUDIT (v5.91 parity pass): PUBLIC — Recent Matches table with optional MVP
          star marker (mvp_match_badges flag). Sourced from the open /players/:id payload. */}
      {recentMatches && recentMatches.length > 0 && (
        <section id="recent">
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
                  <th className="col-stat" title="Download replay (Pro)">Replay</th>
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
                      {/* Magazine v3 (Task #157 round-8): per the reviewer,
                          free users must see a Pro upsell *in place of* the
                          download icon — not a click-through that 402s. We
                          fetch is_pro once for the page (replayIsPro state)
                          and conditionally render either the ⬇ download or
                          a 🔒 link to /pricing. */}
                      <td className="col-stat">
                        {replayIsPro ? (
                          <a
                            href={`/api/matches/${m.match_id}/replay`}
                            title="Download replay"
                            aria-label="Download replay"
                            onClick={async (e) => {
                              e.preventDefault();
                              try {
                                const r = await fetch(`/api/matches/${m.match_id}/replay`, { credentials: 'include' });
                                if (r.status === 429) {
                                  const j = await r.json().catch(() => ({}));
                                  alert(j.error || 'Daily replay limit reached.');
                                  return;
                                }
                                if (!r.ok) {
                                  const j = await r.json().catch(() => ({}));
                                  alert(j.error || `Replay unavailable (HTTP ${r.status})`);
                                  return;
                                }
                                const blob = await r.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `match-${m.match_id}.dem`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                URL.revokeObjectURL(url);
                              } catch (err) {
                                alert(`Replay download failed: ${err.message}`);
                              }
                            }}
                            style={{ color: 'var(--amber, #f59e0b)', fontSize: 13 }}
                          >⬇</a>
                        ) : (
                          <Link
                            to="/pricing"
                            title="Replay downloads are a Pro perk — upgrade to unlock"
                            style={{ color: 'var(--brass, #c5a975)', fontSize: 13, opacity: 0.85 }}
                          >🔒 Pro</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Task #204 / v6.60 — Magazine v3 Compare drawer. Uses the shared
          <Dialog> primitive (focus trap, Escape, body scroll lock — gates
          the hand-rolled-modal a11y check). Picks any other player from
          the season-scoped player list and renders a compact head-to-head
          stat strip via /api/compare. The drawer is keyboard-driven end
          to end: select → "Compare", server fetch, results panel. The
          ?compare=<id> URL param preselects the opponent on first open. */}
      <Dialog
        open={compareOpen}
        onClose={closeCompareDrawer}
        labelledBy="v3-compare-title"
        initialFocusRef={null}
      >
        <div className="v3-compare-drawer">
          <h2 id="v3-compare-title" className="v3-compare-title">⚖️ Compare {displayName}</h2>
          <p className="v3-compare-sub">Pick any player to see a side-by-side stat strip.</p>
          <div className="v3-compare-row">
            <label htmlFor="v3-compare-select" className="v3-compare-label">Versus</label>
            <select
              id="v3-compare-select"
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              className="v3-compare-select"
            >
              <option value="">— Choose a player —</option>
              {compareList.map(p => (
                <option key={p.account_id} value={p.account_id}>
                  {p.nickname || p.persona_name || `Player ${p.account_id}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="v3-compare-go"
              disabled={!compareB || compareLoading}
              onClick={async () => {
                if (!compareB) return;
                setCompareLoading(true);
                setCompareError(null);
                setCompareData(null);
                try {
                  const d = await getPlayerComparison(accountId, compareB, seasonId);
                  setCompareData(d);
                } catch (err) {
                  setCompareError(err.message || 'Compare failed');
                } finally {
                  setCompareLoading(false);
                }
              }}
            >
              {compareLoading ? 'Loading…' : 'Compare'}
            </button>
          </div>
          {compareError && <p className="v3-compare-error">{compareError}</p>}
          {compareData && Array.isArray(compareData.rows) && compareData.rows.length > 0 && (
            <div className="v3-compare-results">
              <table className="v3-compare-table">
                <thead>
                  <tr>
                    <th scope="col">Stat</th>
                    <th scope="col">{compareData.a?.name || displayName}</th>
                    <th scope="col">{compareData.b?.name || 'Opponent'}</th>
                  </tr>
                </thead>
                <tbody>
                  {compareData.rows.map((r, i) => (
                    <tr key={i}>
                      <th scope="row">{r.label}</th>
                      <td className={r.a_wins ? 'v3-compare-win' : ''}>{r.a}</td>
                      <td className={r.b_wins ? 'v3-compare-win' : ''}>{r.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {compareData && (!compareData.rows || compareData.rows.length === 0) && (
            <p className="v3-compare-empty">No comparable stats yet — both players need a few games this season.</p>
          )}
          <div className="v3-compare-actions">
            <button
              type="button"
              className="v3-compare-close"
              onClick={closeCompareDrawer}
            >Close</button>
          </div>
        </div>
      </Dialog>

      {/* Task #242 — Share popover. Uses the shared <Dialog> primitive
          (focus trap, Escape, body scroll lock, focus restore — gates
          the hand-rolled-modal a11y check). Offers one-click intents
          for Twitter/X and Discord-friendly markdown alongside the
          existing copy-link behaviour. */}
      <Dialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        labelledBy="share-popover-title"
        backdropStyle={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'transparent',
        }}
        contentStyle={shareAnchor ? {
          position: 'fixed',
          top: Math.min(shareAnchor.top, (typeof window !== 'undefined' ? window.innerHeight - 360 : shareAnchor.top)),
          left: Math.min(shareAnchor.left, (typeof window !== 'undefined' ? window.innerWidth - 380 : shareAnchor.left)),
        } : undefined}
      >
        {(() => {
          const shareUrl = vanitySlug
            ? `${window.location.origin}/p/${vanitySlug}`
            : (typeof window !== 'undefined' ? window.location.href : '');
          const mmrValue = seasonMmr != null ? seasonMmr : (rating?.mmr != null ? rating.mmr : null);
          const mmrFragment = mmrValue != null ? ` (${Math.round(mmrValue)} MMR)` : '';
          const tweetText = `Check out ${displayName}${mmrFragment} on OCE Inhouse:`;
          const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
          const discordMarkdown = `Check out **${displayName}**${mmrFragment} on OCE Inhouse: <${shareUrl}>`;
          const copyText = (text, kind) => {
            const done = () => {
              setShareCopied(kind);
              // Brief confirmation flash, then auto-close so the popover
              // doesn't linger after the user has what they came for.
              window.setTimeout(() => {
                setShareCopied(prev => prev === kind ? null : prev);
                setShareOpen(false);
              }, 900);
            };
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(text).then(done).catch(() => {
                window.prompt('Copy this:', text);
                setShareOpen(false);
              });
            } else {
              window.prompt('Copy this:', text);
              setShareOpen(false);
            }
          };
          const btnStyle = {
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text)', borderRadius: 8, padding: '10px 14px',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            textDecoration: 'none',
          };
          return (
            <div style={{
              background: 'var(--bg-secondary, #111)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 18, minWidth: 280, maxWidth: 360,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            }}>
              <h2
                id="share-popover-title"
                style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}
              >Share this profile</h2>
              <p style={{ margin: '0 0 14px 0', fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {shareUrl}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href={twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={btnStyle}
                  onClick={() => setShareOpen(false)}
                >
                  <span aria-hidden="true">🐦</span>
                  <span>Share on Twitter / X</span>
                </a>
                <button
                  type="button"
                  onClick={() => copyText(discordMarkdown, 'discord')}
                  style={btnStyle}
                >
                  <span aria-hidden="true">💬</span>
                  <span>{shareCopied === 'discord' ? '✅ Copied for Discord!' : 'Copy for Discord'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => copyText(shareUrl, 'link')}
                  style={btnStyle}
                >
                  <span aria-hidden="true">🔗</span>
                  <span>{shareCopied === 'link' ? '✅ Link copied!' : 'Copy link'}</span>
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--text-muted)', borderRadius: 8, padding: '6px 14px',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >Close</button>
              </div>
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
}

function CoachingApplyCta() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    fetch('/api/coaching/eligibility/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});
  }, []);
  if (!data || !data.signed_in || !data.eligible) return null;
  const linkTo = data.has_coach_row ? '/coach/edit' : '/coach/onboarding';
  const label = data.has_coach_row ? '⚙️ Coach profile' : '🎓 Apply to coach';
  return (
    <Link
      to={linkTo}
      style={{
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
        borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, textDecoration: 'none',
      }}
    >{label}</Link>
  );
}
