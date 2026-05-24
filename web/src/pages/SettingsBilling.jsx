import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useProStatus from '../hooks/useProStatus';
import ProBadge from '../components/ProBadge';
import Dialog from '../components/Dialog';
import {
  getGiftHistory, openProPortal,
  cancelProSubscription, resumeProSubscription, acceptProWinback,
} from '../api';

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

const CANCEL_REASONS = [
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'not_using', label: 'Not using it enough' },
  { value: 'missing_features', label: 'Missing features I need' },
  { value: 'temporary_break', label: 'Just taking a break' },
  { value: 'switching', label: 'Switching to another tool' },
  { value: 'other', label: 'Other' },
];

// Task #318 — single-shot cancel modal. Step 1 = reason picker.
// Step 2 = winback offer (50% off 3 months) for price-sensitive reasons.
// Step 3 = confirmation that cancel-at-period-end is set.
function CancelModal({ sub, onClose, onChanged }) {
  const [step, setStep] = useState('reason'); // 'reason' | 'winback' | 'done'
  const [reason, setReason] = useState('too_expensive');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end * 1000).toLocaleDateString()
    : 'the end of this billing period';

  async function submitReason() {
    setErr(null);
    // Offer the winback discount for price-sensitive cancels; otherwise
    // proceed straight to the cancel API call.
    if (reason === 'too_expensive' || reason === 'not_using') {
      setStep('winback');
      return;
    }
    await doCancel(false);
  }

  async function doCancel(winbackOffered) {
    setBusy(true);
    try {
      await cancelProSubscription({ reason, comment, winbackOffered });
      setStep('done');
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptOffer() {
    setBusy(true);
    setErr(null);
    try {
      await acceptProWinback({ reason });
      onChanged?.();
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose} label="Cancel Pro subscription">
      <div style={{ padding: 22, maxWidth: 480 }}>
        {step === 'reason' && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>We're sorry to see you go</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Could you tell us why you're cancelling? This helps us improve.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0' }}>
              {CANCEL_REASONS.map(r => (
                <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="radio" name="cancel_reason"
                    value={r.value} checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Anything else you'd like us to know? (optional)"
              maxLength={1000}
              rows={3}
              style={{
                width: '100%', padding: 8, borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg-input, var(--bg-card))',
                color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', marginBottom: 14,
              }}
            />
            {err && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} disabled={busy} style={btnSecondary}>Keep Pro</button>
              <button onClick={submitReason} disabled={busy} style={btnDanger}>
                {busy ? 'Working…' : 'Continue cancellation'}
              </button>
            </div>
          </>
        )}

        {step === 'winback' && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Wait — here's 50% off for 3 months</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              We'd love to keep you around. Stay subscribed and we'll knock 50% off your next three months — applied automatically.
            </p>
            {err && <div style={{ color: 'var(--accent-red)', fontSize: 13, margin: '10px 0' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => doCancel(true)} disabled={busy} style={btnSecondary}>
                No thanks, cancel
              </button>
              <button onClick={acceptOffer} disabled={busy} style={btnPrimary}>
                {busy ? 'Applying…' : 'Yes, apply discount'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Cancellation scheduled</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Your Pro membership will remain active until <strong>{periodEnd}</strong>, after which it will not renew. You can resume any time before then.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={onClose} style={btnPrimary}>Close</button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

const btnPrimary = {
  background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  color: '#1a1a1a', border: 'none', padding: '8px 16px', borderRadius: 6,
  fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
const btnSecondary = {
  background: 'var(--bg-card)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', padding: '8px 16px', borderRadius: 6,
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const btnDanger = {
  background: 'transparent', color: 'var(--accent-red)',
  border: '1px solid var(--accent-red)', padding: '8px 16px', borderRadius: 6,
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

function planLabel(sub) {
  if (!sub) return 'Pro';
  if (sub.is_founder) return 'Pro — Founders Lifetime';
  if (sub.plan_type === 'lifetime') return 'Pro — Lifetime';
  if (sub.plan_type === 'monthly') return 'Pro — Monthly';
  return sub.plan_type || 'Pro';
}

function statusPill(sub) {
  if (!sub) return null;
  const map = {
    active:   { label: 'Active',           color: 'var(--accent-green)' },
    lifetime: { label: 'Lifetime',         color: 'var(--brass, #c5a975)' },
    past_due: { label: 'Payment failed',   color: 'var(--accent-amber, #f59e0b)' },
    canceled: { label: 'Cancelled',        color: 'var(--text-muted)' },
    cancelled:{ label: 'Cancelled',        color: 'var(--text-muted)' },
  };
  const it = map[sub.status] || { label: sub.status || '—', color: 'var(--text-muted)' };
  return <span style={{ color: it.color, fontWeight: 700 }}>{it.label}</span>;
}

export default function SettingsBilling() {
  const { status, loading, reload } = useProStatus();
  const [searchParams] = useSearchParams();
  const justPurchased = searchParams.get('checkout') === 'success';

  const [gifts, setGifts] = useState(null);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(null);
  const [actionErr, setActionErr] = useState(null);

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

  async function openPortal() {
    setActionErr(null);
    setActionBusy('portal');
    try {
      const { url } = await openProPortal();
      if (url) window.location.href = url;
    } catch (e) {
      setActionErr(e.message);
      setActionBusy(null);
    }
  }

  async function resume() {
    setActionErr(null);
    setActionBusy('resume');
    try {
      await resumeProSubscription();
      await reload();
    } catch (e) {
      setActionErr(e.message);
    } finally {
      setActionBusy(null);
    }
  }

  if (loading && !status) return <div className="loading">Loading billing…</div>;

  const sub = status?.subscription || null;
  const isFounder = !!sub?.is_founder;
  const isLifetime = sub?.plan_type === 'lifetime' || sub?.status === 'lifetime';
  const isMonthly = sub?.plan_type === 'monthly';
  const isPastDue = sub?.status === 'past_due';
  const cancelScheduled = !!sub?.cancel_at_period_end;
  const renewalDate = sub?.current_period_end
    ? new Date(sub.current_period_end * 1000).toLocaleDateString()
    : null;

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

          {isPastDue && (
            <div style={{
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.45)',
              borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 14,
            }}>
              <strong>Your last payment failed.</strong> Update your card from the billing portal to keep Pro active — Stripe will retry automatically.
            </div>
          )}

          {cancelScheduled && (
            <div style={{
              background: 'rgba(244,67,54,0.08)',
              border: '1px solid rgba(244,67,54,0.4)',
              borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 14,
            }}>
              Your subscription is set to cancel on <strong>{renewalDate || 'the end of this period'}</strong>. You'll keep Pro until then — or resume any time below.
            </div>
          )}

          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '20px 24px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Membership Status</div>
              {status?.is_pro && (
                <ProBadge size="lg" variant={isFounder ? 'founder' : 'pro'} />
              )}
            </div>

            {status?.is_pro ? (
              <>
                <table style={{ width: '100%', fontSize: 14 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: 'var(--text-muted)', padding: '4px 0', width: '40%' }}>Plan</td>
                      <td style={{ padding: '4px 0', fontWeight: 600 }}>{planLabel(sub)}</td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>Status</td>
                      <td style={{ padding: '4px 0' }}>{statusPill(sub)}</td>
                    </tr>
                    {isMonthly && renewalDate && (
                      <tr>
                        <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>
                          {cancelScheduled ? 'Ends on' : 'Renews on'}
                        </td>
                        <td style={{ padding: '4px 0' }}>{renewalDate}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>Started</td>
                      <td style={{ padding: '4px 0' }}>{formatDate(sub?.purchased_at)}</td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>Amount</td>
                      <td style={{ padding: '4px 0' }}>
                        {formatMoney(sub?.amount_cents, sub?.currency)}
                        {isMonthly && <span style={{ color: 'var(--text-muted)' }}> / month</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Action row — only for live monthly subscriptions */}
                {isMonthly && sub?.has_portal && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
                    <button
                      onClick={openPortal}
                      disabled={actionBusy === 'portal'}
                      style={btnSecondary}
                    >
                      {actionBusy === 'portal' ? 'Opening…' : 'Manage billing'}
                    </button>
                    {cancelScheduled ? (
                      <button onClick={resume} disabled={actionBusy === 'resume'} style={btnPrimary}>
                        {actionBusy === 'resume' ? 'Resuming…' : 'Resume subscription'}
                      </button>
                    ) : (
                      <button onClick={() => setCancelOpen(true)} style={btnDanger}>
                        Cancel subscription
                      </button>
                    )}
                  </div>
                )}

                {isLifetime && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 16, marginBottom: 0 }}>
                    {isFounder
                      ? 'Thank you for backing the league as a Founder. Lifetime access — nothing to renew, nothing to cancel.'
                      : 'Lifetime access — nothing to renew, nothing to cancel.'}
                  </p>
                )}

                {actionErr && (
                  <div style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 10 }}>{actionErr}</div>
                )}
              </>
            ) : (
              <div>
                <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
                  You are not currently a Pro member.
                </p>
                {status?.gate_on ? (
                  <Link to="/pro" style={{ ...btnPrimary, display: 'inline-block', textDecoration: 'none' }}>
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

      {cancelOpen && (
        <CancelModal
          sub={sub}
          onChanged={reload}
          onClose={() => setCancelOpen(false)}
        />
      )}
    </div>
  );
}
