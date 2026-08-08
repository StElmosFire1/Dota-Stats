import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getHallOfFame, getAchievementLeaderboard, getReferralLeaderboard } from '../api';
import { useSeason } from '../context/SeasonContext';
import HeroIcon from '../components/HeroIcon';
import { formatHeroName as formatHero } from '../utils/heroes';
import ImpactBadge from '../components/ImpactBadge';

function RecordCard({ title, emoji, record }) {
  if (!record) return null;
  const val = typeof record.value === 'number' && record.value > 1000
    ? record.value.toLocaleString()
    : record.value;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', minWidth: 200, flex: '1 1 200px',
    }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{val}</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <HeroIcon heroName={record.hero_name} size="sm" />
        <div>
          <Link to={`/player/${record.account_id}`} style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 14 }}>
            {record.persona_name}
          </Link>
          {record.match_id && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <Link to={`/match/${record.match_id}`} style={{ color: 'var(--text-muted)' }}>Match #{record.match_id}</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const RECORD_META = [
  { key: 'kills', emoji: '⚔️', title: 'Most Kills (Single Match)' },
  { key: 'deaths', emoji: '💀', title: 'Most Deaths (Single Match)' },
  { key: 'assists', emoji: '🤝', title: 'Most Assists (Single Match)' },
  { key: 'gpm', emoji: '💰', title: 'Highest GPM' },
  { key: 'xpm', emoji: '⚡', title: 'Highest XPM' },
  { key: 'hero_damage', emoji: '🔥', title: 'Most Hero Damage' },
  { key: 'hero_healing', emoji: '💚', title: 'Most Healing' },
  { key: 'tower_damage', emoji: '🏯', title: 'Most Tower Damage' },
  { key: 'net_worth', emoji: '💎', title: 'Highest Net Worth' },
  { key: 'last_hits', emoji: '🎯', title: 'Most Last Hits' },
];

export default function HallOfFame({ embed = false } = {}) {
  const { seasonId } = useSeason();
  const [data, setData] = useState(null);
  const [hunters, setHunters] = useState([]);
  const [referrers, setReferrers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Auxiliary leaderboards can fail independently of the main payload —
  // remember which ones did so their tabs can say "failed" instead of
  // rendering the misleading "no data yet" empty state.
  const [auxFailed, setAuxFailed] = useState({ hunters: false, referrers: false });
  const [tab, setTab] = useState('records');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const failed = { hunters: false, referrers: false };
    Promise.all([
      getHallOfFame(seasonId),
      getAchievementLeaderboard(10).catch(() => { failed.hunters = true; return { hunters: [] }; }),
      getReferralLeaderboard(10).catch(() => { failed.referrers = true; return { referrers: [] }; }),
    ])
      .then(([hof, ach, ref]) => {
        if (cancelled) return;
        setData(hof);
        const hofHunters = hof.achievementHunters || [];
        setHunters(hofHunters.length ? hofHunters : (ach.hunters || []));
        // The main payload also carries achievement hunters, so the tab is
        // only "failed" if both sources came back empty AND the aux call errored.
        setAuxFailed({
          hunters: failed.hunters && hofHunters.length === 0 && (ach.hunters || []).length === 0,
          referrers: failed.referrers,
        });
        setReferrers(ref.referrers || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(err || new Error('Failed to load'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [seasonId, reloadKey]);

  if (loading) return <div className="loading">Loading Hall of Fame…</div>;
  if (!data) {
    const needsAuth = error && (error.status === 401 || error.status === 403);
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden="true">🏆</div>
        <h2 style={{ marginBottom: 8 }}>Couldn&rsquo;t load the Hall of Fame</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          {needsAuth
            ? 'This data requires you to be signed in.'
            : 'Something went wrong fetching the data. It\u2019s probably temporary.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => setReloadKey(k => k + 1)}>
            Try again
          </button>
          {needsAuth && (
            <button type="button" className="btn" onClick={() => { window.location.href = '/auth/steam'; }}>
              Sign in with Steam
            </button>
          )}
        </div>
      </div>
    );
  }

  const { records, career } = data;
  const tabs = [
    { id: 'records', label: '🏅 Match Records' },
    { id: 'career', label: '📊 Career Rankings' },
    { id: 'hunters', label: '🎖️ Achievement Hunters' },
    { id: 'recruiters', label: '📣 Top Recruiters' },
  ];

  return (
    <div>
      {!embed && <h1 className="page-title">🏆 Hall of Fame</h1>}
      {!embed && (
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
          All-time single-match records, career achievements, top achievement hunters, and the most active recruiters.
        </p>
      )}

      <div className="tabs" style={{ marginBottom: 24 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'records' && (
        Object.keys(records || {}).length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Match records aren&rsquo;t available right now. If matches have been played, this is
            likely a temporary loading issue &mdash; try refreshing in a moment.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {RECORD_META.map(m => (
              <RecordCard key={m.key} title={m.title} emoji={m.emoji} record={records[m.key]} />
            ))}
          </div>
        )
      )}

      {tab === 'career' && ((career || []).length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          Career rankings aren&rsquo;t available right now. If matches have been played, this is
          likely a temporary loading issue &mdash; try refreshing in a moment.
        </p>
      ) : (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table className="scoreboard" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ textAlign: 'left' }}>Player</th>
                  <th>Games</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Win%</th>
                  <th>Avg KDA</th>
                  <th>Avg GPM</th>
                  <th>Total Kills</th>
                  <th title="Overall Impact Score 1–10 (win rate, kill involvement, K/D/A, games played)">Impact</th>
                  <th title="Total achievements unlocked">🏅</th>
                </tr>
              </thead>
              <tbody>
                {career.map((p, i) => {
                  const wr = p.games > 0 ? ((p.wins / p.games) * 100).toFixed(0) : 0;
                  const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
                  const achCount = parseInt(p.achievement_count) || 0;
                  return (
                    <tr key={p.account_id}>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{medal}</td>
                      <td>
                        <Link to={`/player/${p.account_id}`} style={{ fontWeight: 600 }}>
                          {p.display_name}
                        </Link>
                      </td>
                      <td className="col-stat">{p.games}</td>
                      <td className="col-stat" style={{ color: 'var(--radiant-color)' }}>{p.wins}</td>
                      <td className="col-stat" style={{ color: 'var(--dire-color)' }}>{p.losses}</td>
                      <td className="col-stat" style={{
                        color: wr >= 60 ? 'var(--radiant-color)' : wr >= 45 ? 'var(--text-primary)' : 'var(--dire-color)',
                        fontWeight: 600,
                      }}>{wr}%</td>
                      <td className="col-stat">{parseFloat(p.avg_kda).toFixed(2)}</td>
                      <td className="col-stat">{p.avg_gpm}</td>
                      <td className="col-stat">{parseInt(p.total_kills).toLocaleString()}</td>
                      <td className="col-stat"><ImpactBadge score={p.impact_score ?? null} /></td>
                      <td className="col-stat" style={{ color: achCount > 0 ? 'var(--accent-blue)' : 'var(--text-muted)', fontWeight: achCount > 0 ? 600 : 400 }}>
                        {achCount > 0 ? achCount : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {tab === 'hunters' && (
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Top players ranked by total achievements unlocked. Keep playing to climb the ranks!
          </p>
          {hunters.length === 0 ? (
            auxFailed.hunters ? (
              <p style={{ color: 'var(--text-muted)' }}>
                Couldn&rsquo;t load the achievement leaderboard.{' '}
                <button type="button" className="btn btn-small" onClick={() => setReloadKey(k => k + 1)}>Try again</button>
              </p>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No achievement data yet. Achievements are granted automatically after matches.</p>
            )
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="scoreboard" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th style={{ textAlign: 'left' }}>Player</th>
                    <th>Achievements</th>
                    <th style={{ textAlign: 'left' }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {hunters.map((h, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
                    const pct = Math.min(100, Math.round((parseInt(h.achievement_count) / 80) * 100));
                    return (
                      <tr key={h.player_id}>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{medal}</td>
                        <td>
                          <Link to={`/player/${h.player_id}`} style={{ fontWeight: 600 }}>
                            {h.display_name}
                          </Link>
                        </td>
                        <td className="col-stat" style={{ color: 'var(--gold)', fontWeight: 700 }}>
                          🏅 {h.achievement_count}
                        </td>
                        <td style={{ minWidth: 140 }}>
                          <div style={{ background: 'var(--bg-secondary)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`, height: '100%',
                              background: pct >= 80 ? 'var(--gold)' : pct >= 50 ? 'var(--accent-blue)' : 'var(--text-muted)',
                              borderRadius: 4, transition: 'width 0.3s',
                            }} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pct}% of catalogue</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'recruiters' && (
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Players who have brought the most new members into the inhouse group. Invite your friends to climb the ranks!
          </p>
          {referrers.length === 0 ? (
            auxFailed.referrers ? (
              <p style={{ color: 'var(--text-muted)' }}>
                Couldn&rsquo;t load the recruiter leaderboard.{' '}
                <button type="button" className="btn btn-small" onClick={() => setReloadKey(k => k + 1)}>Try again</button>
              </p>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No referral data yet. Share your invite link to get started!</p>
            )
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="scoreboard" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th style={{ textAlign: 'left' }}>Player</th>
                    <th>Players Recruited</th>
                  </tr>
                </thead>
                <tbody>
                  {referrers.map((r, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
                    const count = parseInt(r.referral_count);
                    return (
                      <tr key={r.account_id}>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{medal}</td>
                        <td>
                          <Link to={`/player/${r.account_id}`} style={{ fontWeight: 600 }}>
                            {r.display_name}
                          </Link>
                        </td>
                        <td className="col-stat" style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>
                          📣 {count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
