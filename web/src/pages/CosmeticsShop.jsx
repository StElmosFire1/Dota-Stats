// v6.62 / Task #206 — Cosmetics Shop. A single, browsable catalogue of every
// paid cosmetic on OCE Inhouse, grouped by type. Each card surfaces the
// signed-in user's real ownership state ("Owned ✓", "Pick in settings",
// "Unlock with Pro", or "Buy $X.XX") and routes into the existing
// purchase / settings flow rather than running its own checkout, so the
// shop can never drift out of sync with what the server actually accepts.
//
// Ownership rules:
//   - Voice packs / layout themes / titles / theme accents → bundled with
//     the /pro membership; ownership = isPro.
//   - Profile frames → either purchased individually (in /api/frames/owned)
//     or bundled with Pro (gold). Frame prices mirror the FRAME_PRICES map
//     in src/web/server.js (kept in sync via this comment).

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PREMIUM_TITLES,
  PREMIUM_THEMES,
  PREMIUM_FRAMES,
  FRAME_META,
  PREMIUM_LAYOUT_THEMES,
  LAYOUT_THEME_META,
  PREMIUM_VOICE_PACKS,
  VOICE_PACK_META,
} from '../profileCosmetics';
import { useSteamAuth } from '../context/SteamAuthContext';
import { getOwnedFrames, purchaseFrameCheckout, getFoundersRingStatus, buyFoundersRingCheckout,
  listMyFounderRings, setEquippedFounderRing as apiSetEquippedFounderRing,
  buyFounderRingCheckout, spendCoinsOnSku } from '../api';
import FounderRing from '../components/founderRings/FounderRing';
import {
  FOUNDER_RING_SLUGS, FOUNDER_RING_TIER, FOUNDER_RING_LABEL,
  FOUNDER_RING_USD_CENTS, FOUNDER_RING_COIN_PRICE,
} from '../profileCosmetics';
import VanitySlugPicker from '../components/VanitySlugPicker';

// Task #312 — preview palettes for the Magazine v3 layout themes. Mirrors the
// real `.layout-theme-<id>` CSS-token swaps applied to the live profile cover
// banner, so the swatch the buyer sees here is the same palette they'll get
// after purchase. Six tokens cover the cover-card render: bg, accent, text,
// muted text, plus an optional gradient overlay for holo.
const LAYOUT_THEME_PALETTE = {
  'court-pitch': { bg: '#0d1424', accent: '#c5a975', text: '#f5efe2', muted: '#9ca3af', overlay: null,
                   description: 'Ink-navy + brass' },
  newsprint:     { bg: '#f5efe2', accent: '#8b6914', text: '#1a1a1a', muted: '#5b5240', overlay: null,
                   description: 'Sepia broadsheet' },
  carbon:        { bg: '#0a0a0a', accent: '#f59e0b', text: '#f5f5f5', muted: '#737373', overlay: null,
                   description: 'Pitch-black + amber' },
  holo:          { bg: '#1a0033', accent: '#a855f7', text: '#f5f5ff', muted: '#a5b4fc',
                   overlay: 'linear-gradient(135deg, rgba(168,85,247,0.25) 0%, rgba(6,182,212,0.25) 100%)',
                   description: 'Iridescent purple/cyan' },
  heritage:      { bg: '#2d1810', accent: '#d4a017', text: '#f5e6c8', muted: '#bfa57a', overlay: null,
                   description: 'Warm cigar + gold' },
  broadcast:     { bg: '#0c1117', accent: '#ff6b1a', text: '#f5f5f5', muted: '#9ca3af', overlay: null,
                   description: 'Sport-channel orange' },
};

// Mini avatar + frame preview. Renders the SAME FRAME_META.style as the live
// profile-card wrapper applies, so the buyer sees the exact glow/border.
function FramePreview({ frameId, label }) {
  const style = (FRAME_META[frameId] || {}).style || {};
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
      <div
        aria-label={`Preview of ${label || frameId} frame`}
        style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-condensed, inherit)', fontWeight: 700,
          fontSize: 18, color: 'var(--text-muted)', letterSpacing: 0.5,
          ...style,
        }}
      >OA</div>
    </div>
  );
}

// Mini layout-theme preview. Mimics the Magazine v3 cover banner: theme bg,
// optional gradient overlay, accent stripe, title in theme text colour.
function LayoutThemePreview({ themeId, label }) {
  const p = LAYOUT_THEME_PALETTE[themeId] || LAYOUT_THEME_PALETTE['court-pitch'];
  return (
    <div
      aria-label={`Preview of ${label || themeId} layout theme`}
      style={{
        position: 'relative', height: 70, borderRadius: 6, overflow: 'hidden',
        background: p.bg, border: '1px solid var(--border)', marginBottom: 8,
      }}
    >
      {p.overlay ? (
        <div style={{ position: 'absolute', inset: 0, background: p.overlay }} />
      ) : null}
      <div style={{ position: 'absolute', left: 8, right: 8, top: 8, color: p.text, fontFamily: 'var(--font-condensed, inherit)', fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>
        PLAYER NAME
      </div>
      <div style={{ position: 'absolute', left: 8, top: 26, color: p.muted, fontSize: 10 }}>
        Inhouse Legend
      </div>
      <div style={{ position: 'absolute', left: 8, bottom: 8, right: 8, height: 3, background: p.accent, borderRadius: 2 }} />
      <div style={{ position: 'absolute', right: 8, bottom: 14, color: p.accent, fontFamily: 'var(--font-condensed, inherit)', fontSize: 11, fontWeight: 700 }}>
        7-W STREAK
      </div>
    </div>
  );
}

// v6.83 — VoicePackPreview removed. The per-event picker on
// /settings/profile already lets users audition every pack slot, and
// duplicating it as a shop-card ▶ Play button added clutter without
// covering the full pack. Voice packs render as text-only cards in
// the shop; the popup section of CosmeticCard is skipped when no
// `preview` prop is passed.

// Title preview — renders "PlayerName · <title>" the way it appears under a
// player's name on the profile card subtitle, so the buyer reads it the way
// it will appear.
function TitlePreview({ title }) {
  return (
    <div
      aria-label={`Preview of ${title} title`}
      style={{
        marginBottom: 8, padding: '6px 8px', borderRadius: 4,
        background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-condensed, inherit)', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
        PlayerName
      </div>
      <div style={{ fontSize: 11, color: 'var(--accent)', fontStyle: 'italic' }}>
        {title}
      </div>
    </div>
  );
}

// Founders Pass cover preview — mimics a Magazine v3 cover tile with the
// brass→amber ring applied so buyers see what they're getting.
function FoundersRingPreview() {
  return (
    <div
      aria-label="Preview of Founders Pass ring"
      style={{
        position: 'relative', height: 80, borderRadius: 6, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0d1424 0%, #1a2540 100%)',
        border: '1px solid var(--border)', marginBottom: 8,
        boxShadow: '0 0 0 2px #c5a975, 0 0 0 4px #f59e0b, 0 0 16px rgba(245,158,11,0.5)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, padding: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ color: '#f5efe2', fontFamily: 'var(--font-condensed, inherit)', fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>
          PLAYER NAME
        </div>
        <div style={{ color: '#c5a975', fontFamily: 'var(--font-condensed, inherit)', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
          FOUNDER · #042
        </div>
      </div>
    </div>
  );
}

// Theme accent preview — renders a mini stat-card retinted with the accent
// (border + label + a value bar) so the buyer sees the colour applied in
// context, not just as a swatch.
function AccentPreview({ color }) {
  return (
    <div
      aria-label={`Preview of ${color} accent in context`}
      style={{
        width: 80, padding: 6, borderRadius: 6,
        background: 'rgba(0,0,0,0.25)',
        border: `1px solid ${color}66`,
        marginTop: 6,
      }}
    >
      <div style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>KDA</div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>9.2</div>
      <div style={{ height: 3, marginTop: 4, background: color, borderRadius: 2, width: '70%' }} />
    </div>
  );
}

// Mirrors FRAME_PRICES in src/web/server.js. Keep in sync.
const FRAME_PRICES_CENTS = {
  gold: 299,
  'neon-blue': 299,
  cosmic: 399,
  fire: 399,
};

function formatPrice(cents) {
  if (cents == null) return '';
  return `$${(cents / 100).toFixed(2)}`;
}

function ProPill() {
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 999,
      background: '#3b2a08', color: '#fbbf24', border: '1px solid #fbbf2455',
      marginLeft: 6, fontWeight: 700, letterSpacing: 0.4,
    }}>★ PRO</span>
  );
}

function OwnedPill() {
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 999,
      background: '#0f3a1a', color: '#86efac', border: '1px solid #16a34a55',
      marginLeft: 6, fontWeight: 700, letterSpacing: 0.4,
    }}>✓ OWNED</span>
  );
}

function LockedPill() {
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 999,
      background: '#1a1a1a', color: '#9ca3af', border: '1px solid #4b556355',
      marginLeft: 6, fontWeight: 700, letterSpacing: 0.4,
    }}>🔒 LOCKED</span>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <header style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-condensed, inherit)', fontSize: 22 }}>{title}</h2>
      {sub ? (
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>{sub}</p>
      ) : null}
    </header>
  );
}

function actionButtonStyle(variant) {
  const base = {
    display: 'inline-block', fontSize: 12, fontWeight: 700,
    padding: '6px 12px', borderRadius: 6, textDecoration: 'none',
    border: 'none', cursor: 'pointer',
  };
  if (variant === 'pro') {
    return { ...base, background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', color: '#1a1a1a' };
  }
  if (variant === 'owned') {
    return { ...base, background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid #16a34a55', cursor: 'default' };
  }
  if (variant === 'buy') {
    return { ...base, background: 'rgba(59,130,246,0.18)', color: '#93c5fd', border: '1px solid #3b82f655' };
  }
  // settings
  return { ...base, background: 'rgba(245,158,11,0.12)', color: 'var(--accent)', border: '1px solid var(--border)' };
}

// v6.84 — click-to-toggle preview replaces v6.80-era hover. The wrap is
// now a real <button type="button"> with `aria-expanded`, which makes
// the popup a standard disclosure (announced as "expanded/collapsed" by
// screen readers, Enter/Space keyboard-equivalent to a click).
// Trade-off vs hover: one extra click to peek, but the popup stays open
// while the user inspects it — they can move their mouse off the
// thumbnail without it vanishing, and it doesn't trigger by accident
// when scrolling past. ESC closes, click-outside closes, second click
// on the wrap closes. The hover/focus-within CSS selectors are gone.
function CosmeticCardPreview({ label, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <button
      type="button"
      ref={wrapRef}
      className={`cosmetic-card__preview-wrap${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-label={`Preview: ${label}. ${open ? 'Press to close enlarged preview.' : 'Press to enlarge.'}`}
      onClick={() => setOpen(o => !o)}
    >
      {children}
      {/*
        Zoom clone is `aria-hidden` + `inert` so its duplicated content
        is never announced or focusable. The previews (FramePreview,
        LayoutThemePreview, TitlePreview) are purely presentational so
        there are no interactive descendants to gate — the inert is
        belt-and-braces for any future preview that adds buttons.
      */}
      <div className="cosmetic-card__zoom" aria-hidden="true" inert="">
        <span className="cosmetic-card__zoom-label">{label} — enlarged preview</span>
        <span className="cosmetic-card__zoom-inner">{children}</span>
      </div>
    </button>
  );
}

function CosmeticCard({ label, sub, badges, action, preview }) {
  return (
    <div className="cosmetic-card" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px', minWidth: 220, maxWidth: 280,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {preview ? (
        <CosmeticCardPreview label={label}>{preview}</CosmeticCardPreview>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
        <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{label}</strong>
        {badges}
      </div>
      {sub ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{sub}</div>
      ) : null}
      <div style={{ marginTop: 'auto' }}>{action}</div>
    </div>
  );
}

export default function CosmeticsShop() {
  const { steamUser } = useSteamAuth();
  const accountId = steamUser?.accountId;
  const signedIn = !!accountId;

  // Real per-account state. Ownership API is the source of truth for
  // frames; isPro is loaded from the same /api/me/profile payload that
  // the settings page uses, so the two views can never disagree.
  const [isPro, setIsPro] = useState(false);
  const [ownedFrames, setOwnedFrames] = useState([]);
  const [purchasingFrame, setPurchasingFrame] = useState(null);
  const [purchaseError, setPurchaseError] = useState(null);
  // v6.63 / Task #207 — Founders Pass ring (one-time, capped SKU).
  const [foundersStatus, setFoundersStatus] = useState(null);
  const [foundersBuying, setFoundersBuying] = useState(false);
  // Task #314 / v7.34 — full Founders Ring catalog (10 individually-sold
  // slugs + Inscribed). `ringState` mirrors /api/me/founder-rings:
  // { owned: [slug...], equipped: slug|null }. `ringBusy` is the slug
  // currently being acted on (so we can disable just one card's buttons).
  const [ringState, setRingState] = useState({ owned: [], equipped: null });
  const [ringBusy, setRingBusy] = useState(null);
  const [ringError, setRingError] = useState(null);
  // Task #313 / v6.79 — in-app currency. coinInfo = { balance, lifetime, owned[], prices{} }.
  const [coinInfo, setCoinInfo] = useState(null);
  const [coinBuying, setCoinBuying] = useState(null); // SKU currently in flight
  const [coinFlash, setCoinFlash] = useState(null);   // {ok, msg} for last spend

  const reloadCoins = React.useCallback(() => {
    if (!signedIn) { setCoinInfo(null); return; }
    fetch('/api/coins/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCoinInfo(d); })
      .catch(() => {});
  }, [signedIn]);

  useEffect(() => { reloadCoins(); }, [reloadCoins]);

  const isCoinOwned = React.useCallback((kind, value) => {
    if (!coinInfo?.owned) return false;
    return coinInfo.owned.some(o => o.kind === kind && o.value === value);
  }, [coinInfo]);

  async function spendCoins(sku) {
    setCoinBuying(sku); setCoinFlash(null);
    try {
      const r = await fetch('/api/coins/spend', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setCoinFlash({ ok: true, msg: `Unlocked ${sku} for ${d.spent} 🪙 — apply it in Settings → Profile.` });
      reloadCoins();
      // Frame purchase also affects the legacy ownedFrames list.
      getOwnedFrames().then(list => setOwnedFrames(Array.isArray(list) ? list : [])).catch(() => {});
    } catch (e) {
      setCoinFlash({ ok: false, msg: e.message || 'Spend failed.' });
    } finally {
      setCoinBuying(null);
    }
  }

  useEffect(() => {
    let alive = true;
    // v6.63 / Task #207 — founders ring availability is public so the
    // "X / 200 claimed · Y remaining" copy always renders, even when the
    // visitor is signed out (they still see "limited" before they have
    // to sign in to actually buy).
    getFoundersRingStatus()
      .then(s => { if (alive) setFoundersStatus(s || null); })
      .catch(() => {});
    // Task #314 / v7.34 — load the user's owned + equipped Founders Rings.
    // Public/anon users see the cards but can't buy/equip.
    if (signedIn) {
      listMyFounderRings()
        .then(d => { if (alive && d) setRingState({ owned: d.owned || [], equipped: d.equipped || null }); })
        .catch(() => { /* unauth or transient — leave defaults */ });
    } else {
      setRingState({ owned: [], equipped: null });
    }
    if (!signedIn) { setIsPro(false); setOwnedFrames([]); return () => { alive = false; }; }
    fetch('/api/me/profile', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setIsPro(!!(d && d.is_pro)); })
      .catch(() => {});
    getOwnedFrames()
      .then(list => { if (alive) setOwnedFrames(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [signedIn]);

  async function buyFoundersRing() {
    setFoundersBuying(true);
    setPurchaseError(null);
    try {
      const res = await buyFoundersRingCheckout();
      if (res?.url) window.location.href = res.url;
      else setPurchaseError(res?.error || 'Could not start checkout.');
    } catch (e) {
      setPurchaseError(e?.message || 'Could not start checkout.');
    }
    setFoundersBuying(false);
  }

  async function buyFrame(frameId) {
    setPurchasingFrame(frameId);
    setPurchaseError(null);
    try {
      const url = await purchaseFrameCheckout(frameId);
      if (url) window.location.href = url;
      else setPurchaseError('Could not start checkout.');
    } catch (e) {
      setPurchaseError(e?.message || 'Could not start checkout.');
    }
    setPurchasingFrame(null);
  }

  // ---- Action factories: choose the right CTA per cosmetic + ownership ----

  // Pro-bundled cosmetic (titles, themes, layout themes, voice packs):
  // owned with Pro → "Pick in settings"; otherwise → "Unlock with Pro".
  // Task #313 / v6.79 — also accepts coin-purchase SKU + coin-owned flag so
  // non-Pro buyers can unlock individually with the in-app currency.
  function proBundledAction(coinSku) {
    if (!signedIn) {
      return <Link to="/pro" style={actionButtonStyle('pro')}>Sign in & go Pro →</Link>;
    }
    const coinOwned = coinSku ? isCoinOwned(coinSku.split(':')[0], coinSku.split(':')[1]) : false;
    if (isPro || coinOwned) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Link to="/settings/profile" style={actionButtonStyle('settings')}>Pick in settings →</Link>
          {coinOwned && !isPro ? (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Unlocked with 🪙 coins</span>
          ) : null}
        </div>
      );
    }
    // No Pro, not coin-owned: offer both Pro + coin-buy paths.
    const price = coinSku ? coinInfo?.prices?.[coinSku] : null;
    const canAfford = price && (coinInfo?.balance ?? 0) >= price;
    const busy = coinBuying === coinSku;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Link to="/pro" style={actionButtonStyle('pro')}>Unlock with Pro →</Link>
        {price ? (
          <button
            type="button"
            disabled={busy || !canAfford}
            onClick={() => spendCoins(coinSku)}
            title={canAfford ? `Spend ${price} coins to unlock just this item` : `Need ${price} coins (you have ${coinInfo?.balance ?? 0})`}
            style={{
              ...actionButtonStyle('buy'),
              opacity: busy ? 0.6 : (canAfford ? 1 : 0.5),
              cursor: canAfford ? 'pointer' : 'not-allowed',
              background: canAfford ? 'rgba(245,158,11,0.14)' : 'rgba(75,85,99,0.12)',
              color: canAfford ? '#fbbf24' : '#9ca3af',
              border: `1px solid ${canAfford ? 'rgba(245,158,11,0.5)' : '#4b556355'}`,
            }}
          >
            {busy ? 'Unlocking…' : `or ${price} 🪙`}
          </button>
        ) : null}
      </div>
    );
  }

  // Profile frames have three flavours:
  //   - gold: bundled with Pro (cannot be purchased separately)
  //   - rest: purchasable individually OR bundled with Pro
  // Task #313 / v6.79 — non-gold frames can also be bought with 🪙 coins.
  function frameAction(frameId) {
    if (!signedIn) {
      return <Link to="/pro" style={actionButtonStyle('pro')}>Sign in to purchase →</Link>;
    }
    const owned = ownedFrames.includes(frameId) || (frameId === 'gold' && isPro);
    if (owned) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={actionButtonStyle('owned')}>✓ Owned</span>
          <Link to="/settings/profile" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Apply in settings →
          </Link>
        </div>
      );
    }
    if (frameId === 'gold') {
      return <Link to="/pro" style={actionButtonStyle('pro')}>Unlock with Pro →</Link>;
    }
    const price = FRAME_PRICES_CENTS[frameId];
    const buying = purchasingFrame === frameId;
    const coinSku = `frame:${frameId}`;
    const coinPrice = coinInfo?.prices?.[coinSku];
    const canAffordCoins = coinPrice && (coinInfo?.balance ?? 0) >= coinPrice;
    const coinBusy = coinBuying === coinSku;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          disabled={buying}
          onClick={() => buyFrame(frameId)}
          style={{ ...actionButtonStyle('buy'), opacity: buying ? 0.6 : 1 }}
        >
          {buying ? 'Starting checkout…' : `Buy ${formatPrice(price)}`}
        </button>
        {coinPrice ? (
          <button
            type="button"
            disabled={coinBusy || !canAffordCoins}
            onClick={() => spendCoins(coinSku)}
            title={canAffordCoins ? `Spend ${coinPrice} coins to unlock` : `Need ${coinPrice} coins (you have ${coinInfo?.balance ?? 0})`}
            style={{
              ...actionButtonStyle('buy'),
              opacity: coinBusy ? 0.6 : (canAffordCoins ? 1 : 0.5),
              cursor: canAffordCoins ? 'pointer' : 'not-allowed',
              background: canAffordCoins ? 'rgba(245,158,11,0.14)' : 'rgba(75,85,99,0.12)',
              color: canAffordCoins ? '#fbbf24' : '#9ca3af',
              border: `1px solid ${canAffordCoins ? 'rgba(245,158,11,0.5)' : '#4b556355'}`,
            }}
          >
            {coinBusy ? 'Unlocking…' : `or ${coinPrice} 🪙`}
          </button>
        ) : null}
        {!isPro && (
          <Link to="/pro" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            …or unlock all with Pro →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          margin: 0, fontFamily: 'var(--font-condensed, inherit)',
          fontSize: 32, letterSpacing: 0.5,
        }}>
          Cosmetics Shop
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>
          Every paid cosmetic on OCE Inhouse, in one place. Most cosmetics unlock
          via the <Link to="/pro" style={{ color: 'var(--accent)' }}>Pro membership</Link>;
          profile frames may also be purchased individually.
          {signedIn
            ? ' Your ownership status is shown on each card.'
            : ' Sign in with Steam to start applying cosmetics.'}
        </p>
        {purchaseError ? (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6,
            background: '#3a1414', color: '#fca5a5', border: '1px solid #b91c1c55', fontSize: 13 }}
          >{purchaseError}</div>
        ) : null}
        {/* Task #313 / v6.79 — coin balance banner. Signed-in only; shows the
            current spendable balance + lifetime earned, plus a flash message
            after a successful or failed spend. */}
        {signedIn && coinInfo ? (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.35)',
            display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 13,
          }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24' }}>
              🪙 {Number(coinInfo.balance || 0).toLocaleString()}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              Spendable · {Number(coinInfo.lifetime || 0).toLocaleString()} earned all-time.
              Earn coins by playing inhouses (+10 per match ≥ 20 min, +5 if you win, soft cap 100 per day).
            </span>
          </div>
        ) : null}
        {coinFlash ? (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 6,
            background: coinFlash.ok ? 'rgba(34,197,94,0.1)' : '#3a1414',
            color: coinFlash.ok ? '#86efac' : '#fca5a5',
            border: `1px solid ${coinFlash.ok ? '#16a34a55' : '#b91c1c55'}`,
            fontSize: 13,
          }}>{coinFlash.msg}</div>
        ) : null}
      </div>

      {/* v6.63 / Task #207 — Founders Pass ring. One-time SKU, capped at
          FOUNDERS_RING_CAP (default 200). Server enforces the cap inside
          a single transaction; the status payload here is purely
          informational ("X / 200 sold"). */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          title="Founders Pass"
          sub="A limited, one-time founder badge: a brass→amber ring around your Magazine v3 cover banner, forever. Strictly capped — once they're gone, they're gone."
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <CosmeticCard
            preview={<FoundersRingPreview />}
            label="Founders Pass — cover ring"
            sub={
              foundersStatus
                ? `${foundersStatus.sold ?? 0} / ${foundersStatus.cap ?? 200} sold · ${Math.max(0, (foundersStatus.cap ?? 200) - (foundersStatus.sold ?? 0))} remaining`
                : 'Loading availability…'
            }
            badges={
              !signedIn ? <ProPill />
                : foundersStatus?.owned ? <OwnedPill />
                : foundersStatus?.sold_out ? <LockedPill />
                : null
            }
            action={
              !signedIn ? (
                <Link to="/login" style={actionButtonStyle('pro')}>Sign in to purchase →</Link>
              ) : foundersStatus?.owned ? (
                <span style={actionButtonStyle('owned')}>✓ Owned</span>
              ) : foundersStatus?.sold_out ? (
                <span style={{ ...actionButtonStyle('owned'), background: 'rgba(75,85,99,0.18)', color: '#9ca3af', border: '1px solid #4b556355' }}>
                  Sold out
                </span>
              ) : (
                <button
                  type="button"
                  disabled={foundersBuying || !foundersStatus}
                  onClick={buyFoundersRing}
                  style={{ ...actionButtonStyle('buy'), opacity: foundersBuying ? 0.6 : 1 }}
                >
                  {foundersBuying
                    ? 'Starting checkout…'
                    : `Buy ${formatPrice(foundersStatus?.price_cents ?? 999)}`}
                </button>
              )
            }
          />
        </div>
      </section>

      {/* Task #314 / v7.34 — Founders Rings (10 individually-sold SKUs + the
          bundled Inscribed). Tiered pricing: static rings (Classic, Laurel)
          are $4.99 / 1200 🪙; animated rings are $7.99 / 2000 🪙. The
          Inscribed card is informational only — its CTA defers to the
          Founders Pass section above. Buying via coins is the alt-buy path
          and is deliberately priced above the Stripe equivalent. */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          title="Founders Rings"
          sub="A growing collection of cover-ring designs. Buy individually or pick up Inscribed with the Founders Pack. Only one ring is equipped at a time."
        />
        {ringError && (
          <div role="alert" style={{
            padding: '8px 12px', marginBottom: 12, borderRadius: 8,
            border: '1px solid #b91c1c55', background: '#7f1d1d22', color: '#fca5a5',
            fontSize: 13,
          }}>{ringError}</div>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {FOUNDER_RING_SLUGS.map(slug => {
            const tier = FOUNDER_RING_TIER[slug];
            const label = FOUNDER_RING_LABEL[slug];
            const isInscribed = slug === 'inscribed';
            const owned = ringState.owned.includes(slug);
            const equipped = ringState.equipped === slug;
            const usdCents = isInscribed ? null
              : (tier === 'static' ? FOUNDER_RING_USD_CENTS.static : FOUNDER_RING_USD_CENTS.animated);
            const coinPrice = isInscribed ? null
              : (tier === 'static' ? FOUNDER_RING_COIN_PRICE.static : FOUNDER_RING_COIN_PRICE.animated);
            const busy = ringBusy === slug;

            const tierLabel = tier === 'animated' ? 'Animated'
              : tier === 'static' ? 'Static'
              : 'Bundled with Founders Pack';

            // Equip / unequip handler (toggles equipped state).
            const equipAction = async () => {
              if (!signedIn || busy) return;
              setRingBusy(slug); setRingError(null);
              try {
                const next = equipped ? null : slug;
                const result = await apiSetEquippedFounderRing(next);
                setRingState(s => ({ ...s, equipped: result?.equipped ?? next }));
              } catch (err) {
                setRingError(err.message || 'Failed to update equipped ring');
              } finally {
                setRingBusy(null);
              }
            };

            // Stripe buy (individual ring). Inscribed defers to Founders Pass.
            const buyStripe = async () => {
              if (!signedIn || busy || isInscribed) return;
              setRingBusy(slug); setRingError(null);
              try {
                const result = await buyFounderRingCheckout(slug);
                if (result?.url) window.location.assign(result.url);
                else setRingError('Checkout did not return a URL');
              } catch (err) {
                setRingError(err.message || 'Failed to start checkout');
              } finally {
                setRingBusy(null);
              }
            };

            // Coin alt-buy. Re-loads ownership on success so card flips to
            // the Equip state.
            const buyCoins = async () => {
              if (!signedIn || busy || isInscribed) return;
              setRingBusy(slug); setRingError(null);
              try {
                await spendCoinsOnSku(`founder_ring:${slug}`);
                const fresh = await listMyFounderRings();
                if (fresh) setRingState({ owned: fresh.owned || [], equipped: fresh.equipped || null });
              } catch (err) {
                setRingError(err.message || 'Failed to spend coins');
              } finally {
                setRingBusy(null);
              }
            };

            const action = (() => {
              if (!signedIn) {
                return <Link to="/login" style={actionButtonStyle('pro')}>Sign in →</Link>;
              }
              if (owned) {
                return (
                  <button type="button" onClick={equipAction} disabled={busy}
                          aria-pressed={equipped}
                          style={{ ...actionButtonStyle(equipped ? 'owned' : 'buy'),
                                   opacity: busy ? 0.6 : 1 }}>
                    {busy ? '…' : equipped ? '✓ Equipped (click to unequip)' : 'Equip'}
                  </button>
                );
              }
              if (isInscribed) {
                return (
                  <a href="#founders-pass" onClick={(e) => {
                    e.preventDefault();
                    document.querySelector('section h2')?.scrollIntoView?.({ behavior: 'smooth' });
                  }} style={actionButtonStyle('pro')}>
                    See Founders Pass ↑
                  </a>
                );
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button type="button" onClick={buyStripe} disabled={busy}
                          style={{ ...actionButtonStyle('buy'), opacity: busy ? 0.6 : 1 }}>
                    {busy ? 'Starting checkout…' : `Buy ${formatPrice(usdCents)}`}
                  </button>
                  <button type="button" onClick={buyCoins} disabled={busy}
                          style={{ ...actionButtonStyle('settings'), opacity: busy ? 0.6 : 1, fontSize: 12 }}>
                    {busy ? '…' : `or ${coinPrice} 🪙`}
                  </button>
                </div>
              );
            })();

            return (
              <CosmeticCard
                key={slug}
                preview={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '100%', height: '100%' }}>
                    <FounderRing sku={slug} size={140} disc="emblem" />
                  </div>
                }
                label={label}
                sub={tierLabel}
                badges={
                  equipped ? <OwnedPill /> : owned ? <OwnedPill /> : null
                }
                action={action}
              />
            );
          })}
        </div>
      </section>

      {/* v6.64 / Task #208 — Vanity URL slug. Pro-gated; the picker is the
          shared <VanitySlugPicker/> so the controls match Settings → Profile
          exactly (debounced availability, Claim/Change/Release). */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          title="Identity · Vanity URL"
          sub="Claim a short /p/<your-slug> link to your profile. Pro members only — 3–24 chars, lowercase a–z / 0–9 / hyphen."
        />
        <div style={{
          padding: 16, borderRadius: 10, border: '1px solid var(--border)',
          background: 'var(--bg-card)', maxWidth: 560,
        }}>
          {!signedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Sign in with Steam to claim a vanity URL.
              </div>
              <Link to="/login" style={actionButtonStyle('pro')}>Sign in →</Link>
            </div>
          ) : (
            <VanitySlugPicker compact />
          )}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          title="Voice packs"
          sub="Replace the default church-bell chime on the inhouse lobby page (ready-up, captain promotion, your-pick warning) with a themed audio pack. Lobby-only — never plays while you're in a Dota game. Bundled with Pro."
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PREMIUM_VOICE_PACKS.map(p => {
            const m = VOICE_PACK_META[p] || { label: p, sub: '' };
            const owned = signedIn && isPro;
            return (
              <CosmeticCard
                key={p}
                /* v6.83 — no in-shop audio preview. The per-event picker on
                   /settings/profile already lets users audition every pack
                   slot from a single place; duplicating that as a ▶ Play
                   button per shop card added clutter, broke the hover-zoom
                   popup layout, and gave robot-voice samples that don't
                   match the rest of the site's audio theme. Voice packs
                   show as text-only cards in the shop now. */
                label={m.label}
                sub={m.sub}
                badges={owned ? <OwnedPill /> : <ProPill />}
                action={proBundledAction(`voice_pack:${p}`)}
              />
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          title="Profile layout themes"
          sub="Restyles your public profile's Magazine v3 cover banner. Bundled with Pro."
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PREMIUM_LAYOUT_THEMES.map(t => {
            const m = LAYOUT_THEME_META[t] || { label: t, sub: '' };
            const owned = signedIn && isPro;
            return (
              <CosmeticCard
                key={t}
                preview={<LayoutThemePreview themeId={t} label={m.label} />}
                label={m.label}
                sub={m.sub}
                badges={owned ? <OwnedPill /> : <ProPill />}
                action={proBundledAction(`layout_theme:${t}`)}
              />
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          title="Profile frames"
          sub="Decorative borders around your profile card. Sold individually; gold is bundled with Pro."
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PREMIUM_FRAMES.map(f => {
            const m = FRAME_META[f] || {};
            const owned = signedIn && (ownedFrames.includes(f) || (f === 'gold' && isPro));
            const isGold = f === 'gold';
            const price = FRAME_PRICES_CENTS[f];
            const sub = isGold
              ? 'Bundled with Pro membership'
              : `Sold individually for ${formatPrice(price)} · also bundled with Pro`;
            return (
              <CosmeticCard
                key={f}
                preview={<FramePreview frameId={f} label={m.label} />}
                label={m.label || f}
                sub={sub}
                badges={
                  owned
                    ? <OwnedPill />
                    : (isGold ? <ProPill /> : (signedIn ? <LockedPill /> : <ProPill />))
                }
                action={frameAction(f)}
              />
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          title="Custom titles"
          sub="A short flair string under your name on your profile card. Bundled with Pro."
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PREMIUM_TITLES.map(t => {
            const owned = signedIn && isPro;
            return (
              <CosmeticCard
                key={t}
                preview={<TitlePreview title={t} />}
                label={t}
                badges={owned ? <OwnedPill /> : <ProPill />}
                action={proBundledAction()}
              />
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          title="Theme accents"
          sub="The accent colour on your public profile. The Pro-only swatches are below; free swatches live in /settings/profile."
        />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {PREMIUM_THEMES.map(c => {
            const owned = signedIn && isPro;
            return (
              <div key={c} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: 10, minWidth: 88,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: c, border: '2px solid var(--border)',
                }} />
                <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c}</code>
                <AccentPreview color={c} />
                {owned ? <OwnedPill /> : <ProPill />}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>{proBundledAction()}</div>
      </section>
    </div>
  );
}
