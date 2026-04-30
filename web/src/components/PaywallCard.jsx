import React from 'react';
import { Link } from 'react-router-dom';
import useProStatus from '../hooks/useProStatus';

const FEATURE_LABELS = {
  hero_meta_v2: 'Hero Meta V2',
  hero_matchups: 'Hero Matchups',
  skill_builds: 'Skill Builds',
  head_to_head: 'Head to Head',
  compare_players: 'Compare Players',
  player_benchmarks: 'Player Benchmarks',
  csv_export: 'CSV Export',
  synergy_matrix: 'Synergy Matrix',
  synergy_heatmap: 'Synergy Heatmap',
  player_network: 'Player Network',
  performance_trend: 'Performance Trend',
};

export default function PaywallCard({ feature, signedIn = null, compact = false, message }) {
  const { status } = useProStatus();
  const inferredSignedIn = signedIn != null ? signedIn : Boolean(status?.signed_in);
  const featureLabel = FEATURE_LABELS[feature] || 'This feature';

  const headline = message || `${featureLabel} is a Pro Tier feature`;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, var(--bg-card) 60%)',
      border: '1px solid rgba(245,158,11,0.4)',
      borderRadius: 12,
      padding: compact ? '16px 18px' : '24px 28px',
      margin: compact ? '12px 0' : '24px 0',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: compact ? 28 : 40, marginBottom: 8 }}>★</div>
      <h3 style={{ margin: '0 0 6px', fontSize: compact ? 16 : 20, color: 'var(--text-primary)' }}>
        {headline}
      </h3>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13, maxWidth: 480, marginInline: 'auto' }}>
        Unlock advanced analytics, premium profile cosmetics, and bulk match exports — one-time purchase, yours forever.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link
          to="/pro"
          style={{
            display: 'inline-block',
            padding: '8px 18px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
            color: '#1a1a1a',
            borderRadius: 6,
            fontWeight: 700,
            textDecoration: 'none',
            fontSize: 13,
            letterSpacing: 0.3,
          }}
        >
          See Pro Tier
        </Link>
        {!inferredSignedIn && (
          <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            Sign in with Steam first to upgrade
          </span>
        )}
      </div>
    </div>
  );
}
