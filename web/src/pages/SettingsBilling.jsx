import React, { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useProStatus from '../hooks/useProStatus';
import ProBadge from '../components/ProBadge';

function formatMoney(cents, currency = 'aud') {
  if (cents == null) return '—';
  return `${(currency || 'aud').toUpperCase()} $${(cents / 100).toFixed(2)}`;
}

function formatDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch (_) { return s; }
}

export default function SettingsBilling() {
  const { status, loading, reload } = useProStatus();
  const [searchParams] = useSearchParams();
  const justPurchased = searchParams.get('checkout') === 'success';

  // Refresh once on mount and again 2s later if we just came back from checkout
  // — gives the Stripe webhook a chance to land before we render is_pro:false.
  useEffect(() => {
    reload();
    if (justPurchased) {
      const t = setTimeout(reload, 2500);
      return () => clearTimeout(t);
    }
  }, [justPurchased]); // eslint-disable-line react-hooks/exhaustive-deps

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

          <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.7 }}>
            All payments are processed securely by Stripe.<br />
            Need a refund? Refunds are available within 30 days — contact an admin in Discord.
          </div>
        </>
      )}
    </div>
  );
}
