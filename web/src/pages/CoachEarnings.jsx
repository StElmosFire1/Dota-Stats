import React, { useEffect, useState } from 'react';
import * as api from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';
import SignInPrompt from '../components/SignInPrompt';

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
  plan_invoice: 'Plan subscription',
  booking_refund: '1:1 booking · refunded',
  group_seat_refund: 'Group seat · refunded',
  vod_review_refund: 'VOD review · refunded',
};

function fmtSigned(c, cur = 'aud') {
  const sign = c < 0 ? '−' : '';
  return `${sign}$${(Math.abs(c) / 100).toFixed(2)} ${String(cur).toUpperCase()}`;
}

export default function CoachEarnings() {
  const { steamUser, loading: authLoading } = useSteamAuth() || {};
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

  if (authLoading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!steamUser?.accountId) return <SignInPrompt title="Coach earnings" message="Sign in with Steam to view your coaching earnings." />;

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
          {/* Task #413 — recurring-revenue tiles. MRR sums every active
              plan_subscription's monthly price right now (not just this
              month); retained = subscribers with a paid invoice in this
              month who also had at least one earlier paid invoice, i.e.
              renewals rather than first-time signups. */}
          {data.plan_metrics && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                ['MRR (active plans)', data.plan_metrics.mrr_cents, 'var(--gold)'],
                ['Active subscribers', null, 'var(--text-primary)', data.plan_metrics.active_subscribers],
                ['Retained this month', null, 'var(--radiant-color)', data.plan_metrics.retained_subscribers],
              ].map(([label, cents, color, count]) => (
                <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--brass)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>
                    {cents != null ? `${fmtPrice(cents)} / mo` : count}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {data.totals.fully_reconciled
              ? 'All line items below are reconciled against Stripe BalanceTransactions — fees and net payout match your Stripe dashboard exactly.'
              : 'Rows marked Reconciled show real Stripe fees pulled from the BalanceTransaction; unreconciled rows fall back to the AU domestic-card estimate (1.75% + 30c) until the next reconciliation run.'}
          </p>
          {data.totals.refunded_rows > 0 && (
            <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: -8 }}>
              {data.totals.refunded_rows} refunded {data.totals.refunded_rows === 1 ? 'row' : 'rows'} this month
              — refunded gross {fmtSigned(data.totals.refunded_gross)}
              {data.totals.stripe_fee_kept_on_refunds > 0
                ? `, Stripe kept ${fmtPrice(data.totals.stripe_fee_kept_on_refunds)} of the original processing fee (your real refund cost)`
                : '. Stripe returned the original processing fee in full — no extra cost beyond the refunded gross'}
              . Refund rows appear as negative entries in the table below.
            </p>
          )}

          <h3 style={{ marginTop: 20 }}>Line items ({data.rows.length})</h3>
          {data.rows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No earnings this month.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th align="left">Kind</th><th align="left">When</th><th align="left">Detail</th>
                  <th align="right">Gross</th><th align="right">Platform</th>
                  <th align="right">Stripe</th><th align="right">Net</th>
                  <th align="left">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => {
                  // Refund rows carry an explicit `net_cents` = coach's true
                  // balance delta (-stripe_fee_kept under reverse_transfer:true
                  // + refund_application_fee:true). Completed rows omit it and
                  // fall back to the classic gross - platform - stripe formula.
                  const net = r.net_cents != null
                    ? r.net_cents
                    : (r.amount_cents - r.platform_fee_cents - r.stripe_fee_cents);
                  const stripeLabel = r.refunded
                    ? (r.stripe_fee_kept > 0
                        ? `Stripe kept ${fmtPrice(r.stripe_fee_kept, r.currency)} of the original processing fee (your real cost on this refund)`
                        : 'Stripe returned the original processing fee in full')
                    : (r.reconciled ? 'Stripe fee' : 'Stripe est');
                  const rowStyle = r.refunded
                    ? { borderBottom: '1px solid var(--border)', background: 'rgba(245, 158, 11, 0.04)' }
                    : { borderBottom: '1px solid var(--border)' };
                  const netColor = net < 0 ? 'var(--dire-color)' : 'var(--radiant-color)';
                  return (
                    <tr key={`${r.kind}-${r.id}`} style={rowStyle}>
                      <td style={{ padding: 8, fontSize: 13 }}>{KIND_LABEL[r.kind] || r.kind}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{new Date(r.when).toLocaleString()}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{r.title || r.match_id || '—'}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{fmtSigned(r.amount_cents, r.currency)}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: 'var(--amber)' }}>{r.platform_fee_cents <= 0 ? fmtSigned(-r.platform_fee_cents, r.currency) : `−${fmtPrice(r.platform_fee_cents, r.currency)}`}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: 'var(--text-muted)' }} title={stripeLabel}>{r.stripe_fee_cents < 0 ? fmtSigned(-r.stripe_fee_cents, r.currency) : `−${fmtPrice(r.stripe_fee_cents, r.currency)}`}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: netColor }}>{fmtSigned(net, r.currency)}</td>
                      <td style={{ padding: 8, fontSize: 11 }}>
                        {r.refunded ? (
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                            background: 'rgba(245, 158, 11, 0.15)', color: 'var(--amber)',
                            border: '1px solid rgba(245, 158, 11, 0.45)', fontWeight: 600,
                          }} aria-label="Refunded; Stripe BalanceTransaction reconciled">↺ Refunded</span>
                        ) : r.reconciled ? (
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                            background: 'rgba(34, 197, 94, 0.15)', color: 'var(--radiant-color)',
                            border: '1px solid rgba(34, 197, 94, 0.35)', fontWeight: 600,
                          }} aria-label="Reconciled against Stripe BalanceTransaction">✓ Reconciled</span>
                        ) : (
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                            background: 'rgba(245, 158, 11, 0.12)', color: 'var(--amber)',
                            border: '1px solid rgba(245, 158, 11, 0.35)', fontWeight: 600,
                          }} aria-label="Stripe fees are estimated; awaiting reconciliation">Estimated</span>
                        )}
                      </td>
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
