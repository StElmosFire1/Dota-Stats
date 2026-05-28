import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyRival } from '../api';

// Task #441 — Weekly Rivals card. Renders on the Home tile row and on
// your own /player/:id profile. Self-fetching; renders nothing when the
// viewer is signed out, exempt, or hasn't been paired yet this week.
export default function RivalCard({ compact = false }) {
  const [rival, setRival] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyRival()
      .then(d => { if (alive) { setRival(d?.rival || null); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  if (!loaded) return null;
  if (!rival) return null;

  const myWins = rival.my_wins || 0;
  const rivalWins = rival.rival_wins || 0;
  const leading = myWins > rivalWins ? 'leading' : myWins < rivalWins ? 'trailing' : 'tied';
  const colour = leading === 'leading' ? '#22c55e'
    : leading === 'trailing' ? '#ef4444' : 'var(--text-muted)';
  const rivalLabel = rival.rival_nickname || `account ${rival.rival_account_id}`;

  return (
    <section
      aria-labelledby="rival-card-heading"
      style={{
        background: 'var(--card, #181a23)',
        border: '1px solid var(--border, #2a2d3a)',
        borderRadius: 12,
        padding: compact ? 14 : 18,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 id="rival-card-heading" style={{ margin: 0, fontSize: compact ? 14 : 16 }}>
          ⚔️ Weekly Rival
        </h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          week of {String(rival.week_start).slice(0, 10)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          vs{' '}
          <Link
            to={`/player/${rival.rival_account_id}`}
            style={{ color: 'var(--accent, #c5a975)', fontWeight: 600 }}
          >
            {rivalLabel}
          </Link>
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: colour, fontVariantNumeric: 'tabular-nums' }}>
          {myWins}<span style={{ color: 'var(--text-muted)', fontWeight: 400, margin: '0 4px' }}>–</span>{rivalWins}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {leading === 'leading' && 'You\'re leading this week. Close it out.'}
        {leading === 'trailing' && 'They\'re ahead this week. Get them back.'}
        {leading === 'tied' && 'All square — next match decides it.'}
      </div>
      <div
        style={{
          fontSize: 12, color: 'var(--text-muted)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid var(--border, #2a2d3a)', paddingTop: 8,
        }}
      >
        <span>
          All-time vs {rivalLabel}:{' '}
          <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {rival.all_time_my_wins || 0}–{rival.all_time_rival_wins || 0}
          </strong>
        </span>
      </div>
      {rival.both_in_queue && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid #22c55e',
            color: '#22c55e',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span aria-hidden="true">🟢</span>
          You and {rivalLabel} are both in the inhouse queue right now — go!
        </div>
      )}
    </section>
  );
}
