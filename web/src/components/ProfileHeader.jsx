import React from 'react';
import { getHeroImageUrl } from '../heroNames';
import { FRAME_META } from '../profileCosmetics';
import FounderRing from './founderRings/FounderRing';

/**
 * Mockup-aligned profile hero header (upscale-2026 redesign).
 *
 * Mirrors the Press Box mockup's header lockup: a framed square portrait
 * (the player's pinned / most-played hero, since the app has no Steam
 * avatar surface), the badge row + large serif name, and three inline
 * headline stats (Current MMR / Win Rate / Total Matches). All values are
 * passed in from the real PlayerProfile data wiring — this component is
 * presentational only and renders no interactive elements.
 *
 * Props
 *  - displayName: string
 *  - heroPortraitId: number | null  — hero id used for the portrait tile
 *  - frameId: string                — cosmetic frame slug (FRAME_META key)
 *  - mmr: number | null
 *  - winRate: string | null         — preformatted, e.g. "54.2%"
 *  - totalMatches: number | null
 *  - nameAdornments: ReactNode      — Pro / Verified / Rank badges row
 *  - rankLabel: string | null       — optional ladder rank badge, e.g. "#4"
 *  - tier: object | null            — resolved MMR_TIERS row { name, badge, emoji }
 *                                     for the top-left heraldic emblem. Null/unranked
 *                                     renders no emblem.
 */
export default function ProfileHeader({
  displayName,
  heroPortraitId = null,
  frameId = 'none',
  mmr = null,
  winRate = null,
  totalMatches = null,
  nameAdornments = null,
  rankLabel = null,
  founderRing = null,
  tier = null,
}) {
  const meta = FRAME_META[frameId] || {};
  const portrait = heroPortraitId ? getHeroImageUrl(heroPortraitId) : null;
  const RING_SIZE = 152;
  const PORTRAIT_SIZE = 140;

  // Circular portrait fill (hero art or monogram fallback). Reused inside the
  // founder-ring overlay and the plain circular tile.
  const portraitFill = portrait ? (
    <img
      src={portrait}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  ) : (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'var(--font-serif, inherit)',
      fontSize: 46, color: 'var(--text-muted)',
    }}>{(displayName || '?').slice(0, 1).toUpperCase()}</div>
  );

  const Stat = ({ label, value, accent = false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        fontFamily: 'var(--font-condensed, inherit)', textTransform: 'uppercase',
        letterSpacing: '0.12em', fontSize: 11, color: 'var(--text-muted)',
      }}>{label}</span>
      <span className="pb-num" style={{
        fontSize: 'clamp(1.25rem, 2.4vw, 1.65rem)', fontWeight: 700, lineHeight: 1,
        color: accent ? 'var(--brass, #c5a975)' : 'var(--text-primary)',
      }}>{value}</span>
    </div>
  );

  const Divider = () => (
    <div aria-hidden="true" style={{ width: 1, height: 34, background: 'var(--border)' }} />
  );

  const stats = [];
  if (mmr != null) stats.push(<Stat key="mmr" label="Current MMR" value={mmr} accent />);
  if (winRate != null) stats.push(<Stat key="wr" label="Win Rate" value={winRate} />);
  stats.push(<Stat key="tm" label="Total Matches" value={totalMatches != null ? Number(totalMatches).toLocaleString() : '—'} />);

  return (
    <header style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 28, marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        {/* Portrait tile */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {founderRing ? (
            <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE }}>
              <FounderRing sku={founderRing} size={RING_SIZE} disc="emblem" />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: RING_SIZE * 0.64, height: RING_SIZE * 0.64,
                borderRadius: '50%', overflow: 'hidden',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)',
                background: 'linear-gradient(180deg, var(--bg-card) 0%, rgba(0,0,0,0.35) 100%)',
              }}>
                {portraitFill}
              </div>
            </div>
          ) : (
            <div style={{
              width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, overflow: 'hidden',
              background: 'linear-gradient(180deg, var(--bg-card) 0%, rgba(0,0,0,0.35) 100%)',
              ...(meta.style || { border: '1px solid var(--border)' }),
              borderRadius: '50%',
            }}>
              {portraitFill}
            </div>
          )}
          {tier && (
            <div
              style={{
                position: 'absolute', top: -10, left: -10, width: 48, height: 48,
                zIndex: 2, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))',
              }}
            >
              {tier.badge ? (
                <img
                  src={tier.badge}
                  alt={`${tier.name} tier`}
                  title={`${tier.name} tier`}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  onError={(e) => {
                    const span = document.createElement('span');
                    span.style.cssText = 'font-size:34px;line-height:1';
                    span.setAttribute('title', `${tier.name} tier`);
                    span.setAttribute('aria-label', `${tier.name} tier`);
                    span.setAttribute('role', 'img');
                    span.textContent = tier.emoji || '🛡️';
                    e.target.replaceWith(span);
                  }}
                />
              ) : (
                <span
                  role="img"
                  aria-label={`${tier.name} tier`}
                  title={`${tier.name} tier`}
                  style={{ fontSize: 34, lineHeight: 1 }}
                >{tier.emoji || '🛡️'}</span>
              )}
            </div>
          )}
          {rankLabel && (
            <div style={{
              position: 'absolute', bottom: -12, right: -12, minWidth: 44, height: 44,
              padding: '0 9px', borderRadius: 999, background: 'var(--bg-card)',
              border: '1px solid var(--brass, #c5a975)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-serif, inherit)', fontSize: 18,
              color: 'var(--brass, #c5a975)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>{rankLabel}</div>
          )}
        </div>

        {/* Identity + headline stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 4 }}>
          {nameAdornments && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {nameAdornments}
            </div>
          )}
          <h1 style={{
            margin: 0, fontFamily: 'var(--font-serif, inherit)', fontWeight: 800,
            fontSize: 'clamp(2.2rem, 5vw, 4rem)', lineHeight: 1, color: 'var(--text-primary)',
          }}>{displayName}</h1>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginTop: 6 }}>
            {stats.reduce((acc, el, i) => {
              if (i > 0) acc.push(<Divider key={`d${i}`} />);
              acc.push(el);
              return acc;
            }, [])}
          </div>
        </div>
      </div>
    </header>
  );
}
