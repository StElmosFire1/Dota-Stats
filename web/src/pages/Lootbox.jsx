// Task #664 — Lootbox store (full edition only, oceinhouse.gg).
// Task #709 — Cosmetic visuals + stronger open animation.
//
// Coins-only. Three paid box tiers + one free weekly box. The published odds
// rendered here are fetched verbatim from GET /api/lootbox/catalog — the same
// object the server rolls against — so the UI can never advertise odds that
// differ from reality.
//
// Opening a box plays an anticipation shake (rarity-scaled) then pops the
// cosmetic reveal in the shared <Dialog> primitive (focus-trapped, Escape-
// closeable, ARIA-labelled per the a11y house rules). All motion is gated on
// prefers-reduced-motion; reduced-motion users get an instant static reveal.

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Dialog from '../components/Dialog';
import CosmeticPreview from '../components/CosmeticPreview';
import { useSteamAuth } from '../context/SteamAuthContext';
import { RARITY_COLORS } from '../profileCosmetics';
import {
  getLootboxCatalog,
  getLootboxMe,
  openLootbox,
  claimFreeLootbox,
  redeemWildcard,
} from '../api';

function rarityColor(r) {
  return RARITY_COLORS[r] || 'var(--brass, #c5a975)';
}

// Milliseconds of anticipation shake per rarity tier before the reveal pops.
const SHAKE_DURATION = { common: 500, rare: 700, epic: 900, legendary: 1100 };

function OutcomeLine({ result }) {
  if (!result) return null;
  const { outcome, item, refundCoins, proDays } = result;
  if (outcome === 'pro_time') {
    return <strong style={{ color: rarityColor('legendary') }}>{proDays} days of Pro membership granted!</strong>;
  }
  if (outcome === 'new') {
    return <strong style={{ color: rarityColor(item.rarity) }}>New unlock! Added to your collection.</strong>;
  }
  if (outcome === 'dupe_token') {
    return <strong style={{ color: rarityColor('legendary') }}>Duplicate Legendary — a wildcard token was minted.</strong>;
  }
  if (outcome === 'dupe_refund') {
    return <span style={{ color: 'var(--text-muted)' }}>Duplicate — refunded {refundCoins} coins.</span>;
  }
  return null;
}

export default function Lootbox() {
  const { steamUser } = useSteamAuth();
  const accountId = steamUser?.accountId;
  const signedIn = !!accountId;

  const [catalog, setCatalog] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [busyBox, setBusyBox] = useState(null);
  const [reveal, setReveal] = useState(null);
  // 'shake' → anticipation crate animation; 'reveal' → cosmetic card shown.
  const [revealPhase, setRevealPhase] = useState(null);
  const [poolBox, setPoolBox] = useState(null);
  const [redeeming, setRedeeming] = useState(null);
  const [notice, setNotice] = useState(null);

  const revealCloseRef = useRef(null);

  // Advance from shake phase to reveal after the rarity-appropriate duration.
  useEffect(() => {
    if (revealPhase !== 'shake' || !reveal) return;
    const ms = SHAKE_DURATION[reveal.item?.rarity] ?? 700;
    const t = setTimeout(() => setRevealPhase('reveal'), ms);
    return () => clearTimeout(t);
  }, [revealPhase, reveal]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const cat = await getLootboxCatalog();
      setCatalog(cat);
      if (signedIn) {
        const m = await getLootboxMe().catch(() => null);
        setMe(m);
      }
    } catch (e) {
      setError(e.message || 'Failed to load lootboxes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [accountId]);

  async function handleOpen(boxId) {
    if (!signedIn || busyBox) return;
    setBusyBox(boxId);
    setNotice(null);
    try {
      const result = boxId === 'free' ? await claimFreeLootbox() : await openLootbox(boxId);
      setReveal(result);
      // Reduced-motion users get an instant static reveal; others get the shake build-up.
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setRevealPhase(reducedMotion ? 'reveal' : 'shake');
      const m = await getLootboxMe().catch(() => null);
      if (m) setMe(m);
    } catch (e) {
      setNotice({ kind: 'error', text: e.message || 'Could not open box' });
    } finally {
      setBusyBox(null);
    }
  }

  function closeReveal() {
    setReveal(null);
    setRevealPhase(null);
  }

  async function handleRedeem(sku) {
    if (redeeming) return;
    setRedeeming(sku);
    setNotice(null);
    try {
      const r = await redeemWildcard(sku);
      setNotice({ kind: 'ok', text: `Redeemed ${r.item?.label || 'cosmetic'} with a wildcard token.` });
      const m = await getLootboxMe().catch(() => null);
      if (m) setMe(m);
    } catch (e) {
      setNotice({ kind: 'error', text: e.message || 'Could not redeem token' });
    } finally {
      setRedeeming(null);
    }
  }

  const coinBalance = me?.coinBalance ?? null;
  const wildcardTokens = me?.wildcardTokens ?? 0;
  const freeBox = me?.freeBox || null;
  const boxes = catalog?.boxes || [];
  const paidBoxes = boxes.filter((b) => b.id !== 'free');
  const freeBoxCat = boxes.find((b) => b.id === 'free') || null;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-serif, inherit)', fontSize: '2.4rem', margin: 0 }}>Lootboxes</h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: 640 }}>
          Spend coins on crates to unlock profile cosmetics — avatar rings, banners, nameplate effects
          and recap skins. Every box&apos;s odds below are pulled straight from the server, so what you
          see is exactly what you roll against. Boxes favour cosmetics you don&apos;t own yet — you only
          get a duplicate once you own everything in the rolled rarity, and duplicates refund coins
          (legendary dupes mint a wildcard token you can spend on any cosmetic).
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          {signedIn ? (
            <>
              <span className="pb-num" style={{ fontSize: 18 }}>
                💰 {coinBalance != null ? coinBalance.toLocaleString() : '—'} coins
              </span>
              <span className="pb-num" style={{ fontSize: 18 }}>
                🎟️ {wildcardTokens} wildcard {wildcardTokens === 1 ? 'token' : 'tokens'}
              </span>
              <Link to="/coins/buy" style={{ color: 'var(--accent)' }}>Get more coins →</Link>
              <Link to="/collection" style={{ color: 'var(--accent)' }}>View my collection →</Link>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Sign in with Steam to open boxes.</span>
          )}
        </div>
      </header>

      {notice && (
        <div role="status" style={{
          margin: '8px 0 16px', padding: '10px 14px', borderRadius: 8,
          border: `1px solid ${notice.kind === 'error' ? '#ef4444' : '#22c55e'}`,
          color: notice.kind === 'error' ? '#fca5a5' : '#86efac',
          background: 'rgba(0,0,0,0.2)',
        }}>{notice.text}</div>
      )}

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading boxes…</p>}
      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}

      {!loading && !error && (
        <>
          {/* Free weekly box */}
          {freeBoxCat && (
            <section style={{ marginBottom: 28 }}>
              <BoxCard
                box={freeBoxCat}
                free
                signedIn={signedIn}
                busy={busyBox === 'free'}
                freeState={freeBox}
                onOpen={() => handleOpen('free')}
                onViewPool={() => setPoolBox(freeBoxCat)}
              />
            </section>
          )}

          {/* Paid tiers */}
          <section style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}>
            {paidBoxes.map((b) => (
              <BoxCard
                key={b.id}
                box={b}
                signedIn={signedIn}
                busy={busyBox === b.id}
                canAfford={coinBalance == null || coinBalance >= b.price}
                onOpen={() => handleOpen(b.id)}
                onViewPool={() => setPoolBox(b)}
              />
            ))}
          </section>

          {/* Wildcard redemption */}
          {signedIn && wildcardTokens > 0 && catalog && (
            <WildcardSection
              catalog={catalog}
              tokens={wildcardTokens}
              redeeming={redeeming}
              onRedeem={handleRedeem}
            />
          )}

          {/* Recent opens */}
          {signedIn && me?.recent?.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <h2 style={{ fontFamily: 'var(--font-serif, inherit)', fontSize: '1.4rem' }}>Recent opens</h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                {me.recent.slice(0, 12).map((ev) => (
                  <li key={ev.id} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 12,
                    padding: '8px 12px', borderRadius: 6, background: 'var(--bg-card)',
                    borderLeft: `3px solid ${rarityColor(ev.rarity)}`,
                  }}>
                    <span>{ev.item_sku.replace(/^[^:]+:/, '').replace(/-/g, ' ')}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {ev.outcome === 'dupe_refund' ? `+${ev.refund_coins} coins` :
                       ev.outcome === 'dupe_token' ? 'wildcard token' :
                       ev.outcome === 'pro_time' ? `${ev.pro_days}d Pro` : 'new'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Reveal dialog — anticipation shake → cosmetic reveal */}
      <Dialog
        open={!!reveal}
        onClose={closeReveal}
        label="Box opened"
        initialFocusRef={revealCloseRef}
        contentStyle={{
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          borderRadius: 20, padding: 0, maxWidth: 420, width: '90vw',
        }}
      >
        {reveal && revealPhase === 'shake' && (
          <div style={{ padding: '32px 24px 24px', textAlign: 'center' }}>
            <div
              className={`lootbox-crate lootbox-shake-${reveal.item?.rarity || 'common'}`}
              style={{ '--lb-rarity': rarityColor(reveal.item?.rarity) }}
              aria-hidden="true"
            >
              <div className="lootbox-crate-lid" style={{ '--lb-rarity': rarityColor(reveal.item?.rarity) }} />
              <div className="lootbox-crate-line" />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 14, marginBottom: 0 }}>
              Opening…
            </p>
          </div>
        )}
        {reveal && revealPhase === 'reveal' && (
          <div style={{ padding: 24 }}>
            <div
              className="lootbox-reveal-card lootbox-reveal-glow"
              style={{ '--lb-rarity': rarityColor(reveal.item.rarity) }}
            >
              {/* Cosmetic visual */}
              {reveal.item.kind !== 'pro_time' ? (
                <div style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  minHeight: 80, marginBottom: 16, padding: '0 16px',
                }}>
                  <div style={{ width: '100%', maxWidth: 200 }}>
                    <CosmeticPreview
                      kind={reveal.item.kind}
                      value={reveal.item.value}
                      label={reveal.item.label}
                      size="lg"
                    />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 52, marginBottom: 12, lineHeight: 1 }} aria-hidden="true">⭐</div>
              )}
              <div style={{
                textTransform: 'uppercase', letterSpacing: 2, fontSize: 12,
                color: rarityColor(reveal.item.rarity), fontFamily: 'var(--font-condensed, inherit)',
              }}>{reveal.item.rarity}{reveal.item.boxExclusive ? ' · box-exclusive' : ''}</div>
              <div style={{ fontSize: '1.8rem', fontFamily: 'var(--font-serif, inherit)', margin: '8px 0' }}>
                {reveal.item.label}
              </div>
              <OutcomeLine result={reveal} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 12 }}>
              <span className="pb-num" style={{ color: 'var(--text-muted)' }}>
                💰 {reveal.newBalance?.toLocaleString?.() ?? reveal.newBalance} coins
              </span>
              <button
                type="button"
                ref={revealCloseRef}
                onClick={closeReveal}
                style={btnPrimary}
              >Nice!</button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Drop-pool details */}
      <Dialog
        open={!!poolBox}
        onClose={() => setPoolBox(null)}
        label={poolBox ? `${poolBox.label} drop pool` : 'Drop pool'}
        contentStyle={{
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24, maxWidth: 580, width: '92vw',
          maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        {poolBox && (
          <div>
            <h2 style={{ marginTop: 0, fontFamily: 'var(--font-serif, inherit)' }}>{poolBox.label} — odds &amp; pool</h2>
            {poolBox.odds.map((row) => (
              <div key={row.rarity} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <strong style={{ color: rarityColor(row.rarity) }}>{row.label}</strong>
                  <span className="pb-num">{row.pct}%</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {row.items.map((it) => (
                    <div key={it.sku} style={{
                      width: 120, background: 'var(--bg-card)',
                      border: `1px solid var(--border)`, borderRadius: 10,
                      padding: '8px 6px 6px', display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      {!it.special && (
                        <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: '100%' }}>
                            <CosmeticPreview kind={it.kind} value={it.value} label={it.label} size="sm" />
                          </div>
                        </div>
                      )}
                      {it.special && (
                        <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }} aria-hidden="true">⭐</div>
                      )}
                      <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.3, color: 'var(--text-primary)' }}>
                        {it.label}{it.boxExclusive ? ' ★' : ''}{it.set ? ' (set)' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 0 }}>
              ★ = box-exclusive (never sold in the coin shop). Within a rarity, drops are uniform across
              the listed items. These numbers are served by the same catalog the server rolls against.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function BoxCard({ box, free, signedIn, busy, canAfford = true, freeState, onOpen, onViewPool }) {
  const topOdds = box.odds || [];
  const freeReady = freeState ? freeState.canClaim : true;
  const nextReset = freeState?.nextResetAt ? new Date(freeState.nextResetAt) : null;

  // Pick up to 3 representative cosmetic items from the box's drop pool,
  // selecting from the rarest available tier downwards (one per tier).
  const previewItems = (() => {
    const rarityOrder = ['legendary', 'epic', 'rare', 'common'];
    const result = [];
    for (const rarity of rarityOrder) {
      const row = topOdds.find((r) => r.rarity === rarity);
      if (row?.items?.length) {
        const pick = row.items.find((i) => !i.special) || null;
        if (pick) result.push(pick);
      }
      if (result.length >= 3) break;
    }
    return result;
  })();

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 10,
      ...(free ? { borderColor: 'var(--brass, #c5a975)' } : {}),
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-serif, inherit)', fontSize: '1.4rem' }}>{box.label}</h2>
        <span className="pb-num" style={{ fontSize: 18, color: 'var(--gold, #f59e0b)' }}>
          {free ? 'Free' : `${box.price.toLocaleString()} 💰`}
        </span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, minHeight: 40 }}>{box.blurb}</p>

      {/* Representative cosmetic previews */}
      {previewItems.length > 0 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '4px 0' }}>
          {previewItems.map((it) => (
            <div key={it.sku} style={{ flex: 1, minWidth: 0 }}>
              <CosmeticPreview kind={it.kind} value={it.value} label={it.label} size="sm" />
            </div>
          ))}
        </div>
      )}

      <ul aria-label={`${box.label} published odds`} style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 3 }}>
        {topOdds.map((row) => (
          <li key={row.rarity} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: rarityColor(row.rarity) }}>{row.label}</span>
            <span className="pb-num">{row.pct}%</span>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          type="button"
          onClick={onOpen}
          disabled={!signedIn || busy || (free ? !freeReady : !canAfford)}
          style={{ ...btnPrimary, flex: 1, opacity: (!signedIn || busy || (free ? !freeReady : !canAfford)) ? 0.5 : 1 }}
          aria-label={free ? `Claim ${box.label}` : `Open ${box.label} for ${box.price} coins`}
        >
          {busy ? 'Opening…' : free ? (freeReady ? 'Claim free box' : 'Claimed') : 'Open box'}
        </button>
        <button type="button" onClick={onViewPool} style={btnGhost} aria-label={`View ${box.label} drop pool and odds`}>
          Odds
        </button>
      </div>
      {free && !freeReady && nextReset && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Next free box: {nextReset.toLocaleDateString()} {nextReset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

function WildcardSection({ catalog, tokens, redeeming, onRedeem }) {
  const retired = new Set((catalog.sets || []).filter((s) => s.retired).map((s) => s.id));
  const pool = [];
  for (const box of catalog.boxes || []) {
    for (const row of box.odds || []) {
      for (const it of row.items || []) {
        if (it.special) continue;
        if (it.set && retired.has(it.set)) continue;
        if (!pool.find((p) => p.sku === it.sku)) pool.push({ ...it, rarity: row.rarity });
      }
    }
  }
  pool.sort((a, b) => a.label.localeCompare(b.label));
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontFamily: 'var(--font-serif, inherit)', fontSize: '1.4rem' }}>
        Redeem a wildcard token ({tokens} available)
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Pick any cosmetic — if you already own it the redeem will be rejected, so spend it on something new.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {pool.map((it) => (
          <button
            key={it.sku}
            type="button"
            onClick={() => onRedeem(it.sku)}
            disabled={!!redeeming}
            style={{ ...btnGhost, borderColor: rarityColor(it.rarity) }}
            aria-label={`Redeem wildcard token for ${it.label}`}
          >
            {redeeming === it.sku ? 'Redeeming…' : it.label}
          </button>
        ))}
      </div>
    </section>
  );
}

const btnPrimary = {
  background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  color: '#1a1a1a', fontWeight: 700, border: 'none', borderRadius: 8,
  padding: '9px 16px', cursor: 'pointer',
};
const btnGhost = {
  background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', cursor: 'pointer',
};
