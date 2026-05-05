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
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(13,20,36,0.35) 0%, rgba(13,20,36,0.7) 60%, rgba(13,20,36,0.85) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          className="oa-card oa-card-rule"
          style={{
            maxWidth: 460, width: '100%',
            padding: '28px 30px', textAlign: 'center',
            color: 'var(--text-primary)',
            boxShadow: '0 14px 40px rgba(0,0,0,0.45)',
            background: 'var(--bg-card)',
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
