import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getHomeStats, getLatestRecap } from '../api';
import { fmtDate } from '../utils/dates';

function formatHeroName(raw) {
  if (!raw) return '—';
  const clean = raw.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ');
  return clean.replace(/\b\w/g, c => c.toUpperCase());
}

function StatCard({ label, value, sub, icon }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value ?? '—'}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</span>}
    </div>
  );
}

function QuickLink({ to, icon, label, desc }) {
  return (
    <Link to={to} style={{ textDecoration: 'none', flex: 1, minWidth: 160 }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '16px 18px', transition: 'border-color 0.15s, background 0.15s',
        cursor: 'pointer',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
      >
        <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </Link>
  );
}

function fmtDuration(s) {
  if (!s) return '—';
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export default function Home() {
  const [stats, setStats] = useState(null);
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  useEffect(() => {
    Promise.all([
      getHomeStats().catch(() => null),
      getLatestRecap().catch(() => null),
    ]).then(([s, r]) => {
      setStats(s);
      setRecap(r);
      setLoading(false);
    });
  }, []);

  async function handleGenerateRecap() {
    const key = prompt('Enter the admin key to generate a recap:');
    if (!key) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/generate-recap', {
        method: 'POST',
        headers: { 'x-upload-key': key },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setRecap(data);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  const totals = stats?.totals || {};
  const recentMatches = stats?.recentMatches || [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

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
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/leaderboard" className="btn btn-primary" style={{ fontSize: 13 }}>
            🏆 Leaderboard
          </Link>
          <Link to="/matches" className="btn" style={{ fontSize: 13 }}>
            🎮 Matches
          </Link>
        </div>
      </div>

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
          <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            📊 Weekly Recap
            {recap?.generated_at && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                generated {fmtDate(recap.generated_at)}
              </span>
            )}
            <button
              onClick={handleGenerateRecap}
              disabled={generating}
              style={{
                marginLeft: 'auto', fontSize: 11, padding: '3px 10px',
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              {generating ? '⏳ Generating…' : '⚙️ Generate Now'}
            </button>
          </h2>
          {genError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>Error: {genError}</div>}
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
                {recentMatches.map(m => (
                  <Link key={m.match_id} to={`/match/${m.match_id}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--bg-hover)', textDecoration: 'none',
                    border: '1px solid transparent', transition: 'border-color 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(m.date)}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: m.radiant_win ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {m.radiant_win ? 'Radiant' : 'Dire'} Win
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDuration(m.duration)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent matches (shown below when recap is present) */}
      {recap?.ai_blurb && recentMatches.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            🕐 Recent Matches
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentMatches.map(m => (
              <Link key={m.match_id} to={`/match/${m.match_id}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 8, background: 'var(--bg-hover)',
                textDecoration: 'none', border: '1px solid transparent', transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
              >
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(m.date)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: m.radiant_win ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {m.radiant_win ? 'Radiant' : 'Dire'} Win
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDuration(m.duration)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick navigation */}
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>
        Explore
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <QuickLink to="/leaderboard" icon="🏆" label="Leaderboard" desc="TrueSkill MMR rankings" />
        <QuickLink to="/players" icon="👥" label="Players" desc="Individual profiles & stats" />
        <QuickLink to="/heroes" icon="🦸" label="Heroes" desc="Pick rates, win rates, KDA" />
        <QuickLink to="/matches" icon="🎮" label="Matches" desc="Full match history" />
        <QuickLink to="/synergy" icon="🤝" label="Synergy" desc="Teammate & opponent win rates" />
        <QuickLink to="/head-to-head" icon="⚔️" label="Head to Head" desc="Direct player matchups" />
        <QuickLink to="/draft-assistant" icon="📋" label="Draft Assistant" desc="Hero pick & ban suggestions" />
        <QuickLink to="/patch-notes" icon="📝" label="Patch Notes" desc="Latest game updates" />
      </div>

    </div>
  );
}
