// v6.62 / Task #206 — Cosmetics Shop. A single, browsable catalogue of every
// paid cosmetic on OCE Inhouse, grouped by type. Each card surfaces the
// signed-in user's real ownership state ("Owned ✓", "Pick in settings",
// "Unlock with Pro", or "Buy $X.XX") and routes into the existing
// purchase / settings flow rather than running its own checkout, so the
// shop can never drift out of sync with what the server actually accepts.
//
// Task #740 — Press Box editorial re-skin + Custom URL as a standalone
// paid cosmetic (Stripe one-off or coin spend).

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
  buyFounderRingCheckout, spendCoinsOnSku, getActiveLimitedDrops,
  getMyVanitySlug, getVanityUrlPrice, purchaseVanityUrlStripe,
  getMyPurchaseHistory } from '../api';
import FounderRing from '../components/founderRings/FounderRing';
import {
  FOUNDER_RING_SLUGS, FOUNDER_RING_TIER, FOUNDER_RING_LABEL,
  FOUNDER_RING_USD_CENTS, FOUNDER_RING_COIN_PRICE,
} from '../profileCosmetics';
import VanitySlugPicker from '../components/VanitySlugPicker';
import '../styles/pressbox-shop.css';

// Task #312 — preview palettes for the Magazine v3 layout themes.
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

// Mini avatar + frame preview.
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
          fontSize: 18, color: 'var(--pb-muted)', letterSpacing: 0.5,
          ...style,
        }}
      >OA</div>
    </div>
  );
}

// Mini layout-theme preview.
function LayoutThemePreview({ themeId, label }) {
  const p = LAYOUT_THEME_PALETTE[themeId] || LAYOUT_THEME_PALETTE['court-pitch'];
  return (
    <div
      aria-label={`Preview of ${label || themeId} layout theme`}
      style={{
        position: 'relative', height: 70, borderRadius: 6, overflow: 'hidden',
        background: p.bg, border: '1px solid var(--pb-line)', marginBottom: 8,
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

// Title preview.
function TitlePreview({ title }) {
  return (
    <div
      aria-label={`Preview of ${title} title`}
      style={{
        marginBottom: 8, padding: '6px 8px', borderRadius: 4,
        background: 'rgba(0,0,0,0.25)', border: '1px solid var(--pb-line)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-condensed, inherit)', fontWeight: 700, fontSize: 13, color: 'var(--pb-text)' }}>
        PlayerName
      </div>
      <div style={{ fontSize: 11, color: 'var(--pb-amber)', fontStyle: 'italic' }}>
        {title}
      </div>
    </div>
  );
}

// Founders Pass cover preview.
function FoundersRingPreview() {
  return (
    <div
      aria-label="Preview of Founders Pass ring"
      style={{
        position: 'relative', height: 80, borderRadius: 6, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0d1424 0%, #1a2540 100%)',
        border: '1px solid var(--pb-line)', marginBottom: 8,
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

// Theme accent preview.
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
      <div style={{ fontSize: 13, color: 'var(--pb-text)', fontWeight: 700 }}>9.2</div>
      <div style={{ height: 3, marginTop: 4, background: color, borderRadius: 2, width: '70%' }} />
    </div>
  );
}

// Countdown helpers (Task #330 / #338 / #347).
function formatTimeRemaining(targetMs, nowMs) {
  const ms = targetMs - nowMs;
  if (ms <= 0) return 'Ended';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
function formatAbsoluteEndTime(targetMs) {
  const d = new Date(targetMs);
  try {
    return d.toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch { return d.toString(); }
}
function formatTimeSince(startedAtMs, nowMs) {
  const ms = nowMs - startedAtMs;
  if (ms < 0) {
    const absSec = Math.floor(-ms / 1000);
    const d = Math.floor(absSec / 86400);
    const h = Math.floor((absSec % 86400) / 3600);
    const m = Math.floor((absSec % 3600) / 60);
    if (d > 0) return `in ${d}d ${h}h`;
    if (h > 0) return `in ${h}h ${m}m`;
    return `in ${Math.max(1, m)}m`;
  }
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return 'just now';
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ago`;
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
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

// ---- Press Box pills -------------------------------------------------------
function ProPill() {
  return <span className="pb-pill pb-pill-pro">★ PRO</span>;
}
function OwnedPill() {
  return <span className="pb-pill pb-pill-owned">✓ OWNED</span>;
}
function LockedPill() {
  return <span className="pb-pill pb-pill-locked">🔒 LOCKED</span>;
}

// ---- Press Box section header ---------------------------------------------
function ShopSection({ icon, title, sub, children, id }) {
  return (
    <section className="pb-shop-section" id={id}>
      <div className="pb-shop-section-head">
        {icon ? (
          <div className="pb-shop-section-icon" aria-hidden="true">{icon}</div>
        ) : null}
        <div className="pb-shop-section-text">
          <h2 className="pb-shop-section-title">{title}</h2>
          {sub ? <p className="pb-shop-section-sub">{sub}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

// ---- Click-to-toggle preview (a11y: real <button> with aria-expanded) ------
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
      <div className="cosmetic-card__zoom" aria-hidden="true" inert="">
        <span className="cosmetic-card__zoom-label">{label} — enlarged preview</span>
        <span className="cosmetic-card__zoom-inner">{children}</span>
      </div>
    </button>
  );
}

// ---- Cosmetic card ---------------------------------------------------------
function CosmeticCard({ label, sub, badges, action, preview }) {
  return (
    <div className="pb-shop-card cosmetic-card">
      {preview ? (
        <CosmeticCardPreview label={label}>{preview}</CosmeticCardPreview>
      ) : null}
      <div className="pb-shop-card-label-row">
        <span className="pb-shop-card-label">{label}</span>
        {badges}
      </div>
      {sub ? <div className="pb-shop-card-sub">{sub}</div> : null}
      <div className="pb-shop-card-actions">{action}</div>
    </div>
  );
}

export default function CosmeticsShop() {
  const { steamUser } = useSteamAuth();
  const accountId = steamUser?.accountId;
  const signedIn = !!accountId;

  const [isPro, setIsPro] = useState(false);
  const [ownedFrames, setOwnedFrames] = useState([]);
  const [purchasingFrame, setPurchasingFrame] = useState(null);
  const [purchaseError, setPurchaseError] = useState(null);
  const [foundersStatus, setFoundersStatus] = useState(null);
  const [foundersBuying, setFoundersBuying] = useState(false);
  const [ringState, setRingState] = useState({ owned: [], equipped: null });
  const [ringBusy, setRingBusy] = useState(null);
  const [ringError, setRingError] = useState(null);
  const [coinInfo, setCoinInfo] = useState(null);
  const [coinBuying, setCoinBuying] = useState(null);
  const [coinFlash, setCoinFlash] = useState(null);
  const [limitedDrops, setLimitedDrops] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [dropBuying, setDropBuying] = useState(null);
  const [dropError, setDropError] = useState(null);

  // Task #768 — purchase history state.
  const [purchaseHistory, setPurchaseHistory] = useState(null); // null = loading, [] = empty
  const [historyError, setHistoryError] = useState(null);

  // Task #740 — Custom URL purchase state.
  const [vanitySlugData, setVanitySlugData] = useState(null);
  const [vanityUrlPrice, setVanityUrlPrice] = useState(null);
  const [vanityUrlBuying, setVanityUrlBuying] = useState(false);
  const [vanityUrlFlash, setVanityUrlFlash] = useState(null);

  const reloadCoins = React.useCallback(() => {
    if (!signedIn) { setCoinInfo(null); return; }
    fetch('/api/coins/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCoinInfo(d); })
      .catch(() => {});
  }, [signedIn]);

  useEffect(() => { reloadCoins(); }, [reloadCoins]);

  // Load active limited drops + tick.
  const reloadLimitedDrops = React.useCallback(() => {
    getActiveLimitedDrops()
      .then(d => setLimitedDrops(Array.isArray(d?.drops) ? d.drops : []))
      .catch(() => setLimitedDrops([]));
  }, []);
  useEffect(() => { reloadLimitedDrops(); }, [reloadLimitedDrops]);

  // Task #338 — adaptive tick rate.
  const soonestEndsAtMs = React.useMemo(() => {
    let soonest = Infinity;
    for (const d of limitedDrops) {
      const t = new Date(d.available_until).getTime();
      if (Number.isFinite(t) && t > nowMs && t < soonest) soonest = t;
    }
    return soonest;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitedDrops]);
  const tickRegime = (soonestEndsAtMs - nowMs) <= 60 * 60 * 1000 ? 'fast' : 'slow';
  useEffect(() => {
    if (!Number.isFinite(soonestEndsAtMs)) return undefined;
    const intervalMs = tickRegime === 'fast' ? 1000 : 60 * 1000;
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [soonestEndsAtMs, tickRegime]);

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
      getOwnedFrames().then(list => setOwnedFrames(Array.isArray(list) ? list : [])).catch(() => {});
    } catch (e) {
      const msg = e.message || 'Spend failed.';
      const isInsufficient = /insufficient/i.test(msg);
      setCoinFlash({
        ok: false,
        msg: isInsufficient ? `${msg} Top up your balance.` : msg,
        topUpLink: isInsufficient,
      });
    } finally {
      setCoinBuying(null);
    }
  }

  // Task #330 — buy a limited drop.
  async function buyLimitedDropStripe(drop) {
    setDropBuying(drop.id); setDropError(null);
    try {
      const kind = String(drop.kind || '').toLowerCase();
      const skuRaw = String(drop.sku || '');
      const skuTail = skuRaw.includes(':') ? skuRaw.split(':').slice(1).join(':') : skuRaw;
      let url = null;
      if (kind === 'frame') {
        const res = await purchaseFrameCheckout(skuTail);
        url = res?.url || null;
      } else if (kind === 'founder_ring' || kind === 'founders_ring') {
        const res = await buyFounderRingCheckout(skuTail);
        url = res?.url || null;
      } else {
        throw new Error(`No Stripe checkout for kind "${drop.kind}". Use the coin button if available.`);
      }
      if (url) window.location.assign(url);
      else setDropError('Checkout did not return a URL.');
    } catch (err) {
      setDropError(err?.message || 'Failed to start checkout.');
    } finally {
      setDropBuying(null);
    }
  }
  async function buyLimitedDropCoins(drop) {
    setDropBuying(drop.id); setDropError(null);
    try {
      await spendCoinsOnSku(String(drop.sku || ''));
      reloadCoins();
      reloadLimitedDrops();
    } catch (err) {
      setDropError(err?.message || 'Failed to spend coins.');
    } finally {
      setDropBuying(null);
    }
  }

  // Task #740 — Custom URL purchase handlers.
  const reloadVanitySlug = React.useCallback(async () => {
    if (!signedIn) return;
    try {
      const d = await getMyVanitySlug();
      setVanitySlugData(d);
    } catch { /* best-effort */ }
  }, [signedIn]);

  async function buyVanityUrlStripe() {
    setVanityUrlBuying(true); setVanityUrlFlash(null);
    try {
      const res = await purchaseVanityUrlStripe();
      if (res?.url) window.location.assign(res.url);
      else setVanityUrlFlash({ ok: false, msg: 'Checkout did not return a URL.' });
    } catch (e) {
      setVanityUrlFlash({ ok: false, msg: e.message || 'Failed to start checkout.' });
    } finally {
      setVanityUrlBuying(false);
    }
  }

  async function buyVanityUrlCoins() {
    const sku = 'cosmetic:vanity_url';
    const coinPrice = coinInfo?.prices?.[sku];
    if (!coinPrice) return;
    setCoinBuying(sku); setVanityUrlFlash(null);
    try {
      const r = await fetch('/api/coins/spend', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setVanityUrlFlash({ ok: true, msg: `Custom URL unlocked! Claim your slug in Settings → Profile.` });
      reloadCoins();
      reloadVanitySlug();
    } catch (e) {
      const msg = e.message || 'Spend failed.';
      setVanityUrlFlash({
        ok: false,
        msg: /insufficient/i.test(msg) ? `${msg} Top up your balance.` : msg,
        topUpLink: /insufficient/i.test(msg),
      });
    } finally {
      setCoinBuying(null);
    }
  }

  useEffect(() => {
    let alive = true;
    getFoundersRingStatus()
      .then(s => { if (alive) setFoundersStatus(s || null); })
      .catch(() => {});
    // Task #740 — load vanity slug state + URL prices (public endpoint).
    getVanityUrlPrice()
      .then(p => { if (alive && p) setVanityUrlPrice(p); })
      .catch(() => {});
    if (signedIn) {
      listMyFounderRings()
        .then(d => { if (alive && d) setRingState({ owned: d.owned || [], equipped: d.equipped || null }); })
        .catch(() => {});
      reloadVanitySlug();
    } else {
      setRingState({ owned: [], equipped: null });
    }
    // Task #768 — load purchase history for the signed-in user.
    if (signedIn) {
      getMyPurchaseHistory()
        .then(d => { if (alive) { setPurchaseHistory(Array.isArray(d?.items) ? d.items : []); setHistoryError(null); } })
        .catch(e => { if (alive) { setPurchaseHistory([]); setHistoryError(e?.message || 'Failed to load purchase history.'); } });
    } else {
      setPurchaseHistory(null);
      setHistoryError(null);
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
  }, [signedIn, reloadVanitySlug]);

  async function buyFoundersRing() {
    setFoundersBuying(true); setPurchaseError(null);
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
    setPurchasingFrame(frameId); setPurchaseError(null);
    try {
      const res = await purchaseFrameCheckout(frameId);
      const url = res?.url || null;
      if (url) window.location.href = url;
      else setPurchaseError('Could not start checkout.');
    } catch (e) {
      setPurchaseError(e?.message || 'Could not start checkout.');
    }
    setPurchasingFrame(null);
  }

  // ---- Action factories (using pb-shop-btn classes) -----------------------

  function proBundledAction(coinSku) {
    if (!signedIn) {
      return (
        <Link to="/pro" className="pb-shop-btn pb-shop-btn-amber">
          Sign in &amp; go Pro →
        </Link>
      );
    }
    const coinOwned = coinSku ? isCoinOwned(coinSku.split(':')[0], coinSku.split(':')[1]) : false;
    if (isPro || coinOwned) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Link to="/settings/profile" className="pb-shop-btn pb-shop-btn-brass">
            Pick in settings →
          </Link>
          {coinOwned && !isPro ? (
            <span style={{ fontSize: 10, color: 'var(--pb-faint)' }}>Unlocked with 🪙 coins</span>
          ) : null}
        </div>
      );
    }
    const price = coinSku ? coinInfo?.prices?.[coinSku] : null;
    const canAfford = price && (coinInfo?.balance ?? 0) >= price;
    const busy = coinBuying === coinSku;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Link to="/pro" className="pb-shop-btn pb-shop-btn-amber">Unlock with Pro →</Link>
        {price ? (
          <button
            type="button"
            disabled={busy || !canAfford}
            onClick={() => spendCoins(coinSku)}
            aria-label={canAfford ? `Spend ${price} coins to unlock` : `Need ${price} coins — you have ${coinInfo?.balance ?? 0}`}
            className={`pb-shop-btn pb-shop-btn-coin${!canAfford ? ' disabled-coin' : ''}`}
          >
            {busy ? 'Unlocking…' : `or ${price} 🪙`}
          </button>
        ) : null}
      </div>
    );
  }

  function frameAction(frameId) {
    if (!signedIn) {
      return (
        <Link to="/pro" className="pb-shop-btn pb-shop-btn-amber">Sign in to purchase →</Link>
      );
    }
    const owned = ownedFrames.includes(frameId) || (frameId === 'gold' && isPro);
    if (owned) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="pb-shop-btn pb-shop-btn-owned">✓ Owned</span>
          <Link to="/settings/profile" style={{ fontSize: 11, color: 'var(--pb-muted)' }}>
            Apply in settings →
          </Link>
        </div>
      );
    }
    if (frameId === 'gold') {
      return <Link to="/pro" className="pb-shop-btn pb-shop-btn-amber">Unlock with Pro →</Link>;
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
          className="pb-shop-btn pb-shop-btn-brass"
        >
          {buying ? 'Starting checkout…' : `Buy ${formatPrice(price)}`}
        </button>
        {coinPrice ? (
          <button
            type="button"
            disabled={coinBusy || !canAffordCoins}
            onClick={() => spendCoins(coinSku)}
            aria-label={canAffordCoins ? `Spend ${coinPrice} coins to unlock` : `Need ${coinPrice} coins — you have ${coinInfo?.balance ?? 0}`}
            className={`pb-shop-btn pb-shop-btn-coin${!canAffordCoins ? ' disabled-coin' : ''}`}
          >
            {coinBusy ? 'Unlocking…' : `or ${coinPrice} 🪙`}
          </button>
        ) : null}
        {!isPro && (
          <Link to="/pro" style={{ fontSize: 11, color: 'var(--pb-muted)' }}>
            …or unlock all with Pro →
          </Link>
        )}
      </div>
    );
  }

  // Task #740 — vanity URL purchase cards.
  const vanityOwned = vanitySlugData?.can_claim || false;
  const vanityGrandfathered = vanitySlugData?.grandfathered || false;
  const vanityStripeCents = vanityUrlPrice?.stripe_cents;
  const vanityCoinPrice = coinInfo?.prices?.['cosmetic:vanity_url'] ?? vanityUrlPrice?.coin_price;
  const vanityBusy = vanityUrlBuying;
  const vanityCoinBusy = coinBuying === 'cosmetic:vanity_url';
  const vanityCanAffordCoins = vanityCoinPrice && (coinInfo?.balance ?? 0) >= vanityCoinPrice;

  return (
    <div className="pb-shop">
      {/* ---- Page hero ------------------------------------------------- */}
      <div className="pb-shop-hero">
        <div className="pb-shop-hero-inner">
          <div className="pb-eyebrow">OCE Inhouse</div>
          <h1 className="pb-shop-title">Cosmetics Shop</h1>
          <p className="pb-shop-lede">
            Every paid cosmetic on OCE Inhouse, in one place. Most cosmetics unlock
            via the <Link to="/pro" style={{ color: 'var(--pb-amber)' }}>Pro membership</Link>.
            Profile frames and Custom URL are also available as one-time individual purchases — no Pro required.
            {signedIn
              ? ' Your ownership status is shown on each card.'
              : ' Sign in with Steam to start applying cosmetics.'}
          </p>
          {purchaseError ? (
            <div className="pb-shop-flash err" role="alert">{purchaseError}</div>
          ) : null}
          {signedIn && coinInfo ? (
            <div className="pb-shop-coin-banner">
              <span className="pb-shop-coin-amount">🪙 {Number(coinInfo.balance || 0).toLocaleString()}</span>
              <span className="pb-shop-coin-desc">
                Spendable · {Number(coinInfo.lifetime || 0).toLocaleString()} earned all-time.
                Earn coins by playing inhouses (+10 per match ≥ 20 min, +5 if you win, soft cap 100/day).
              </span>
            </div>
          ) : null}
          {coinFlash ? (
            <div className={`pb-shop-flash${coinFlash.ok ? ' ok' : ' err'}`} role="alert" style={{ marginTop: 10 }}>
              {coinFlash.msg}
              {coinFlash.topUpLink ? (
                <> <a href="/coins/buy" style={{ color: '#fbbf24', fontWeight: 600 }}>Buy coins →</a></>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ---- Limited drops (Task #330) ------------------------------------- */}
      {limitedDrops.length > 0 && (() => {
        const active = limitedDrops.filter(d => new Date(d.available_until).getTime() > nowMs);
        if (!active.length) return null;
        return (
          <ShopSection
            icon="⚡"
            title="Available Now — Limited Drop"
            sub="A rotating selection of cosmetics, only available for a short window. Once the timer hits zero (or the cap sells out), they're gone."
          >
            {dropError ? (
              <div className="pb-shop-flash err" role="alert" style={{ marginBottom: 12 }}>{dropError}</div>
            ) : null}
            <div className="pb-shop-grid">
              {active.map(drop => {
                const endsAtMs = new Date(drop.available_until).getTime();
                const remaining = formatTimeRemaining(endsAtMs, nowMs);
                const endsAtLocal = formatAbsoluteEndTime(endsAtMs);
                const startedAtMs = drop.available_from ? new Date(drop.available_from).getTime() : null;
                const startedAtLocal = Number.isFinite(startedAtMs) ? formatAbsoluteEndTime(startedAtMs) : null;
                const startedAgo = Number.isFinite(startedAtMs) ? formatTimeSince(startedAtMs, nowMs) : null;
                const sold = Number(drop.quantity_sold || 0);
                const cap = drop.quantity_cap != null ? Number(drop.quantity_cap) : null;
                const soldOut = cap != null && sold >= cap;
                const busy = dropBuying === drop.id;
                const hasStripe = drop.price_cents != null;
                const hasCoins = drop.coin_price != null;
                const endsLine = (
                  <span title={new Date(endsAtMs).toString()}>
                    <span style={{ color: 'var(--pb-text)', fontWeight: 600 }}>Ends {endsAtLocal}</span>
                    <span style={{ color: 'var(--pb-muted)' }}>{' · in '}{remaining}</span>
                  </span>
                );
                const startedLine = startedAtLocal ? (
                  <span title={new Date(startedAtMs).toString()} style={{ color: 'var(--pb-muted)' }}>
                    Started {startedAtLocal} · {startedAgo}
                  </span>
                ) : null;
                const kindLabel = String(drop.kind || '').replace(/_/g, ' ');
                const capLabel = cap != null ? `${sold} / ${cap} sold` : null;
                const subNode = (
                  <span>
                    {kindLabel}{' · '}{endsLine}
                    {startedLine ? <> {' · '}{startedLine}</> : null}
                    {capLabel ? <> {' · '}{capLabel}</> : null}
                  </span>
                );
                return (
                  <CosmeticCard
                    key={drop.id}
                    label={drop.label || drop.sku}
                    sub={subNode}
                    badges={soldOut ? <LockedPill /> : <ProPill />}
                    action={
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {drop.description ? (
                          <div style={{ fontSize: 11, color: 'var(--pb-faint)' }}>{drop.description}</div>
                        ) : null}
                        {hasStripe ? (
                          <button
                            type="button"
                            disabled={busy || soldOut || !signedIn}
                            onClick={() => buyLimitedDropStripe(drop)}
                            aria-label={!signedIn ? 'Sign in to buy' : soldOut ? 'Sold out' : `Buy for ${formatPrice(drop.price_cents)}`}
                            className="pb-shop-btn pb-shop-btn-brass"
                          >
                            {soldOut ? 'Sold out' : busy ? 'Starting checkout…' : `Buy ${formatPrice(drop.price_cents)}`}
                          </button>
                        ) : null}
                        {hasCoins ? (
                          <button
                            type="button"
                            disabled={busy || soldOut || !signedIn}
                            onClick={() => buyLimitedDropCoins(drop)}
                            aria-label={!signedIn ? 'Sign in to spend coins' : soldOut ? 'Sold out' : `Spend ${drop.coin_price} coins`}
                            className="pb-shop-btn pb-shop-btn-coin"
                          >
                            {soldOut ? 'Sold out' : busy ? 'Unlocking…' : `${hasStripe ? 'or ' : ''}${drop.coin_price} 🪙`}
                          </button>
                        ) : null}
                        {!signedIn ? (
                          <Link to="/login" style={{ fontSize: 11, color: 'var(--pb-muted)' }}>
                            Sign in to purchase →
                          </Link>
                        ) : null}
                      </div>
                    }
                  />
                );
              })}
            </div>
          </ShopSection>
        );
      })()}

      {/* ---- Founders Pass (Task #207) ------------------------------------- */}
      <ShopSection
        icon="🏅"
        title="Founders Pass"
        sub="A limited, one-time founder badge: a brass→amber ring around your Magazine v3 cover banner, forever. Strictly capped — once they're gone, they're gone."
        id="founders-pass"
      >
        <div className="pb-shop-grid">
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
                <Link to="/login" className="pb-shop-btn pb-shop-btn-amber">Sign in to purchase →</Link>
              ) : foundersStatus?.owned ? (
                <span className="pb-shop-btn pb-shop-btn-owned">✓ Owned</span>
              ) : foundersStatus?.sold_out ? (
                <span className="pb-shop-btn pb-shop-btn-owned" style={{ background: 'rgba(75,85,99,0.18)', color: '#9ca3af', borderColor: '#4b556355' }}>
                  Sold out
                </span>
              ) : (
                <button
                  type="button"
                  disabled={foundersBuying || !foundersStatus}
                  onClick={buyFoundersRing}
                  className="pb-shop-btn pb-shop-btn-brass"
                >
                  {foundersBuying
                    ? 'Starting checkout…'
                    : `Buy ${formatPrice(foundersStatus?.price_cents ?? 999)}`}
                </button>
              )
            }
          />
        </div>
      </ShopSection>

      {/* ---- Founders Rings (Task #314) ------------------------------------ */}
      <ShopSection
        icon="💍"
        title="Founders Rings"
        sub="A growing collection of cover-ring designs. Buy individually or pick up Inscribed with the Founders Pack. Only one ring is equipped at a time."
      >
        {ringError && (
          <div className="pb-shop-flash err" role="alert" style={{ marginBottom: 12 }}>{ringError}</div>
        )}
        <div className="pb-shop-grid">
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
                return <Link to="/login" className="pb-shop-btn pb-shop-btn-amber">Sign in →</Link>;
              }
              if (owned) {
                return (
                  <button type="button" onClick={equipAction} disabled={busy}
                          aria-pressed={equipped}
                          className={`pb-shop-btn ${equipped ? 'pb-shop-btn-owned' : 'pb-shop-btn-brass'}`}>
                    {busy ? '…' : equipped ? '✓ Equipped (click to unequip)' : 'Equip'}
                  </button>
                );
              }
              if (isInscribed) {
                return (
                  <a href="#founders-pass" onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('founders-pass')?.scrollIntoView?.({ behavior: 'smooth' });
                  }} className="pb-shop-btn pb-shop-btn-amber">
                    See Founders Pass ↑
                  </a>
                );
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button type="button" onClick={buyStripe} disabled={busy}
                          className="pb-shop-btn pb-shop-btn-brass">
                    {busy ? 'Starting checkout…' : `Buy ${formatPrice(usdCents)}`}
                  </button>
                  <button type="button" onClick={buyCoins} disabled={busy}
                          className="pb-shop-btn pb-shop-btn-coin">
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
      </ShopSection>

      {/* ---- Custom URL (Task #740) ----------------------------------------
           Standalone paid cosmetic — Stripe one-off ($12 AUD default) or
           2500 🪙. Any signed-in player can buy; also bundled with Pro. */}
      <ShopSection
        icon="🔗"
        title="Identity · Custom URL"
        sub="Claim a permanent short link to your player profile. Available to any signed-in player — no Pro required."
      >
        {vanityUrlFlash ? (
          <div className={`pb-shop-flash${vanityUrlFlash.ok ? ' ok' : ' err'}`} role="alert" style={{ marginBottom: 16 }}>
            {vanityUrlFlash.msg}
            {vanityUrlFlash.topUpLink ? (
              <> <a href="/coins/buy" style={{ color: '#fbbf24', fontWeight: 600 }}>Buy coins →</a></>
            ) : null}
          </div>
        ) : null}

        <div className="pb-shop-url-card">
          <div className="pb-shop-url-left">
            <div className="pb-eyebrow">Permanent · lifetime ownership</div>
            <h3 className="pb-shop-url-title">Custom Profile URL</h3>
            <p className="pb-shop-url-desc">
              Choose your own short address like <code style={{ color: 'var(--pb-brass-bright)' }}>/p/your-name</code> and share
              it anywhere. Claim it, change it, or release it at any time.
              One-time purchase — no Pro membership required.
            </p>
            <div className="pb-shop-url-preview">oceinhouse.gg/p/your-name</div>
            <ul className="pb-shop-url-rules">
              <li className="pb-shop-url-rule">3–24 characters</li>
              <li className="pb-shop-url-rule">Lowercase a–z, 0–9, hyphen only</li>
              <li className="pb-shop-url-rule">30-day cooldown after release</li>
              <li className="pb-shop-url-rule">One active slug per account</li>
            </ul>
          </div>

          <div className="pb-shop-url-right">
            {!signedIn ? (
              <>
                <div className="pb-shop-url-price-tag">
                  <span className="pb-shop-url-price-label">One-time purchase</span>
                  <span className="pb-shop-url-price-amount">
                    {vanityStripeCents ? formatPrice(vanityStripeCents) : '$12.00'}
                  </span>
                </div>
                {vanityCoinPrice ? (
                  <div className="pb-shop-url-price-tag">
                    <span className="pb-shop-url-price-label">or with coins</span>
                    <span className="pb-shop-url-price-amount" style={{ color: '#fbbf24' }}>
                      {vanityCoinPrice} 🪙
                    </span>
                  </div>
                ) : null}
                <Link to="/login" className="pb-shop-btn pb-shop-btn-amber">
                  Sign in to purchase →
                </Link>
              </>
            ) : vanityOwned ? (
              <>
                <span className="pb-pill pb-pill-owned" style={{ alignSelf: 'flex-start', fontSize: 11 }}>
                  ✓ OWNED
                </span>
                {vanityGrandfathered ? (
                  <div style={{ fontSize: 11, color: 'var(--pb-muted)', lineHeight: 1.4, marginBottom: 2 }}>
                    Grandfathered from an earlier plan — your slug and full management rights are preserved.
                  </div>
                ) : null}
                <div className="pb-shop-url-price-tag" style={{ background: 'rgba(22,163,74,0.07)', borderColor: 'rgba(22,163,74,0.25)' }}>
                  <span className="pb-shop-url-price-label">Current slug</span>
                  <span className="pb-shop-url-price-amount" style={{ fontSize: 15 }}>
                    {vanitySlugData?.slug ? `/p/${vanitySlugData.slug}` : 'Not yet claimed'}
                  </span>
                </div>
                <VanitySlugPicker compact />
                <Link to="/settings/profile" style={{ fontSize: 12, color: 'var(--pb-muted)' }}>
                  Manage in Settings →
                </Link>
              </>
            ) : (
              <>
                <div className="pb-shop-url-price-tag">
                  <span className="pb-shop-url-price-label">One-time purchase</span>
                  <span className="pb-shop-url-price-amount">
                    {vanityStripeCents ? formatPrice(vanityStripeCents) : '$12.00'}
                  </span>
                </div>
                {vanityCoinPrice ? (
                  <div className="pb-shop-url-price-tag">
                    <span className="pb-shop-url-price-label">or with coins</span>
                    <span className="pb-shop-url-price-amount" style={{ color: '#fbbf24' }}>
                      {vanityCoinPrice} 🪙
                    </span>
                  </div>
                ) : null}
                {vanityStripeCents ? (
                  <button
                    type="button"
                    disabled={vanityBusy}
                    onClick={buyVanityUrlStripe}
                    className="pb-shop-btn pb-shop-btn-amber"
                    aria-label={`Buy Custom URL for ${formatPrice(vanityStripeCents)}`}
                  >
                    {vanityBusy ? 'Redirecting to checkout…' : `Buy ${formatPrice(vanityStripeCents)} →`}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="pb-shop-btn pb-shop-btn-brass"
                  >
                    Loading…
                  </button>
                )}
                {vanityCoinPrice ? (
                  <button
                    type="button"
                    disabled={vanityCoinBusy || !vanityCanAffordCoins}
                    onClick={buyVanityUrlCoins}
                    aria-label={vanityCanAffordCoins ? `Spend ${vanityCoinPrice} coins for Custom URL` : `Need ${vanityCoinPrice} coins — you have ${coinInfo?.balance ?? 0}`}
                    className={`pb-shop-btn pb-shop-btn-coin${!vanityCanAffordCoins ? ' disabled-coin' : ''}`}
                  >
                    {vanityCoinBusy ? 'Unlocking…' : `or ${vanityCoinPrice} 🪙`}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </ShopSection>

      {/* ---- Voice packs --------------------------------------------------- */}
      <ShopSection
        icon="🎙"
        title="Voice Packs"
        sub="Replace the default chime on the inhouse lobby page with a themed audio pack. Lobby-only — never plays in-game. Bundled with Pro."
      >
        <div className="pb-shop-grid">
          {PREMIUM_VOICE_PACKS.map(p => {
            const m = VOICE_PACK_META[p] || { label: p, sub: '' };
            const coinOwned = isCoinOwned('voice_pack', p);
            const owned = signedIn && (isPro || coinOwned);
            return (
              <CosmeticCard
                key={p}
                label={m.label}
                sub={m.sub}
                badges={owned ? <OwnedPill /> : <ProPill />}
                action={proBundledAction(`voice_pack:${p}`)}
              />
            );
          })}
        </div>
      </ShopSection>

      {/* ---- Layout themes ------------------------------------------------- */}
      <ShopSection
        icon="🎨"
        title="Profile Layout Themes"
        sub="Restyles your public profile's Magazine v3 cover banner. Bundled with Pro."
      >
        <div className="pb-shop-grid">
          {PREMIUM_LAYOUT_THEMES.map(t => {
            const m = LAYOUT_THEME_META[t] || { label: t, sub: '' };
            const coinOwned = isCoinOwned('layout_theme', t);
            const owned = signedIn && (isPro || coinOwned);
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
      </ShopSection>

      {/* ---- Profile frames ------------------------------------------------ */}
      <ShopSection
        icon="🖼"
        title="Profile Frames"
        sub="Decorative borders around your profile card. Sold individually; Gold is bundled with Pro."
      >
        <div className="pb-shop-grid">
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
      </ShopSection>

      {/* ---- Custom titles ------------------------------------------------- */}
      <ShopSection
        icon="✏️"
        title="Custom Titles"
        sub="A short flair string under your name on your profile card. Bundled with Pro."
      >
        <div className="pb-shop-grid">
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
      </ShopSection>

      {/* ---- Theme accents ------------------------------------------------- */}
      <ShopSection
        icon="🎨"
        title="Theme Accents"
        sub="The accent colour on your public profile. The Pro-only swatches are below; free swatches live in Settings → Profile."
      >
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {PREMIUM_THEMES.map(c => {
            const owned = signedIn && isPro;
            return (
              <div key={c} className="pb-shop-card" style={{ minWidth: 88, maxWidth: 108, alignItems: 'center', textAlign: 'center', padding: 10 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: c, border: '2px solid var(--pb-line)',
                  marginBottom: 6,
                }} />
                <code style={{ fontSize: 11, color: 'var(--pb-muted)' }}>{c}</code>
                <AccentPreview color={c} />
                {owned ? <OwnedPill /> : <ProPill />}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>{proBundledAction()}</div>
      </ShopSection>

      {/* ---- Purchase history (Task #768) ---------------------------------- */}
      {signedIn ? (
        <ShopSection
          icon="🧾"
          title="Purchase History"
          sub="Everything you've bought — Stripe one-off purchases (Custom URL, frames, founder rings, perks), coin unlocks and coin top-ups."
          id="purchase-history"
        >
          {historyError ? (
            <p style={{ color: 'var(--pb-red, #ef4444)', fontSize: 13 }}>{historyError}</p>
          ) : purchaseHistory === null ? (
            <p style={{ color: 'var(--pb-muted)', fontSize: 13 }}>Loading…</p>
          ) : purchaseHistory.length === 0 ? (
            <p style={{ color: 'var(--pb-muted)', fontSize: 13 }}>
              No purchases yet. Anything you buy here will show up in this list.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--pb-muted)', fontFamily: 'var(--font-condensed, inherit)', letterSpacing: 0.5, fontSize: 11 }}>
                    <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)' }}>ITEM</th>
                    <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)' }}>PAID</th>
                    <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)' }}>METHOD</th>
                    <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)' }}>DATE</th>
                    <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)' }}>RECEIPT</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseHistory.map(item => (
                    <tr key={`${item.type}:${item.key}:${item.purchased_at || ''}`}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)', color: 'var(--pb-text)', textTransform: item.type === 'coin_cosmetic' ? 'capitalize' : 'none' }}>
                        {item.name}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)', color: 'var(--pb-text)' }}>
                        {item.coins_spent != null
                          ? `${item.coins_spent.toLocaleString()} 🪙`
                          : item.amount_cents != null
                            ? `${formatPrice(item.amount_cents)}${item.currency ? ` ${String(item.currency).toUpperCase()}` : ''}`
                            : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)', color: 'var(--pb-muted)' }}>
                        {item.type === 'coin_cosmetic' ? 'Coins'
                          : item.type === 'coin_topup' ? 'Stripe (top-up)'
                          : 'Stripe'}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)', color: 'var(--pb-muted)', whiteSpace: 'nowrap' }}>
                        {item.purchased_at ? new Date(item.purchased_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--pb-line)', whiteSpace: 'nowrap' }}>
                        {item.receipt_url ? (
                          <a
                            href={item.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--pb-amber)', textDecoration: 'underline' }}
                            aria-label={`Open Stripe receipt for ${item.name} in a new tab`}
                          >
                            Receipt ↗
                          </a>
                        ) : (
                          <span style={{ color: 'var(--pb-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ShopSection>
      ) : null}
    </div>
  );
}
