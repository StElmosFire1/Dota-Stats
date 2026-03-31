import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPlayer, getPlayerPositions, getPlayerRatingHistory, getPlayerAchievements, getPlayerNemesis, getPlayerPredictionStats, getPlayerHeroCounters, getPlayerStreak, getPlayerDurationStats, getPlayerCommunityRatings } from '../api';
import { useSeason } from '../context/SeasonContext';
import { getHeroName } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
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

function AchievementBadges({ achievements }) {
  if (!achievements || achievements.length === 0) return null;
  const earned = achievements.filter(a => a.earned);
  if (earned.length === 0 && achievements.every(a => !a.earned)) return null;

  return (
    <section>
      <h2 className="section-title">Achievements</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {achievements.map(a => (
          <div
            key={a.key}
            title={a.desc}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '12px 14px', borderRadius: 10, minWidth: 80, textAlign: 'center',
              background: a.earned ? 'var(--bg-card)' : 'rgba(0,0,0,0.15)',
              border: `1px solid ${a.earned ? 'var(--accent-blue)' : 'var(--border)'}`,
              opacity: a.earned ? 1 : 0.38,
              boxShadow: a.earned ? '0 0 8px rgba(59,130,246,0.2)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 26, marginBottom: 5 }}>{a.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: a.earned ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.3 }}>
              {a.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PlayerProfile() {
  const { accountId } = useParams();
  const { seasonId } = useSeason();
  const [data, setData] = useState(null);
  const [positions, setPositions] = useState([]);
  const [ratingHistory, setRatingHistory] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [nemesis, setNemesis] = useState([]);
  const [predictionStats, setPredictionStats] = useState(null);
  const [heroCounters, setHeroCounters] = useState([]);
  const [streak, setStreak] = useState(null);
  const [durationStats, setDurationStats] = useState([]);
  const [communityRatings, setCommunityRatings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPlayer(accountId, seasonId).catch(() => null),
      getPlayerPositions(accountId, seasonId).catch(() => ({ positions: [] })),
      getPlayerRatingHistory(accountId).catch(() => ({ history: [] })),
      getPlayerAchievements(accountId).catch(() => ({ achievements: [] })),
      getPlayerNemesis(accountId).catch(() => []),
      getPlayerPredictionStats(accountId).catch(() => null),
      getPlayerHeroCounters(accountId, seasonId).catch(() => ({ counters: [] })),
      getPlayerStreak(accountId).catch(() => ({ streak: 0 })),
      getPlayerDurationStats(accountId, seasonId).catch(() => ({ stats: [] })),
      getPlayerCommunityRatings(accountId).catch(() => null),
    ]).then(([playerData, posData, histData, achData, nemData, predData, counterData, streakData, durData, ratingData]) => {
      setData(playerData);
      setPositions(posData?.positions || []);
      setRatingHistory(histData?.history || []);
      setAchievements(achData?.achievements || []);
      setNemesis(Array.isArray(nemData) ? nemData : []);
      setPredictionStats(predData?.stats || null);
      setHeroCounters(counterData?.counters || []);
      setStreak(streakData?.streak ?? null);
      setDurationStats(durData?.stats || []);
      setCommunityRatings(ratingData?.ratings || null);
    }).finally(() => setLoading(false));
  }, [accountId, seasonId]);

  if (loading) return <div className="loading">Loading player...</div>;
  if (!data) return <div className="error-state">Player not found</div>;

  const { rating, nickname, recentMatches, averages, heroes, seasonMmr } = data;
  const displayName = nickname || rating?.display_name || `Player ${accountId}`;

  const totalMatches = averages ? parseInt(averages.total_matches) : 0;
  const totalKDA = averages && totalMatches > 0
    ? ((parseInt(averages.total_kills) + parseInt(averages.total_assists)) / Math.max(parseInt(averages.total_deaths), 1)).toFixed(2)
    : null;

  return (
    <div>
      <Link to="/players" className="back-link">&larr; Back to players</Link>

      <h1 className="page-title">
        {displayName}
        {nickname && rating?.display_name && nickname !== rating.display_name && (
          <span style={{ fontSize: '0.6em', color: '#888', marginLeft: '0.5rem' }}>
            ({rating.display_name})
          </span>
        )}
      </h1>

      {rating && (
        <div className="stats-grid">
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
                return g > 0 ? ((w / g) * 100).toFixed(1) + '%' : '--';
              })()}
            </div>
            <div className="stat-label">Win Rate</div>
          </div>
          {totalKDA && (
            <div className="stat-card">
              <div className="stat-value">{totalKDA}</div>
              <div className="stat-label">KDA</div>
            </div>
          )}
          {streak !== null && streak !== 0 && (
            <div className="stat-card" style={{
              borderColor: streak > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              boxShadow: streak > 0 ? '0 0 8px rgba(74,222,128,0.2)' : '0 0 8px rgba(248,113,113,0.2)',
            }}>
              <div className="stat-value" style={{ color: streak > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`}
              </div>
              <div className="stat-label">Current Streak</div>
            </div>
          )}
          {averages && parseInt(averages.total_firstbloods) > 0 && (
            <div className="stat-card" style={{ borderColor: '#f87171' }}>
              <div className="stat-value" style={{ color: '#f87171' }}>
                {averages.total_firstbloods}
                <span style={{ fontSize: '0.7em', color: '#64748b', marginLeft: 4 }}>({averages.fb_rate}%)</span>
              </div>
              <div className="stat-label">🩸 First Bloods</div>
            </div>
          )}
          {averages && parseInt(averages.pudge_games_with_hooks) > 0 && (
            <div className="stat-card" style={{ borderColor: '#a78bfa' }}>
              <div className="stat-value" style={{ color: '#a78bfa' }}>
                {parseInt(averages.total_hook_attempts) > 0
                  ? ((parseInt(averages.total_hook_hits) / parseInt(averages.total_hook_attempts)) * 100).toFixed(1) + '%'
                  : '—'}
                <span style={{ fontSize: '0.7em', color: '#64748b', marginLeft: 4 }}>
                  ({averages.total_hook_hits}/{averages.total_hook_attempts})
                </span>
              </div>
              <div className="stat-label">🪝 Pudge Hook Accuracy</div>
            </div>
          )}
        </div>
      )}

      <RatingChart history={ratingHistory} />

      <AchievementBadges achievements={achievements} />

      {communityRatings && (parseInt(communityRatings.mvp_votes) > 0 || parseInt(communityRatings.attitude_ratings) > 0) && (
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">⭐ Community Ratings</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Voted by teammates after matches — ratings are anonymous.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {parseInt(communityRatings.mvp_votes) > 0 && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '14px 20px', minWidth: 120, textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fbbf24' }}>
                  {communityRatings.mvp_votes} ⭐
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>MVP Votes</div>
              </div>
            )}
            {communityRatings.avg_attitude && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '14px 20px', minWidth: 120, textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: parseFloat(communityRatings.avg_attitude) >= 7 ? '#4ade80' : parseFloat(communityRatings.avg_attitude) >= 5 ? '#fbbf24' : '#f87171' }}>
                  {communityRatings.avg_attitude}/10
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Attitude Score ({communityRatings.attitude_ratings} ratings)
                </div>
              </div>
            )}
          </div>
        </section>
      )}

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
                {positions.filter(p => p.position > 0).map((p, i) => {
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
