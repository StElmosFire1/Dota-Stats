import React, { useEffect, useState } from 'react';
import * as api from '../api';

function fmtPrice(c, cur = 'aud') {
  return `$${(c / 100).toFixed(2)} ${String(cur).toUpperCase()}`;
}

function currentYM() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const KIND_LABEL = {
  booking: '1:1 booking',
  group_seat: 'Group session seat',
  vod_review: 'VOD review',
};

export default function CoachEarnings() {
  const [ym, setYm] = useState(currentYM());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getCoachEarnings(ym)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ym]);

  // Generate the last 12 months as options.
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 16 }}>
      <h1>Coach earnings</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label>Month:&nbsp;
          <select value={ym} onChange={e => setYm(e.target.value)}
            aria-label="Select earnings month"
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <a href={`/api/me/coach/earnings.csv?ym=${ym}`}
          style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
          ⬇ Export CSV
        </a>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: 'var(--dire-color)' }}>{error}</div>}
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              ['Gross', data.totals.gross, 'var(--text-primary)'],
              ['Platform take', -data.totals.platform_fee, 'var(--amber)'],
              ['Stripe fees (est)', -data.totals.stripe_fee, 'var(--text-muted)'],
              ['Net payout', data.totals.net, 'var(--radiant-color)'],
            ].map(([label, cents, color]) => (
              <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{fmtPrice(cents)}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Stripe fees are estimated (1.75% + 30c AU domestic card). Actual fees can be reconciled in the Stripe dashboard.
          </p>

          <h3 style={{ marginTop: 20 }}>Line items ({data.rows.length})</h3>
          {data.rows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No earnings this month.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th align="left">Kind</th><th align="left">When</th><th align="left">Detail</th>
                  <th align="right">Gross</th><th align="right">Platform</th>
                  <th align="right">Stripe est</th><th align="right">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => {
                  const net = r.amount_cents - r.platform_fee_cents - r.stripe_fee_cents;
                  return (
                    <tr key={`${r.kind}-${r.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8, fontSize: 13 }}>{KIND_LABEL[r.kind] || r.kind}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{new Date(r.when).toLocaleString()}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{r.title || r.match_id || '—'}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{fmtPrice(r.amount_cents, r.currency)}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: 'var(--amber)' }}>−{fmtPrice(r.platform_fee_cents, r.currency)}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: 'var(--text-muted)' }}>−{fmtPrice(r.stripe_fee_cents, r.currency)}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: 'var(--radiant-color)' }}>{fmtPrice(net, r.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
