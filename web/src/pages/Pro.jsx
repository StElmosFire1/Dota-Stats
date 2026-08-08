import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getProPricing, createProCheckout } from '../api';
import useProStatus from '../hooks/useProStatus';
import { useSuperuser } from '../context/SuperuserContext';
import { useSteamAuth } from '../context/SteamAuthContext';

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
        desc: 'Bulk-download your match history for spreadsheet analysis — the Download CSV button lives on your player profile.',
        to: '/players', kind: 'page', tabHint: 'Download CSV on your profile',
        ownProfileLink: true, // Task #14 — deep-link to the signed-in member's own profile
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
  const { isSuperuser } = useSuperuser();
  const { steamUser } = useSteamAuth();
  const { status, loading: statusLoading } = useProStatus();
  const [pricing, setPricing] = useState(null);
  const [pricingError, setPricingError] = useState(null);
  const [busy, setBusy] = useState(null); // 'monthly' | 'lifetime' | null
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

  async function handleUpgrade(plan) {
    setError(null);
    setBusy(plan);
    try {
      const { url } = await createProCheckout(plan);
      if (url) window.location.href = url;
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  if (statusLoading) {
    return <div className="loading">Loading…</div>;
  }

  // Superusers get full Pro feature access for testing/admin previews without
  // needing a Stripe purchase against their account.
  const isPro = !!status?.is_pro || isSuperuser;

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
            {group.features.map(f => {
              // Task #14 — deep-link "own profile" features (CSV export) to the
              // signed-in member's profile so the Download CSV button is one
              // click away; falls back to the players list when signed out.
              const feat = (f.ownProfileLink && steamUser?.accountId)
                ? { ...f, to: `/player/${steamUser.accountId}` }
                : f;
              return <FeatureCard key={f.title} feat={feat} isPro={isPro} />;
            })}
          </div>
        </div>
      ))}

      {/* Task #318 — two plan cards. Monthly is the default; lifetime is the
          premium Founders SKU (one-time, includes Founder badge + frame). */}
      {status?.gate_on && !isPro && (
        <div style={{ marginTop: 8 }}>
          {error && (
            <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}
          {!status?.signed_in && (
            <div style={{
              color: 'var(--text-muted)', fontSize: 14, marginBottom: 12, textAlign: 'center',
            }}>
              Sign in with Steam first to upgrade.
            </div>
          )}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16,
          }}>
            {/* Monthly plan — default */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, var(--bg-card) 100%)',
              border: '1px solid rgba(245,158,11,0.45)',
              borderRadius: 12, padding: '22px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: '#fbbf24', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
                Most popular
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Pro — Monthly</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 4 }}>
                {pricing?.monthly ? formatPrice(pricing.monthly.price_cents, pricing.currency) : (pricingError ? '—' : '…')}
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}> / month</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Cancel any time from Settings → Billing.
              </div>
              <button
                onClick={() => handleUpgrade('monthly')}
                disabled={!!busy || !pricing || !status?.signed_in}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                  color: '#1a1a1a', border: 'none',
                  padding: '12px 28px', borderRadius: 6,
                  fontSize: 14, fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer',
                  letterSpacing: 0.3, opacity: busy === 'monthly' ? 0.6 : 1,
                  width: '100%',
                }}
              >
                {busy === 'monthly' ? 'Redirecting…' : '★ Subscribe Monthly'}
              </button>
            </div>

            {/* Lifetime / Founder plan */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(197,169,117,0.14) 0%, var(--bg-card) 100%)',
              border: '1px solid rgba(197,169,117,0.55)',
              borderRadius: 12, padding: '22px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: 'var(--brass, #c5a975)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
                Founders edition
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Pro — Lifetime</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 4 }}>
                {pricing?.lifetime ? formatPrice(pricing.lifetime.price_cents, pricing.currency) : (pricingError ? '—' : '…')}
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}> · one-time</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Lifetime Pro access plus the exclusive <strong style={{ color: 'var(--brass, #c5a975)' }}>♛ Founder</strong> badge and a unique cosmetic frame.
              </div>
              <button
                onClick={() => handleUpgrade('lifetime')}
                disabled={!!busy || !pricing || !status?.signed_in}
                style={{
                  background: 'linear-gradient(135deg, #c5a975 0%, #f5efe2 100%)',
                  color: '#0d1424', border: 'none',
                  padding: '12px 28px', borderRadius: 6,
                  fontSize: 14, fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer',
                  letterSpacing: 0.3, opacity: busy === 'lifetime' ? 0.6 : 1,
                  width: '100%',
                }}
              >
                {busy === 'lifetime' ? 'Redirecting…' : '♛ Become a Founder'}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, textAlign: 'center' }}>
            Secure payment processed by Stripe. Refunds available within 30 days — contact an admin.
          </div>
        </div>
      )}
    </div>
  );
}
