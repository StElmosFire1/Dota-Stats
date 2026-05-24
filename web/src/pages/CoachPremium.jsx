import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const BASE = '/api';

// Task #335 — public pitch page for Coach Premium. Explains the perks
// (featured placement, 7% commission, priority support) and routes the
// signed-in eligible coach into the existing checkout. Anyone not signed
// in / not yet a coach is funnelled to /coach/onboarding first.
export default function CoachPremium() {
  const navigate = useNavigate();
  const [eligibility, setEligibility] = useState(null);
  const [premium, setPremium] = useState(null);
  const [lift, setLift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const e = await fetch(`${BASE}/coaching/eligibility/me`, { credentials: 'include' });
        if (e.ok) setEligibility(await e.json());
        const p = await fetch(`${BASE}/coach/premium/status`, { credentials: 'include' });
        if (p.ok) setPremium((await p.json()).subscription);
        // Task #344 — only meaningful for signed-in coaches; route 401/404s
        // for anyone else and we just skip.
        const lf = await fetch(`${BASE}/coach/premium/lift`, { credentials: 'include' });
        if (lf.ok) setLift(await lf.json());
      } catch (_) { /* public page — fail soft */ }
      setLoading(false);
    })();
  }, []);

  const startCheckout = async () => {
    setMsg('');
    if (!eligibility?.signed_in) { navigate('/coach/onboarding'); return; }
    if (!eligibility?.has_coach_row) { navigate('/coach/onboarding'); return; }
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

  const isActive = premium && (premium.status === 'active' || premium.status === 'trialing');

  const perks = [
    {
      icon: '⭐',
      title: 'Featured placement',
      body: 'Your profile is pinned to the top of the /coaches directory above non-premium coaches, with a brass Premium badge on every card. New students see you first.',
    },
    {
      icon: '💰',
      title: '7% commission (vs site default)',
      body: 'Standard platform fee is 10%. Premium drops it to 7% on every booking — at the $50/hr default rate that\'s an extra $1.50 in your pocket per session, recouping the subscription in under a week of regular bookings.',
    },
    {
      icon: '⚡',
      title: 'Priority support',
      body: 'Dispute resolution, no-show refunds, and Stripe payout questions go to the front of the operator queue. Direct Discord ping when there\'s a booking-blocking issue.',
    },
  ];

  return (
    <div style={{ maxWidth: 880, margin: '24px auto', padding: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <Link to="/coaches" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13 }}>← Back to coaches</Link>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(197,169,117,0.06))',
        border: '1px solid var(--brass, #c5a975)', borderRadius: 12, padding: 28, marginBottom: 24,
      }}>
        <div style={{
          display: 'inline-block', fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
          padding: '3px 10px', borderRadius: 999,
          background: 'linear-gradient(135deg, #fbbf24, #c5a975)', color: '#0d1424',
          textTransform: 'uppercase', marginBottom: 12,
        }}>★ Coach Premium</div>
        <h1 style={{ margin: '0 0 10px', fontSize: 32 }}>Stand out. Earn more. Book faster.</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 16, margin: '0 0 18px', lineHeight: 1.5 }}>
          A monthly subscription for coaches who want top placement on the marketplace,
          a lower platform fee, and direct support from the operator team.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {loading ? (
            <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
          ) : isActive ? (
            <>
              <span style={{ color: 'var(--radiant-color)', fontWeight: 700 }}>✓ You're already Premium</span>
              <Link to="/coach/edit" style={{
                padding: '10px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff',
                textDecoration: 'none', fontWeight: 700,
              }}>Manage in coach editor →</Link>
            </>
          ) : (
            <>
              <button type="button" onClick={startCheckout} aria-label="Subscribe to Coach Premium"
                style={{
                  padding: '12px 28px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0d1424',
                  border: 0, cursor: 'pointer', fontWeight: 800, fontSize: 16,
                }}>
                Subscribe — $9.99/mo
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cancel any time · Billed monthly via Stripe</span>
            </>
          )}
        </div>
        {msg && <p style={{ color: 'var(--dire-color)', marginTop: 12 }}>{msg}</p>}
        {/* Task #344 — aggregate "Nx more first-week profile views" badge.
            Public, hidden until the premium cohort is large enough to be
            honest. */}
        {lift?.aggregate?.sufficient && lift.aggregate.ratio != null && lift.aggregate.ratio > 1.05 && (
          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--amber, #f59e0b)' }}>{lift.aggregate.ratio.toFixed(1)}× more first-week profile views</strong>
            {' '}than non-Premium coaches, averaged across {lift.aggregate.premium_cohort_n} current Premium coaches.
          </div>
        )}
        {/* Task #344 — personal savings line for signed-in coaches, with an
            explicit insufficient-history fallback so a signed-in coach with
            no bookings yet sees the same hint they get on the editor card
            rather than a silent gap. */}
        {lift?.personal && (
          lift.personal.enough_history ? (
            (() => {
              const s = lift.is_premium ? lift.personal.actual_savings_cents : lift.personal.projected_savings_cents;
              if (s == null) return null;
              const verb = lift.is_premium ? 'have saved' : 'would have saved';
              return (
                <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-primary)' }}>
                  Based on your last {lift.window_days} days you {verb}{' '}
                  <strong style={{ color: 'var(--amber, #f59e0b)' }}>${(s / 100).toFixed(2)}</strong>{' '}
                  in platform fees at the Premium 7% rate.
                </div>
              );
            })()
          ) : (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
              Your personalised savings figure will appear here once you've taken your first paid booking.
            </div>
          )
        )}
        {!loading && eligibility?.signed_in && !eligibility?.has_coach_row && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
            You'll need to finish coach onboarding (Stripe Connect KYC) before you can subscribe.
            <Link to="/coach/onboarding" style={{ color: 'var(--accent)', marginLeft: 6 }}>Apply to coach →</Link>
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 28 }}>
        {perks.map(p => (
          <div key={p.title} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 18,
          }}>
            <div style={{ fontSize: 26, marginBottom: 8 }} aria-hidden="true">{p.icon}</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{p.title}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{p.body}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>How the maths works</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
          On a $50/hr session, standard 10% commission means $5 to the platform, $45 to you.
          With Coach Premium that drops to 7% — $3.50 to the platform, $46.50 to you.
          At seven sessions a month the fee savings have already covered the $9.99 subscription;
          every booking after that is pure upside.
        </p>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
          The commission tier is applied automatically on every booking — no invoice fiddling, no
          settings to flip. The Stripe webhook flips your tier the moment your subscription goes active.
        </p>
      </div>

      <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-primary)' }}>FAQ.</strong>{' '}
        Premium is a monthly Stripe subscription you can cancel at any time from the coach editor —
        cancellation takes effect at the end of the current period, so you keep the perks you've already paid for.
        Featured ordering applies as soon as the subscription is active and is removed the moment it lapses.
      </div>
    </div>
  );
}
