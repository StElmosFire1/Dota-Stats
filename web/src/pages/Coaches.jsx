import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const BASE = '/api';

function formatPrice(cents, currency = 'aud') {
  if (cents == null) return '—';
  const v = (cents / 100).toFixed(0);
  return `$${v} ${String(currency).toUpperCase()}/hr`;
}

export default function Coaches() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [filters, setFilters] = useState({ language: '', role: '', hero: '', max_price_cents: '' });
  const [eligibility, setEligibility] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
      const res = await fetch(`${BASE}/coaches?${qs.toString()}`, { credentials: 'include' });
      if (res.status === 404) {
        setError('Coaching marketplace is not yet open.');
        setCoaches([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCoaches(data.coaches || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => {
    fetch(`${BASE}/coaching/eligibility/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setEligibility)
      .catch(() => {});
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <div style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}>
      <h1>Coaching Marketplace</h1>
      <p style={{ color: 'var(--text-muted)' }}>{error}</p>
    </div>;
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>🎓 Coaching Marketplace</h1>
        {eligibility?.signed_in && eligibility?.eligible && (
          <Link
            to={eligibility.has_coach_row ? '/coach/edit' : '/coach/onboarding'}
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
              padding: '8px 16px', borderRadius: 8, fontWeight: 700, textDecoration: 'none',
            }}>
            {eligibility.has_coach_row ? '⚙️ Manage Coach Profile' : '✨ Apply to coach'}
          </Link>
        )}
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
        Book a 1:1 session with a vetted coach (top-5 leaderboard or Immortal+ rank).
        Sessions run in your Discord voice — bring your own replay.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <input placeholder="Language (e.g. English)" value={filters.language}
          onChange={e => setFilters(f => ({ ...f, language: e.target.value }))}
          style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <input placeholder="Role (1–5)" value={filters.role}
          onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}
          style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: 100 }} />
        <input placeholder="Hero name" value={filters.hero}
          onChange={e => setFilters(f => ({ ...f, hero: e.target.value }))}
          style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <input placeholder="Max $/hr (cents)" value={filters.max_price_cents}
          onChange={e => setFilters(f => ({ ...f, max_price_cents: e.target.value.replace(/\D/g, '') }))}
          style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: 140 }} />
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}>
          Apply filters
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {!loading && coaches.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No coaches match these filters yet.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {coaches.map(c => (
          <Link key={c.id} to={`/coaches/${c.id}`}
            style={{
              display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16, textDecoration: 'none', color: 'inherit',
            }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{c.display_name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
              {c.taught_roles ? `Roles: ${c.taught_roles}` : 'Coach'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatPrice(c.hourly_rate_cents, c.currency)}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {c.avg_rating ? `★ ${c.avg_rating} (${c.review_count})` : 'No reviews yet'}
              </span>
            </div>
            {c.bio && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {c.bio}
            </div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
