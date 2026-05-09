import React from 'react';
import { Link } from 'react-router-dom';
import useProStatus from '../hooks/useProStatus';
import { useSuperuser } from '../context/SuperuserContext';

const FEATURE_LABELS = {
  player_insights: 'Player Insights',
  ward_heatmap: 'Ward Heatmap',
  head_to_head: 'Head-to-Head',
  compare_players: 'Compare Stats',
  player_profiles: 'Position Player Profiles',
  hero_position_meta: 'Hero Position Meta',
  hero_breakdown: 'Hero Breakdown',
};

export default function PaywallBlur({ feature, children, blurStrength = 6, minHeight = 320 }) {
  const { status } = useProStatus();
  const { isSuperuser } = useSuperuser();
  const isPro = !!(status?.is_pro);
  if (isPro || isSuperuser) return <>{children}</>;

  const label = FEATURE_LABELS[feature] || 'This feature';

  // Layout note (Nov 2026): the upgrade card used to render with
  // `alignItems: center` inside an `inset: 0` overlay, which centred it
  // vertically against the WHOLE blurred body. On long pages (e.g. the
  // Position Player Profiles table, ~80+ rows) the card landed well below
  // the fold and users had to scroll to discover the page was even gated
  // — they assumed it was just slow-loading data. Fix: anchor the card
  // near the top of the gated section AND make it `position: sticky` so
  // as the user scrolls down through the blurred preview it tracks with
  // the viewport. Card stays in eye-shot the entire time the gated area
  // is on screen.
  return (
    <div style={{ position: 'relative', minHeight }}>
      <div
        aria-hidden="true"
        style={{
          filter: `blur(${blurStrength}px)`,
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 0.7,
        }}
      >
        {children}
      </div>
      {/* Gradient wash sits behind the card, covering the full blurred area. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(13,20,36,0.35) 0%, rgba(13,20,36,0.7) 60%, rgba(13,20,36,0.85) 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* Card overlay — fixed to the centre of the visible viewport so it's
          immediately obvious regardless of how tall the blurred section is. */}
      <div
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <div
          className="oa-card oa-card-rule"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 200,
            maxWidth: 460,
            width: 'calc(100% - 32px)',
            padding: '24px 28px', textAlign: 'center',
            color: 'var(--text-primary)',
            boxShadow: '0 14px 40px rgba(0,0,0,0.55)',
            background: 'var(--bg-card)',
            pointerEvents: 'auto',
          }}
        >
          <div className="oa-eyebrow" style={{ marginBottom: 6 }}>Pro Membership</div>
          <h3 className="font-serif" style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 700 }}>
            {label} is a Pro feature
          </h3>
          <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
            Unlock advanced analytics, premium profile cosmetics and bulk match exports —
            one-time purchase, yours forever.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/pro"
              style={{
                display: 'inline-block',
                padding: '10px 22px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                color: '#1a1a1a',
                borderRadius: 6,
                fontWeight: 700,
                textDecoration: 'none',
                fontSize: 14,
                letterSpacing: 0.3,
              }}
            >
              ★ Upgrade to Pro
            </Link>
            {!status?.signed_in && (
              <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                Sign in with Steam first
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
