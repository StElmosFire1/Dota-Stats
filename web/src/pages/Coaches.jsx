import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatHeroName } from '../utils/heroes';

const BASE = '/api';

// Task #410 — Coaching marketplace discovery upgrade.
// Layout: filter sidebar (position 1–5, language, price range, min rating,
// available-this-week) + Coach-of-the-month spotlight tile + grid of cards
// with Instant Booking badge and consent-gated annotation snippets.

const SORT_OPTIONS = [
  { value: 'relevance',      label: 'Relevance' },
  { value: 'price_asc',      label: 'Price: low → high' },
  { value: 'price_desc',     label: 'Price: high → low' },
  { value: 'rating',         label: 'Top rated' },
  { value: 'next_available', label: 'Next available' },
  { value: 'most_booked',    label: 'Most booked' },
];

const POSITIONS = [
  { value: '1', label: 'Pos 1 — Carry' },
  { value: '2', label: 'Pos 2 — Mid' },
  { value: '3', label: 'Pos 3 — Offlane' },
  { value: '4', label: 'Pos 4 — Soft Support' },
  { value: '5', label: 'Pos 5 — Hard Support' },
];

function formatPrice(cents, currency = 'aud') {
  if (cents == null) return '—';
  const v = (cents / 100).toFixed(0);
  return `$${v} ${String(currency).toUpperCase()}/hr`;
}

function formatNextAvailable(iso) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  const diffMs = ts - Date.now();
  if (diffMs <= 0) return 'Available now';
  const hours = Math.round(diffMs / 3600_000);
  if (hours < 1) return 'Within the hour';
  if (hours < 48) return `In ${hours}h`;
  const days = Math.round(hours / 24);
  return `In ${days}d`;
}

function InstantBadge() {
  return (
    <span
      aria-label="Instant booking available — coach has openings in the next 48 hours"
      style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 0.7,
        padding: '2px 7px', borderRadius: 999,
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        color: '#0d1424', textTransform: 'uppercase',
      }}>⚡ Instant</span>
  );
}

function PremiumBadge() {
  return (
    <span aria-label="Coach Premium subscriber"
      style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 0.7,
        padding: '2px 7px', borderRadius: 999,
        background: 'linear-gradient(135deg, #fbbf24, #c5a975)',
        color: '#0d1424', textTransform: 'uppercase',
      }}>★ Premium</span>
  );
}

function CoachCard({ c }) {
  const nextLabel = formatNextAvailable(c.next_available_at);
  return (
    <Link to={`/coaches/${c.id}`}
      style={{
        display: 'block', background: 'var(--bg-card)',
        border: c.is_premium ? '1px solid var(--brass, #c5a975)' : '1px solid var(--border)',
        borderRadius: 10, padding: 16, textDecoration: 'none', color: 'inherit',
        boxShadow: c.is_premium ? '0 0 0 1px rgba(245,158,11,0.18) inset' : 'none',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{c.display_name}</span>
        {c.is_premium && <PremiumBadge />}
        {c.instant_booking && <InstantBadge />}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
        {c.taught_roles ? `Roles: ${c.taught_roles}` : 'Coach'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatPrice(c.hourly_rate_cents, c.currency)}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {c.avg_rating ? `★ ${c.avg_rating} (${c.review_count})` : 'No reviews yet'}
        </span>
      </div>
      {(c.mmr || c.games_played > 0 || c.top_hero_id) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {c.mmr && <span><strong style={{ color: 'var(--text-primary)' }}>{c.mmr}</strong> MMR</span>}
          {c.games_played > 0 && (
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>{c.wins}W-{c.losses}L</strong>
              {' · '}{Math.round((c.wins / Math.max(1, c.games_played)) * 100)}%
            </span>
          )}
          {c.delivered_bookings_count > 0 && (
            <span><strong style={{ color: 'var(--text-primary)' }}>{c.delivered_bookings_count}</strong> booking{c.delivered_bookings_count === 1 ? '' : 's'}</span>
          )}
        </div>
      )}
      {(c.languages || nextLabel) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {c.languages && (
            <span>🌐 <strong style={{ color: 'var(--text-primary)' }}>{c.languages}</strong></span>
          )}
          {nextLabel && (
            <span>📅 Next: <strong style={{ color: 'var(--text-primary)' }}>{nextLabel}</strong></span>
          )}
        </div>
      )}
      {c.bio && (
        <div style={{
          color: 'var(--text-muted)', fontSize: 12, marginTop: 8, lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{c.bio}</div>
      )}
      {/* Task #410 — consent-gated annotation snippets. Server only sends
          `snippets` when the coach has ticked the consent toggle in /coach/edit;
          empty/missing array means no public preview. */}
      {Array.isArray(c.snippets) && c.snippets.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                        color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Sample annotation{c.snippets.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {c.snippets.slice(0, 3).map((s, i) => (
              <blockquote key={i}
                style={{ margin: 0, fontStyle: 'italic', fontSize: 12,
                         color: 'var(--text-primary)', lineHeight: 1.45 }}>
                “{s.text}”
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </Link>
  );
}

function SpotlightTile({ coach }) {
  if (!coach) return null;
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(197,169,117,0.06))',
      border: '1px solid var(--brass, #c5a975)', borderRadius: 12, padding: 20, marginBottom: 20,
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center',
    }}>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: 'var(--amber, #f59e0b)',
          textTransform: 'uppercase', marginBottom: 6,
        }}>
          🏆 Coach of the Month
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{coach.display_name}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
          {coach.taught_roles ? `Roles ${coach.taught_roles}` : 'Coach'}
          {coach.avg_rating ? ` · ★ ${coach.avg_rating} (${coach.review_count})` : ''}
          {coach.monthly_bookings ? ` · ${coach.monthly_bookings} session${coach.monthly_bookings === 1 ? '' : 's'} this month` : ''}
        </div>
        {coach.bio && (
          <div style={{
            color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            maxWidth: 600,
          }}>{coach.bio}</div>
        )}
      </div>
      <Link to={`/coaches/${coach.id}`}
        aria-label={`View Coach of the Month profile: ${coach.display_name}`}
        style={{
          background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
          padding: '10px 18px', borderRadius: 8, fontWeight: 700, textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}>View profile →</Link>
    </div>
  );
}

export default function Coaches() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [coachOfMonth, setCoachOfMonth] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [filters, setFilters] = useState({
    language: '',
    role: '',
    hero: '',
    min_price_cents: '',
    max_price_cents: '',
    min_rating: '',
    available_this_week: false,
  });
  const [sort, setSort] = useState('relevance');
  const [heroOptions, setHeroOptions] = useState([]);

  const qs = useMemo(() => {
    const u = new URLSearchParams();
    if (filters.language) u.set('language', filters.language);
    if (filters.role) u.set('role', filters.role);
    if (filters.hero) u.set('hero', filters.hero);
    if (filters.min_price_cents) u.set('min_price_cents', filters.min_price_cents);
    if (filters.max_price_cents) u.set('max_price_cents', filters.max_price_cents);
    if (filters.min_rating) u.set('min_rating', filters.min_rating);
    if (filters.available_this_week) u.set('available_this_week', '1');
    if (sort && sort !== 'relevance') u.set('sort', sort);
    return u.toString();
  }, [filters, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${BASE}/coaches?${qs}`, { credentials: 'include' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) { setError('Coaching marketplace is not yet open.'); setCoaches([]); setCoachOfMonth(null); setLoading(false); return; }
        const data = await res.json();
        if (cancelled) return;
        setCoaches(data.coaches || []);
        setCoachOfMonth(data.coach_of_the_month || null);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [qs]);

  useEffect(() => {
    fetch(`${BASE}/coaching/eligibility/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setEligibility)
      .catch(() => {});
  }, []);

  // Task #436 — hero typeahead options. Pulls the hero list already shipped
  // by /api/heroes and maps internal hero_name → display name so the input's
  // <datalist> can offer "Invoker", "Pudge", etc. taught_heroes on the coach
  // row is free-text, so we ILIKE-match the display name and let students
  // also type custom strings.
  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/heroes`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        if (cancelled || !Array.isArray(rows)) return;
        const names = Array.from(new Set(
          rows.map(h => formatHeroName(h.hero_name)).filter(n => n && n !== '—')
        )).sort((a, b) => a.localeCompare(b));
        setHeroOptions(names);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const resetFilters = () => {
    setFilters({ language: '', role: '', hero: '', min_price_cents: '', max_price_cents: '', min_rating: '', available_this_week: false });
    setSort('relevance');
  };

  if (error) {
    return <div style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}>
      <h1>Coaching Marketplace</h1>
      <p style={{ color: 'var(--text-muted)' }}>{error}</p>
    </div>;
  }

  const fieldStyle = {
    padding: 8, borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%',
  };

  return (
    <div style={{ maxWidth: 1200, margin: '24px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          🎓 Coaching Marketplace
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
            padding: '3px 8px', borderRadius: 999,
            background: 'linear-gradient(135deg, #f59e0b, #c5a975)',
            color: '#0d1424', textTransform: 'uppercase',
          }}>Beta</span>
        </h1>
        {eligibility?.signed_in && eligibility?.eligible ? (
          <Link to={eligibility.has_coach_row ? '/coach/edit' : '/coach/onboarding'}
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
              padding: '8px 16px', borderRadius: 8, fontWeight: 700, textDecoration: 'none',
            }}>
            {eligibility.has_coach_row ? '⚙️ Manage Coach Profile' : '✨ Apply to coach'}
          </Link>
        ) : (
          <Link to="/coach/onboarding"
            style={{
              background: 'transparent', color: 'var(--accent)',
              padding: '8px 14px', borderRadius: 8, fontWeight: 700, textDecoration: 'none',
              border: '1px solid var(--accent)',
            }}>How do I become a coach? →</Link>
        )}
      </div>

      <SpotlightTile coach={coachOfMonth} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 240px) 1fr', gap: 20, alignItems: 'start' }}>
        {/* ---------- Filter sidebar ---------- */}
        <aside aria-label="Coach filters" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 16, position: 'sticky', top: 16,
        }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Filters
          </h3>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cm-pos" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Position</label>
            <select id="cm-pos" value={filters.role}
              onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}
              style={fieldStyle}>
              <option value="">Any position</option>
              {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cm-lang" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Language</label>
            <input id="cm-lang" placeholder="e.g. English"
              value={filters.language}
              onChange={e => setFilters(f => ({ ...f, language: e.target.value }))}
              style={fieldStyle} />
          </div>

          {/* Task #436 — hero specialty filter. Free-text input backed by a
              <datalist> typeahead of every hero shipped via /api/heroes, so
              students can pick "Invoker" without knowing the API also accepts
              arbitrary substrings (matched server-side via ILIKE against the
              coach's taught_heroes free-text field). */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cm-hero" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Hero specialty</label>
            <input id="cm-hero" placeholder="e.g. Invoker"
              list="cm-hero-options"
              value={filters.hero}
              onChange={e => setFilters(f => ({ ...f, hero: e.target.value }))}
              autoComplete="off"
              style={fieldStyle} />
            <datalist id="cm-hero-options">
              {heroOptions.map(name => <option key={name} value={name} />)}
            </datalist>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Price range (AUD/hr)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 6, alignItems: 'center' }}>
              <input id="cm-min-price" type="number" min={0} step={5}
                aria-label="Minimum price per hour in AUD"
                placeholder="Min"
                value={filters.min_price_cents ? Math.round(parseInt(filters.min_price_cents) / 100) : ''}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '');
                  setFilters(f => ({ ...f, min_price_cents: v ? String(parseInt(v) * 100) : '' }));
                }}
                style={fieldStyle} />
              <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>–</span>
              <input id="cm-max-price" type="number" min={0} step={5}
                aria-label="Maximum price per hour in AUD"
                placeholder="Max"
                value={filters.max_price_cents ? Math.round(parseInt(filters.max_price_cents) / 100) : ''}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '');
                  setFilters(f => ({ ...f, max_price_cents: v ? String(parseInt(v) * 100) : '' }));
                }}
                style={fieldStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cm-rating" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Minimum rating</label>
            <select id="cm-rating" value={filters.min_rating}
              onChange={e => setFilters(f => ({ ...f, min_rating: e.target.value }))}
              style={fieldStyle}>
              <option value="">Any rating</option>
              <option value="3">★ 3+</option>
              <option value="4">★ 4+</option>
              <option value="4.5">★ 4.5+</option>
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <button
              type="button"
              role="switch"
              aria-checked={filters.available_this_week}
              aria-label="Show only coaches available this week"
              onClick={() => setFilters(f => ({ ...f, available_this_week: !f.available_this_week }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: 8, borderRadius: 6, cursor: 'pointer',
                background: filters.available_this_week ? 'rgba(34,197,94,0.12)' : 'var(--bg-secondary)',
                border: '1px solid ' + (filters.available_this_week ? 'rgba(34,197,94,0.5)' : 'var(--border)'),
                color: 'var(--text-primary)', textAlign: 'left',
              }}>
              <span aria-hidden="true" style={{
                width: 32, height: 18, borderRadius: 999, position: 'relative',
                background: filters.available_this_week ? '#22c55e' : 'var(--border)',
                transition: 'background 120ms ease',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: filters.available_this_week ? 16 : 2,
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  transition: 'left 120ms ease',
                }} />
              </span>
              <span style={{ fontSize: 13 }}>Available this week</span>
            </button>
          </div>

          <button type="button" onClick={resetFilters}
            aria-label="Reset all filters"
            style={{
              width: '100%', padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
            }}>Reset filters</button>
        </aside>

        {/* ---------- Results column ---------- */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {loading ? 'Loading…' : `${coaches.length} coach${coaches.length === 1 ? '' : 'es'}`}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              Sort by
              <select aria-label="Sort coaches" value={sort} onChange={e => setSort(e.target.value)}
                style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)',
                         background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {!loading && coaches.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>No coaches match these filters yet.</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {coaches.map(c => <CoachCard key={c.id} c={c} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
