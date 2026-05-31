import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getPlayerPerfGrowth } from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';
import HeroIcon from '../components/HeroIcon';
import CoachRecommendationsTile from '../components/CoachRecommendationsTile';

const POS_LABELS = {
  1: 'Pos 1 · Carry',
  2: 'Pos 2 · Mid',
  3: 'Pos 3 · Offlane',
  4: 'Pos 4 · Soft Support',
  5: 'Pos 5 · Hard Support',
};

function fmtVal(value, format) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  if (format === 'int') return Math.round(value).toLocaleString('en-AU');
  return (Math.round(value * 10) / 10).toFixed(1);
}

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', timeZone: 'Australia/Sydney',
    });
  } catch { return ''; }
}

function trendMeta(trend, delta) {
  if (trend === 'up') {
    return { color: 'var(--accent-green, #22c55e)', icon: '▲',
      text: `Trending up — last 5 games are ${Math.abs(delta).toFixed(1)} PERF above the 5 before` };
  }
  if (trend === 'down') {
    return { color: 'var(--accent-red, #ef4444)', icon: '▼',
      text: `Trending down — last 5 games are ${Math.abs(delta).toFixed(1)} PERF below the 5 before` };
  }
  return { color: 'var(--text-muted)', icon: '◆', text: 'Holding steady over your recent games' };
}

function PerfTrendChart({ perf }) {
  const history = perf?.history || [];
  if (history.length < 2) return null;
  const data = history.map((h, i) => ({
    idx: i + 1,
    perf: h.perf,
    rolling: h.rolling,
    date: fmtDate(h.date) || `#${i + 1}`,
    won: h.won,
  }));
  const t = trendMeta(perf.trend, perf.trend_delta || 0);

  return (
    <section className="pb-chart-panel">
      <div className="pb-chart-head">
        <div className="pb-chart-head-title">
          <span className="pb-chart-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="14 7 21 7 21 14" />
            </svg>
          </span>
          <h2 className="section-title">PERF Over Time</h2>
        </div>
        <div className="pb-chart-controls">
          <span className="pb-chart-meta" style={{ color: t.color }}>
            {t.icon} {t.text}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="idx"
            tick={false}
            stroke="var(--border)"
            label={{ value: 'Games →', position: 'insideRight', offset: -10, fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <YAxis
            domain={[0, 10]}
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            width={32}
          />
          <Tooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
            labelStyle={{ color: 'var(--text-muted)', fontSize: 12 }}
            formatter={(v, n) => [Number(v).toFixed(1), n === 'rolling' ? '5-game avg' : 'Match PERF']}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => (value === 'rolling' ? '5-game rolling avg' : 'Per-match PERF')}
          />
          <Line type="monotone" dataKey="perf" name="perf" stroke="var(--brass, #c5a975)" strokeWidth={1} dot={false} opacity={0.45} />
          <Line type="monotone" dataKey="rolling" name="rolling" stroke="var(--amber, #f59e0b)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: 'var(--amber, #f59e0b)' }} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

function PerfSummary({ perf, games, position }) {
  const cards = [
    { label: 'Recent PERF', value: perf.current, hint: 'avg of last 10' },
    { label: 'Career avg', value: perf.overall, hint: `${games} games` },
    { label: 'Best game', value: perf.best, hint: 'all-time high' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      {cards.map((c) => (
        <div key={c.label} style={{
          flex: '1 1 140px', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.label}</div>
          <div className="pb-num" style={{ fontSize: 28, fontWeight: 700, color: 'var(--amber, #f59e0b)' }}>
            {c.value != null ? c.value.toFixed(1) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.hint}</div>
        </div>
      ))}
      {position && (
        <div style={{
          flex: '1 1 140px', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Main role</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--parchment, #f5efe2)', marginTop: 6 }}>
            {POS_LABELS[position] || `Pos ${position}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>most-played</div>
        </div>
      )}
    </div>
  );
}

function DimensionCard({ dim, position }) {
  const below = dim.delta_pct < 0;
  const pct = Math.abs(dim.delta_pct);
  const posLabel = position ? (POS_LABELS[position]?.split(' · ')[0] || `Pos ${position}`) : 'peers';
  const target = dim.target;
  // "what good looks like" prefers the elite target; fall back to peer avg.
  const goodValue = target ? target.elite : dim.peer;
  const goodBasis = target ? 'elite' : 'peer avg';

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${below ? 'var(--accent-red, #ef4444)' : 'var(--accent-green, #22c55e)'}`,
      borderRadius: 10, padding: 14, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="section-title" style={{ margin: 0 }}>{dim.label}</h3>
        <span style={{ fontSize: 13, fontWeight: 700, color: below ? 'var(--accent-red, #ef4444)' : 'var(--accent-green, #22c55e)' }}>
          <span className="pb-num">{pct}%</span> {below ? 'below' : 'above'} {posLabel} peers
        </span>
      </div>

      <p style={{ margin: '8px 0 10px', fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
        You're averaging <strong className="pb-num">{fmtVal(dim.own, dim.format)}</strong>{' '}
        vs the bracket's <strong className="pb-num">{fmtVal(dim.peer, dim.format)}</strong>.{' '}
        {goodValue != null && (
          <>What good looks like: aim for{' '}
          <strong className="pb-num" style={{ color: 'var(--amber, #f59e0b)' }}>
            {fmtVal(goodValue, target?.format || dim.format)}
          </strong>{' '}
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({goodBasis})</span>.</>
        )}
      </p>

      {dim.examples && dim.examples.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
            Recent games where this was weakest
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dim.examples.map((ex) => (
              <li key={ex.match_id}>
                <Link
                  to={`/match/${ex.match_id}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--bg-hover, rgba(255,255,255,.04))',
                    border: '1px solid var(--border)', borderRadius: 8,
                    padding: '4px 8px', fontSize: 13, textDecoration: 'none', color: 'var(--text)',
                  }}
                >
                  <HeroIcon heroId={ex.hero_id} size="sm" />
                  <span style={{ color: 'var(--text-muted)' }}>{fmtDate(ex.date)}</span>
                  <span className="pb-num" style={{ fontWeight: 600 }}>{fmtVal(ex.value, ex.format)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PlayerGrowth() {
  const { accountId } = useParams();
  const { steamUser, loading: authLoading } = useSteamAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getPlayerPerfGrowth(accountId)
      .then((d) => { if (alive) setData(d); })
      .catch((err) => {
        if (!alive) return;
        setStatus(err.status || null);
        setError(err.message || 'Failed to load growth report');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId]);

  const isOwnProfile = !!(steamUser?.accountId && String(steamUser.accountId) === String(accountId));

  if (authLoading || loading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading your growth report…</div>;
  }

  // Logged-out / not-your-profile states.
  if (status === 401) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: 24, textAlign: 'center' }}>
        <h1 className="section-title">Growth Coach</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Sign in with Steam to see your PERF trend and personalised improvement plan.
        </p>
      </div>
    );
  }
  if (status === 403) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: 24, textAlign: 'center' }}>
        <h1 className="section-title">Growth Coach</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          The growth report is personal — you can only view your own.
        </p>
        <Link to={`/player/${accountId}`} style={{ color: 'var(--amber, #f59e0b)' }}>← Back to profile</Link>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: 24, textAlign: 'center' }}>
        <h1 className="section-title">Growth Coach</h1>
        <p style={{ color: 'var(--accent-red, #ef4444)' }}>{error}</p>
      </div>
    );
  }

  // Too-few-games empty state.
  if (data && data.enough === false) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px' }}>
        <div style={{ marginBottom: 12 }}>
          <Link to={`/player/${accountId}`} style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>← Back to profile</Link>
        </div>
        <h1 className="section-title">Growth Coach</h1>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 24, textAlign: 'center', marginTop: 12,
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">📈</div>
          <p style={{ color: 'var(--text)', fontSize: 15, margin: '0 0 6px' }}>
            Play a few more games to unlock your growth report.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            We need at least {data.min_games || 5} rated games to chart your PERF and spot
            where you can improve — you have {data.games}.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { perf, weakest_dimensions: dims = [], primary_position: position, games } = data;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px' }}>
      <div style={{ marginBottom: 12 }}>
        <Link to={`/player/${accountId}`} style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>← Back to profile</Link>
      </div>
      <h1 className="section-title" style={{ marginBottom: 4 }}>Growth Coach</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px' }}>
        Your PERF over time, where you trail your role's peers, and what to aim for next.
      </p>

      <PerfSummary perf={perf} games={games} position={position} />
      <PerfTrendChart perf={perf} />

      <div style={{ marginTop: 20 }}>
        <h2 className="section-title">Where to focus</h2>
        {dims.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16, color: 'var(--text-muted)', fontSize: 14,
          }}>
            No standout weaknesses against your role's peers right now — you're tracking at
            or above the bracket on the measured dimensions. Keep it up.
          </div>
        ) : (
          dims.map((d) => <DimensionCard key={d.stat} dim={d} position={position} />)
        )}
      </div>

      {isOwnProfile && (
        <div style={{ marginTop: 24 }}>
          <h2 className="section-title" style={{ marginBottom: 8 }}>Want a human eye on it?</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 12px' }}>
            A coach can turn these gaps into a session plan.
          </p>
          <CoachRecommendationsTile />
          <div style={{ marginTop: 8 }}>
            <Link
              to="/coaches"
              style={{
                display: 'inline-block', background: 'var(--amber, #f59e0b)', color: '#1a1205',
                fontWeight: 700, padding: '10px 18px', borderRadius: 8, textDecoration: 'none',
              }}
            >
              Book a coach →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
