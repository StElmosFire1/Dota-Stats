import React, { useEffect, useState } from 'react';
import { getPlayerHeroMastery } from '../api';
import { formatHeroName } from '../utils/heroes';

const POS_LABEL = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5' };

const TIER_COLOR = {
  Grandmaster: '#f59e0b',
  Master:      '#c5a975',
  Expert:      '#7aa2f7',
  Apprentice:  '#9ca3af',
  Novice:      '#6b7280',
};

export default function HeroMasterySection({ accountId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setLoading(true);
    getPlayerHeroMastery(accountId)
      .then(d => { if (alive) setRows(d.rows || []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId]);

  if (loading) return null;
  if (!rows.length) return null;

  const top = rows.slice(0, 8);

  return (
    <section
      aria-label="Hero mastery"
      style={{
        border: '1px solid var(--border)', borderRadius: 10,
        padding: 12, marginTop: 16,
      }}
    >
      <h3 style={{ margin: '0 0 8px 0', fontFamily: 'var(--font-condensed)' }}>
        Hero mastery
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '4px 6px' }}>Hero</th>
              <th style={{ padding: '4px 6px' }}>Pos</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Games</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>WR</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Avg PERF</th>
              <th style={{ padding: '4px 6px' }}>Tier</th>
            </tr>
          </thead>
          <tbody>
            {top.map(r => (
              <tr key={`${r.hero_id}-${r.position}`} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px' }}>{formatHeroName?.(r.hero_id) || `Hero #${r.hero_id}`}</td>
                <td style={{ padding: '6px' }}>{POS_LABEL[r.position] || r.position}</td>
                <td style={{ padding: '6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.games}</td>
                <td style={{ padding: '6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round((r.win_rate || 0) * 100)}%
                </td>
                <td style={{ padding: '6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {(r.avg_perf || 0).toFixed(1)}
                </td>
                <td style={{ padding: '6px' }}>
                  <span style={{
                    color: TIER_COLOR[r.tier] || 'inherit',
                    fontWeight: 600,
                  }}>{r.tier}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
