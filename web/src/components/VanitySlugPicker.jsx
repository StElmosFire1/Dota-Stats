import React from 'react';
import { Link } from 'react-router-dom';
import {
  getMyVanitySlug, checkVanitySlugAvailability,
  claimMyVanitySlug, releaseMyVanitySlug,
  getVanityUrlPrice, purchaseVanityUrlStripe,
  spendCoinsOnSku,
} from '../api';

// Task #208 / Task #740 — Shared vanity slug picker. Used in both Settings →
// Profile and the Cosmetics Shop identity section.
// Access: purchased "Custom URL" add-on (Stripe or coins) OR existing slug
// (grandfathered). Pro alone no longer grants access.
// Availability is debounced (~300ms) on input change.
export default function VanitySlugPicker({ compact = false }) {
  const [state, setState] = React.useState({
    loading: true, slug: null, hasPerk: false, grandfathered: false, canClaim: false,
  });
  const [draft, setDraft] = React.useState('');
  const [check, setCheck] = React.useState({ status: 'idle', message: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [msg, setMsg] = React.useState(null);
  const debounceRef = React.useRef(null);

  // Buy-path state (only loaded when user lacks access)
  const [price, setPrice] = React.useState(null);
  const [buying, setBuying] = React.useState(false);
  const [coinBuying, setCoinBuying] = React.useState(false);
  const [buyFlash, setBuyFlash] = React.useState(null);

  const reload = React.useCallback(async () => {
    try {
      const data = await getMyVanitySlug();
      setState({
        loading: false,
        slug: data?.slug || null,
        hasPerk: !!data?.has_perk,
        grandfathered: !!data?.grandfathered,
        canClaim: !!data?.can_claim,
      });
      setDraft(data?.slug || '');
    } catch (e) {
      setState(s => ({ ...s, loading: false }));
      setError(e.message || 'Failed to load slug.');
    }
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  // Load price data only when the user lacks access (to show buy buttons)
  React.useEffect(() => {
    if (!state.loading && !state.canClaim) {
      getVanityUrlPrice().then(setPrice).catch(() => {});
    }
  }, [state.loading, state.canClaim]);

  const onChangeDraft = (val) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
    setDraft(cleaned);
    setError(null); setMsg(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!cleaned || cleaned === state.slug) {
      setCheck({ status: 'idle', message: '' });
      return;
    }
    setCheck({ status: 'checking', message: 'Checking…' });
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await checkVanitySlugAvailability(cleaned);
        if (r?.available) setCheck({ status: 'ok', message: 'Available' });
        else setCheck({ status: 'taken', message: r?.reason || 'Unavailable' });
      } catch (e) {
        setCheck({ status: 'taken', message: e.message || 'Unavailable' });
      }
    }, 300);
  };

  const onClaim = async () => {
    setError(null); setMsg(null); setBusy(true);
    try {
      await claimMyVanitySlug(draft);
      setMsg(`Claimed /p/${draft}`);
      await reload();
    } catch (e) {
      setError(e.message || 'Failed to claim slug.');
    }
    setBusy(false);
  };

  const onRelease = async () => {
    if (!window.confirm(`Release /p/${state.slug}? You'll have a 30-day cooldown before anyone else can claim it.`)) return;
    setError(null); setMsg(null); setBusy(true);
    try {
      await releaseMyVanitySlug();
      setMsg('Slug released.');
      setDraft('');
      await reload();
    } catch (e) {
      setError(e.message || 'Failed to release slug.');
    }
    setBusy(false);
  };

  const onBuyStripe = async () => {
    setBuying(true); setBuyFlash(null);
    try {
      const r = await purchaseVanityUrlStripe();
      if (r?.url) { window.location.href = r.url; return; }
      setBuyFlash({ ok: false, msg: r?.error || 'Could not start checkout.' });
    } catch (e) {
      setBuyFlash({ ok: false, msg: e.message || 'Checkout failed.' });
    }
    setBuying(false);
  };

  const onBuyCoins = async () => {
    setCoinBuying(true); setBuyFlash(null);
    try {
      await spendCoinsOnSku('cosmetic:vanity_url');
      await reload();
      setBuyFlash({ ok: true, msg: 'Custom URL unlocked! Claim your slug below.' });
    } catch (e) {
      setBuyFlash({ ok: false, msg: e.message || 'Coin spend failed.' });
    }
    setCoinBuying(false);
  };

  const canEdit = state.canClaim;
  const canSave = canEdit && draft && draft !== state.slug && check.status === 'ok' && !busy;

  const accessLabel = state.hasPerk
    ? 'Custom URL add-on active — claim, change, or release at any time.'
    : state.grandfathered
      ? 'Your existing slug is grandfathered in — claim, change, or release at any time.'
      : null;

  if (state.loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div>
      {!compact && accessLabel ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0, marginBottom: 10 }}>
          Claim a short link to your profile, like <code>/p/your-name</code>.
          3–24 chars, lowercase a–z / 0–9 / hyphen. {accessLabel}
        </p>
      ) : !compact && !canEdit ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0, marginBottom: 10 }}>
          Claim a short link to your profile, like <code>/p/your-name</code>.
          3–24 chars, lowercase a–z / 0–9 / hyphen.
          Purchase the Custom URL add-on below to get started.
        </p>
      ) : null}

      {state.slug ? (
        <div style={{
          padding: '8px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.10)',
          border: '1px solid #16a34a55', color: 'var(--text-primary)', fontSize: 13,
          marginBottom: 10,
        }}>
          Current: <strong>/p/{state.slug}</strong>
        </div>
      ) : null}

      {canEdit ? (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/p/</span>
            <input
              type="text"
              value={draft}
              onChange={(e) => onChangeDraft(e.target.value)}
              placeholder="your-name"
              disabled={busy}
              maxLength={24}
              aria-label="Vanity slug"
              style={{
                flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: 14,
                fontFamily: 'monospace', letterSpacing: 0.4,
              }}
            />
            <button type="button" className="btn btn-small"
              onClick={onClaim} disabled={!canSave}>
              {busy ? 'Saving…' : state.slug ? 'Change' : 'Claim'}
            </button>
            {state.slug ? (
              <button type="button" className="btn btn-small"
                onClick={onRelease} disabled={busy}
                style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}>
                Release
              </button>
            ) : null}
          </div>

          {check.status !== 'idle' && draft && draft !== state.slug ? (
            <div style={{
              marginTop: 6, fontSize: 12,
              color: check.status === 'ok' ? '#22c55e'
                : check.status === 'checking' ? 'var(--text-muted)'
                : '#ef4444',
            }}>{check.message}</div>
          ) : null}
        </>
      ) : (
        /* No access — show inline purchase options */
        <div style={{ marginTop: 4 }}>
          {buyFlash ? (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 13,
              background: buyFlash.ok ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
              border: `1px solid ${buyFlash.ok ? '#16a34a55' : '#ef444455'}`,
              color: buyFlash.ok ? '#22c55e' : '#ef4444',
            }} role="alert">{buyFlash.msg}</div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onBuyStripe}
              disabled={buying}
              aria-label={price?.stripe_cents ? `Buy Custom URL for $${(price.stripe_cents / 100).toFixed(2)}` : 'Buy Custom URL'}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'var(--accent)', color: '#fff', border: 'none',
                opacity: buying ? 0.6 : 1,
              }}
            >
              {buying ? 'Redirecting…' : price?.stripe_cents ? `Buy — $${(price.stripe_cents / 100).toFixed(2)}` : 'Buy Custom URL'}
            </button>

            {price?.coin_price ? (
              <button
                type="button"
                onClick={onBuyCoins}
                disabled={coinBuying}
                aria-label={`Spend ${price.coin_price} coins for Custom URL`}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
                  border: '1px solid rgba(251,191,36,0.35)',
                  opacity: coinBuying ? 0.6 : 1,
                }}
              >
                {coinBuying ? 'Unlocking…' : `or ${price.coin_price} 🪙`}
              </button>
            ) : null}

            <Link to="/shop" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              View in Shop →
            </Link>
          </div>
        </div>
      )}

      {error && <div style={{ marginTop: 6, color: '#ef4444', fontSize: 12 }}>{error}</div>}
      {msg && <div style={{ marginTop: 6, color: '#22c55e', fontSize: 12 }}>{msg}</div>}
    </div>
  );
}
