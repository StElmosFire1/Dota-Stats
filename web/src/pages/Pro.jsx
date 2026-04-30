import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getProPricing, createProCheckout } from '../api';
import useProStatus from '../hooks/useProStatus';

const BENEFITS = [
  { icon: '📊', title: 'Hero Meta V2', desc: 'Position-specific win rates, pick frequency, and tier-aware breakdowns.' },
  { icon: '⚔️', title: 'Hero Matchups', desc: 'See exactly which heroes beat your favourites in your inhouse pool.' },
  { icon: '🧙', title: 'Skill Builds', desc: 'Most-popular ability orders for every hero, with timing data.' },
  { icon: '🤝', title: 'Head to Head & Compare', desc: 'Deep comparisons between any two players, season-aware.' },
  { icon: '📈', title: 'Player Benchmarks', desc: 'How your GPM, damage, last hits stack against the server average.' },
  { icon: '🎨', title: 'Premium Profile Cosmetics', desc: 'Exclusive titles and theme accents for your player profile.' },
  { icon: '📥', title: 'CSV Match Export', desc: 'Bulk-download your match history for spreadsheet analysis.' },
];

function formatPrice(cents, currency = 'aud') {
  if (cents == null) return '—';
  return `${currency.toUpperCase()} $${(cents / 100).toFixed(2)}`;
}

export default function Pro() {
  const { status, loading: statusLoading, reload } = useProStatus();
  const [pricing, setPricing] = useState(null);
  const [pricingError, setPricingError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();
  const cancelled = searchParams.get('checkout') === 'cancelled';

  useEffect(() => {
    if (status?.gate_on) {
      getProPricing()
        .then(setPricing)
        .catch(e => setPricingError(e.message));
    }
  }, [status?.gate_on]);

  async function handleUpgrade() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await createProCheckout();
      if (url) window.location.href = url;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (statusLoading) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>★</div>
        <h1 className="page-title" style={{ marginBottom: 8 }}>Inhouse Stats Pro</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, maxWidth: 560, margin: '0 auto' }}>
          Unlock the full analytics suite with a one-time lifetime purchase. No subscriptions, no renewals.
        </p>
      </div>

      {cancelled && (
        <div style={{
          background: 'rgba(244,67,54,0.08)',
          border: '1px solid rgba(244,67,54,0.4)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13,
          color: 'var(--accent-red)',
        }}>
          Checkout was cancelled — no charge was made.
        </div>
      )}

      {status?.is_pro && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(76,175,80,0.12) 0%, var(--bg-card) 100%)',
          border: '1px solid rgba(76,175,80,0.4)',
          borderRadius: 12, padding: '20px 24px', marginBottom: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>✓</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>You are a Pro member</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Thanks for supporting the league.{' '}
            <Link to="/settings/billing" style={{ color: 'var(--accent-blue)' }}>View billing details</Link>
          </div>
        </div>
      )}

      {!status?.gate_on && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '16px 20px', marginBottom: 24,
          color: 'var(--text-muted)', fontSize: 14, textAlign: 'center',
        }}>
          Pro Tier launches soon — check back shortly.
        </div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14, marginBottom: 28,
      }}>
        {BENEFITS.map(b => (
          <div key={b.title} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{b.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{b.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{b.desc}</div>
          </div>
        ))}
      </div>

      {status?.gate_on && !status?.is_pro && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, var(--bg-card) 100%)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: 12, padding: '24px 28px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>One-time payment, lifetime access</div>
          <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 14 }}>
            {pricing ? formatPrice(pricing.price_cents, pricing.currency) : (pricingError ? '—' : '…')}
          </div>
          {error && (
            <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 10 }}>
              {error}
            </div>
          )}
          {!status?.signed_in ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Sign in with Steam first to upgrade.
            </div>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={busy || !pricing}
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                color: '#1a1a1a', border: 'none',
                padding: '12px 32px', borderRadius: 6,
                fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                letterSpacing: 0.3, opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? 'Redirecting to Stripe…' : 'Upgrade to Pro'}
            </button>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14 }}>
            Secure payment processed by Stripe. Refunds available within 30 days — contact an admin.
          </div>
        </div>
      )}
    </div>
  );
}
