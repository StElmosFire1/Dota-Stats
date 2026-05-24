import React, { useEffect, useState } from 'react';
import Dialog from '../components/Dialog';

// Task #334 — public-facing storefront for sponsorship slots.
// Lists active slots from GET /api/sponsorships/slots and lets prospective
// sponsors start a Stripe Checkout via POST /api/sponsorships/:slug/checkout.
// Authentication is not required — the checkout endpoint accepts a buyer_email
// fallback when there is no logged-in account.
export default function Sponsorships() {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSlug, setSelectedSlug] = useState(null);

  useEffect(() => {
    fetch('/api/sponsorships/slots', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setSlots(d.slots || []))
      .catch(err => setError(err.message));
  }, []);

  function fmtPrice(cents, currency) {
    const cur = (currency || 'aud').toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format((cents || 0) / 100);
    } catch {
      return `${cur} ${((cents || 0) / 100).toFixed(2)}`;
    }
  }

  const selectedSlot = selectedSlug ? (slots || []).find(s => s.slug === selectedSlug) : null;

  return (
    <div style={{ padding: '24px 16px', maxWidth: 980, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
          Sponsor OCE Inhouse
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, maxWidth: 640 }}>
          Reach an engaged audience of competitive Dota 2 players. Pick a placement,
          tell us about your brand, and we&apos;ll publish your sponsorship once payment clears.
          Every spot is clearly labelled &ldquo;Sponsored&rdquo; in line with FTC disclosure guidelines.
        </p>
      </header>

      {error && (
        <div role="alert" style={{
          color: '#fca5a5', background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16,
        }}>
          Couldn&apos;t load placements: {error}
        </div>
      )}

      {!slots && !error && (
        <div style={{ color: 'var(--text-muted)' }}>Loading placements…</div>
      )}

      {slots && slots.length === 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 24, color: 'var(--text-muted)',
        }}>
          No sponsorship placements are open right now. Check back soon.
        </div>
      )}

      {slots && slots.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
        }}>
          {slots.map(slot => (
            <article key={slot.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
              padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {slot.label}
                </h2>
                <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{slot.slug}</code>
              </div>
              {slot.description && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {slot.description}
                </p>
              )}
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold, #c5a975)' }}>
                {fmtPrice(slot.monthly_price_cents, slot.currency)}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>
                  / month
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlug(slot.slug)}
                className="btn btn-primary"
                style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
                aria-label={`Sponsor ${slot.label}`}
              >
                Sponsor this slot
              </button>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={!!selectedSlot}
        onClose={() => setSelectedSlug(null)}
        label={selectedSlot ? `Sponsor ${selectedSlot.label}` : 'Sponsor placement'}
        contentStyle={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, width: '100%', maxWidth: 480,
        }}
      >
        {selectedSlot && (
          <CheckoutForm slot={selectedSlot} onClose={() => setSelectedSlug(null)} fmtPrice={fmtPrice} />
        )}
      </Dialog>
    </div>
  );
}

function CheckoutForm({ slot, onClose, fmtPrice }) {
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [sponsorImageUrl, setSponsorImageUrl] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sponsorships/${encodeURIComponent(slot.slug)}/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsor_name: sponsorName,
          sponsor_url: sponsorUrl || undefined,
          sponsor_image_url: sponsorImageUrl || undefined,
          buyer_email: buyerEmail || undefined,
          months,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.url) {
        window.location.href = j.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  const total = (slot?.monthly_price_cents || 0) * months;

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
        Sponsor: {slot.label}
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
        You&apos;ll be redirected to Stripe Checkout. Your placement goes live once payment
        succeeds and an admin approves it.
      </p>

      <label style={labelStyle}>
        Sponsor name *
        <input type="text" required maxLength={80} value={sponsorName}
          onChange={e => setSponsorName(e.target.value)} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Click-through URL (https://…)
        <input type="url" value={sponsorUrl}
          onChange={e => setSponsorUrl(e.target.value)}
          placeholder="https://example.com" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Logo image URL (https://…)
        <input type="url" value={sponsorImageUrl}
          onChange={e => setSponsorImageUrl(e.target.value)}
          placeholder="https://example.com/logo.png" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Contact email
        <input type="email" value={buyerEmail}
          onChange={e => setBuyerEmail(e.target.value)}
          placeholder="you@brand.com" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Months
        <input type="number" min={1} max={12} value={months}
          onChange={e => setMonths(Math.min(12, Math.max(1, parseInt(e.target.value) || 1)))}
          style={inputStyle} />
      </label>

      <div style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 4 }}>
        Total: <strong>{fmtPrice(total, slot.currency)}</strong>
      </div>

      {err && (
        <div role="alert" style={{ fontSize: 13, color: '#fca5a5' }}>{err}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !sponsorName.trim()}>
          {busy ? 'Redirecting…' : 'Continue to payment'}
        </button>
      </div>
    </form>
  );
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' };
const inputStyle = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 10px',
  color: 'var(--text-primary)',
  fontSize: 14,
};
