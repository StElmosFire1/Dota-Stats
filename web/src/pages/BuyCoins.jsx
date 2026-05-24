import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getCoinPacks, buyCoinPack } from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';

export default function BuyCoins() {
  const { steamUser } = useSteamAuth() || {};
  const location = useLocation();
  const [packs, setPacks] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    if (qs.get('success') === '1') {
      setFlash({ ok: true, msg: 'Payment received — coins will land in your balance momentarily.' });
    } else if (qs.get('cancelled') === '1') {
      setFlash({ ok: false, msg: 'Checkout cancelled — no charge made.' });
    }
  }, [location.search]);

  useEffect(() => {
    getCoinPacks()
      .then(d => setPacks(d.packs || []))
      .catch(e => setError(e.message));
  }, []);

  async function onBuy(packId) {
    setError(null); setBusy(packId);
    try {
      const r = await buyCoinPack(packId);
      if (r?.url) {
        window.location.href = r.url;
      } else {
        throw new Error('Checkout URL missing');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}>
      <h2 style={{ fontFamily: 'var(--font-condensed)' }}>Buy coins</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Real-money top-ups via Stripe. Coins land in your balance the moment
        Stripe confirms the payment. Use them for cosmetics, founder rings,
        match wagers, or anywhere you see the 🪙 icon.
      </p>

      {!steamUser && (
        <div style={{
          background: 'rgba(245,158,11,.1)', border: '1px solid var(--amber)',
          padding: 12, borderRadius: 8, marginBottom: 16,
        }}>
          Sign in with Steam to buy coins.
        </div>
      )}

      {flash && (
        <div style={{
          padding: 10, borderRadius: 8, marginBottom: 12,
          background: flash.ok ? 'rgba(76,175,80,.12)' : 'rgba(244,67,54,.12)',
          border: `1px solid ${flash.ok ? '#4caf50' : '#f44336'}`,
        }}>{flash.msg}</div>
      )}
      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>}

      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}>
        {packs.map(p => (
          <div key={p.id} style={{
            border: '1px solid var(--border)', borderRadius: 10, padding: 16,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{p.label}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {p.coins.toLocaleString()} 🪙
            </div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-condensed)' }}>
              ${(p.priceCents / 100).toFixed(2)} AUD
            </div>
            <button
              type="button"
              onClick={() => onBuy(p.id)}
              disabled={!steamUser || busy === p.id}
              style={{
                marginTop: 'auto', padding: '8px 12px', borderRadius: 8,
                background: 'var(--accent)', color: 'var(--ink-navy)',
                border: 'none', cursor: steamUser ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
              aria-label={`Buy ${p.label} for ${(p.priceCents / 100).toFixed(2)} AUD`}
            >
              {busy === p.id ? 'Redirecting…' : 'Buy'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
