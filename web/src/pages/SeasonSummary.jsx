import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSeasonSummary } from '../api';

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px', minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || 'var(--text-primary)' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function RecordCard({ icon, title, name, detail, accent }) {
  if (!name) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${accent || 'var(--border)'}`,
      borderRadius: 10, padding: '14px 18px', flex: '1 1 260px',
    }}>
      <div style={{ fontSize: 12, color: accent || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {icon} {title}
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>{name}</div>
      {detail && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{detail}</div>}
    </div>
  );
}

export default function SeasonSummary() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSeasonSummary(id)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading season summary…</div>
  );
  if (error) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--dire-color)' }}>Error: {error}</div>
  );
  if (!data) return null;

  const { season, summary } = data;
  const medals = ['🥇', '🥈', '🥉'];

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 8 }}>
        <Link to="/seasons" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
          ← All Seasons
        </Link>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: '1.8rem' }}>🏆 {season?.name || `Season ${id}`}</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {fmtDate(summary.dates?.startDate)} — {fmtDate(summary.dates?.endDate)}
          {season?.is_legacy && (
            <span style={{
              marginLeft: 10, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(124,107,255,0.15)', color: 'var(--accent, #7c6bff)',
              fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            }}>ARCHIVED</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard label="Total Matches" value={summary.overview.totalMatches} accent="var(--accent, #7c6bff)" />
        <StatCard label="Players" value={summary.overview.totalPlayers} />
        {summary.heroOfSeason && (
          <StatCard
            label="Hero of the Season"
            value={summary.heroOfSeason.hero_name}
            sub={`${summary.heroOfSeason.winRate}% win rate · ${summary.heroOfSeason.games} games`}
            accent="#4ade80"
          />
        )}
      </div>

      {summary.topPlayers?.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 14, fontSize: '1.1rem' }}>📊 Final Leaderboard Top 3</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {summary.topPlayers.map((p, i) => (
              <div key={p.account_id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 18px',
              }}>
                <div style={{ fontSize: 28, minWidth: 36 }}>{medals[i]}</div>
                <div style={{ flex: 1 }}>
                  <Link
                    to={`/player/${p.account_id}`}
                    style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', textDecoration: 'none' }}
                  >
                    {p.display_name}
                  </Link>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    {p.wins ?? 0}W / {p.losses ?? 0}L · {p.games_played ?? 0} games
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent, #7c6bff)' }}>
                    {p.mmr != null ? p.mmr : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>MMR</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 14, fontSize: '1.1rem' }}>🏅 Season Records</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <RecordCard
            icon="🔥"
            title="Longest Win Streak"
            name={summary.longestStreak?.display_name}
            detail={summary.longestStreak ? `${summary.longestStreak.longest_streak} wins in a row` : null}
            accent="#fb923c"
          />
          <RecordCard
            icon="📈"
            title="Most Improved"
            name={summary.mostImproved?.display_name}
            detail={summary.mostImproved
              ? `+${summary.mostImproved.delta} MMR (${summary.mostImproved.first_mmr} → ${summary.mostImproved.last_mmr})`
              : null}
            accent="#4ade80"
          />
          <RecordCard
            icon="⚔️"
            title="Hero of the Season"
            name={summary.heroOfSeason?.hero_name}
            detail={summary.heroOfSeason
              ? `${summary.heroOfSeason.winRate}% win rate · ${summary.heroOfSeason.games} picks`
              : null}
            accent="#facc15"
          />
        </div>
      </section>

      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <Link
          to="/leaderboard"
          style={{
            display: 'inline-block', padding: '10px 24px', borderRadius: 8,
            background: 'var(--accent, #7c6bff)', color: '#fff',
            textDecoration: 'none', fontWeight: 600, fontSize: 14,
          }}
        >
          View Leaderboard →
        </Link>
        <Link
          to="/matches"
          style={{
            display: 'inline-block', padding: '10px 24px', borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', textDecoration: 'none',
            fontWeight: 600, fontSize: 14, marginLeft: 12,
          }}
        >
          Match History →
        </Link>
      </div>
    </div>
  );
}
