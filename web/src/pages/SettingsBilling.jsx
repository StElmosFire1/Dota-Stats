import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useProStatus from '../hooks/useProStatus';
import ProBadge from '../components/ProBadge';
import { getGiftHistory } from '../api';

function formatMoney(cents, currency = 'aud') {
  if (cents == null) return '—';
  return `${(currency || 'aud').toUpperCase()} $${(cents / 100).toFixed(2)}`;
}

function formatDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch (_) { return s; }
}

function formatGiftType(t) {
  if (!t) return '—';
  if (t === 'pro') return 'Pro Membership';
  if (t === 'season_pass') return 'Season Pass';
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function GiftTable({ rows, direction }) {
  if (!rows || rows.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '8px 0 0' }}>
        No {direction === 'sent' ? 'gifts sent' : 'gifts received'} yet.
      </p>
    );
  }
  const nameKey = direction === 'sent' ? 'recipient_name' : 'gifter_name';
  const nameLabel = direction === 'sent' ? 'Recipient' : 'From';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
            <th style={{ padding: '4px 8px 8px 0', fontWeight: 600 }}>Date</th>
            <th style={{ padding: '4px 8px 8px 0', fontWeight: 600 }}>Type</th>
            <th style={{ padding: '4px 8px 8px 0', fontWeight: 600 }}>{nameLabel}</th>
            <th style={{ padding: '4px 8px 8px 0', fontWeight: 600 }}>Amount</th>
            <th style={{ padding: '4px 8px 8px 0', fontWeight: 600 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(g => (
            <tr key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap' }}>{formatDate(g.created_at)}</td>
              <td style={{ padding: '6px 8px 6px 0' }}>{formatGiftType(g.gift_type)}</td>
              <td style={{ padding: '6px 8px 6px 0' }}>{g[nameKey] || '—'}</td>
              <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap' }}>{formatMoney(g.amount_cents, g.currency)}</td>
              <td style={{ padding: '6px 8px 6px 0' }}>
                <span style={{
                  color: g.status === 'completed' ? 'var(--accent-green)' : 'var(--text-muted)',
                  fontWeight: g.status === 'completed' ? 600 : 400,
                }}>
                  {g.status || '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SettingsBilling() {
  const { status, loading, reload } = useProStatus();
  const [searchParams] = useSearchParams();
  const justPurchased = searchParams.get('checkout') === 'success';

  const [gifts, setGifts] = useState(null);
  const [giftsLoading, setGiftsLoading] = useState(false);

  useEffect(() => {
    reload();
    if (justPurchased) {
      const t = setTimeout(reload, 2500);
      return () => clearTimeout(t);
    }
  }, [justPurchased]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!status?.signed_in) return;
    setGiftsLoading(true);
    getGiftHistory()
      .then(data => setGifts(data))
      .catch(() => setGifts(null))
      .finally(() => setGiftsLoading(false));
  }, [status?.signed_in]);

  if (loading && !status) return <div className="loading">Loading billing…</div>;

  const sub = status?.subscription || null;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 className="page-title">Billing</h1>

      {!status?.signed_in ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '20px 24px', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Sign in with Steam to view your billing details.
          </p>
        </div>
      ) : (
        <>
          {justPurchased && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(76,175,80,0.12) 0%, var(--bg-card) 100%)',
              border: '1px solid rgba(76,175,80,0.4)',
              borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 14,
            }}>
              {status?.is_pro
                ? '✓ Payment received — welcome to Pro!'
                : '✓ Payment is being processed. This page will refresh in a moment.'}
            </div>
          )}

          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '20px 24px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Membership Status</div>
              {status?.is_pro && <ProBadge size="lg" />}
            </div>

            {status?.is_pro ? (
              <table style={{ width: '100%', fontSize: 14 }}>
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--text-muted)', padding: '4px 0', width: '40%' }}>Plan</td>
                    <td style={{ padding: '4px 0', fontWeight: 600 }}>
                      {sub?.plan_type === 'lifetime' ? 'Pro — Lifetime' : (sub?.plan_type || 'Pro')}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>Status</td>
                    <td style={{ padding: '4px 0', fontWeight: 600, color: 'var(--accent-green)' }}>Active</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>Purchased</td>
                    <td style={{ padding: '4px 0' }}>{formatDate(sub?.purchased_at)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>Amount</td>
                    <td style={{ padding: '4px 0' }}>{formatMoney(sub?.amount_cents, sub?.currency)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div>
                <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
                  You are not currently a Pro member.
                </p>
                {status?.gate_on ? (
                  <Link
                    to="/pro"
                    style={{
                      display: 'inline-block',
                      padding: '8px 18px',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                      color: '#1a1a1a', borderRadius: 6,
                      fontWeight: 700, textDecoration: 'none', fontSize: 13,
                    }}
                  >
                    Upgrade to Pro
                  </Link>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 0 }}>
                    Pro Tier launches soon.
                  </p>
                )}
              </div>
            )}
          </div>

          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '20px 24px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Gifts</div>

            {giftsLoading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Loading gift history…</p>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Gifts Sent</div>
                  <GiftTable rows={gifts?.sent} direction="sent" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Gifts Received</div>
                  <GiftTable rows={gifts?.received} direction="received" />
                </div>
              </>
            )}
          </div>

          <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.7 }}>
            All payments are processed securely by Stripe.<br />
            Need a refund? Refunds are available within 30 days — contact an admin in Discord.
          </div>
        </>
      )}
    </div>
  );
}
