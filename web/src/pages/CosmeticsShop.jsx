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

import React, { useEffect, useState } from 'react';
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
import { getOwnedFrames, purchaseFrameCheckout, getFoundersRingStatus, buyFoundersRingCheckout } from '../api';
import VanitySlugPicker from '../components/VanitySlugPicker';

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

function CosmeticCard({ label, sub, badges, action }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px', minWidth: 220, maxWidth: 280,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
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

  useEffect(() => {
    let alive = true;
    // v6.63 / Task #207 — founders ring availability is public so the
    // "X / 200 claimed · Y remaining" copy always renders, even when the
    // visitor is signed out (they still see "limited" before they have
    // to sign in to actually buy).
    getFoundersRingStatus()
      .then(s => { if (alive) setFoundersStatus(s || null); })
      .catch(() => {});
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
  function proBundledAction() {
    if (!signedIn) {
      return <Link to="/pro" style={actionButtonStyle('pro')}>Sign in & go Pro →</Link>;
    }
    if (isPro) {
      return (
        <Link to="/settings/profile" style={actionButtonStyle('settings')}>
          Pick in settings →
        </Link>
      );
    }
    return <Link to="/pro" style={actionButtonStyle('pro')}>Unlock with Pro →</Link>;
  }

  // Profile frames have three flavours:
  //   - gold: bundled with Pro (cannot be purchased separately)
  //   - rest: purchasable individually OR bundled with Pro
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
          sub="Replace the default church-bell chime on inhouse alerts with a themed voice pack. Bundled with Pro."
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PREMIUM_VOICE_PACKS.map(p => {
            const m = VOICE_PACK_META[p] || { label: p, sub: '' };
            const owned = signedIn && isPro;
            return (
              <CosmeticCard
                key={p}
                label={m.label}
                sub={m.sub}
                badges={owned ? <OwnedPill /> : <ProPill />}
                action={proBundledAction()}
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
                label={m.label}
                sub={m.sub}
                badges={owned ? <OwnedPill /> : <ProPill />}
                action={proBundledAction()}
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
