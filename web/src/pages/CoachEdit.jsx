import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';

const BASE = '/api';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Task #344 — Renders the personalised savings + featured-placement lift
// numbers inside the Premium card. Falls back to "not enough history" copy
// when the coach hasn't taken enough bookings yet, and hides the aggregate
// line entirely until the premium cohort is large enough to be honest.
function PremiumLift({ lift }) {
  if (!lift) return null;
  const { is_premium, premium_bps, default_bps, current_bps, window_days, personal, aggregate } = lift;
  const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;
  const pct = (bps) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
  const savings = is_premium ? personal.actual_savings_cents : personal.projected_savings_cents;
  const verb = is_premium ? 'have saved' : 'would have saved';
  const compareBps = is_premium ? default_bps : current_bps;

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      {personal.enough_history && savings != null ? (
        <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          <strong style={{ color: 'var(--amber, #f59e0b)' }}>{fmt(savings)}</strong>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            — based on your last {window_days} days ({personal.booking_count} booking{personal.booking_count === 1 ? '' : 's'},
            {' '}{fmt(personal.gross_cents)} gross) you {verb} on platform fees at the Premium {pct(premium_bps)} rate vs your current {pct(compareBps)}.
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Your personalised savings figure will appear here once you've taken your first paid booking.
        </div>
      )}
      {aggregate.sufficient && aggregate.ratio != null && aggregate.ratio > 1.05 && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          Based on {aggregate.premium_cohort_n} Premium coach{aggregate.premium_cohort_n === 1 ? '' : 'es'}
          {' '}vs {aggregate.non_premium_cohort_n} non-Premium, featured placement delivered{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{aggregate.ratio.toFixed(1)}×</strong> the
          first-week profile views.
          {aggregate.premium_cohort_n < 3 && (
            <span style={{ marginLeft: 4, fontStyle: 'italic' }}>(early data)</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function CoachEdit() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [coach, setCoach] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [rating, setRating] = useState(null);
  const [kyc, setKyc] = useState(null);
  const [premium, setPremium] = useState(null);
  const [lift, setLift] = useState(null);
  const [msg, setMsg] = useState('');
  // Task #410 — review-snippet consent toggle. Mirrors `coaches.review_consent_quotes`;
  // synced from the loaded coach row, written back on Save profile.
  const [consentQuotes, setConsentQuotes] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${BASE}/coach/me`, { credentials: 'include' });
      if (r.status === 404) { setError('You don\'t have a coach profile yet. Apply to coach first.'); setLoading(false); return; }
      if (r.status === 401) { setError('Sign in with Steam first.'); setLoading(false); return; }
      const d = await r.json();
      setCoach(d.coach); setAvailability(d.availability || []);
      setBookings(d.bookings || []); setRating(d.rating);
      setConsentQuotes(!!d.coach?.review_consent_quotes);
      const k = await fetch(`${BASE}/coach/onboarding-status`, { credentials: 'include' });
      if (k.ok) setKyc(await k.json());
      const ps = await fetch(`${BASE}/coach/premium/status`, { credentials: 'include' });
      if (ps.ok) setPremium((await ps.json()).subscription);
      const lf = await fetch(`${BASE}/coach/premium/lift`, { credentials: 'include' });
      if (lf.ok) setLift(await lf.json());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const startPremium = async () => {
    setMsg('');
    try {
      const r = await fetch(`${BASE}/coach/premium/checkout`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
      else setMsg(`Error: ${d.error || 'Could not start checkout'}`);
    } catch (e) { setMsg(`Error: ${e.message}`); }
  };

  const cancelPremium = async () => {
    setMsg('');
    const r = await fetch(`${BASE}/coach/premium/cancel`, { method: 'POST', credentials: 'include' });
    const d = await r.json();
    if (r.ok) { setPremium(d.subscription); setMsg('Premium will cancel at period end.'); }
    else setMsg(`Error: ${d.error}`);
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const f = new FormData(e.target);
      const patch = Object.fromEntries(f.entries());
      patch.hourly_rate_cents = parseInt(patch.hourly_rate_dollars || '0') * 100;
      delete patch.hourly_rate_dollars;
      // Task #410 — the form holds the consent toggle as state, not as a
      // form field, so plumb the current value in explicitly. Default to
      // false if the field is missing so we never accidentally re-enable
      // it after the row was opted out elsewhere.
      patch.review_consent_quotes = !!consentQuotes;
      const r = await fetch(`${BASE}/coach/me`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setCoach(d.coach);
      setMsg('Saved.');
    } catch (err) { setMsg(`Error: ${err.message}`); }
  };

  const saveAvail = async () => {
    setMsg('');
    try {
      const r = await fetch(`${BASE}/coach/me/availability`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: availability }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setAvailability(d.availability || []);
      setMsg('Availability saved.');
    } catch (err) { setMsg(`Error: ${err.message}`); }
  };

  const addSlot = () => setAvailability(a => [...a, { day_of_week: 1, start_time: '19:00', end_time: '21:00', timezone: 'Australia/Sydney' }]);
  const updSlot = (i, k, v) => setAvailability(a => a.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const rmSlot = (i) => setAvailability(a => a.filter((_, idx) => idx !== i));

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) return <div style={{ padding: 24 }}>
    <h1>Coach editor</h1>
    <p style={{ color: 'var(--text-muted)' }}>{error}</p>
    <Link to="/coach/onboarding" style={{ color: 'var(--accent)' }}>→ Apply to coach</Link>
  </div>;

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
      <h1>Coach editor</h1>

      {kyc && (() => {
        // Backend gates 'active' on BOTH charges_enabled AND payouts_enabled
        // (we use manual capture so funds sit in escrow — there's no point
        // accepting a booking we can't pay out). Mirror that here so we
        // don't tell a coach they're "Active" while bookings are still
        // failing on the validateBookingSlot status check.
        const fullyActive = kyc.charges_enabled && kyc.payouts_enabled;
        let statusLabel;
        if (fullyActive) statusLabel = 'Active — accepting bookings';
        else if (kyc.charges_enabled && !kyc.payouts_enabled) statusLabel = 'Almost there — Stripe needs your payout details (bank account) before you can accept bookings.';
        else statusLabel = `Pending (${kyc.requirements_due?.length || 0} requirements due)`;
        return (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
            <strong>KYC status:</strong>{' '}
            <span style={{ color: fullyActive ? 'var(--radiant-color)' : '#fbbf24' }}>
              {statusLabel}
            </span>
            {!fullyActive && (
              <button
                onClick={async () => {
                  const r = await fetch(`${BASE}/coach/onboard`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                  const d = await r.json();
                  if (d.url) window.location.href = d.url;
                  else setMsg(`Error: ${d.error}`);
                }}
                style={{ marginLeft: 12, padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}>
                Continue Stripe setup
              </button>
            )}
          </div>
        );
      })()}

      {/* Task #320 — Coach Premium subscription card */}
      <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(197,169,117,0.05))', border: '1px solid var(--brass, #c5a975)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, color: 'var(--amber, #f59e0b)' }}>⭐ Coach Premium</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
          Featured placement in the coach directory, priority support, and a reduced platform fee (7% vs the site default).
        </p>
        {premium && (premium.status === 'active' || premium.status === 'trialing') ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--radiant-color)', fontWeight: 600 }}>Active</span>
            {premium.current_period_end && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Renews {new Date(premium.current_period_end).toLocaleDateString()}
              </span>
            )}
            {!premium.cancel_at_period_end && (
              <button type="button" onClick={cancelPremium} aria-label="Cancel Coach Premium subscription"
                style={{ padding: '5px 12px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
                Cancel at period end
              </button>
            )}
            {premium.cancel_at_period_end && (
              <span style={{ fontSize: 12, color: '#fbbf24' }}>Cancels at period end</span>
            )}
          </div>
        ) : (
          <button type="button" onClick={startPremium} aria-label="Subscribe to Coach Premium"
            style={{ padding: '8px 18px', borderRadius: 6, background: 'var(--amber, #f59e0b)', color: '#1a1a1a', border: 0, cursor: 'pointer', fontWeight: 700 }}>
            Subscribe — $9.99/mo
          </button>
        )}
        {lift && <PremiumLift lift={lift} />}
      </div>

      <form onSubmit={save} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Profile</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>Hourly rate (AUD): <input type="number" name="hourly_rate_dollars" min={10} max={500} step={1}
            defaultValue={Math.round((coach.hourly_rate_cents || 5000) / 100)} required
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 100 }} /></label>
          <label>Bio:<br/>
            <textarea name="bio" defaultValue={coach.bio || ''} rows={5}
              placeholder="Tell students why they should book you (peak rank, teams, coaching style, etc.)"
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} /></label>
          <label>Languages: <input name="languages" defaultValue={coach.languages || ''} placeholder="English, Mandarin"
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
          <label>Roles taught: <input name="taught_roles" defaultValue={coach.taught_roles || ''} placeholder="1, 2, 3"
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
          <label>Heroes specialised: <input name="taught_heroes" defaultValue={coach.taught_heroes || ''} placeholder="Invoker, Pudge"
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
          <label>Intro video URL: <input name="intro_video_url" defaultValue={coach.intro_video_url || ''} placeholder="https://youtube.com/..."
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
          <label>Sample replays: <input name="sample_replays" defaultValue={coach.sample_replays || ''}
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>

          {/* Task #410 — Marketplace consent toggle. Off by default; when on,
              up to 3 anonymised annotation snippets from delivered VOD reviews
              are surfaced on the public /coaches card + detail page. */}
          <div style={{ marginTop: 4, padding: 12, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <button
              type="button"
              role="switch"
              aria-checked={consentQuotes}
              aria-label="Allow anonymised sample annotations from delivered VOD reviews to appear on your public coach profile"
              onClick={() => setConsentQuotes(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: 0, background: 'transparent', border: 0, cursor: 'pointer',
                color: 'var(--text-primary)', textAlign: 'left',
              }}>
              <span aria-hidden="true" style={{
                width: 36, height: 20, borderRadius: 999, position: 'relative', flexShrink: 0,
                background: consentQuotes ? '#22c55e' : 'var(--border)',
                transition: 'background 120ms ease',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: consentQuotes ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 120ms ease',
                }} />
              </span>
              <span>
                <strong>Share anonymised review snippets</strong>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  When on, up to 3 short annotation excerpts from your delivered VOD reviews appear on your public marketplace card. Student names are never shown.
                </div>
              </span>
            </button>
          </div>
        </div>
        <button type="submit" style={{ marginTop: 12, padding: '8px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 }}>Save profile</button>
      </form>

      {/* Task #413 — Coaching v3: recurring student plans editor. */}
      <CoachPlansPanel />

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Weekly availability</h3>
        {availability.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={s.day_of_week} onChange={e => updSlot(i, 'day_of_week', parseInt(e.target.value))}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
            </select>
            <input type="time" value={s.start_time} onChange={e => updSlot(i, 'start_time', e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <span>–</span>
            <input type="time" value={s.end_time} onChange={e => updSlot(i, 'end_time', e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <input value={s.timezone} onChange={e => updSlot(i, 'timezone', e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 180 }} />
            <button type="button" onClick={() => rmSlot(i)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--dire-color)', cursor: 'pointer' }}>Remove</button>
          </div>
        ))}
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={addSlot} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', marginRight: 8 }}>+ Add slot</button>
          <button type="button" onClick={saveAvail} style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}>Save availability</button>
        </div>
      </div>

      {msg && <p style={{ color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>{msg}</p>}

      <h3>Recent bookings</h3>
      {bookings.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No bookings yet.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}><th align="left">Student</th><th align="left">When</th><th align="left">Status</th><th align="right">Earning</th><th></th></tr></thead>
          <tbody>{bookings.map(b => (
            <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 6 }}>{b.student_name}</td>
              <td style={{ padding: 6 }}>{new Date(b.slot_start_at).toLocaleString()}</td>
              <td style={{ padding: 6 }}>{b.status}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>${((b.amount_cents - b.platform_fee_cents) / 100).toFixed(2)}</td>
              <td style={{ padding: 6 }}>
                {b.status === 'paid' && !b.coach_confirmed_at && (
                  <button onClick={async () => {
                    const r = await fetch(`${BASE}/bookings/${b.id}/confirm-completion`, { method: 'POST', credentials: 'include' });
                    if (r.ok) load();
                  }} style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--radiant-color)', color: '#fff', border: 0, cursor: 'pointer' }}>Confirm done</button>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {rating && (
        <p style={{ marginTop: 20, color: 'var(--text-muted)' }}>
          Average rating: {rating.avg_rating ? `★ ${rating.avg_rating} (${rating.review_count})` : 'No ratings yet'}
        </p>
      )}
    </div>
  );
}

// Task #413 — coach plan editor. Coaches create draft plans (price + quotas),
// publish them (creates a Stripe Product+Price under the hood), and see a
// roster of current subscribers. Plans cannot be hard-deleted once they have
// subscribers — only archived (hides from public, doesn't cancel actives).
function CoachPlansPanel() {
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', price_dollars: 49,
    quota_sessions: 2, quota_group_seats: 0, quota_vod_reviews: 1,
  });

  const reload = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api.listMyCoachPlans().catch(() => ({ plans: [] })),
        api.listMyCoachPlanSubscribers().catch(() => ({ subscribers: [] })),
      ]);
      setPlans(p.plans || []);
      setSubs(s.subscribers || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        price_cents: Math.round(parseFloat(form.price_dollars || 0) * 100),
        quota_sessions: parseInt(form.quota_sessions, 10) || 0,
        quota_group_seats: parseInt(form.quota_group_seats, 10) || 0,
        quota_vod_reviews: parseInt(form.quota_vod_reviews, 10) || 0,
      };
      await api.createCoachPlan(payload);
      setForm({ name: '', description: '', price_dollars: 49, quota_sessions: 2, quota_group_seats: 0, quota_vod_reviews: 1 });
      await reload();
      setMsg('Draft plan created — click Publish to make it available to students.');
    } catch (err) { setMsg(`Error: ${err.message}`); }
  };

  const publish = async (id) => {
    setMsg('');
    try { await api.publishCoachPlan(id); await reload(); setMsg('Plan published.'); }
    catch (err) { setMsg(`Error: ${err.message}`); }
  };
  const archive = async (id) => {
    setMsg('');
    try { await api.updateCoachPlan(id, { status: 'archived' }); await reload(); }
    catch (err) { setMsg(`Error: ${err.message}`); }
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--brass, #c5a975)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, color: 'var(--brass, #c5a975)' }}>📦 Recurring student plans</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
        Sell a monthly bundle to repeat students. Each subscription gives the student a quota of 1:1 sessions, group-session seats, and VOD reviews per billing cycle. Stripe Billing handles renewals automatically.
      </p>

      {loading ? <div>Loading…</div> : (
        <>
          {plans.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>You haven't created any plans yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th align="left">Plan</th><th align="left">Price</th><th align="left">Quota / mo</th>
                <th align="left">Status</th><th></th>
              </tr></thead>
              <tbody>{plans.map(pl => (
                <tr key={pl.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}><strong>{pl.name}</strong>{pl.description ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pl.description}</div> : null}</td>
                  <td style={{ padding: 6 }}>${(pl.price_cents / 100).toFixed(2)} {String(pl.currency).toUpperCase()}/mo</td>
                  <td style={{ padding: 6 }}>
                    {pl.quota_sessions > 0 && <div>{pl.quota_sessions} × 1:1</div>}
                    {pl.quota_group_seats > 0 && <div>{pl.quota_group_seats} × group seat</div>}
                    {pl.quota_vod_reviews > 0 && <div>{pl.quota_vod_reviews} × VOD review</div>}
                  </td>
                  <td style={{ padding: 6 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontWeight: 600, fontSize: 11,
                      background: pl.status === 'active' ? 'rgba(34,197,94,0.15)' : pl.status === 'archived' ? 'rgba(120,120,120,0.15)' : 'rgba(245,158,11,0.15)',
                      color: pl.status === 'active' ? 'var(--radiant-color)' : pl.status === 'archived' ? 'var(--text-muted)' : 'var(--amber)',
                    }}>{pl.status}</span>
                  </td>
                  <td style={{ padding: 6, textAlign: 'right' }}>
                    {pl.status === 'draft' && (
                      <button type="button" onClick={() => publish(pl.id)} aria-label={`Publish plan ${pl.name}`}
                        style={{ padding: '4px 10px', borderRadius: 6, border: 0, background: 'var(--accent)', color: '#fff', cursor: 'pointer', marginRight: 6 }}>Publish</button>
                    )}
                    {pl.status !== 'archived' && (
                      <button type="button" onClick={() => archive(pl.id)} aria-label={`Archive plan ${pl.name}`}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Archive</button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}

          {subs.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <strong style={{ fontSize: 13 }}>Active subscribers ({subs.length})</strong>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                {subs.slice(0, 8).map(s => (
                  <div key={s.id}>
                    {s.student_name} — {s.plan_name} ({s.used_sessions}/{s.quota_sessions} 1:1, {s.used_group_seats}/{s.quota_group_seats} group, {s.used_vod_reviews}/{s.quota_vod_reviews} VOD) — {s.status}
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={create} style={{ marginTop: 14, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <strong style={{ fontSize: 13 }}>New plan</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12 }}>Name<input required maxLength={120} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} /></label>
              <label style={{ fontSize: 12 }}>Price (AUD/mo)<input required type="number" min={5} max={2000} step={1}
                value={form.price_dollars} onChange={e => setForm(f => ({ ...f, price_dollars: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} /></label>
              <label style={{ fontSize: 12 }}>1:1 sessions / mo<input type="number" min={0} max={50}
                value={form.quota_sessions} onChange={e => setForm(f => ({ ...f, quota_sessions: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} /></label>
              <label style={{ fontSize: 12 }}>Group seats / mo<input type="number" min={0} max={50}
                value={form.quota_group_seats} onChange={e => setForm(f => ({ ...f, quota_group_seats: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} /></label>
              <label style={{ fontSize: 12 }}>VOD reviews / mo<input type="number" min={0} max={50}
                value={form.quota_vod_reviews} onChange={e => setForm(f => ({ ...f, quota_vod_reviews: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} /></label>
            </div>
            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>Description (optional)
              <textarea rows={2} maxLength={1000} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            </label>
            <button type="submit" style={{ marginTop: 8, padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 }}>Create draft plan</button>
          </form>
          {msg && <p style={{ color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)', marginTop: 8, fontSize: 13 }} role="status">{msg}</p>}
        </>
      )}
    </div>
  );
}
