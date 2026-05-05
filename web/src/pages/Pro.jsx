import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getProPricing, createProCheckout } from '../api';
import useProStatus from '../hooks/useProStatus';

// Every Pro feature lives here. Standalone features get their own card with a
// "Open" button; tab-features (e.g. Heroes → Position Meta) get a card that
// deep-links into the parent page so the user lands directly on the right tab.
const FEATURE_GROUPS = [
  {
    title: 'Hero Analytics',
    features: [
      {
        icon: '📍', title: 'Hero Position Meta',
        desc: 'Position-specific win rates, pick frequency, and tier-aware breakdowns.',
        to: '/hero-position-meta', kind: 'tab', tabHint: 'Heroes → Position Meta',
      },
      {
        icon: '🏛️', title: 'Hero Breakdown',
        desc: 'Drill into every hero — bans, situational picks, win conditions.',
        to: '/hero-breakdown', kind: 'tab', tabHint: 'Heroes → Hero Breakdown',
      },
    ],
  },
  {
    title: 'Player Analytics',
    features: [
      {
        icon: '🤝', title: 'Head to Head & Compare',
        desc: 'Deep two-player comparisons, season-aware.',
        to: '/player-tools', kind: 'page',
      },
      {
        icon: '🕸️', title: 'Player Network',
        desc: 'Top duos, synergy, and who you play with most.',
        to: '/player-network', kind: 'page',
      },
      {
        icon: '📈', title: 'Player Benchmarks',
        desc: 'How your GPM, damage, last hits stack up against the server average.',
        to: '/benchmarks', kind: 'page',
      },
      {
        icon: '👤', title: 'Position Player Profiles',
        desc: 'Per-position deep dives for any player on the ladder.',
        to: '/position-player-profiles', kind: 'tab', tabHint: 'Positions → Player Profiles',
      },
    ],
  },
  {
    title: 'Match Tools',
    features: [
      {
        icon: '🗺️', title: 'Ward Heatmap',
        desc: 'Vision data overlay — where wards live and die across the map.',
        to: '/ward-map', kind: 'page',
      },
      {
        icon: '⬇', title: 'Replay Downloads',
        desc: 'Pull the .dem replay file for any archived dedicated-server match.',
        to: '/matches', kind: 'inline', tabHint: 'On any match page',
      },
      {
        icon: '📥', title: 'CSV Match Export',
        desc: 'Bulk-download your match history for spreadsheet analysis.',
        to: '/matches', kind: 'inline', tabHint: 'From the matches list',
      },
    ],
  },
  {
    title: 'Profile',
    features: [
      {
        icon: '🎨', title: 'Premium Profile Cosmetics',
        desc: 'Exclusive titles, theme accents, and custom flair on your player profile.',
        to: '/settings/profile', kind: 'page',
      },
    ],
  },
];

function formatPrice(cents, currency = 'aud') {
  if (cents == null) return '—';
  return `${currency.toUpperCase()} $${(cents / 100).toFixed(2)}`;
}

const goldText = { color: '#fbbf24', fontWeight: 700 };

function FeatureCard({ feat, isPro }) {
  const cta = isPro
    ? (feat.kind === 'inline' ? feat.tabHint : 'Open')
    : (feat.tabHint || 'Locked');
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${isPro ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 22, marginBottom: 2 }}>{feat.icon}</div>
      <div style={{ fontWeight: 700, fontSize: 14, ...goldText }}>{feat.title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>
        {feat.desc}
      </div>
      {isPro && feat.kind !== 'inline' ? (
        <Link
          to={feat.to}
          style={{
            marginTop: 6, alignSelf: 'flex-start',
            fontSize: 12, fontWeight: 700,
            color: '#1a1a1a',
            background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
            padding: '5px 12px', borderRadius: 5,
            textDecoration: 'none', letterSpacing: 0.3,
          }}
        >
          {cta} →
        </Link>
      ) : (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {isPro ? feat.tabHint : `🔒 ${feat.tabHint || 'Pro members only'}`}
        </div>
      )}
    </div>
  );
}

export default function Pro() {
  const { status, loading: statusLoading } = useProStatus();
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

  const isPro = !!status?.is_pro;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 56, marginBottom: 8, color: '#fbbf24' }}>★</div>
        <h1 className="page-title" style={{ marginBottom: 8 }}>Inhouse Stats Pro</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, maxWidth: 620, margin: '0 auto' }}>
          {isPro
            ? 'You have full access to every Pro feature below — tap any card to jump straight in.'
            : 'Unlock the full analytics suite with a one-time lifetime purchase. No subscriptions, no renewals.'}
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

      {isPro && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.14) 0%, var(--bg-card) 100%)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: 12, padding: '16px 22px', marginBottom: 24, textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2, ...goldText }}>
            ★ You are a Pro member
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Thanks for supporting the league.{' '}
            <Link to="/settings/billing" style={{ color: 'var(--accent-blue)' }}>View billing details</Link>
          </div>
        </div>
      )}

      {!status?.gate_on && !isPro && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '16px 20px', marginBottom: 24,
          color: 'var(--text-muted)', fontSize: 14, textAlign: 'center',
        }}>
          Pro Tier launches soon — check back shortly.
        </div>
      )}

      {/* Feature catalogue — grouped by parent area */}
      {FEATURE_GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: '#fbbf24', fontWeight: 700, marginBottom: 10,
          }}>
            {group.title}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}>
            {group.features.map(f => (
              <FeatureCard key={f.title} feat={f} isPro={isPro} />
            ))}
          </div>
        </div>
      ))}

      {/* Single gold upgrade CTA at the bottom — covers everything above */}
      {status?.gate_on && !isPro && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, var(--bg-card) 100%)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: 12, padding: '24px 28px', textAlign: 'center', marginTop: 8,
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
              {busy ? 'Redirecting to Stripe…' : '★ Upgrade to Pro — Unlock Everything Above'}
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
