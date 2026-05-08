import React, { useState, useEffect } from 'react';
import { createVerifiedBadgeCheckout, getPlayerVerifiedBadges } from '../api';

// Must stay in sync with ALLOWED_VERIFIED_PROVIDERS in
// src/monetization/magazineV3.js — /api/verified/checkout will 400 on
// any provider not in that set. Steam is intentionally excluded here
// (it's only available via the code-challenge proof flow, not paid
// checkout).
const PROVIDERS = [
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'twitch',  label: 'Twitch' },
  { value: 'youtube', label: 'YouTube' },
];

// Owner-only CTA tile mounted on PlayerProfile. Self-hides if the owner
// already has at least one verified badge (no point upselling); otherwise
// shows a small "Get verified" button that opens the purchase modal.
export function VerifiedBadgeOwnerCta({ accountId }) {
  const [open, setOpen] = useState(false);
  const [hasBadge, setHasBadge] = useState(null); // null = unknown
  useEffect(() => {
    if (!accountId) { setHasBadge(false); return; }
    getPlayerVerifiedBadges(accountId)
      .then(d => setHasBadge(Array.isArray(d?.badges) && d.badges.length > 0))
      .catch(() => setHasBadge(false));
  }, [accountId]);
  if (hasBadge === null || hasBadge === true) return null;
  return (
    <div style={{
      marginTop: 12, padding: 12,
      background: 'rgba(197,169,117,.06)',
      border: '1px solid var(--brass, #c5a975)', borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 600 }}>Get the verified checkmark</div>
        <div style={{ color: 'var(--text-muted, #9ca3af)' }}>
          Prove ownership of your social handle so others know it's really you.
        </div>
      </div>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'var(--brass, #c5a975)', color: 'var(--ink-navy, #0d1424)',
          border: 'none', padding: '6px 14px', fontWeight: 600, borderRadius: 4,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Get verified
      </button>
      <VerifiedBadgePurchaseModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function VerifiedBadgePurchaseModal({ open, onClose }) {
  const [provider, setProvider] = useState('twitter');
  const [handle, setHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [paywall, setPaywall] = useState(false);

  if (!open) return null;

  async function onSubmit(e) {
    e.preventDefault();
    setError(null); setPaywall(false); setSubmitting(true);
    try {
      const out = await createVerifiedBadgeCheckout(provider, handle.trim());
      if (out?.url) {
        window.location.href = out.url;
        return;
      }
      setError('Checkout URL missing from server response.');
    } catch (err) {
      if (err.status === 401) {
        setError('Sign in with Steam first to request a verified badge.');
      } else if (err.paywall) {
        setPaywall(true);
        setError(err.message || 'Verification requires payment.');
      } else {
        setError(err.message || 'Could not start verification checkout.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary, #11192b)',
          color: 'var(--text-primary, #f5efe2)',
          border: '1px solid var(--brass, #c5a975)',
          borderRadius: 8, maxWidth: 480, width: '100%', padding: 20,
          boxShadow: '0 12px 32px rgba(0,0,0,.5)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--font-condensed, Oswald), sans-serif' }}>
          Get verified
        </h3>
        <p style={{ marginTop: 0, color: 'var(--text-muted, #9ca3af)', fontSize: 13 }}>
          Prove ownership of a public account so your profile shows the verified
          checkmark. After payment your verification request enters the moderation
          queue — an admin reviews it and your badge is granted on approval. Want
          to skip payment? You can also use the free code-challenge proof flow
          (paste a one-time code into your public profile bio).
        </p>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            Provider
            <select
              value={provider} onChange={e => setProvider(e.target.value)}
              style={{ padding: 6 }}
            >
              {PROVIDERS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            Handle on that platform
            <input
              value={handle} onChange={e => setHandle(e.target.value)}
              placeholder="e.g. your_username (no @)"
              required maxLength={64}
              style={{ padding: 6 }}
            />
          </label>
          {error && (
            <div style={{ color: paywall ? 'var(--amber, #f59e0b)' : 'crimson', fontSize: 13 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit" disabled={submitting || !handle.trim()}
              style={{
                background: 'var(--brass, #c5a975)', color: 'var(--ink-navy, #0d1424)',
                border: 'none', padding: '6px 14px', fontWeight: 600, borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {submitting ? 'Opening checkout…' : 'Continue to payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
