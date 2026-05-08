import React, { useEffect, useState } from 'react';
import { getCoachRecommendations } from '../api';

export default function CoachRecommendationsTile() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [paywall, setPaywall] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCoachRecommendations()
      .then(d => setData(d))
      .catch(err => {
        if (err.paywall) setPaywall(true);
        else if (err.status !== 401) setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (paywall) {
    return (
      <div style={{
        background: 'rgba(245,158,11,.08)', border: '1px solid var(--amber)',
        padding: 12, borderRadius: 8, marginBottom: 12,
      }}>
        <strong>AI Coach Pairing</strong> — Pro feature.{' '}
        <a href="/pricing">Upgrade →</a>
      </div>
    );
  }
  if (error) return null;
  const recs = (data && Array.isArray(data.recommendations)) ? data.recommendations : [];
  if (!recs.length) return null;

  return (
    <div style={{
      background: 'var(--ink-navy, #0d1424)', color: 'var(--parchment, #f5efe2)',
      border: '1px solid var(--brass, #c5a975)', padding: 16, borderRadius: 8,
      marginBottom: 12,
    }}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--brass, #c5a975)' }}>
        Recommended Coaches
      </h3>
      <div style={{ fontSize: 12, opacity: .7, marginBottom: 8 }}>
        Matched to your role + recent stat gaps.
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {recs.slice(0, 3).map(r => (
          <li key={r.coach_id} style={{
            padding: '8px 0', borderTop: '1px solid rgba(197,169,117,.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{r.display_name || `Coach #${r.coach_id}`}</strong>
              <span style={{ color: 'var(--amber, #f59e0b)' }}>
                {r.hourly_rate_cents != null
                  ? `$${(r.hourly_rate_cents / 100).toFixed(0)}/hr` : ''}
              </span>
            </div>
            {r.headline && (
              <div style={{ fontSize: 13, opacity: .85, marginTop: 2 }}>{r.headline}</div>
            )}
            {Array.isArray(r.reasons) && r.reasons.length > 0 && (
              <div style={{ fontSize: 11, opacity: .65, marginTop: 4 }}>
                {r.reasons.slice(0, 2).join(' · ')}
              </div>
            )}
            <a href={`/coaches/${r.coach_id}`} style={{
              display: 'inline-block', marginTop: 6, fontSize: 12,
              color: 'var(--amber, #f59e0b)',
            }}>
              View profile →
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
